#!/usr/bin/env node
// Disposable Windows A/B probe for Edge NetworkServiceSandbox.
// Uses the exact Node 24.17.0 and locked Playwright runtime used by the candidate.
// No accounts, model key, Douyin network, user profile, or production files.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const runtime = path.resolve(process.argv[2] || '');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.YUTANG_EDGE_FIREWALL_CONFIRMED !== 'yes' ||
    !path.isAbsolute(runtime)) {
  throw new Error('Refusing to run outside the guarded disposable Windows runner.');
}
assert.equal(process.versions.node, '24.17.0', 'Exact candidate Node runtime required.');
const require = createRequire(path.join(runtime, 'probe-require.cjs'));
const playwrightPackage = require('playwright-core/package.json');
assert.equal(playwrightPackage.version, '1.64.0-alpha-1790635538000', 'Pinned Playwright runtime required.');
const edgeExe = process.env.YUTANG_EDGE_EXE;
assert.ok(typeof edgeExe === 'string' && path.isAbsolute(edgeExe), 'Verified signed Edge path required.');
await fs.access(edgeExe);
const { chromium } = await import(pathToFileURL(path.join(runtime, 'playwright-runtime.mjs')).href);

function psJson(command) {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024
  }).trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
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
function processRows() {
  return psJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
}
function listenerRows(port) {
  const netstat = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000
  });
  return netstat.split(/\r?\n/).flatMap(line => {
    const escaped = String(port);
    const match = new RegExp('^\\s*TCP\\s+(\\S+):' + escaped + '\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$', 'i').exec(line);
    return match ? [{ address: match[1], pid: Number(match[2]) }] : [];
  });
}
async function waitForVersion(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const value = await response.json();
        if (/Edg|Chrome/.test(String(value.Browser))) return value;
      }
    } catch {}
    await delay(200);
  }
  throw new Error('Edge CDP endpoint did not become ready on port ' + port);
}
async function cdpCommand(socket, id, method, params = {}, sessionId = null) {
  return await Promise.race([
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
async function inspectSandbox(port) {
  const version = await waitForVersion(port);
  const socketUrl = new URL(version.webSocketDebuggerUrl);
  assert.equal(socketUrl.hostname, '127.0.0.1', 'CDP WebSocket must be loopback-only.');
  assert.equal(socketUrl.port, String(port), 'CDP WebSocket port mismatch.');
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true });
    }),
    delay(5000).then(() => { throw new Error('CDP WebSocket open timeout'); })
  ]);
  let targetId = null;
  try {
    const target = await cdpCommand(socket, 1, 'Target.createTarget', { url: 'edge://sandbox' });
    targetId = target.targetId;
    const attached = await cdpCommand(socket, 2, 'Target.attachToTarget', { targetId, flatten: true });
    await cdpCommand(socket, 3, 'Runtime.enable', {}, attached.sessionId);
    let snapshot = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const evaluated = await cdpCommand(socket, 4 + attempt, 'Runtime.evaluate', {
        expression: 'JSON.stringify({href:location.href,title:document.title,text:document.body?document.body.innerText:""})',
        returnByValue: true, awaitPromise: true
      }, attached.sessionId);
      if (typeof evaluated.result?.value === 'string') {
        try { snapshot = JSON.parse(evaluated.result.value); } catch {}
      }
      if (snapshot?.text?.trim().length > 100) break;
      await delay(250);
    }
    assert.equal(snapshot?.href, 'edge://sandbox/', 'Edge sandbox diagnostics page did not load.');
    const text = String(snapshot.text || '');
    const rows = text.split(/\r?\n/).map(line => line.split('\t'));
    const networkRow = rows.find(columns => columns[1] === 'Utility' && columns[2] === 'Network Service');
    const rendererRows = rows.filter(columns => columns[1] === 'Renderer');
    const featureEnabled = /"enabled"\s*:\s*true,\s*"name"\s*:\s*"NetworkServiceSandbox"/.test(text);
    const rendererAppContainerEnabled = /"enabled"\s*:\s*true,\s*"name"\s*:\s*"RendererAppContainer"/.test(text);
    const rendererVerified = rendererRows.length > 0 && rendererRows.every(columns =>
      columns[3] === 'Renderer' && columns[4] === 'Lockdown' &&
      /Untrusted/.test(columns[5] || '') && /^S-1-15-2-/.test(columns[8] || ''));
    return {
      browserVersion: String(version.Browser),
      networkServiceFeatureEnabled: featureEnabled,
      networkServiceRow: networkRow ? {
        sandbox: String(networkRow[3] || ''),
        lockdown: String(networkRow[4] || ''),
        integrity: String(networkRow[5] || ''),
        lowboxAppContainer: /^S-1-15-2-/.test(networkRow[8] || '')
      } : null,
      networkServiceSandboxed: Boolean(networkRow && networkRow[3] !== 'Not Sandboxed'),
      rendererProcessCount: rendererRows.length,
      rendererAppContainerEnabled,
      rendererSandboxVerified: rendererVerified && rendererAppContainerEnabled,
      textSample: text.slice(0, 900)
    };
  } finally {
    if (targetId) await cdpCommand(socket, 100, 'Target.closeTarget', { targetId }).catch(() => {});
    try { socket.close(); } catch {}
  }
}
async function waitForGone(profile, port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const processes = processRows();
    const owned = processes.filter(item =>
      /msedge\.exe$/i.test(String(item.Name || '')) &&
      String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
    const listeners = listenerRows(port);
    last = { ownedEdgeProcesses: owned.length, listeners: listeners.length };
    if (!owned.length && !listeners.length) return last;
    await delay(250);
  }
  throw new Error('Edge did not cleanly exit after context.close(): ' + JSON.stringify(last));
}
async function runVariant({ name, port, enableNetworkSandbox, base }) {
  const profile = path.join(base, name + '-profile');
  await fs.mkdir(profile, { recursive: true });
  let context = null;
  const result = { name, port, enableNetworkSandbox, started: false, cleaned: false };
  try {
    const args = [
      '--remote-debugging-port=' + port,
      '--remote-debugging-address=127.0.0.1',
      '--no-first-run',
      '--no-default-browser-check',
      ...(enableNetworkSandbox ? ['--enable-features=NetworkServiceSandbox'] : [])
    ];
    context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge', headless: false, viewport: null, chromiumSandbox: true,
      args, timeout: 30000
    });
    result.started = true;
    const version = await waitForVersion(port);
    const processes = processRows();
    const descendants = processes.filter(item => hasAncestor(Number(item.ProcessId), process.pid, processes));
    const edge = descendants.filter(item => /msedge\.exe$/i.test(String(item.Name || '')));
    const browser = edge.find(item => !/--type=/.test(String(item.CommandLine || '')));
    assert.ok(browser, 'Edge browser process must be a descendant of this probe.');
    const command = String(browser.CommandLine || '');
    assert.ok(command.toLowerCase().includes(profile.toLowerCase()), 'Edge must use only the fresh temporary profile.');
    assert.ok(command.includes('--remote-debugging-port=' + port), 'Edge CDP port argument missing.');
    assert.ok(command.includes('--remote-debugging-address=127.0.0.1'), 'Edge CDP loopback argument missing.');
    assert.doesNotMatch(command, /--no-sandbox|--disable-setuid-sandbox/i, 'Sandbox-disabling argument detected.');
    if (enableNetworkSandbox) assert.match(command, /--enable-features=[^"]*NetworkServiceSandbox/i, 'Network sandbox feature flag missing from browser process.');
    const listeners = listenerRows(port);
    assert.ok(listeners.length > 0, 'CDP listener missing.');
    assert.ok(listeners.every(item => ['127.0.0.1', '::1'].includes(item.address)), 'CDP listener is not loopback-only.');
    assert.ok(listeners.every(item => edge.some(proc => Number(proc.ProcessId) === item.pid)), 'CDP listener is not owned by the Edge process tree.');
    result.browserVersion = String(version.Browser);
    result.edgeProcessCount = edge.length;
    result.listenerCount = listeners.length;
    result.sandbox = await inspectSandbox(port);
    assert.equal(result.sandbox.rendererSandboxVerified, true, 'Renderer sandbox verification failed.');
    if (enableNetworkSandbox) {
      assert.equal(result.sandbox.networkServiceFeatureEnabled, true, 'NetworkServiceSandbox feature flag was not honored.');
      assert.equal(result.sandbox.networkServiceSandboxed, true, 'Network Service still reports Not Sandboxed.');
    }
    result.pass = true;
  } finally {
    if (context) await context.close().catch(error => { result.closeError = String(error?.message || error).slice(0, 500); });
    const cleanup = await waitForGone(profile, port, 15000);
    result.cleanup = cleanup;
    result.cleaned = cleanup.ownedEdgeProcesses === 0 && cleanup.listeners === 0;
    if (!result.cleaned) throw new Error('Variant left Edge processes or listeners behind.');
  }
  return result;
}
async function main() {
  assert.equal(typeof WebSocket, 'function', 'Node 24 WebSocket support required.');
  const firewall = psJson("Get-NetFirewallRule -DisplayName 'YuTangNetworkSandboxProbeBlockOutbound' | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' -and $_.Direction -eq 'Outbound' | Select-Object Name | ConvertTo-Json -Compress");
  assert.equal(firewall.length, 1, 'Verified Edge outbound firewall block is required.');
  const base = await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'yutang-network-sandbox-ab-'));
  const report = {
    node: process.versions.node,
    playwright: playwrightPackage.version,
    edgeOutboundBlocked: true,
    realAccounts: false,
    modelKeyPresent: false,
    variants: []
  };
  try {
    const baseline = await runVariant({ name: 'baseline', port: 9234, enableNetworkSandbox: false, base });
    report.variants.push(baseline);
    const enabled = await runVariant({ name: 'feature-enabled', port: 9235, enableNetworkSandbox: true, base });
    report.variants.push(enabled);
    report.pass = enabled.sandbox.networkServiceFeatureEnabled && enabled.sandbox.networkServiceSandboxed &&
      enabled.sandbox.rendererSandboxVerified && baseline.sandbox.rendererSandboxVerified;
  } finally {
    await fs.rm(base, { recursive: true, force: true }).catch(() => {});
  }
  process.stdout.write('YUTANG_NETWORK_SERVICE_SANDBOX_AB_RESULT ' + JSON.stringify(report) + '\n');
  if (!report.pass) process.exitCode = 1;
}
main().catch(error => {
  process.stderr.write('YUTANG_NETWORK_SERVICE_SANDBOX_AB_FATAL ' + String(error?.stack || error?.message || error).slice(-6000) + '\n');
  process.exitCode = 1;
});
