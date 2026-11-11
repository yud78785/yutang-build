#!/usr/bin/env node
// Isolated Node 24 reproduction of the exact browser-host startup path.
// No candidate EXE, no accounts, no Douyin URL, no model key, and no browser outbound access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './playwright-runtime.mjs';

const require = createRequire(import.meta.url);
const packageInfo = require('playwright-core/package.json');
const EXPECTED_NODE = '24.17.0';
const EXPECTED_PLAYWRIGHT = '1.64.0-alpha-1790635538000';
const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));

function category(error) {
  const value = String(error?.message || error || '');
  if (/timeout|timed out/i.test(value)) return 'TIMEOUT';
  if (/permission|access denied|EACCES|EPERM/i.test(value)) return 'PERMISSION';
  if (/pipe|websocket|ECONNREFUSED|connection/i.test(value)) return 'DEBUG_CONNECTION';
  if (/executable|ENOENT|not found/i.test(value)) return 'BROWSER_NOT_FOUND';
  if (/protocol|unsupported|method/i.test(value)) return 'PROTOCOL';
  return 'OTHER';
}
function safeText(value, paths = []) {
  let text = String(value ?? '');
  for (const item of paths) if (typeof item === 'string' && item) text = text.split(item).join('[isolated-path]');
  return text.replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]').slice(-4000);
}
async function readJson(file) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; }
}
async function waitForVersion(port, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const value = await response.json();
        if (/Edg|Chrome/.test(String(value.Browser))) return value;
      }
    } catch {}
    await delay(250);
  }
  return null;
}
function powershellJson(command) {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024
  }).trim();
  if (!output) return [];
  const value = JSON.parse(output);
  return Array.isArray(value) ? value : [value];
}
function hasAncestor(pid, ancestorPid, processes) {
  const byPid = new Map(processes.map(item => [Number(item.ProcessId), item]));
  const visited = new Set();
  let current = Number(pid);
  for (let i = 0; i < 40 && current > 0; i++) {
    if (current === Number(ancestorPid)) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const parent = Number(byPid.get(current)?.ParentProcessId);
    if (!Number.isSafeInteger(parent) || parent < 1) return false;
    current = parent;
  }
  return false;
}
function processSummary(processes, hostPid, profile, port, listeners) {
  const host = processes.find(item => Number(item.ProcessId) === Number(hostPid));
  const edge = processes.filter(item =>
    /msedge\.exe$/i.test(String(item.Name)) && hasAncestor(Number(item.ProcessId), Number(hostPid), processes));
  const listenerRows = listeners.map(item => ({
    ownerIsEdgeDescendant: edge.some(process => Number(process.ProcessId) === Number(item.OwningProcess)),
    loopback: ['127.0.0.1', '::1'].includes(String(item.LocalAddress))
  }));
  return {
    hostFound: Boolean(host),
    hostIsNode: /node\.exe$/i.test(String(host?.Name || '')),
    hostParentIsProbe: Number(host?.ParentProcessId) === process.pid,
    edgeProcessCount: edge.length,
    edgeWithProfile: edge.filter(item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase())).length,
    edgeWithPortArg: edge.filter(item => String(item.CommandLine || '').includes('--remote-debugging-port=' + port)).length,
    edgeWithLoopbackArg: edge.filter(item => /--remote-debugging-address=127\.0\.0\.1/i.test(String(item.CommandLine || ''))).length,
    edgeWithNoSandbox: edge.filter(item => /--no-sandbox|--disable-setuid-sandbox/i.test(String(item.CommandLine || ''))).length,
    listenerCount: listeners.length,
    listenerOwnersAreEdgeDescendants: listenerRows.length > 0 && listenerRows.every(item => item.ownerIsEdgeDescendant),
    listenersLoopbackOnly: listenerRows.length > 0 && listenerRows.every(item => item.loopback)
  };
}

async function main() {
  assert.equal(process.platform, 'win32', 'Windows-only diagnostic');
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub runner required');
  assert.equal(process.env.YUTANG_EDGE_FIREWALL_CONFIRMED, 'yes', 'Edge outbound firewall must be verified');
  assert.equal(process.versions.node, EXPECTED_NODE, 'Must use the candidate bundled Node version');
  assert.equal(packageInfo.version, EXPECTED_PLAYWRIGHT, 'Must use the exact locked Playwright package');

  const firewall = powershellJson("Get-NetFirewallRule -DisplayName 'YuTangNode24HostProbeBlockOutbound' | Select-Object Enabled,Action,Direction | ConvertTo-Json -Compress");
  assert.ok(firewall.length === 1 && firewall[0].Enabled === 'True' && firewall[0].Action === 'Block' && firewall[0].Direction === 'Outbound',
    'Edge outbound firewall rule is not active');

  const base = await fsp.mkdtemp(path.join(process.env.RUNNER_TEMP, 'yutang-node24-host-'));
  const home = process.env.USERPROFILE;
  assert.ok(typeof home === 'string' && path.isAbsolute(home), 'Native Windows USERPROFILE must be preserved');
  const userData = path.join(base, 'user-data');
  await fsp.mkdir(userData, { recursive: true });
  let commonDir = null;
  const envAllow = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata|username|userdomain|public|allusersprofile|programw6432|os|processor_architecture|number_of_processors|homedrive|homepath|userprofile|appdata|localappdata|temp|tmp|systemdrive|home)$/i;
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => envAllow.test(key)));
  Object.assign(safeEnv, {
    DSH_HOME: path.join(home, '.dsh'),
    DOUYIN_DESKTOP_USER_DATA: userData
  });

  let rawContext = null;
  let hostChild = null;
  let hostLog = null;
  let report = {
    node: process.versions.node,
    playwright: packageInfo.version,
    firewallOutboundBlocked: true,
    raw: { launch: false, cdp: false, errorCategory: null },
    host: { spawned: false, ready: false, cdp: false, failureCode: null, logTail: '', process: null }
  };

  try {
    const rawPort = 9341;
    const rawProfile = path.join(base, 'raw-profile');
    await fsp.mkdir(rawProfile, { recursive: true });
    try {
      rawContext = await chromium.launchPersistentContext(rawProfile, {
        channel: 'msedge', headless: false, viewport: null, chromiumSandbox: true,
        ignoreDefaultArgs: ['--mute-audio'],
        args: ['--remote-debugging-port=' + rawPort, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required'],
        env: safeEnv, timeout: 30000
      });
      const rawPage = rawContext.pages()[0] || await rawContext.newPage();
      await rawPage.goto('about:blank', { timeout: 5000 });
      report.raw.launch = true;
      report.raw.cdp = Boolean(await waitForVersion(rawPort));
    } catch (error) {
      report.raw.errorCategory = category(error);
    } finally {
      if (rawContext) await rawContext.close().catch(() => {});
      rawContext = null;
    }

    const hostPort = 9342;
    commonDir = path.join(home, '.dsh', 'douyin-browser');
    if (fs.existsSync(commonDir)) throw new Error('Unexpected pre-existing YuTang browser state on the disposable runner; refusing to overwrite it.');
    const common = commonDir;
    const profile = path.join(common, 'cli-profile');
    const control = path.join(common, 'control');
    const stateDir = path.join(common, 'state');
    const mediaRoot = path.join(common, 'media');
    const memoryDir = path.join(common, 'memory');
    const mediaEnvFile = path.join(mediaRoot, '.env');
    const mediaSettingsFile = path.join(mediaRoot, 'settings.local.json');
    const mediaModelsDir = path.join(mediaRoot, '.models');
    const memoryDbPath = path.join(memoryDir, 'shared.sqlite');
    await Promise.all([
      fsp.mkdir(profile, { recursive: true }),
      fsp.mkdir(control, { recursive: true }),
      fsp.mkdir(stateDir, { recursive: true }),
      fsp.mkdir(mediaRoot, { recursive: true }),
      fsp.mkdir(memoryDir, { recursive: true }),
      fsp.mkdir(mediaModelsDir, { recursive: true })
    ]);
    const locationFile = path.join(common, 'runtime-location.json');
    const locationRecord = { version: 1, stateDir, mediaEnvFile, mediaSettingsFile, mediaRuntimeRoot: mediaRoot, mediaModelsDir, memoryDir, memoryDbPath };
    await fsp.writeFile(locationFile, JSON.stringify(locationRecord, null, 2) + '\n', { flag: 'wx' });
    await fsp.writeFile(mediaEnvFile, '', { flag: 'wx' });
    await fsp.writeFile(mediaSettingsFile, JSON.stringify({ enabled: false, backend: 'local-whisper' }), { flag: 'wx' });
    Object.assign(safeEnv, {
      DOUYIN_RUNTIME_LOCATION_FILE: locationFile,
      DEEPSEEK_SHARED_MEMORY_DB: memoryDbPath,
      DOUYIN_STATE_DIR: stateDir,
      DOUYIN_MEDIA_ENV_FILE: mediaEnvFile,
      DOUYIN_MEDIA_SETTINGS_FILE: mediaSettingsFile,
      DOUYIN_MEDIA_RUNTIME_ROOT: mediaRoot,
      DOUYIN_MEDIA_MODELS_DIR: mediaModelsDir
    });
    const logFile = path.join(control, 'browser-host.log');
    const logFd = fs.openSync(logFile, 'a');
    try {
      hostChild = spawn(process.execPath, [path.join(RUNTIME_DIR, 'browser-host.mjs'), profile, control, String(hostPort)], {
        cwd: RUNTIME_DIR,
        env: safeEnv, detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd], shell: false
      });
    } finally {
      fs.closeSync(logFd);
    }
    await new Promise((resolve, reject) => {
      hostChild.once('spawn', resolve);
      hostChild.once('error', reject);
    });
    hostChild.unref();
    report.host.spawned = true;
    const deadline = Date.now() + 35000;
    let state = null;
    while (Date.now() < deadline) {
      state = await readJson(path.join(control, 'browser.json'));
      if (state?.ready === true || state?.launchFailure || hostChild.exitCode !== null) break;
      await delay(250);
    }
    report.host.ready = state?.ready === true;
    report.host.failureCode = typeof state?.launchFailure?.code === 'string' ? state.launchFailure.code : null;
    report.host.failureMessage = safeText(state?.launchFailure?.message, [base, home, userData, profile, control]);
    report.host.cdp = report.host.ready ? Boolean(await waitForVersion(hostPort)) : false;
    report.host.logTail = safeText(await fsp.readFile(logFile, 'utf8').catch(() => ''), [base, home, userData, profile, control]);

    let processes = [];
    let listeners = [];
    try {
      processes = powershellJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
      listeners = powershellJson('Get-NetTCPConnection -LocalPort ' + hostPort + ' -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 4');
    } catch {}
    report.host.process = processSummary(processes, hostChild.pid, profile, hostPort, listeners);
    report.host.statePidMatchesChild = Number(state?.pid) === Number(hostChild.pid);
    report.host.stateProfileMatches = state?.profile === profile;
    report.host.statePortMatches = Number(state?.port) === hostPort;
    report.host.childAlive = hostChild.exitCode === null;
    report.host.startedAtPresent = Number.isFinite(state?.startedAt);

    console.log('YUTANG_NODE24_BROWSER_HOST_RESULT ' + JSON.stringify(report));

    const hostProcess = report.host.process;
    const hostPass = report.host.ready && report.host.cdp && report.host.statePidMatchesChild &&
      report.host.stateProfileMatches && report.host.statePortMatches && hostProcess.hostFound &&
      hostProcess.hostIsNode && hostProcess.hostParentIsProbe && hostProcess.edgeProcessCount > 0 &&
      hostProcess.edgeWithProfile > 0 && hostProcess.edgeWithPortArg > 0 && hostProcess.edgeWithLoopbackArg > 0 &&
      hostProcess.edgeWithNoSandbox === 0 && hostProcess.listenerOwnersAreEdgeDescendants && hostProcess.listenersLoopbackOnly;
    if (!report.raw.launch || !report.raw.cdp || !hostPass) process.exitCode = 1;
  } finally {
    if (rawContext) await rawContext.close().catch(() => {});
    if (hostChild && hostChild.exitCode === null) {
      try { execFileSync('taskkill.exe', ['/PID', String(hostChild.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
      await Promise.race([new Promise(resolve => hostChild.once('exit', resolve)), delay(3000)]);
    }
    if (commonDir) await fsp.rm(commonDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(base, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(error => {
  console.error('YUTANG_NODE24_BROWSER_HOST_FATAL ' + category(error));
  process.exitCode = 1;
});
