#!/usr/bin/env node
// Candidate-only Windows LPAC semantics and real Edge HTTPS probe.
// Exact artifact identity mapping rechecked on 2026-11-14; no candidate source changed.
// Runs only on disposable GitHub-hosted Windows runners. It does not login,
// call a model, visit Douyin, alter firewall policy, or touch a user PC.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createCandidateEnvironment,
  hasHostAncestor,
  inspectRendererSandbox,
  verifyProcessSnapshot
} from './windows_147_isolated_edge_lifecycle.mjs';

const FILE = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
const PORT = 9227;
const TARGET = 'https://example.com/';
const EXPECTED_SHA = process.env.YUTANG_EXPECTED_CANDIDATE_SHA256 || '';

function asRows(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function ps(script) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', timeout: 25000, maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  const value = out.trim();
  return value ? JSON.parse(value) : [];
}
async function readJSON(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function exists(file) { return fs.access(file).then(() => true, () => false); }
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of (await import('node:fs')).createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function until(work, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  let last;
  while (Date.now() < deadline) {
    try { const value = await work(); if (value) return value; }
    catch (error) { last = error; }
    await delay(250);
  }
  throw new Error(label + ' unavailable after ' + milliseconds + 'ms: ' + (last?.message || 'no evidence'));
}
function safeText(value, paths = []) {
  let text = String(value ?? '');
  for (const item of paths) if (typeof item === 'string' && item) text = text.split(item).join('[isolated-path]');
  return text.replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
    .replace(/\b(?:token|api[-_]?key|cookie|authorization)\s*[:=]\s*[^\s,;]+/gi, '[redacted]')
    .slice(-4000);
}
function processRows() {
  return asRows(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4"));
}
function listeners(port) {
  return asRows(ps('$items=@(); try { $items=@(Get-NetTCPConnection -LocalPort ' + port +
    ' -State Listen -ErrorAction Stop) } catch { $items=@() }; if($items.Count -gt 0) {' +
    '$items | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 3 } else { "[]" }'));
}
function ownedProfileProcesses(profile, controlDir, rows = processRows()) {
  const p = profile.toLowerCase(), c = controlDir.toLowerCase();
  return rows.filter(item => {
    const command = String(item.CommandLine || '').toLowerCase();
    return command.includes(p) || command.includes(c);
  });
}
function isAlive(pid) {
  return ps('Get-Process -Id ' + Number(pid) + ' -ErrorAction SilentlyContinue | Select-Object -First 1 Id | ConvertTo-Json -Compress') !== null;
}
async function cdpConnect(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, 'CDP version endpoint must respond');
  const info = await response.json();
  const url = new URL(info.webSocketDebuggerUrl);
  assert.equal(url.hostname, '127.0.0.1', 'CDP WebSocket must be loopback-only');
  assert.equal(url.port, String(port), 'CDP WebSocket port mismatch');
  const socket = new WebSocket(info.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true });
    }),
    delay(5000).then(() => { throw new Error('CDP WebSocket open timeout'); })
  ]);
  return { socket, info };
}
async function cdpCommand(socket, id, method, params = {}, sessionId = null) {
  return Promise.race([
    new Promise((resolve, reject) => {
      const onMessage = event => {
        let message;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.id !== id) return;
        socket.removeEventListener('message', onMessage);
        if (message.error) reject(new Error(String(message.error.message || 'CDP command failed')));
        else resolve(message.result || {});
      };
      socket.addEventListener('message', onMessage);
      try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
      catch (error) { socket.removeEventListener('message', onMessage); reject(error); }
    }),
    delay(7000).then(() => { throw new Error('CDP command timeout: ' + method); })
  ]);
}
async function probeHttps(port) {
  const { socket } = await cdpConnect(port);
  let targetId = null, sessionId = null, nextId = 1, responseInfo = null, loadingFailure = null;
  const onMessage = event => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Network.responseReceived' &&
        message.params?.type === 'Document' &&
        new URL(message.params.response?.url || 'about:blank').hostname === 'example.com') {
      responseInfo = { ...message.params.response, requestId: message.params.requestId };
    }
    if (message.method === 'Network.loadingFailed') loadingFailure = {
      errorText: String(message.params?.errorText || '').slice(0, 160),
      blockedReason: String(message.params?.blockedReason || '').slice(0, 80)
    };
  };
  try {
    const target = await cdpCommand(socket, nextId++, 'Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdpCommand(socket, nextId++, 'Target.attachToTarget', { targetId, flatten: true });
    sessionId = attached.sessionId;
    socket.addEventListener('message', onMessage);
    await cdpCommand(socket, nextId++, 'Network.enable', {}, sessionId);
    await cdpCommand(socket, nextId++, 'Page.enable', {}, sessionId);
    const navigation = await cdpCommand(socket, nextId++, 'Page.navigate', { url: TARGET }, sessionId);
    assert.equal(navigation.errorText || '', '', 'Edge could not navigate to the public HTTPS probe');
    let snapshot = null;
    await until(async () => {
      try {
        const result = await cdpCommand(socket, nextId++, 'Runtime.evaluate', {
          expression: 'JSON.stringify({href:location.href,title:document.title,readyState:document.readyState,text:document.body?document.body.innerText:""})',
          returnByValue: true, awaitPromise: true
        }, sessionId);
        if (typeof result.result?.value === 'string') snapshot = JSON.parse(result.result.value);
        return snapshot?.readyState === 'complete' && /Example Domain/.test(snapshot?.text || '') && responseInfo;
      } catch { return null; }
    }, 30000, 'Edge HTTPS navigation, TLS response and Example Domain content');
    assert.equal(new URL(snapshot.href).origin, 'https://example.com', 'Final page origin changed');
    assert.equal(responseInfo.status, 200, 'Public HTTPS probe did not return HTTP 200');
    assert.ok(responseInfo.remoteIPAddress, 'Edge did not report the resolved remote IP');
    assert.ok(responseInfo.securityDetails?.protocol && /^TLS/i.test(responseInfo.securityDetails.protocol),
      'Edge did not report a TLS security session');
    const body = await cdpCommand(socket, nextId++, 'Network.getResponseBody', { requestId: responseInfo.requestId }, sessionId);
    const bodyText = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : String(body.body || '');
    assert.match(bodyText, /Example Domain/, 'HTTPS response body did not contain the expected page content');
    return {
      url: TARGET,
      dnsRemoteIp: String(responseInfo.remoteIPAddress),
      httpStatus: responseInfo.status,
      mimeType: String(responseInfo.mimeType || ''),
      tlsProtocol: String(responseInfo.securityDetails.protocol),
      tlsIssuer: String(responseInfo.securityDetails.issuer || '').slice(0, 160),
      title: String(snapshot.title || ''),
      pageContentVerified: /Example Domain/.test(snapshot.text || ''),
      responseBodyVerified: /Example Domain/.test(bodyText)
    };
  } catch (error) {
    if (loadingFailure) error.message += ' | Network.loadingFailed=' + JSON.stringify(loadingFailure);
    throw error;
  } finally {
    socket.removeEventListener('message', onMessage);
    if (targetId) {
      try { await cdpCommand(socket, nextId++, 'Target.closeTarget', { targetId }); } catch {}
    }
    try { socket.close(); } catch {}
  }
}
async function closeBrowser(port) {
  const { socket } = await cdpConnect(port);
  try {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await Promise.race([
      closed,
      delay(12000).then(() => { throw new Error('Edge did not close after Browser.close'); })
    ]);
  } finally { try { socket.close(); } catch {} }
}
function runAccessCheck(pid, packageSid) {
  const csharp = [
    'using System;',
    'using System.ComponentModel;',
    'using System.Runtime.InteropServices;',
    'public static class YuTangLpacAccessCheck {',
    '  [StructLayout(LayoutKind.Sequential)] public struct GENERIC_MAPPING { public uint GenericRead; public uint GenericWrite; public uint GenericExecute; public uint GenericAll; }',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool DuplicateToken(IntPtr token, int level, out IntPtr duplicate);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, int length, out int returned);',
    '  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint revision, out IntPtr descriptor, out uint size);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool AccessCheck(IntPtr descriptor, IntPtr clientToken, uint desiredAccess, ref GENERIC_MAPPING mapping, IntPtr privileges, ref uint privilegeLength, out uint grantedAccess, [MarshalAs(UnmanagedType.Bool)] out bool accessStatus);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr LocalFree(IntPtr memory);',
    '  static bool Check(IntPtr token, string sid) {',
    '    IntPtr descriptor = IntPtr.Zero, privileges = IntPtr.Zero;',
    '    uint descriptorSize = 0, granted = 0, privilegeLength = 4096;',
    '    bool access = false;',
    '    try {',
    '      string sddl = "D:(A;;0x00000001;;;" + sid + ")";',
    '      if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out descriptor, out descriptorSize)) throw new Win32Exception(Marshal.GetLastWin32Error(), "SDDL conversion failed");',
    '      privileges = Marshal.AllocHGlobal((int)privilegeLength);',
    '      GENERIC_MAPPING mapping = new GENERIC_MAPPING();',
    '      if (!AccessCheck(descriptor, token, 0x00000001, ref mapping, privileges, ref privilegeLength, out granted, out access)) throw new Win32Exception(Marshal.GetLastWin32Error(), "AccessCheck call failed");',
    '      return access && (granted & 0x00000001) != 0;',
    '    } finally { if (privileges != IntPtr.Zero) Marshal.FreeHGlobal(privileges); if (descriptor != IntPtr.Zero) LocalFree(descriptor); }',
    '  }',
    '  public static object Read(int pid, string packageSid) {',
    '    IntPtr process = OpenProcess(0x1000, false, pid);',
    '    if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess failed");',
    '    IntPtr token = IntPtr.Zero, impersonation = IntPtr.Zero, appBuffer = IntPtr.Zero;',
    '    try {',
    '      if (!OpenProcessToken(process, 0x000A, out token)) throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcessToken failed");',
    '      appBuffer = Marshal.AllocHGlobal(4); int returned;',
    '      if (!GetTokenInformation(token, 29, appBuffer, 4, out returned)) throw new Win32Exception(Marshal.GetLastWin32Error(), "TokenIsAppContainer query failed");',
    '      bool isAppContainer = Marshal.ReadInt32(appBuffer) != 0;',
    '      if (!isAppContainer) throw new InvalidOperationException("Network Service token is not an AppContainer");',
    '      if (!DuplicateToken(token, 2, out impersonation)) throw new Win32Exception(Marshal.GetLastWin32Error(), "DuplicateToken failed");',
    '      bool packageSidAccess = Check(impersonation, packageSid);',
    '      bool allApplicationPackagesAccess = Check(impersonation, "S-1-15-2-1");',
    '      bool allRestrictedApplicationPackagesAccess = Check(impersonation, "S-1-15-2-2");',
    '      string classification = packageSidAccess && allApplicationPackagesAccess && !allRestrictedApplicationPackagesAccess ? "ordinary-AppContainer" : packageSidAccess && !allApplicationPackagesAccess && allRestrictedApplicationPackagesAccess ? "LPAC-semantics-confirmed" : "unknown";',
    '      return new { processId = pid, isAppContainer = isAppContainer, packageSidAccess = packageSidAccess, allApplicationPackagesAccess = allApplicationPackagesAccess, allRestrictedApplicationPackagesAccess = allRestrictedApplicationPackagesAccess, classification = classification, method = "AccessCheck with package-SID positive control and ALL_APPLICATION_PACKAGES / ALL_RESTRICTED_APPLICATION_PACKAGES ACEs" };',
    '    } finally { if (appBuffer != IntPtr.Zero) Marshal.FreeHGlobal(appBuffer); if (impersonation != IntPtr.Zero) CloseHandle(impersonation); if (token != IntPtr.Zero) CloseHandle(token); CloseHandle(process); }',
    '  }',
    '}'
  ].join('\n');
  const script = "$ErrorActionPreference='Stop'\n$source=@'\n" + csharp + "\n'@\nAdd-Type -TypeDefinition $source -ErrorAction Stop\n[YuTangLpacAccessCheck]::Read(" + Number(pid) + ", '" + String(packageSid).replace(/'/g, "''") + "') | ConvertTo-Json -Compress";
  return ps(script);
}
async function stopOwnedProcesses({ candidatePid, desktopPid, hostPid, profile, controlDir, base }) {
  const errors = [];
  if (Number.isSafeInteger(hostPid) && hostPid > 0) {
    try { await closeBrowser(PORT); } catch {}
    await delay(500);
    const rows = processRows();
    if (rows.some(item => Number(item.ProcessId) === hostPid)) {
      try { execFileSync('taskkill.exe', ['/PID', String(hostPid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); }
      catch (error) { errors.push('browser-host termination: ' + String(error.code || error.name)); }
    }
  }
  if (Number.isSafeInteger(desktopPid) && desktopPid > 0 && desktopPid !== candidatePid) {
    const rows = processRows();
    if (rows.some(item => Number(item.ProcessId) === desktopPid)) {
      try { execFileSync('taskkill.exe', ['/PID', String(desktopPid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); }
      catch (error) { errors.push('desktop main termination: ' + String(error.code || error.name)); }
    }
  }
  if (Number.isSafeInteger(candidatePid) && candidatePid > 0) {
    const rows = processRows();
    const candidate = rows.find(item => Number(item.ProcessId) === candidatePid && String(item.ExecutablePath || '').toLowerCase() === path.resolve(process.env.YUTANG_CANDIDATE_EXE || '').toLowerCase());
    if (candidate) {
      try { execFileSync('taskkill.exe', ['/PID', String(candidatePid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); }
      catch (error) { errors.push('candidate termination: ' + String(error.code || error.name)); }
    }
  }
  await delay(1200);
  const rows = processRows();
  const owned = ownedProfileProcesses(profile, controlDir, rows);
  const listenersLeft = listeners(PORT);
  const candidateTree = rows.filter(item => Number(item.ProcessId) === candidatePid || hasHostAncestor(Number(item.ProcessId), candidatePid, rows));
  const hostAlive = Number.isSafeInteger(hostPid) && rows.some(item => Number(item.ProcessId) === hostPid);
  const desktopAlive = Number.isSafeInteger(desktopPid) && rows.some(item => Number(item.ProcessId) === desktopPid);
  if (owned.length || listenersLeft.length || candidateTree.length || hostAlive || desktopAlive || errors.length) {
    throw new Error('CANDIDATE_OR_EDGE_CLEANUP_UNVERIFIED: ' + JSON.stringify({
      ownedProfileProcesses: owned.map(item => ({ pid: Number(item.ProcessId), name: String(item.Name || '') })),
      listeners: listenersLeft.map(item => ({ pid: Number(item.OwningProcess), address: String(item.LocalAddress || '') })),
      candidateTree: candidateTree.map(item => ({ pid: Number(item.ProcessId), name: String(item.Name || '') })),
      hostAlive, desktopAlive, errors
    }));
  }
  await fs.rm(base, { recursive: true, force: true });
  const common = path.join(process.env.USERPROFILE, '.yutang-observer-isolated');
  await fs.rm(common, { recursive: true, force: true });
  return { verified: true, candidateTreeRemaining: 0, profileProcessesRemaining: 0, cdpListenersRemaining: 0, unrelatedProcessesTouched: false };
}
async function run(exeFile) {
  assert.equal(process.platform, 'win32', 'Windows runner required');
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub Actions runner required');
  assert.match(EXPECTED_SHA, /^[a-f0-9]{64}$/);
  assert.equal(path.basename(exeFile), FILE);
  assert.equal(await sha256(exeFile), EXPECTED_SHA, 'Candidate EXE SHA-256 mismatch');
  assert.equal(await exists(path.join(process.env.RUNNER_TEMP || tmpdir(), 'never-used-placeholder')), false);
  // No firewall rules or profiles are queried or modified in this live-network probe.
  // If the disposable runner blocks outbound traffic, the real HTTPS request fails explicitly.
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'yutang-lpac-network-'));
  const home = path.resolve(process.env.USERPROFILE || '');
  assert.ok(path.isAbsolute(home), 'Native Windows USERPROFILE is required');
  const common = path.join(home, '.yutang-observer-isolated');
  if (await exists(common)) { await fs.rm(base, { recursive: true, force: true }); throw new Error('Pre-existing YuTang runner state found; refusing to overwrite it'); }
  const userData = path.join(base, 'user-data');
  const memory = path.join(common, 'memory');
  const locationFile = path.join(common, 'runtime-location.json');
  await fs.mkdir(userData, { recursive: true });
  const env = createCandidateEnvironment(process.env, userData, locationFile);
  const preExistingEdge = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Select-Object ProcessId | ConvertTo-Json -Compress"));
  assert.equal(preExistingEdge.length, 0, 'Runner must have no pre-existing Edge processes');
  const candidateChild = spawn(exeFile, ['--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'], {
    env, windowsHide: true, stdio: 'ignore', shell: false
  });
  let candidateExit = null, backendPid = null, desktopPid = null, hostChild = null, hostPid = null;
  const report = {
    schema: 'yutang.windows-147-lpac-network-probe.v1',
    candidateSha256: EXPECTED_SHA,
    sourceRunId: 43467660911,
    sourceCommit: '1c332d55a88c4be2f3bbffda60548ced52b1f061',
    realAccount: false, realModelCalled: false, realMessageSent: false,
    visitedDouyin: false, externalTarget: TARGET, firewallPolicyChanged: false
  };
  const candidateExitPromise = new Promise(resolve => candidateChild.once('exit', (code, signal) => { candidateExit = { code, signal }; resolve(candidateExit); }));
  try {
    const ready = await until(async () => {
      if (candidateExit) throw new Error('Candidate exited before desktop readiness: ' + JSON.stringify(candidateExit));
      try { const value = await readJSON(path.join(userData, 'desktop-smoke.json')); return value.ready === true ? value : null; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
    }, 85000, 'packaged EXE isolated desktop and API readiness');
    assert.equal(ready.configured, false, 'Candidate must not have a configured model key');
    assert.equal(path.resolve(ready.memoryFolder).toLowerCase(), path.resolve(memory).toLowerCase(), 'Candidate memory must be isolated');
    backendPid = Number(ready.backendPid);
    assert.ok(Number.isSafeInteger(backendPid) && backendPid > 0, 'Candidate API worker PID missing');
    report.desktopReady = true;
    report.candidatePid = candidateChild.pid;
    report.backendPid = backendPid;
    const receipt = await readJSON(path.join(path.dirname(exeFile), 'windows-candidate-receipt.json'));
    const verification = await readJSON(path.join(path.dirname(exeFile), 'verification-1.4.7.json'));
    assert.equal(receipt.yutangPatchCommit, report.sourceCommit);
    assert.equal(receipt.sha256, EXPECTED_SHA);
    assert.equal(receipt.release, false);
    assert.equal(receipt.realModelCalled, false);
    assert.equal(receipt.realMessageSent, false);
    assert.equal(verification.sha256, EXPECTED_SHA);
    const runtimeId = verification.runtimeId;
    assert.match(runtimeId, /^[a-f0-9]{64}$/);
    const runtimeDir = path.join(userData, 'runtimes', runtimeId.slice(0, 20));
    await until(async () => await exists(path.join(runtimeDir, '.runtime-ready.json')), 30000, 'candidate isolated runtime readiness marker');
    const runtimeMarker = await readJSON(path.join(runtimeDir, '.runtime-ready.json'));
    assert.equal(runtimeMarker.runtimeId, runtimeId);
    const browserHostFile = path.join(runtimeDir, 'browser-host.mjs');
    const playwrightRuntimeFile = path.join(runtimeDir, 'playwright-runtime.mjs');
    const jobGuardFile = path.join(runtimeDir, 'jobguard.exe');
    assert.equal(await sha256(browserHostFile), receipt.dynamicSecurityPatch.staticSources.find(item => item.path === 'browser-host.mjs').sha256,
      'Prepared browser-host source differs from the exact candidate receipt');
    assert.equal(await sha256(jobGuardFile), receipt.jobGuardSha256, 'Prepared JobGuard differs from the exact candidate receipt');
    assert.equal(await exists(playwrightRuntimeFile), true, 'Prepared Playwright runtime missing');
    const rows = processRows();
    const backend = rows.find(item => Number(item.ProcessId) === backendPid);
    assert.ok(backend && /node\.exe$/i.test(String(backend.Name || '')), 'Candidate API worker is not a Node process');
    assert.match(String(backend.CommandLine || ''), /api-worker\.mjs/i, 'Candidate API worker command identity mismatch');
    const nodeExe = path.resolve(String(backend.ExecutablePath || ''));
    assert.ok(path.isAbsolute(nodeExe) && /node\.exe$/i.test(nodeExe), 'Could not identify the exact candidate Node runtime');
    const nodeVersion = execFileSync(nodeExe, ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
    assert.match(nodeVersion, /^2[2-9]\./, 'Candidate Node runtime is below the supported version floor');
    desktopPid = Number(backend.ParentProcessId);
    const desktop = rows.find(item => Number(item.ProcessId) === desktopPid);
    assert.ok(desktop && String(desktop.Name || '').includes('大肥鱼') &&
      hasHostAncestor(desktopPid, candidateChild.pid, rows), 'Candidate desktop main process ancestry not proven');
    report.runtime = {
      runtimeId,
      browserHostSha256: await sha256(browserHostFile),
      jobGuardSha256: await sha256(jobGuardFile),
      nodeExecutable: path.basename(nodeExe),
      nodeVersion
    };
    report.desktopPid = desktopPid;
    const profile = path.join(common, 'cli-profile');
    const controlDir = path.join(common, 'control');
    await fs.mkdir(profile, { recursive: true });
    await fs.mkdir(controlDir, { recursive: true });
    const hostEnv = { ...env, YUTANG_REQUIRE_JOB_GUARD: '1' };
    hostChild = spawn(nodeExe, [browserHostFile, profile, controlDir, String(PORT)], {
      cwd: runtimeDir, env: hostEnv, windowsHide: true, stdio: 'ignore', shell: false
    });
    const hostExitPromise = new Promise(resolve => hostChild.once('exit', (code, signal) => resolve({ code, signal })));
    const stateFile = path.join(controlDir, 'browser.json');
    const state = await until(async () => {
      if (hostChild.exitCode !== null) throw new Error('Candidate browser-host exited before ready');
      try { const value = await readJSON(stateFile); return value.ready === true ? value : null; }
      catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
    }, 30000, 'candidate Edge browser-host readiness');
    hostPid = Number(state.pid);
    assert.equal(hostPid, hostChild.pid, 'browser-host PID does not match the launched candidate runtime process');
    assert.equal(path.resolve(state.profile).toLowerCase(), path.resolve(profile).toLowerCase());
    assert.equal(state.port, PORT);
    await until(async () => {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(2000) });
      if (!response.ok) return null;
      const value = await response.json();
      return /(?:Edg|Chrome)/.test(String(value.Browser)) ? value : null;
    }, 20000, 'Edge CDP endpoint');
    const current = processRows();
    const edge = current.filter(item => /msedge\.exe$/i.test(String(item.Name || '')) &&
      String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
    assert.ok(edge.length > 0, 'Candidate Edge process family missing');
    const cdpListeners = listeners(PORT);
    const ownership = verifyProcessSnapshot({
      processes: current, hostPid, profile,
      listenerPids: cdpListeners.map(item => Number(item.OwningProcess)),
      portAddresses: cdpListeners.map(item => String(item.LocalAddress || ''))
    });
    assert.equal(ownership.loopbackOnly, true);
    assert.ok(edge.every(item => !/--no-sandbox|--disable-setuid-sandbox/i.test(String(item.CommandLine || ''))),
      'Sandbox-disabling Edge argument detected');
    assert.ok(edge.some(item => String(item.CommandLine || '').includes('--enable-features=NetworkServiceSandbox')),
      'NetworkServiceSandbox launch feature missing');
    report.edge = { processCount: edge.length, cdpLoopbackOnly: true, noSandboxFlags: 0, networkServiceSandboxFlag: true };
    const sandbox = await inspectRendererSandbox(PORT, { profile, hostPid });
    assert.equal(sandbox.rendererSandboxVerified, true, 'Renderer Untrusted/Lockdown/AppContainer not verified');
    assert.equal(sandbox.networkServiceSandboxReported, true, 'Network Service sandbox type not reported');
    assert.equal(sandbox.networkServiceWindowsTokenVerified, true, 'Network Service AppContainer SID mismatch');
    assert.equal(sandbox.networkServiceLowIntegrityVerified, true, 'Network Service Low Integrity not verified');
    assert.equal(sandbox.networkServiceProcessOwned, true, 'Network Service process lineage not verified');
    const lpac = runAccessCheck(sandbox.networkServicePid, sandbox.networkServiceAppContainerSid);
    assert.equal(lpac.isAppContainer, true);
    assert.equal(lpac.packageSidAccess, true, 'LPAC AccessCheck positive control failed');
    assert.notEqual(lpac.classification, 'unknown', 'LPAC AccessCheck classification was ambiguous');
    report.sandbox = {
      rendererSandboxVerified: sandbox.rendererSandboxVerified,
      rendererProcessCount: sandbox.rendererProcessCount,
      networkServiceSandboxType: sandbox.networkServiceSandboxType,
      networkServiceAppContainerSid: sandbox.networkServiceAppContainerSid,
      networkServiceIntegrity: sandbox.networkServiceTokenIntegrityLevel,
      networkServiceIntegrityRid: sandbox.networkServiceTokenIntegrityRid,
      networkServiceProcessOwned: sandbox.networkServiceProcessOwned,
      lpacAccessCheck: lpac
    };
    report.https = await probeHttps(PORT);
    report.networkProbePassed = true;
    try { await closeBrowser(PORT); } catch {}
    await until(async () => {
      const currentRows = processRows();
      const profileProcesses = ownedProfileProcesses(profile, controlDir, currentRows);
      const hostGuard = currentRows.filter(item => /jobguard\.exe$/i.test(String(item.Name || '')) && Number(item.ParentProcessId) === hostPid);
      return !profileProcesses.length && !hostGuard.length && !listeners(PORT).length;
    }, 20000, 'Edge and browser-host cleanup after HTTPS probe');
    report.browserCleanupVerified = true;
    report.hostExit = await Promise.race([hostExitPromise, delay(10000).then(() => null)]);
    if (!report.hostExit) {
      try { execFileSync('taskkill.exe', ['/PID', String(hostPid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
      throw new Error('Browser-host did not exit after Edge close');
    }
    console.log('PASS_WINDOWS_LPAC_AND_REAL_EDGE_HTTPS ' + JSON.stringify(report));
    return report;
  } finally {
    try {
      if (hostPid) {
        try { await closeBrowser(PORT); } catch {}
        await delay(500);
        const currentRows = processRows();
        if (currentRows.some(item => Number(item.ProcessId) === hostPid)) {
          try { execFileSync('taskkill.exe', ['/PID', String(hostPid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
        }
      }
      if (desktopPid && desktopPid !== candidateChild.pid) {
        const currentRows = processRows();
        if (currentRows.some(item => Number(item.ProcessId) === desktopPid)) {
          try { execFileSync('taskkill.exe', ['/PID', String(desktopPid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
        }
      }
      if (candidateChild.pid) {
        const currentRows = processRows();
        if (currentRows.some(item => Number(item.ProcessId) === candidateChild.pid)) {
          try { execFileSync('taskkill.exe', ['/PID', String(candidateChild.pid), '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 }); } catch {}
        }
      }
      await delay(1200);
      const currentRows = processRows();
      const owned = ownedProfileProcesses(path.join(home, '.yutang-observer-isolated', 'cli-profile'),
        path.join(home, '.yutang-observer-isolated', 'control'), currentRows);
      const portLeft = listeners(PORT);
      const candidateTree = currentRows.filter(item => Number(item.ProcessId) === candidateChild.pid ||
        hasHostAncestor(Number(item.ProcessId), candidateChild.pid, currentRows));
      const hostStillAlive = hostPid && currentRows.some(item => Number(item.ProcessId) === hostPid);
      const desktopStillAlive = desktopPid && currentRows.some(item => Number(item.ProcessId) === desktopPid);
      if (owned.length || portLeft.length || candidateTree.length || hostStillAlive || desktopStillAlive) {
        throw new Error('CANDIDATE_OR_EDGE_CLEANUP_FAILED: ' + JSON.stringify({
          profileProcesses: owned.map(item => ({ pid: Number(item.ProcessId), name: String(item.Name || '') })),
          listeners: portLeft.map(item => ({ pid: Number(item.OwningProcess), address: String(item.LocalAddress || '') })),
          candidateTree: candidateTree.map(item => ({ pid: Number(item.ProcessId), name: String(item.Name || '') })),
          hostStillAlive, desktopStillAlive
        }));
      }
      await fs.rm(common, { recursive: true, force: true });
      await fs.rm(base, { recursive: true, force: true });
      report.cleanupVerified = true;
    } catch (error) {
      report.cleanupVerified = false;
      report.cleanupError = safeText(error?.message || error, [base, home, userData, common]);
      process.exitCode = 1;
    }
    const resultPath = process.env.YUTANG_NETWORK_RESULT_PATH;
    if (resultPath) {
      await fs.mkdir(path.dirname(resultPath), { recursive: true });
      await fs.writeFile(resultPath, JSON.stringify(report, null, 2) + '\n');
    }
  }
}
const exe = process.argv[2];
if (!exe) throw new Error('Candidate EXE path required');
run(path.resolve(exe)).catch(error => {
  console.error('FAIL_WINDOWS_LPAC_NETWORK_PROBE ' + safeText(error?.message || error));
  process.exitCode = 1;
});
