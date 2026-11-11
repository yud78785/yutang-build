#!/usr/bin/env node
// Reproduce the exact desktop ApiProcess -> Node API worker -> Core -> detached browser-host chain.
// Runs only on an isolated Windows CI runner. No user profile, API key, account, or external browser network.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ApiProcess } from '../src/api-process.mjs';

const runtime = path.resolve(process.argv[2] || '');
if (!path.isAbsolute(runtime) || !process.env.GITHUB_ACTIONS || process.platform !== 'win32') throw new Error('Isolated Windows CI runtime required.');
assert.equal(process.versions.node, '24.17.0', 'Exact candidate Node runtime required.');
const require = createRequire(path.join(runtime, 'probe-require.cjs'));
const playwrightPackage = require('playwright-core/package.json');
assert.equal(playwrightPackage.version, '1.64.0-alpha-1790635538000', 'Pinned Playwright package required.');
const EXPECTED_HOST_SHA256 = '5716a705e19663f1f6faed52569508b72cf091d3a31766828a7a5434a6eca1bc';
const hostPath = path.join(runtime, 'browser-host.mjs');
const corePath = path.join(runtime, 'core.mjs');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const redact = value => String(value ?? '')
  .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
  .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
  .slice(-6000);

function powershellJson(command) {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024
  }).trim();
  if (!output) return [];
  const value = JSON.parse(output);
  return Array.isArray(value) ? value : [value];
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
async function waitForCdp(port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const data = await response.json();
        if (/Edg|Chrome/.test(String(data.Browser))) return data;
      }
    } catch {}
    await delay(200);
  }
  return null;
}
function hasAncestor(pid, ancestorPid, processes) {
  const byPid = new Map(processes.map(item => [Number(item.ProcessId), item]));
  const seen = new Set();
  let cursor = Number(pid);
  for (let i = 0; i < 48 && cursor > 0; i++) {
    if (cursor === Number(ancestorPid)) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const parent = Number(byPid.get(cursor)?.ParentProcessId);
    if (!Number.isSafeInteger(parent) || parent < 1) return false;
    cursor = parent;
  }
  return false;
}
function inspectOwnership(processes, hostPid, backendPid, profile, listeners) {
  const host = processes.find(item => Number(item.ProcessId) === Number(hostPid));
  const descendants = processes.filter(item => hasAncestor(Number(item.ProcessId), Number(hostPid), processes));
  const edge = descendants.filter(item => /msedge\.exe$/i.test(String(item.Name)));
  const listenerRows = listeners.map(item => ({
    ownerIsEdgeDescendant: edge.some(proc => Number(proc.ProcessId) === Number(item.OwningProcess)),
    loopback: ['127.0.0.1', '::1'].includes(String(item.LocalAddress))
  }));
  return {
    hostFound: Boolean(host),
    hostIsNode: /node\.exe$/i.test(String(host?.Name || '')),
    hostParentIsApiWorker: Number(host?.ParentProcessId) === Number(backendPid),
    edgeDescendantCount: edge.length,
    edgeWithProfileCount: edge.filter(item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase())).length,
    edgeWithPortArgCount: edge.filter(item => /--remote-debugging-port=9227/.test(String(item.CommandLine || ''))).length,
    edgeWithLoopbackArgCount: edge.filter(item => /--remote-debugging-address=127\.0\.0\.1/.test(String(item.CommandLine || ''))).length,
    edgeNoSandboxArgCount: edge.filter(item => /--no-sandbox|--disable-setuid-sandbox/i.test(String(item.CommandLine || ''))).length,
    listenerCount: listeners.length,
    listenerOwnersAreEdgeDescendants: listenerRows.length > 0 && listenerRows.every(item => item.ownerIsEdgeDescendant),
    listenersLoopbackOnly: listenerRows.length > 0 && listenerRows.every(item => item.loopback),
    edgeLaunchSummaries: edge.slice(0, 10).map(item => {
      const command = String(item.CommandLine || '');
      const type = command.match(/--type=([^\\s]+)/i);
      const port = command.match(/--remote-debugging-port=([^\\s]+)/i);
      const address = command.match(/--remote-debugging-address=([^\\s]+)/i);
      return { pid:Number(item.ProcessId), parentPid:Number(item.ParentProcessId), processType:type?.[1] || 'browser', port:port?.[1] || '', address:address?.[1] || '', profileMatches:command.toLowerCase().includes(profile.toLowerCase()), noSandbox:/--no-sandbox|--disable-setuid-sandbox/i.test(command) };
    })
  };
}
async function tail(file, maximum = 6000) {
  try { return redact((await fs.readFile(file, 'utf8')).slice(-maximum)); } catch { return ''; }
}
async function killTree(pid) {
  if (!Number.isSafeInteger(Number(pid)) || Number(pid) < 1) return;
  try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
  await delay(700);
}
async function killProfileProcesses(profile) {
  let processes = [];
  try {
    processes = powershellJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
  } catch {}
  const owned = processes.filter(item => /msedge\.exe$/i.test(String(item.Name)) &&
    String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
  for (const item of owned) await killTree(Number(item.ProcessId));
}
async function instrumentRuntime() {
  const originalHost = await fs.readFile(hostPath);
  assert.equal(sha256(originalHost), EXPECTED_HOST_SHA256, 'Patched browser-host source identity mismatch.');
  let host = originalHost.toString('utf8');
  const hostPatches = [
    [
      "    writeState(false);\n    try { installation = await probeInstallation(); } catch {}\n    context = await chromiumImpl.launchPersistentContext(profile, {",
      "    console.error('PROBE_STAGE:host_env ' + JSON.stringify({hasNodeChannelFd:Object.hasOwn(process.env,'NODE_CHANNEL_FD'),hasNodeChannelSerializationMode:Object.hasOwn(process.env,'NODE_CHANNEL_SERIALIZATION_MODE'),hasNodeUniqueId:Object.hasOwn(process.env,'NODE_UNIQUE_ID'),processConnected:process.connected===true,hasProcessSend:typeof process.send==='function',hasNodeOptions:Boolean(process.env.NODE_OPTIONS),hasNodePath:Boolean(process.env.NODE_PATH),hasElectronRunAsNode:Boolean(process.env.ELECTRON_RUN_AS_NODE),parentPid:process.ppid}));\n    console.error('PROBE_STAGE:before_edge_probe');\n    writeState(false);\n    try { installation = await probeInstallation(); console.error('PROBE_STAGE:edge_probe_finished'); } catch (probeError) { console.error('PROBE_STAGE:edge_probe_failed:' + String(probeError?.name || 'Error')); }\n    console.error('PROBE_STAGE:before_launch_persistent_context');\n    context = await chromiumImpl.launchPersistentContext(profile, {"
    ],
    [
      "    const nativeFocus = await installNativeFocusReset(context, { onFailure:",
      "    console.error('PROBE_STAGE:after_launch_persistent_context');\n    const nativeFocus = await installNativeFocusReset(context, { onFailure:"
    ],
    [
      "    nativeFocus.assertHealthy();\n    writeState(true,",
      "    console.error('PROBE_STAGE:after_focus_reset');\n    nativeFocus.assertHealthy();\n    console.error('PROBE_STAGE:before_ready_state');\n    writeState(true,"
    ],
    [
      "  } catch (error) {\n    try { await context?.close(); } catch {}",
      "  } catch (error) {\n    console.error('PROBE_STAGE:host_catch:' + String(error?.code || error?.name || 'Error'));\n    try { await context?.close(); } catch {}"
    ]
  ];
  for (const [before, after] of hostPatches) {
    if (host.split(before).length !== 2) throw new Error('Browser-host instrumentation anchor mismatch.');
    host = host.replace(before, after);
  }
  await fs.writeFile(hostPath, host);

  const originalCore = await fs.readFile(corePath, 'utf8');
  let core = originalCore;
  const corePatches = [
    [
      "        const child = spawn(resolveNodeExecutable(), [",
      "        console.error('CORE_PROBE:api_worker_env ' + JSON.stringify({hasNodeChannelFd:Object.hasOwn(process.env,'NODE_CHANNEL_FD'),hasNodeChannelSerializationMode:Object.hasOwn(process.env,'NODE_CHANNEL_SERIALIZATION_MODE'),hasNodeUniqueId:Object.hasOwn(process.env,'NODE_UNIQUE_ID'),processConnected:process.connected===true,hasProcessSend:typeof process.send==='function',hasNodeOptions:Boolean(process.env.NODE_OPTIONS),hasNodePath:Boolean(process.env.NODE_PATH),hasElectronRunAsNode:Boolean(process.env.ELECTRON_RUN_AS_NODE),cwdName:path.basename(process.cwd()),nodeVersion:process.versions.node}));\n        console.error('CORE_PROBE:before_node_resolve');\n        const resolvedNode = resolveNodeExecutable();\n        console.error('CORE_PROBE:after_node_resolve');\n        const child = spawn(resolvedNode, ["
    ],
    [
      "        hostPid = child.pid;\n        child.unref();",
      "        hostPid = child.pid;\n        console.error('CORE_PROBE:after_host_spawn pid=' + String(hostPid));\n        child.unref();"
    ]
  ];
  for (const [before, after] of corePatches) {
    if (core.split(before).length !== 2) throw new Error('Core instrumentation anchor mismatch.');
    core = core.replace(before, after);
  }
  await fs.writeFile(corePath, core);
}
function sanitizedEnvironment(base, paths) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/(?:TOKEN|SECRET|PASSWORD|API.?KEY|CREDENTIAL|AUTHORIZATION|COOKIE|GITHUB|ACTIONS|RUNNER|WORKFLOW|EVENT|INPUT|OUTPUT|STATE|STEP|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE)/i.test(key)));
  Object.assign(env, {
    HOME: paths.home,
    USERPROFILE: paths.home,
    HOMEDRIVE: paths.drive,
    HOMEPATH: paths.home.slice(paths.drive.length),
    SystemDrive: paths.drive,
    APPDATA: paths.appData,
    LOCALAPPDATA: paths.localAppData,
    TEMP: paths.temp,
    TMP: paths.temp,
    DSH_HOME: path.join(paths.home, '.dsh'),
    DOUYIN_DESKTOP_USER_DATA: paths.userData,
    DOUYIN_RUNTIME_LOCATION_FILE: paths.locationFile,
    DEEPSEEK_SHARED_MEMORY_DB: paths.memoryDb,
    DOUYIN_STATE_DIR: paths.stateDir,
    DOUYIN_MEDIA_ENV_FILE: paths.mediaEnvFile,
    DOUYIN_MEDIA_SETTINGS_FILE: paths.mediaSettingsFile,
    DOUYIN_MEDIA_RUNTIME_ROOT: paths.mediaRoot,
    DOUYIN_MEDIA_MODELS_DIR: paths.mediaModelsDir,
    DOUYIN_QQ_ROOT: paths.qqRoot,
    DOUYIN_NODE_EXECUTABLE: process.execPath
  });
  for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL']) delete env[key];
  return env;
}
async function main() {
  const firewall = powershellJson("Get-NetFirewallRule -DisplayName 'YuTangApiWorkerHostProbeBlockOutbound' | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' -and $_.Direction -eq 'Outbound' } | Select-Object Name | ConvertTo-Json -Compress");
  assert.ok(firewall.length === 1, 'Verified Edge outbound firewall rule is required.');
  await instrumentRuntime();

  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'yutang-apiworker-host-'));
  const home = path.join(base, 'home');
  const userData = path.join(base, 'user-data');
  const appData = path.join(base, 'app-data');
  const localAppData = path.join(base, 'local-app-data');
  const temp = path.join(base, 'temp');
  const stateDir = path.join(base, 'state');
  const memoryDir = path.join(base, 'memory');
  const mediaRoot = path.join(base, 'media');
  const qqRoot = path.join(base, 'qq');
  const drive = path.parse(home).root.replace(/[\\/]+$/, '');
  const paths = {
    home, userData, appData, localAppData, temp, stateDir, memoryDir,
    memoryDb: path.join(memoryDir, 'shared.sqlite'),
    mediaRoot, mediaEnvFile: path.join(mediaRoot, '.env'),
    mediaSettingsFile: path.join(mediaRoot, 'settings.local.json'),
    mediaModelsDir: path.join(mediaRoot, '.models'),
    qqRoot, drive,
    locationFile: path.join(base, 'runtime-location.json')
  };
  await Promise.all([
    home, userData, appData, localAppData, temp, stateDir, memoryDir, mediaRoot,
    paths.mediaModelsDir, qqRoot
  ].map(directory => fs.mkdir(directory, { recursive: true })));
  await fs.writeFile(paths.mediaEnvFile, '', { flag: 'wx' });
  await fs.writeFile(paths.mediaSettingsFile, JSON.stringify({ enabled: false, backend: 'local-whisper' }) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(qqRoot, '.env'), '', { flag: 'wx' });
  await fs.writeFile(paths.locationFile, JSON.stringify({
    version: 1, stateDir, memoryDir, memoryDbPath: paths.memoryDb,
    mediaEnvFile: paths.mediaEnvFile, mediaSettingsFile: paths.mediaSettingsFile,
    mediaRuntimeRoot: mediaRoot, mediaModelsDir: paths.mediaModelsDir
  }, null, 2) + '\n', { flag: 'wx' });

  const env = sanitizedEnvironment(process.env, paths);
  assert.equal(env.DEEPSEEK_API_KEY, undefined, 'No model key may enter the backend environment.');
  assert.equal(env.NODE_OPTIONS, undefined, 'Node options must not be inherited.');
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined, 'Electron runtime mode must not be inherited.');
  assert.equal(env.DOUYIN_NODE_EXECUTABLE, process.execPath);

  const publicRoot = path.join(runtime, 'public');
  await fs.mkdir(publicRoot, { recursive: true });
  const htmlFile = path.join(publicRoot, 'index.html');
  await fs.writeFile(htmlFile, '<!doctype html><html><head><meta charset="utf-8"></head><body>isolated browser-host probe</body></html>\n');

  const control = path.join(home, '.dsh', 'douyin-browser', 'control');
  const profile = path.join(home, '.dsh', 'douyin-browser', 'cli-profile');
  await fs.mkdir(control, { recursive: true });
  const stateFile = path.join(control, 'browser.json');
  const logFile = path.join(control, 'browser-host.log');
  const backend = new ApiProcess(process.execPath, runtime, { env, timeoutMs: 30000 });
  const config = { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keySource: '未配置' };
  const report = {
    node: process.versions.node,
    nodePathSha256: sha256(await fs.readFile(process.execPath)),
    playwright: playwrightPackage.version,
    backendEnvKeyCount: Object.keys(env).length,
    modelKeyPresent: false,
    edgeOutboundBlocked: true,
    backendStarted: false,
    browserOpenStatus: null,
    browserOpenBody: null,
    backendStderrTail: '',
    browserHostLogTail: '',
    browserState: null,
    processOwnership: null,
    cdp: false
  };
  let openAbort = null;
  let openPromise = null;
  let hostPid = null;
  try {
    const started = await backend.start(config, { htmlFile, staticRoot: publicRoot });
    report.backendStarted = true;
    report.backendOrigin = backend.origin;
    const bootstrapResponse = await fetch(backend.origin + '/api/bootstrap', { signal: AbortSignal.timeout(5000) });
    const bootstrap = await bootstrapResponse.json();
    if (!bootstrapResponse.ok || typeof bootstrap.token !== 'string' || bootstrap.token.length < 10) throw new Error('API bootstrap did not provide a local session token.');

    openAbort = new AbortController();
    openPromise = fetch(backend.origin + '/api/browser/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': bootstrap.token },
      body: '{}',
      signal: openAbort.signal
    }).then(async response => ({
      status: response.status,
      body: redact(await response.text())
    })).catch(error => ({ status: 'ABORTED_OR_FAILED', body: redact(error?.message || error) }));

    const deadline = Date.now() + 35000;
    let state = null;
    while (Date.now() < deadline) {
      state = await readJson(stateFile);
      if (state?.ready === true || state?.launchFailure) break;
      await delay(250);
    }
    report.browserState = state ? {
      pid: state.pid, ready: state.ready, port: state.port,
      profileMatches: state.profile === profile,
      startedAtPresent: Number.isFinite(state.startedAt),
      failureCode: String(state.launchFailure?.code || ''),
      failureMessage: redact(state.launchFailure?.message || '')
    } : null;
    hostPid = Number.isSafeInteger(state?.pid) ? state.pid : null;
    report.browserHostLogTail = await tail(logFile);
    report.backendStderrTail = redact(backend.stderr);
    if (hostPid) {
      let processes = [], listeners = [];
      try {
        processes = powershellJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
        listeners = powershellJson('Get-NetTCPConnection -LocalPort 9227 -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 4');
      } catch {}
      report.processOwnership = inspectOwnership(processes, hostPid, backend.child?.pid, profile, listeners);
      const version = await waitForCdp(9227, 4000);
      report.cdp = Boolean(version);
      report.browserVersion = String(version?.Browser || '').slice(0, 100);
      report.hostPidMatchesBackendLog = backend.stderr.includes('CORE_PROBE:after_host_spawn pid=' + String(hostPid));
    }
    if (openPromise) {
      const settled = await Promise.race([openPromise, delay(1500).then(() => null)]);
      if (settled) {
        report.browserOpenStatus = settled.status;
        report.browserOpenBody = settled.body;
      } else {
        report.browserOpenStatus = 'PENDING_AFTER_HOST_CHECK';
        openAbort.abort(new Error('Diagnostic host check complete.'));
        const aborted = await Promise.race([openPromise, delay(1500).then(() => null)]);
        if (aborted) {
          report.browserOpenStatus = aborted.status;
          report.browserOpenBody = aborted.body;
        }
      }
    }
    report.backendStderrTail = redact(backend.stderr);
    report.browserHostLogTail = await tail(logFile);
    report.hostPid = hostPid;
    process.stdout.write('YUTANG_API_WORKER_BROWSER_HOST_RESULT ' + JSON.stringify(report) + '\n');

    const ownership = report.processOwnership || {};
    const pass = report.backendStarted && report.browserState?.ready === true && report.cdp &&
      report.browserState.profileMatches && report.browserState.port === 9227 &&
      ownership.hostFound && ownership.hostIsNode && ownership.hostParentIsApiWorker &&
      ownership.edgeDescendantCount > 0 && ownership.edgeWithProfileCount > 0 &&
      ownership.edgeWithPortArgCount > 0 && ownership.edgeWithLoopbackArgCount > 0 &&
      ownership.edgeNoSandboxArgCount === 0 && ownership.listenerOwnersAreEdgeDescendants &&
      ownership.listenersLoopbackOnly && report.hostPidMatchesBackendLog;
    if (!pass) process.exitCode = 1;
  } finally {
    if (openAbort && !openAbort.signal.aborted) openAbort.abort(new Error('Diagnostic cleanup.'));
    if (hostPid) await killTree(hostPid);
    await killProfileProcesses(profile);
    await backend.stop().catch(() => {});
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
}
main().catch(error => {
  process.stderr.write('YUTANG_API_WORKER_BROWSER_HOST_FATAL ' + redact(error?.stack || error?.message || error) + '\n');
  process.exitCode = 1;
});
