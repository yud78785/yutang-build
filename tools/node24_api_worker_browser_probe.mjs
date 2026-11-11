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
const { chromium } = require('playwright-core');
assert.equal(playwrightPackage.version, '1.64.0-alpha-1790635538000', 'Pinned Playwright package required.');
const EXPECTED_HOST_SHA256 = '5716a705e19663f1f6faed52569508b72cf091d3a31766828a7a5434a6eca1bc';
const DIAGNOSTIC_LAUNCH_TIMEOUT_MS = 20_000;
const hostPath = path.join(runtime, 'browser-host.mjs');
const corePath = path.join(runtime, 'core.mjs');
const launcherPath = path.join(runtime, 'browser-launcher.mjs');
const apiWorkerPath = path.join(runtime, 'api-worker.mjs');

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
async function closeEdgeViaCdp(port) {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:' + Number(port), { timeout: 10000, noDefaults: true });
  let session = null;
  try {
    session = await browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(() => {});
  } finally {
    await session?.detach().catch(() => {});
    await browser.close().catch(() => {});
  }
}
async function browserSnapshot(profile, port, hostPid) {
  const processes = powershellJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
  const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const listeners = netstat.split(/\r?\n/).flatMap(line => {
    const match = /^\s*TCP\s+(\S+):9227\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line);
    return match ? [{ LocalAddress: match[1], OwningProcess: Number(match[2]) }] : [];
  });
  const edgeProcesses = processes.filter(item => String(item.Name || '').toLowerCase() === 'msedge.exe');
  const profileEdges = edgeProcesses.filter(item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
  return {
    processes, listeners, edgeProcesses, profileEdges,
    hostAlive: processes.some(item => Number(item.ProcessId) === Number(hostPid))
  };
}
async function waitForBrowserClosed(profile, port, hostPid, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await browserSnapshot(profile, port, hostPid);
    if (!last.hostAlive && last.edgeProcesses.length === 0 && last.profileEdges.length === 0 && last.listeners.length === 0) return last;
    await delay(250);
  }
  throw new Error('Graceful Edge close did not release the host, Edge process tree, and CDP listener.');
}
async function waitForNewHost(stateFile, previousPid, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readJson(stateFile);
    if (state?.launchFailure) throw new Error('New browser host reported ' + String(state.launchFailure.code || 'unknown failure'));
    if (state?.ready === true && Number.isSafeInteger(state.pid) && Number(state.pid) !== Number(previousPid)) return state;
    await delay(250);
  }
  throw new Error('A new browser host PID did not become ready after Edge closed.');
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
async function tail(file, maximum = 20000) {
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
      "    console.error('PROBE_STAGE:host_env ' + JSON.stringify({hasNodeChannelFd:Object.hasOwn(process.env,'NODE_CHANNEL_FD'),hasNodeChannelSerializationMode:Object.hasOwn(process.env,'NODE_CHANNEL_SERIALIZATION_MODE'),hasNodeUniqueId:Object.hasOwn(process.env,'NODE_UNIQUE_ID'),processConnected:process.connected===true,hasProcessSend:typeof process.send==='function',hasNodeOptions:Boolean(process.env.NODE_OPTIONS),hasNodePath:Boolean(process.env.NODE_PATH),hasElectronRunAsNode:Boolean(process.env.ELECTRON_RUN_AS_NODE),parentPid:process.ppid}));\n    console.error('PROBE_STAGE:before_edge_probe');\n    writeState(false);\n    try { installation = await probeInstallation(); console.error('PROBE_STAGE:edge_probe_finished'); } catch (probeError) { console.error('PROBE_STAGE:edge_probe_failed:' + String(probeError?.name || 'Error')); }\n    console.error('PROBE_STAGE:before_launch_persistent_context timeoutMs=20000');\n    context = await chromiumImpl.launchPersistentContext(profile, { timeout: 20000,"
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
    ],
    [
      "    context.on('close', () => processImpl.exit(focusFailed ? 1 : 0));",
      "    context.on('close', () => { try { logger.error('PROBE_STAGE:context_close_event at=' + Date.now() + ' pid=' + processImpl.pid); } catch {} processImpl.exit(focusFailed ? 1 : 0); });"
    ],
    [
      "    for (const signal of ['SIGINT', 'SIGTERM']) processImpl.on(signal, () => context.close().finally(() => processImpl.exit(0)));",
      "    for (const signal of ['SIGINT', 'SIGTERM']) processImpl.on(signal, () => { try { logger.error('PROBE_STAGE:host_signal ' + signal + ' at=' + Date.now() + ' pid=' + processImpl.pid); } catch {} context.close().finally(() => processImpl.exit(0)); });"
    ],
    [
      "    writeState(true, { browserVersion: versionOf(installation?.version) });",
      "    writeState(true, { browserVersion: versionOf(installation?.version) });\\n    logger.error('PROBE_STAGE:ready_written at=' + Date.now() + ' pid=' + processImpl.pid);"
    ],
  ];
  for (const [before, after] of hostPatches) {
    if (host.split(before).length !== 2) throw new Error('Browser-host instrumentation anchor mismatch.');
    host = host.replace(before, after);
  }
  await fs.writeFile(hostPath, host);

  const originalLauncher = await fs.readFile(launcherPath, 'utf8');
  let launcher = originalLauncher;
  const launcherOpenBefore = "    const browser = await this.getBrowser(signal); cancelled(signal);";
  const launcherOpenAfter = "    console.error('LAUNCHER_PROBE:before_get_browser at=' + Date.now());\\n    const browser = await this.getBrowser(signal); cancelled(signal);\\n    console.error('LAUNCHER_PROBE:after_get_browser at=' + Date.now());";
  if (launcher.split(launcherOpenBefore).length !== 2) throw new Error('BrowserLauncher getBrowser diagnostic anchor mismatch.');
  launcher = launcher.replace(launcherOpenBefore, launcherOpenAfter);
  const launcherGotoBefore = "    if (page.url() === 'about:blank') { await abortable(page.goto(this.homeUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }), signal); await abortable(page.evaluate(installPreparePause, { label:PREPARE_PAGE_NAME, token, claimInitial:true }), signal); }";
  const launcherGotoAfter = "    if (page.url() === 'about:blank') { console.error('LAUNCHER_PROBE:before_home_goto at=' + Date.now() + ' url=' + String(this.homeUrl)); await abortable(page.goto(this.homeUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }), signal); console.error('LAUNCHER_PROBE:after_home_goto at=' + Date.now()); await abortable(page.evaluate(installPreparePause, { label:PREPARE_PAGE_NAME, token, claimInitial:true }), signal); }";
  if (launcher.split(launcherGotoBefore).length !== 2) throw new Error('BrowserLauncher navigation diagnostic anchor mismatch.');
  launcher = launcher.replace(launcherGotoBefore, launcherGotoAfter);

  const launcherBefore = "function allowedPage(url) { try { return url === 'about:blank' || new URL(url).origin === 'https://www.douyin.com'; } catch { return false; } }";
  const launcherAfter = "function allowedPage(url) { try { return url === 'about:blank' || url === process.env.DOUYIN_TEST_HOME_URL || new URL(url).origin === 'https://www.douyin.com'; } catch { return false; } }";
  if (launcher.split(launcherBefore).length !== 2) throw new Error('BrowserLauncher local fixture allow-list anchor mismatch.');
  launcher = launcher.replace(launcherBefore, launcherAfter);
  await fs.writeFile(launcherPath, launcher);

  const originalWorker = await fs.readFile(apiWorkerPath, 'utf8');
  let worker = originalWorker;
  const workerPatches = [
    ["  const stop = () => stopping ??= (async () => {", "  const stop = () => stopping ??= (async () => {\n    console.error('API_WORKER_PROBE:stop_body_enter');"],
    ["    await server?.stop();", "    await server?.stop();\n    console.error('API_WORKER_PROBE:stop_body_done');"],
    ["  const exit = async code => {", "  const exit = async code => {\n    console.error('API_WORKER_PROBE:exit_enter code=' + String(code));"],
    ["      } else if (type === 'stop') {\n        await stop();", "      } else if (type === 'stop') {\n        console.error('API_WORKER_PROBE:stop_command_enter');\n        await stop();"],
    ["      if (type === 'stop') process.exit(0);", "      if (type === 'stop') { console.error('API_WORKER_PROBE:explicit_process_exit'); process.exit(0); }"],
    ["  process.once('disconnect', () => { void exit(0); });", "  process.once('disconnect', () => { console.error('API_WORKER_PROBE:disconnect_event'); void exit(0); });"]
  ];
  for (const [before, after] of workerPatches) {
    if (worker.split(before).length !== 2) throw new Error('API worker shutdown instrumentation anchor mismatch.');
    worker = worker.replace(before, after);
  }
  await fs.writeFile(apiWorkerPath, worker);

  const originalCore = await fs.readFile(corePath, 'utf8');
  let core = originalCore;
  const launcherAnchor = "        this.browserLauncher ??= new BrowserLauncher({";
  const launcherReplacement = "        this.browserLauncher ??= new BrowserLauncher({ homeUrl: process.env.DOUYIN_TEST_HOME_URL || undefined,";
  if (core.split(launcherAnchor).length !== 2) throw new Error('BrowserLauncher diagnostic home URL anchor mismatch.');
  core = core.replace(launcherAnchor, launcherReplacement);
  const endpointLockBefore = "async function endpoint(signal) {\n  const release = await lock('launch', signal);";
  const endpointLockAfter = "async function endpoint(signal) {\n  console.error('CORE_PROBE:endpoint_lock_wait at=' + Date.now());\n  const release = await lock('launch', signal);\n  console.error('CORE_PROBE:endpoint_lock_acquired at=' + Date.now());";
  if (core.split(endpointLockBefore).length !== 2) throw new Error('Endpoint lock diagnostic anchor mismatch.');
  core = core.replace(endpointLockBefore, endpointLockAfter);
  const endpointDeadlineBefore = "    const deadline = Date.now() + 25_000;";
  const endpointDeadlineAfter = "    const deadline = Date.now() + 25_000;\\n    console.error('CORE_PROBE:endpoint_wait_start at=' + Date.now() + ' hostPid=' + String(hostPid));";
  if (core.split(endpointDeadlineBefore).length !== 2) throw new Error('Endpoint deadline diagnostic anchor mismatch.');
  core = core.replace(endpointDeadlineBefore, endpointDeadlineAfter);
  const endpointFailedBefore = "      if (readiness === 'failed') throw new Error('专用浏览器启动失败；请正常关闭仍使用 cli-profile 的旧专用窗口后重试。');";
  const endpointFailedAfter = "      if (readiness === 'failed') { console.error('CORE_PROBE:endpoint_failed at=' + Date.now() + ' hostPid=' + String(hostPid) + ' state=' + JSON.stringify(state)); throw new Error('专用浏览器启动失败；请正常关闭仍使用 cli-profile 的旧专用窗口后重试。'); }";
  if (core.split(endpointFailedBefore).length !== 2) throw new Error('Endpoint failure diagnostic anchor mismatch.');
  core = core.replace(endpointFailedBefore, endpointFailedAfter);
  const beforeSpawn = "        const child = spawn(resolveNodeExecutable(), [";
  const afterSpawn = [
    "        console.error('CORE_PROBE:api_worker_env ' + JSON.stringify({envKeyNames:Object.keys(process.env).sort(),hasNodeChannelFd:Object.hasOwn(process.env,'NODE_CHANNEL_FD'),hasNodeChannelSerializationMode:Object.hasOwn(process.env,'NODE_CHANNEL_SERIALIZATION_MODE'),hasNodeUniqueId:Object.hasOwn(process.env,'NODE_UNIQUE_ID'),processConnected:process.connected===true,hasProcessSend:typeof process.send==='function',hasNodeOptions:Boolean(process.env.NODE_OPTIONS),hasNodePath:Boolean(process.env.NODE_PATH),hasElectronRunAsNode:Boolean(process.env.ELECTRON_RUN_AS_NODE),cwdName:path.basename(process.cwd()),nodeVersion:process.versions.node}));",
    "        console.error('CORE_PROBE:before_node_resolve');",
    "        const resolvedNode = resolveNodeExecutable();",
    "        console.error('CORE_PROBE:after_node_resolve');",
    "        const child = spawn(resolvedNode, ["
  ].join('\n');
  if (core.split(beforeSpawn).length !== 2) throw new Error('Core spawn instrumentation anchor mismatch.');
  core = core.replace(beforeSpawn, afterSpawn);
  const beforePid = "        hostPid = child.pid;\n        child.unref();";
  const afterPid = "        hostPid = child.pid;\n        console.error('CORE_PROBE:after_host_spawn pid=' + String(hostPid));\n        child.unref();";
  if (core.split(beforePid).length !== 2) throw new Error('Core host PID instrumentation anchor mismatch.');
  core = core.replace(beforePid, afterPid);
  await fs.writeFile(corePath, core);
  try { execFileSync(process.execPath, ['--check', corePath], { encoding: 'utf8', windowsHide: true, timeout: 10000 }); }
  catch (error) { throw new Error('Instrumented core syntax check failed: ' + redact(error?.stderr || error?.message || error)); }
}
function sanitizedEnvironment(base, paths) {
  // Browser observation requires a deliberately small OS-only environment.
  // Model/API credentials and unrelated CI, shell, developer-tool and proxy variables are not inherited.
  const allowed = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata|username|userdomain|public|allusersprofile|programw6432|os|processor_architecture|number_of_processors)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key)));
  assert.ok(Object.keys(env).some(key => /^programfiles\(x86\)$/i.test(key)), 'The Edge x86 installation root must be retained in the isolated environment.');
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
    DOUYIN_NODE_EXECUTABLE: process.execPath,
    DEBUG: 'pw:browser*'
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
  await fs.writeFile(htmlFile, '<!doctype html><html><head><meta charset="utf-8"><title>YuTang isolated browser probe</title></head><body>isolated browser-host probe</body></html>\n');
  const fixtureUrl = pathToFileURL(htmlFile).href;
  env.DOUYIN_TEST_HOME_URL = fixtureUrl;

  const control = path.join(home, '.dsh', 'douyin-browser', 'control');
  const profile = path.join(home, '.dsh', 'douyin-browser', 'cli-profile');
  await fs.mkdir(control, { recursive: true });
  const stateFile = path.join(control, 'browser.json');
  const logFile = path.join(control, 'browser-host.log');
  let backend = new ApiProcess(process.execPath, runtime, { env, timeoutMs: 30000 });
  const config = { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keySource: '未配置' };
  const report = {
    node: process.versions.node,
    nodePathSha256: sha256(await fs.readFile(process.execPath)),
    playwright: playwrightPackage.version,
    backendEnvKeyCount: Object.keys(env).length,
    backendEnvKeys: Object.keys(env).sort(),
    modelKeyPresent: false,
    edgeOutboundBlocked: true,
    diagnosticLaunchTimeoutMs: DIAGNOSTIC_LAUNCH_TIMEOUT_MS,
    playwrightBrowserDebugEnabled: true,
    backendStarted: false,
    backendRestart: null,
    firstBackendExit: null,
    finalBackendExit: null,
    gracefulCloseCycles: [],
    finalBrowserPid: null,
    browserOpenStatus: null,
    browserOpenBody: null,
    browserOpenResult: null,
    localFixturePageCount: 0,
    pageTargetCount: 0,
    backendStderrTail: '',
    browserHostLogTail: '',
    launchReachedAfterMarker: false,
    launchFailureCategory: null,
    browserState: null,
    processOwnership: null,
    cdp: false
  };
  let openAbort = null;
  let openPromise = null;
  let hostPid = null;
  let pass = false;
  try {
    let started;
    try { started = await backend.start(config, { htmlFile, staticRoot: publicRoot }); }
    catch (error) { throw new Error('API worker start failed: ' + redact(error?.message || error) + '; stderr=' + redact(backend.stderr)); }
    report.backendStarted = true;
    report.backendOrigin = backend.origin;
    const bootstrapResponse = await fetch(backend.origin + '/api/bootstrap', { signal: AbortSignal.timeout(5000) });
    const bootstrap = await bootstrapResponse.json();
    if (!bootstrapResponse.ok || typeof bootstrap.token !== 'string' || bootstrap.token.length < 10) throw new Error('API bootstrap did not provide a local session token.');

    openAbort = new AbortController();
    const openStartedAt = Date.now();
    openPromise = fetch(backend.origin + '/api/browser/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': bootstrap.token },
      body: '{}',
      signal: openAbort.signal
    }).then(async response => ({
      status: response.status,
      body: redact(await response.text()),
      durationMs: Date.now() - openStartedAt
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
      failureMessage: redact(state.launchFailure?.message || ''),
      failureDetails: redact(state.launchFailure?.details || '')
    } : null;
    hostPid = Number.isSafeInteger(state?.pid) ? state.pid : null;
    report.browserHostLogTail = await tail(logFile);
    report.launchReachedAfterMarker = report.browserHostLogTail.includes('PROBE_STAGE:after_launch_persistent_context');
    report.launchFailureCategory = report.browserHostLogTail.match(/TimeoutError|TargetClosedError|browserType\\.launchPersistentContext/i)?.[0] || null;
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
      const settled = await Promise.race([openPromise, delay(20000).then(() => null)]);
      if (settled) {
        report.browserOpenStatus = settled.status;
        report.browserOpenBody = settled.body;
        report.browserOpenDurationMs = settled.durationMs;
        try {
          const body = JSON.parse(settled.body);
          report.browserOpenResult = { opened: body.opened === true, mode: body.mode || null, reused: body.reused === true, paused: body.paused === true, watchPreserved: body.watchPreserved === true };
        } catch {}
      } else {
        report.browserOpenStatus = 'PENDING_AFTER_20_SECONDS';
        openAbort.abort(new Error('Diagnostic browser-open request timed out.'));
        const aborted = await Promise.race([openPromise, delay(1500).then(() => null)]);
        if (aborted) {
          report.browserOpenStatus = aborted.status;
          report.browserOpenBody = aborted.body;
        }
      }
    }
    try {
      const response = await fetch('http://127.0.0.1:9227/json/list', { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const targets = await response.json();
        const pages = targets.filter(item => item.type === 'page');
        report.pageTargetCount = pages.length;
        report.localFixturePageCount = pages.filter(item => item.url === fixtureUrl).length;
      }
    } catch {}
    const firstHostPid = hostPid;
    const firstBrowserPid = report.processOwnership?.edgeLaunchSummaries?.[0]?.pid || null;
    try { await backend.stop(); } catch (error) { report.firstBackendStopError = redact(error?.message || error); }
    report.firstBackendExit = { code: backend.exitCode, signal: backend.exitSignal, stderrTail: redact(backend.stderr), clean: backend.exitCode === 0 && !backend.exitSignal && !/UV_HANDLE_CLOSING/.test(backend.stderr) };
    report.firstBackendStderrTail = redact(backend.stderr);
    await delay(750);

    backend = new ApiProcess(process.execPath, runtime, { env, timeoutMs: 30000 });
    const restarted = await backend.start(config, { htmlFile, staticRoot: publicRoot });
    const bootstrap2Response = await fetch(backend.origin + '/api/bootstrap', { signal: AbortSignal.timeout(5000) });
    const bootstrap2 = await bootstrap2Response.json();
    if (!bootstrap2Response.ok || typeof bootstrap2.token !== 'string' || bootstrap2.token.length < 10) throw new Error('Restarted API worker bootstrap failed.');
    const secondOpenResponse = await fetch(backend.origin + '/api/browser/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': bootstrap2.token },
      body: '{}',
      signal: AbortSignal.timeout(20000)
    });
    const secondOpenBody = await secondOpenResponse.json().catch(() => ({}));
    const stateAfterRestart = await readJson(stateFile);
    const restartVersion = await waitForCdp(9227, 5000);
    let restartProcesses = [], restartListeners = [];
    try {
      restartProcesses = powershellJson("Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -or $_.Name -eq 'node.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
      restartListeners = powershellJson('Get-NetTCPConnection -LocalPort 9227 -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 4');
    } catch {}
    const restartHostPid = Number.isSafeInteger(stateAfterRestart?.pid) ? stateAfterRestart.pid : null;
    const restartOwnership = restartHostPid ? inspectOwnership(restartProcesses, restartHostPid, backend.child?.pid, profile, restartListeners) : null;
    let restartTargets = [];
    try {
      const response = await fetch('http://127.0.0.1:9227/json/list', { signal: AbortSignal.timeout(3000) });
      if (response.ok) restartTargets = await response.json();
    } catch {}
    const restartPages = restartTargets.filter(item => item.type === 'page');
    const restartFixtureCount = restartPages.filter(item => item.url === fixtureUrl).length;
    const restartHostCount = restartProcesses.filter(item => /node\.exe$/i.test(String(item.Name)) && /browser-host(?:-probe)?\.mjs/i.test(String(item.CommandLine || ''))).length;
    report.backendRestart = {
      backendStarted: Boolean(restarted?.port),
      browserOpenStatus: secondOpenResponse.status,
      opened: secondOpenBody.opened === true,
      mode: secondOpenBody.mode || null,
      reused: secondOpenBody.reused === true,
      paused: secondOpenBody.paused === true,
      hostReady: stateAfterRestart?.ready === true,
      hostPid: restartHostPid,
      browserPid: restartOwnership?.edgeLaunchSummaries?.[0]?.pid || firstBrowserPid,
      reusedSameHost: restartHostPid === firstHostPid,
      cdp: Boolean(restartVersion),
      browserVersion: String(restartVersion?.Browser || '').slice(0, 100),
      browserHostProcessCount: restartHostCount,
      edgeDescendantCount: restartOwnership?.edgeDescendantCount || 0,
      listenerOwnedByEdge: restartOwnership?.listenerOwnersAreEdgeDescendants === true,
      listenerLoopbackOnly: restartOwnership?.listenersLoopbackOnly === true,
      pageTargetCount: restartPages.length,
      localFixturePageCount: restartFixtureCount
    };
    hostPid = restartHostPid || firstHostPid;
    report.firstBrowserPid = firstBrowserPid;
    report.backendRestarted = report.backendRestart.backendStarted &&
      report.backendRestart.browserOpenStatus === 200 && report.backendRestart.opened && report.backendRestart.reused === true &&
      report.backendRestart.mode === 'prepare' && report.backendRestart.paused && report.backendRestart.reusedSameHost === true &&
      report.backendRestart.browserPid === firstBrowserPid &&
      report.backendRestart.hostReady && report.backendRestart.cdp &&
      report.backendRestart.browserHostProcessCount === 1 &&
      report.backendRestart.edgeDescendantCount > 0 &&
      report.backendRestart.listenerOwnedByEdge && report.backendRestart.listenerLoopbackOnly &&
      report.backendRestart.pageTargetCount === 1 && report.backendRestart.localFixturePageCount === 1;

    try {
      const firstHostPid = hostPid;
      await closeEdgeViaCdp(9227);
      const firstClose = await waitForBrowserClosed(profile, 9227, firstHostPid, 15000);
      report.gracefulCloseCycles.push({
        phase: 'close-edge-after-api-restart',
        hostExited: !firstClose.hostAlive,
        edgeProcessCount: firstClose.edgeProcesses.length,
        profileEdgeProcessCount: firstClose.profileEdges.length,
        listenerCount: firstClose.listeners.length,
        passed: true
      });

      const thirdOpenResponse = await fetch(backend.origin + '/api/browser/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-session-token': bootstrap2.token },
        body: '{}',
        signal: AbortSignal.timeout(20000)
      });
      const thirdOpenBody = await thirdOpenResponse.json().catch(() => ({}));
      const thirdState = await waitForNewHost(stateFile, firstHostPid, 35000);
      hostPid = Number(thirdState.pid);
      const thirdVersion = await waitForCdp(9227, 5000);
      const thirdTargetsResponse = await fetch('http://127.0.0.1:9227/json/list', { signal: AbortSignal.timeout(3000) });
      const thirdTargets = thirdTargetsResponse.ok ? await thirdTargetsResponse.json() : [];
      const thirdPages = thirdTargets.filter(item => item.type === 'page');
      const thirdSnapshot = await browserSnapshot(profile, 9227, hostPid);
      const thirdOwnership = inspectOwnership(thirdSnapshot.processes, hostPid, backend.child?.pid, profile, thirdSnapshot.listeners);
      const thirdBrowserPid = thirdOwnership.edgeLaunchSummaries?.[0]?.pid || null;
      report.finalBrowserPid = thirdBrowserPid;
      const relaunched = thirdOpenResponse.status === 200 && thirdOpenBody.opened === true &&
        thirdOpenBody.mode === 'prepare' && thirdOpenBody.paused === true &&
        thirdState.ready === true && Number(thirdState.pid) !== Number(firstHostPid) &&
        Boolean(thirdVersion) && thirdPages.length === 1 && thirdPages[0].url === fixtureUrl &&
        thirdOwnership.hostFound && thirdOwnership.hostParentIsApiWorker &&
        thirdOwnership.edgeDescendantCount > 0 && thirdOwnership.listenerOwnersAreEdgeDescendants &&
        thirdOwnership.listenersLoopbackOnly && thirdOwnership.edgeNoSandboxArgCount === 0;
      report.gracefulCloseCycles.push({
        phase: 'relaunch-after-graceful-close',
        httpStatus: thirdOpenResponse.status,
        oldHostPid: firstHostPid,
        newHostPid: thirdState.pid,
        newBrowserPid: thirdBrowserPid,
        pageTargetCount: thirdPages.length,
        passed: relaunched
      });
      if (!relaunched) throw new Error('New Edge host did not launch cleanly after graceful browser close.');

      await closeEdgeViaCdp(9227);
      const secondClose = await waitForBrowserClosed(profile, 9227, hostPid, 15000);
      report.gracefulCloseCycles.push({
        phase: 'second-graceful-close',
        hostExited: !secondClose.hostAlive,
        edgeProcessCount: secondClose.edgeProcesses.length,
        profileEdgeProcessCount: secondClose.profileEdges.length,
        listenerCount: secondClose.listeners.length,
        passed: true
      });
    } catch (error) {
      report.gracefulCloseError = redact(error?.message || error);
      pass = false;
    }
    report.backendStderrTail = redact(backend.stderr);
    report.browserHostLogTail = await tail(logFile);
    report.hostPid = hostPid;

    const ownership = report.processOwnership || {};
    pass = report.backendStarted && report.browserState?.ready === true && report.cdp &&
      report.browserOpenStatus === 200 && report.browserOpenResult?.opened === true && report.browserOpenResult?.mode === 'prepare' && report.browserOpenResult?.paused === true && report.localFixturePageCount === 1 && report.backendRestarted === true &&
      report.browserState.profileMatches && report.browserState.port === 9227 &&
      ownership.hostFound && ownership.hostIsNode && ownership.hostParentIsApiWorker &&
      ownership.edgeDescendantCount > 0 && ownership.edgeWithProfileCount > 0 &&
      ownership.edgeWithPortArgCount > 0 && ownership.edgeWithLoopbackArgCount > 0 &&
      ownership.edgeNoSandboxArgCount === 0 && ownership.listenerOwnersAreEdgeDescendants &&
      ownership.listenersLoopbackOnly && report.hostPidMatchesBackendLog;
  } finally {
    if (openAbort && !openAbort.signal.aborted) openAbort.abort(new Error('Diagnostic cleanup.'));
    try { await backend.stop(); } catch (error) { report.backendStopError = redact(error?.message || error); }
    report.finalBackendExit = { code: backend.exitCode, signal: backend.exitSignal, stderrTail: redact(backend.stderr), clean: backend.exitCode === 0 && !backend.exitSignal && !/UV_HANDLE_CLOSING/.test(backend.stderr) };
    const browserPidToClose = Number(report.finalBrowserPid || report.backendRestart?.browserPid || report.firstBrowserPid || 0);
    if (browserPidToClose > 0) await killTree(browserPidToClose);
    report.dedicatedEdgeCloseIssued = browserPidToClose > 0;
    let cleanup = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      let processes = [], listeners = [], processSnapshotVerified = false, listenerSnapshotVerified = false;
      try {
        const snapshotRows = powershellJson("$processOk=$true; try { $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -eq 'msedge.exe' -or $_.Name -eq 'node.exe' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine) } catch { $processOk=$false; $processes=@() }; ConvertTo-Json -InputObject ([ordered]@{processSnapshotVerified=$processOk;processes=$processes}) -Compress -Depth 5");
        if (snapshotRows.length === 1 && snapshotRows[0] && typeof snapshotRows[0] === 'object') {
          const snapshot = snapshotRows[0];
          processSnapshotVerified = snapshot.processSnapshotVerified === true;
          processes = Array.isArray(snapshot.processes) ? snapshot.processes : snapshot.processes ? [snapshot.processes] : [];
        }
        const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
        listeners = netstat.split(/\r?\n/).flatMap(line => { const match = /^\s*TCP\s+(\S+):9227\s+\S+\s+LISTENING\s+(\d+)\s*$/i.exec(line); return match ? [{ LocalAddress: match[1], OwningProcess: Number(match[2]) }] : []; });
        listenerSnapshotVerified = true;
      } catch {}
      const hostStillAlive = processes.some(item => Number(item.ProcessId) === Number(hostPid));
      const edgeProcesses = processes.filter(item => String(item.Name || '').toLowerCase() === 'msedge.exe');
      const profileEdges = edgeProcesses.filter(item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
      const listenerDetails = listeners.map(item => { const owner = processes.find(proc => Number(proc.ProcessId) === Number(item.OwningProcess)); return { pid:Number(item.OwningProcess), localAddress:String(item.LocalAddress), ownerName:String(owner?.Name || ''), ownerIsHost:Number(item.OwningProcess) === Number(hostPid), ownerHasProfile:String(owner?.CommandLine || '').toLowerCase().includes(profile.toLowerCase()) }; });
      cleanup = { processSnapshotVerified, listenerSnapshotVerified, hostProcessExited: hostPid ? !hostStillAlive : null, edgeProcessCount: edgeProcesses.length, profileEdgeProcessCount: profileEdges.length, port9227ListenerCount: listeners.length, listenerDetails };
      if (processSnapshotVerified && listenerSnapshotVerified && !hostStillAlive && edgeProcesses.length === 0 && listeners.length === 0) break;
      await delay(250);
    }
    report.cleanup = cleanup;
    report.cleanupClean = !report.backendStopError && report.firstBackendExit?.clean === true && report.finalBackendExit?.clean === true && report.gracefulCloseError === undefined && cleanup?.processSnapshotVerified === true && cleanup?.listenerSnapshotVerified === true && report.dedicatedEdgeCloseIssued && cleanup?.hostProcessExited === true && cleanup.edgeProcessCount === 0 && cleanup.profileEdgeProcessCount === 0 && cleanup.port9227ListenerCount === 0;
    pass = pass && report.cleanupClean && report.gracefulCloseCycles.length === 3 && report.gracefulCloseCycles.every(item => item.passed === true);
    if (hostPid && cleanup?.hostProcessExited !== true) await killTree(hostPid);
    await killProfileProcesses(profile);
    report.backendStderrTail = redact(backend.stderr);
    report.browserHostLogTail = await tail(logFile);
    report.launchReachedAfterMarker = report.browserHostLogTail.includes('PROBE_STAGE:after_launch_persistent_context');
    report.pass = pass;
    process.stdout.write('YUTANG_API_WORKER_BROWSER_HOST_RESULT ' + JSON.stringify(report) + '\n');
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
    if (!pass) process.exitCode = 1;
  }
}
main().catch(error => {
  process.stderr.write('YUTANG_API_WORKER_BROWSER_HOST_FATAL ' + redact(error?.stack || error?.message || error) + '\n');
  process.exitCode = 1;
});
