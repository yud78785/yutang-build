#!/usr/bin/env node
// Candidate-only Windows CI probe. Does not login, run a model, send a message, or modify real profiles.
// A Windows Firewall rule must already block outbound Edge traffic; this probe fails closed without it.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const EXPECTED_EXE = 'c334971b305caaf5a6335f74bcf6111045013637e91bd7a02f1ceeeb0f4705f9';
export const PUBLIC_VIDEO_URL = 'https://www.douyin.com/video/7577614489533680959';
export const PUBLIC_VIDEO_ID = '7577614489533680959';
const FILE = 'Dafeiyu-Douyin-API-1.4.6-win-x64.exe';
const PORT = 9227;
const allowedEnv = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata|username|userdomain|public|allusersprofile|programw6432|os|processor_architecture|number_of_processors|homedrive|homepath|userprofile|appdata|localappdata|temp|tmp|systemdrive|home)$/i;

export function hasHostAncestor(pid, hostPid, procs) {
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(hostPid) || pid < 1 || hostPid < 1) return false;
  const byPid = new Map(procs.map(p => [Number(p.ProcessId), p]));
  const visited = new Set();
  for (let i = 0, cursor = pid; i < 40 && cursor > 0; i++) {
    if (cursor === hostPid) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const parent = Number(byPid.get(cursor)?.ParentProcessId);
    if (!Number.isSafeInteger(parent) || parent < 1) return false;
    cursor = parent;
  }
  return false;
}

export function verifyProcessSnapshot({ processes, hostPid, profile, listenerPids, portAddresses }) {
  const list = processes.filter(p => p && typeof p === 'object');
  const edge = list.filter(p => /msedge\.exe$/i.test(String(p.Name)) &&
    typeof p.CommandLine === 'string' && p.CommandLine.toLowerCase().includes(profile.toLowerCase()));
  if (!edge.length) throw new Error('No MS Edge process in the isolated profile was found');
  if (edge.some(p => !hasHostAncestor(Number(p.ProcessId), hostPid, list)))
    throw new Error('Isolated-profile MS Edge process is not a descendant of recorded browser host');
  const family = list.filter(p => /msedge\.exe$/i.test(String(p.Name)) &&
    hasHostAncestor(Number(p.ProcessId), hostPid, list));
  if (family.some(p => typeof p.CommandLine !== 'string' ||
    /(?:^|\s)--(?:no-sandbox|disable-setuid-sandbox)(?:\s|=|$)/i.test(p.CommandLine)))
    throw new Error('Unsafe or unreadable MS Edge child process command line');
  if (!listenerPids.length || listenerPids.some(pid => !family.some(p => Number(p.ProcessId) === pid)))
    throw new Error('CDP port listener PID is not a descendant MS Edge process');
  if (!portAddresses.length || portAddresses.some(a => !['127.0.0.1', '::1'].includes(a)))
    throw new Error('CDP socket does not listen exclusively on loopback');
  return { edgeProcessCount: family.length, listenerCount: listenerPids.length,
    flagsChecked: true, pidLineageChecked: true, listenerMatchesEdge: true, loopbackOnly: true };
}

export function selfTest() {
  const profile = 'C:\\sandbox\\profile';
  const list = [
    {ProcessId: 9, ParentProcessId: 4, Name:'node.exe',CommandLine:'node api-worker.mjs'},
    {ProcessId: 100, ParentProcessId: 9, Name:'node.exe',CommandLine:`node browser-host.mjs ${profile} C:\\sandbox\\control 9227`},
    {ProcessId: 200, ParentProcessId: 100, Name:'msedge.exe',CommandLine:`msedge.exe --user-data-dir=${profile} --remote-debugging-port=9227 --remote-debugging-address=127.0.0.1`},
    {ProcessId: 201, ParentProcessId: 200, Name:'msedge.exe',CommandLine:`msedge.exe --user-data-dir=${profile} --type=renderer`},
    {ProcessId: 300, ParentProcessId: 4, Name:'msedge.exe',CommandLine:'msedge.exe --remote-debugging-port=9227'}
  ];
  const good={processes:list,hostPid:100,profile,listenerPids:[200],portAddresses:['127.0.0.1']};
  assert.equal(verifyProcessSnapshot(good).listenerMatchesEdge,true);
  assert.equal(hasHostAncestor(201,100,list),true);
  const summary=summarizeHostProcesses(list,100,9,profile,'C:\\sandbox\\control');
  assert.equal(summary.hostFound,true);
  assert.equal(summary.hostIsNode,true);
  assert.equal(summary.hostCommandHasBrowserHost,true);
  assert.equal(summary.hostCommandProfileMatches,true);
  assert.equal(summary.hostCommandControlMatches,true);
  assert.equal(summary.hostParentIsBackend,true);
  assert.equal(summary.edgeWithPortArg,1);
  assert.equal(summary.edgeWithLoopbackArg,1);
  assert.equal(summarizeHostProcesses(list,100,8,profile,'C:\\sandbox\\control').hostParentIsBackend,false);
  assert.doesNotMatch(safeText('Bearer test-secret sk-1234567890'),/test-secret|sk-1234567890/);
  assert.equal(hasHostAncestor(300,100,list),false);
  assert.throws(()=>verifyProcessSnapshot({...good,listenerPids:[300]}),/listener PID/);
  assert.throws(()=>verifyProcessSnapshot({...good,portAddresses:['0.0.0.0']}),/loopback/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===200?{...p,ParentProcessId:300}:p)}),/descendant/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===201?{...p,CommandLine:p.CommandLine+' --no-sandbox'}:p)}),/Unsafe/);
  assert.throws(()=>verifyProcessSnapshot({...good,profile:'C:\\another'}),/No MS Edge/);
  console.log('PASS 8 synthetic Windows process ownership/port binding regression assertions');
}

async function sha256(file) {
  const h=createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function until(work, milliseconds, label) {
  const end=Date.now()+milliseconds;
  let last;
  while(Date.now()<end) {
    try {const v=await work();if(v)return v;} catch(e){last=e;}
    await delay(250);
  }
  throw new Error(`${label} unavailable after ${milliseconds}ms: ${last?.message || 'no evidence'}`);
}
async function readJSON(file) {return JSON.parse(await fs.readFile(file,'utf8'));}
function safeText(value, paths = []) {
  let text = String(value ?? '');
  for (const item of paths) if (typeof item === 'string' && item) text = text.split(item).join('[isolated-path]');
  return text.replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]').slice(-8000);
}
async function readTail(file, max = 8000) {
  try { return (await fs.readFile(file, 'utf8')).slice(-max); } catch { return null; }
}
function summarizeHostProcesses(processes, hostPid, backendPid, profile, control) {
  const list = processes.filter(p => p && typeof p === 'object');
  const host = list.find(p => Number(p.ProcessId) === hostPid);
  const descendants = list.filter(p => hasHostAncestor(Number(p.ProcessId), hostPid, list));
  const edge = descendants.filter(p => /msedge\.exe$/i.test(String(p.Name)));
  const command = String(host?.CommandLine || '');
  return {
    hostFound: Boolean(host),
    hostIsNode: /node\.exe$/i.test(String(host?.Name || '')),
    hostCommandHasBrowserHost: /browser-host\.mjs/i.test(command),
    hostCommandProfileMatches: command.toLowerCase().includes(profile.toLowerCase()),
    hostCommandControlMatches: command.toLowerCase().includes(control.toLowerCase()),
    hostParentIsBackend: Number(host?.ParentProcessId) === backendPid,
    descendantCount: descendants.length,
    edgeProcessCount: edge.length,
    edgeWithPortArg: edge.filter(p => /--remote-debugging-port=9227/i.test(String(p.CommandLine || ''))).length,
    edgeWithProfileArg: edge.filter(p => String(p.CommandLine || '').toLowerCase().includes(profile.toLowerCase())).length,
    edgeWithLoopbackArg: edge.filter(p => /--remote-debugging-address=127\.0\.0\.1/i.test(String(p.CommandLine || ''))).length,
    edgeWithNoSandbox: edge.filter(p => /--no-sandbox|--disable-setuid-sandbox/i.test(String(p.CommandLine || ''))).length,
    edgeWithNetworkSandboxArg: edge.filter(p => String(p.CommandLine || '').includes('--enable-features=NetworkServiceSandbox')).length
  };
}
const ps = script => {
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:25000,maxBuffer:8*1024*1024});
  const json=out.trim();return json?JSON.parse(json):[];
};
const readProcessToken = pid => {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid Network Service PID for token inspection');
  const csharp = [
    'using System;',
    'using System.ComponentModel;',
    'using System.Runtime.InteropServices;',
    'public static class YuTangProcessTokenInspector {',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, int length, out int returned);',
    '  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr text);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr LocalFree(IntPtr memory);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);',
    '  public static object Read(int pid) {',
    '    IntPtr process = OpenProcess(0x1000, false, pid);',
    '    if (process == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '    IntPtr token = IntPtr.Zero;',
    '    try {',
    '      if (!OpenProcessToken(process, 0x0008, out token)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '      IntPtr appBuffer = Marshal.AllocHGlobal(4);',
    '      bool isAppContainer;',
    '      try {',
    '        int returned;',
    '        if (!GetTokenInformation(token, 29, appBuffer, 4, out returned)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '        isAppContainer = Marshal.ReadInt32(appBuffer) != 0;',
    '      } finally { Marshal.FreeHGlobal(appBuffer); }',
    '      string sidText = null;',
    '      if (isAppContainer) {',
    '        int required = 0;',
    '        GetTokenInformation(token, 31, IntPtr.Zero, 0, out required);',
    '        if (required > 0) {',
    '          IntPtr sidInfo = Marshal.AllocHGlobal(required);',
    '          try {',
    '            if (!GetTokenInformation(token, 31, sidInfo, required, out required)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '            IntPtr sid = Marshal.ReadIntPtr(sidInfo);',
    '            if (sid != IntPtr.Zero) {',
    '              IntPtr sidString = IntPtr.Zero;',
    '              if (!ConvertSidToStringSid(sid, out sidString)) throw new Win32Exception(Marshal.GetLastWin32Error());',
    '              try { sidText = Marshal.PtrToStringUni(sidString); }',
    '              finally { if (sidString != IntPtr.Zero) LocalFree(sidString); }',
    '            }',
    '          } finally { Marshal.FreeHGlobal(sidInfo); }',
    '        }',
    '      }',
    '      return new { processId = pid, isAppContainer = isAppContainer, appContainerSid = sidText };',
    '    } finally { if (token != IntPtr.Zero) CloseHandle(token); CloseHandle(process); }',
    '  }',
    '}'
  ].join('\n');
  const script = "$ErrorActionPreference='Stop'\n$source=@'\n" + csharp + "\n'@\nAdd-Type -TypeDefinition $source -ErrorAction Stop\n[YuTangProcessTokenInspector]::Read(" + String(pid) + ") | ConvertTo-Json -Compress";
  return ps(script);
};
const asRows = value => Array.isArray(value) ? value : value ? [value] : [];
const isExpectedFirewallBlock = (status, body) => status === 500 &&
  /ERR_NETWORK_ACCESS_DENIED/i.test(String(body || '')) &&
  /douyin\.com/i.test(String(body || ''));

async function requestBrowserOpen(origin, token, redactPaths) {
  try {
    const response = await fetch(origin + '/api/browser/open', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-session-token': token },
      body: '{}',
      signal: AbortSignal.timeout(49000)
    });
    const body = await response.text();
    return { status: response.status, body: response.ok ? null : safeText(body, redactPaths) };
  } catch (error) {
    return { status: error.name === 'TimeoutError' ? 'HTTP_TIMEOUT' : 'HTTP_' + error.name,
      body: safeText(error.message, redactPaths) };
  }
}

async function closeEdgeViaCdp(port) {
  assert.equal(typeof WebSocket, 'function', 'Node runtime must provide WebSocket for graceful CDP close');
  const response = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, 'CDP version endpoint must respond before close');
  const info = await response.json();
  const socketUrl = new URL(info.webSocketDebuggerUrl);
  assert.equal(socketUrl.hostname, '127.0.0.1', 'CDP WebSocket must be loopback-only');
  assert.equal(socketUrl.port, String(port), 'CDP WebSocket port mismatch');
  const socket = new WebSocket(info.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP WebSocket connection failed')), { once: true });
    }),
    delay(5000).then(() => { throw new Error('CDP WebSocket open timeout'); })
  ]);
  const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
  socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  await Promise.race([
    closed,
    delay(10000).then(() => { try { socket.close(); } catch {} throw new Error('Edge did not close after CDP Browser.close'); })
  ]);
  return { closed: true, cdpHost: socketUrl.hostname, cdpPort: Number(socketUrl.port) };
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
    delay(5000).then(() => { throw new Error('CDP command timeout: ' + method); })
  ]);
}

export async function inspectRendererSandbox(port = PORT, { profile, hostPid } = {}) {
  assert.equal(typeof WebSocket, 'function', 'Node runtime must provide WebSocket for sandbox diagnostics');
  const versionResponse = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) });
  assert.equal(versionResponse.status, 200, 'CDP version endpoint must respond for sandbox diagnostics');
  const version = await versionResponse.json();
  const socketUrl = new URL(version.webSocketDebuggerUrl);
  assert.equal(socketUrl.hostname, '127.0.0.1', 'Sandbox diagnostic CDP must be loopback-only');
  assert.equal(socketUrl.port, String(port), 'Sandbox diagnostic CDP port mismatch');
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('Sandbox diagnostic CDP connection failed')), { once: true });
    }),
    delay(5000).then(() => { throw new Error('Sandbox diagnostic CDP open timeout'); })
  ]);
  let nextId = 1;
  const attempts = [];
  try {
    for (const url of ['edge://sandbox', 'chrome://sandbox']) {
      let targetId = null;
      try {
        const target = await cdpCommand(socket, nextId++, 'Target.createTarget', { url });
        targetId = target.targetId;
        const attached = await cdpCommand(socket, nextId++, 'Target.attachToTarget', { targetId, flatten: true });
        const sessionId = attached.sessionId;
        await cdpCommand(socket, nextId++, 'Runtime.enable', {}, sessionId);
        let snapshot = null;
        for (let attempt = 0; attempt < 18; attempt++) {
          const evaluated = await cdpCommand(socket, nextId++, 'Runtime.evaluate', {
            expression: 'JSON.stringify({href:location.href,title:document.title,ready:document.readyState,text:document.body?document.body.innerText:""})',
            returnByValue: true,
            awaitPromise: true
          }, sessionId);
          const value = evaluated.result?.value;
          if (typeof value === 'string') {
            try { snapshot = JSON.parse(value); } catch {}
          }
          if (snapshot?.text?.trim().length > 20) break;
          await delay(300);
        }
        attempts.push({
          requestedUrl: url,
          actualUrl: String(snapshot?.href || ''),
          title: String(snapshot?.title || '').slice(0, 160),
          readyState: String(snapshot?.ready || ''),
          textLength: String(snapshot?.text || '').length,
          mentionsRenderer: /renderer/i.test(String(snapshot?.text || '')),
          mentionsSandbox: /sandbox/i.test(String(snapshot?.text || ''))
        });
        if (targetId) {
          try { await cdpCommand(socket, nextId++, 'Target.closeTarget', { targetId }); } catch {}
          targetId = null;
        }
        if (snapshot?.text?.trim().length > 20) {
          const text = String(snapshot.text);
          const rows = text.split(/\r?\n/).map(line => line.split('\t'));
          const rendererRows = rows.filter(columns => columns[1] === 'Renderer');
          const rendererAppContainerEnabled = /\"enabled\"\s*:\s*true,\s*\"name\"\s*:\s*\"RendererAppContainer\"/.test(text);
          const networkServiceSandboxEnabled = /\"enabled\"\s*:\s*true,\s*\"name\"\s*:\s*\"NetworkServiceSandbox\"/.test(text);
          const networkServiceRow = rows.find(columns => columns[1] === 'Utility' && columns[2] === 'Network Service');
          const networkServicePid = Number(networkServiceRow?.[0]);
          const networkServiceAppContainerSid = String(networkServiceRow?.[8] || '').match(/S-1-15-2-[0-9-]+/)?.[0] || null;
          let networkServiceToken = null;
          try { networkServiceToken = readProcessToken(networkServicePid); }
          catch (error) { networkServiceToken = { processId: networkServicePid, isAppContainer: false, appContainerSid: null, errorName: String(error?.name || 'Error'), errorCode: typeof error?.code === 'string' ? error.code : null }; }
          const networkServiceWindowsTokenVerified = networkServiceToken?.isAppContainer === true && networkServiceToken?.appContainerSid === networkServiceAppContainerSid && networkServiceAppContainerSid !== null;
          let networkServiceProcessOwned = false;
          let networkServiceProcessDetails = null;
          try {
            const processList = asRows(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Depth 3 -Compress"));
            const networkProcess = processList.find(item => Number(item.ProcessId) === networkServicePid);
            const profileArgPresent = Boolean(networkProcess && typeof networkProcess.CommandLine === 'string' && typeof profile === 'string' && networkProcess.CommandLine.toLowerCase().includes(profile.toLowerCase()));
            const hostAncestorPresent = Boolean(Number.isSafeInteger(hostPid) && hasHostAncestor(networkServicePid, hostPid, processList));
            networkServiceProcessOwned = Boolean(networkProcess && /msedge\\.exe$/i.test(String(networkProcess.Name || '')) && profileArgPresent && hostAncestorPresent);
            networkServiceProcessDetails = {
              name: String(networkProcess?.Name || ''),
              parentPid: Number(networkProcess?.ParentProcessId) || null,
              profileArgPresent,
              hostAncestorPresent
            };
          } catch (error) {
            networkServiceProcessDetails = { errorName: String(error?.name || 'Error'), errorCode: typeof error?.code === 'string' ? error.code : null };
          }
          const networkServiceFullIsolationVerified = networkServiceWindowsTokenVerified && networkServiceProcessOwned;
          const rendererRowsVerified = rendererRows.length > 0 && rendererRows.every(columns =>
            columns[3] === 'Renderer' && columns[4] === 'Lockdown' && /Untrusted/.test(columns[5] || '') && /^S-1-15-2-/.test(columns[8] || ''));
          const rendererSandboxVerified = rendererRowsVerified && rendererAppContainerEnabled;
          return {
            accessible: true,
            requestedUrl: url,
            actualUrl: String(snapshot.href || ''),
            title: String(snapshot.title || '').slice(0, 160),
            textSample: text.slice(0, 1800),
            mentionsRenderer: rendererRows.length > 0,
            mentionsSandbox: /sandbox/i.test(text),
            rendererProcessCount: rendererRows.length,
            rendererAppContainerEnabled,
            rendererRowsVerified,
            rendererSandboxVerified,
            rendererRows: rendererRows.map(columns => ({ sandbox:columns[3], lockdown:columns[4], integrity:columns[5], lowboxAppContainer:Boolean(/^S-1-15-2-/.test(columns[8] || '')) })),
            networkServiceSandboxEnabled,
            networkServiceSandboxType: String(networkServiceRow?.[3] || ''),
            networkServiceLockdown: String(networkServiceRow?.[4] || ''),
            networkServiceIntegrity: String(networkServiceRow?.[5] || ''),
            networkServicePid,
            networkServiceAppContainerSid,
            networkServiceLowboxAppContainer: networkServiceAppContainerSid !== null,
            networkServiceToken,
            networkServiceWindowsTokenVerified,
            networkServiceProcessOwned,
            networkServiceProcessDetails,
            networkServiceFullIsolationVerified,
            networkServiceReportedNotSandboxed: networkServiceRow?.[3] === 'Not Sandboxed',
            networkServiceSandboxReported: networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network',
            explicitSandboxPositive: rendererSandboxVerified && networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network',
            explicitSandboxFullPositive: rendererSandboxVerified && networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network' && networkServiceFullIsolationVerified,
            explicitSandboxNegative: false,
            attempts
          };
        }
      } catch (error) {
        attempts.push({ requestedUrl: url, error: safeText(error?.message || error) });
        if (targetId) {
          try { await cdpCommand(socket, nextId++, 'Target.closeTarget', { targetId }); } catch {}
        }
      }
    }
    return { accessible: false, attempts };
  } finally {
    try { socket.close(); } catch {}
  }
}

function ownedProfileProcesses(profile, controlDir) {
  const value = ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4");
  const p = profile.toLowerCase(), c = controlDir.toLowerCase();
  return asRows(value).filter(item => {
    const command = String(item.CommandLine || '').toLowerCase();
    return command.includes(p) || command.includes(c);
  });
}

function loopbackListeners(port) {
  const script = '$items=@(); try { $items=@(Get-NetTCPConnection -LocalPort ' + port +
    ' -State Listen -ErrorAction Stop) } catch { $items=@() }; if($items.Count -gt 0) {' +
    '$items | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 3 } else { "[]" }';
  return asRows(ps(script));
}

async function waitForBrowserGone(hostPid, profile, controlDir, port) {
  return until(async () => {
    const owned = ownedProfileProcesses(profile, controlDir);
    const listeners = loopbackListeners(port);
    if (!owned.length && !listeners.length) return { clean: true, hostPid, edgeAndHostProcesses: 0, listeners: 0 };
    return null;
  }, 15000, 'browser-host and Edge process cleanup');
}

function assertUnrelatedEdgeAlive(profile, port) {
  const all = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4"));
  const owned = all.filter(item => String(item.CommandLine || '').toLowerCase().includes(profile.toLowerCase()));
  const listeners = loopbackListeners(port);
  assert.ok(owned.length > 0, 'Unrelated Edge process disappeared during candidate browser operation');
  assert.ok(listeners.length > 0, 'Unrelated Edge CDP listener disappeared during candidate browser operation');
  assert.ok(listeners.every(item => item.LocalAddress === '127.0.0.1' || item.LocalAddress === '::1'), 'Unrelated Edge CDP listener is not loopback-only');
  assert.ok(listeners.every(item => owned.some(p => Number(p.ProcessId) === Number(item.OwningProcess))), 'Unrelated Edge CDP listener is not owned by its separate Edge process tree');
  return { processCount: owned.length, listenerCount: listeners.length, loopbackOnly: true };
}

async function waitForNewBrowserState(control, previousPid, previousStartedAt, profile) {
  return until(async () => {
    const state = await readJSON(control);
    if (state.launchFailure) throw new Error('Restarted browser host reported ' + String(state.launchFailure.code || 'failure'));
    if (state.ready === true && state.profile === profile && state.port === PORT &&
        Number.isSafeInteger(state.pid) && state.pid > 0 &&
        Number(state.startedAt) > Number(previousStartedAt)) return state;
    return null;
  }, 25000, 'new browser-host PID and ready state after restart');
}

async function inspectReadyBrowser(state, backendPid, profile, controlDir) {
  assert.equal(path.resolve(state.profile).toLowerCase(), path.resolve(profile).toLowerCase(), 'Dedicated browser profile not isolated');
  assert.equal(state.port, PORT);
  assert.ok(Number.isSafeInteger(state.pid) && state.pid > 0);
  const version = await (await fetch('http://127.0.0.1:' + PORT + '/json/version', { signal: AbortSignal.timeout(5000) })).json();
  assert.match(String(version.Browser), /(?:Edg|Chrome)/);
  const processes = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4"));
  const listeners = loopbackListeners(PORT);
  const hostSummary = summarizeHostProcesses(processes, state.pid, backendPid, profile, controlDir);
  assert.equal(hostSummary.hostFound, true, 'Browser host PID is not present in the process snapshot');
  assert.equal(hostSummary.hostIsNode, true, 'Browser host is not the expected Node process');
  assert.equal(hostSummary.hostCommandHasBrowserHost, true, 'Browser host command line does not identify browser-host.mjs');
  assert.equal(hostSummary.hostCommandProfileMatches, true, 'Browser host profile argument does not match the isolated profile');
  assert.equal(hostSummary.hostCommandControlMatches, true, 'Browser host control argument does not match the isolated control directory');
  assert.equal(hostSummary.hostParentIsBackend, true, 'Browser host is not a child of the expected API backend');
  assert.ok(hostSummary.edgeWithPortArg > 0, 'Edge command line does not include the expected CDP port');
  assert.ok(hostSummary.edgeWithLoopbackArg > 0, 'Edge command line does not include the loopback-only CDP address');
  const ownership = verifyProcessSnapshot({
    processes, hostPid: state.pid, profile,
    listenerPids: listeners.map(item => Number(item.OwningProcess)),
    portAddresses: listeners.map(item => item.LocalAddress)
  });
  assert.equal(hostSummary.edgeWithNoSandbox, 0, 'A sandbox-disabling Edge argument was detected');
  assert.ok(hostSummary.edgeWithNetworkSandboxArg > 0, 'Network Service sandbox launch flag was not passed to Edge');
  return { state, browserVersion: version.Browser, hostSummary, ownership };
}

async function readColdStartDiagnostics(userData, candidatePid, exeFile, redactionPaths) {
  // This diagnostic only reads disposable runner evidence. Never dump arbitrary files,
  // raw process arguments, environment values, credentials, or user browser profiles.
  const report = { userDataEntryNames: [], startupEvents: [], startupError: null,
    runtimeDirectoryCount: 0, processTree: [], possibleUnrelatedTempExecutables: 0 };
  try {
    report.userDataEntryNames = (await fs.readdir(userData)).filter(name => /^[A-Za-z0-9._-]{1,100}$/.test(name)).slice(0,35);
    const logDir = path.join(userData, 'startup-diagnostics');
    const files = (await fs.readdir(logDir)).filter(name => /^[A-Za-z0-9._-]{1,110}\.jsonl$/.test(name)).sort().slice(-2);
    for (const name of files) {
      const content = await fs.readFile(path.join(logDir, name), 'utf8');
      for (const line of content.split(/\r?\n/).filter(Boolean).slice(-45)) {
        try {
          const record = JSON.parse(line);
          const event = /^[a-z.-]{1,60}$/.test(String(record.event)) ? record.event : 'unknown';
          const stage = /^[A-Za-z0-9_.-]{1,60}$/.test(String(record.stage || '')) ? record.stage : null;
          report.startupEvents.push({ event, stage, seq: Number(record.seq), at: String(record.at).slice(0,30) });
        } catch { report.startupEvents.push({ event: 'unparseable-startup-record' }); }
      }
    }
  } catch (error) {
    report.startupEvidenceError = String(error?.code || error?.name || 'read-failed').slice(0,80);
  }
  try {
    report.startupError = safeText(await readTail(path.join(userData, 'startup-error.txt'), 2500), redactionPaths);
  } catch {}
  try { report.runtimeDirectoryCount = (await fs.readdir(path.join(userData, 'runtimes'))).length; }
  catch {}
  try {
    const rows = asRows(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress -Depth 3"));
    const byPid = new Map(rows.map(item => [Number(item.ProcessId), item]));
    const isCandidateDescendant = pid => hasHostAncestor(pid, candidatePid, rows);
    const descendants = rows.filter(item => isCandidateDescendant(Number(item.ProcessId)));
    report.processTree = descendants.slice(0,45).map(item => ({
      pid: Number(item.ProcessId), parentPid: Number(item.ParentProcessId),
      image: String(item.Name || '').slice(0,90),
      isOriginalCandidate: Number(item.ProcessId) === candidatePid,
      isTempExecutable: String(item.ExecutablePath || '').toLowerCase().startsWith(String(process.env.RUNNER_TEMP || '').toLowerCase())
    }));
    report.possibleUnrelatedTempExecutables = rows.filter(item => {
      const executable = String(item.ExecutablePath || '').toLowerCase();
      return executable.includes('ns') && executable.includes('.tmp') && !isCandidateDescendant(Number(item.ProcessId));
    }).length;
    report.candidatePidVisible = byPid.has(candidatePid);
    report.candidateImageName = path.basename(exeFile);
  } catch (error) {
    report.processSnapshotError = String(error?.code || error?.name || 'process-query-failed').slice(0,80);
  }
  return report;
}

async function run(exeFile) {
  if (process.platform!=='win32' || process.env.GITHUB_ACTIONS!=='true' || process.env.YUTANG_PUBLIC_VIDEO_TEST_ALLOWED!=='yes')
    throw new Error('Refusing public video probe outside the explicitly guarded ephemeral Windows GitHub runner');
  assert.equal(path.basename(exeFile),FILE);
  assert.equal(await sha256(exeFile),EXPECTED_EXE,'Candidate EXE does not match immutable build');
  const base=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(),'yutang-edge-ci-'));
  const videoEvidenceDir=path.join(process.env.RUNNER_TEMP || tmpdir(),'yutang-public-video-evidence');
  await fs.rm(videoEvidenceDir,{recursive:true,force:true});
  await fs.mkdir(videoEvidenceDir,{recursive:true});
  const home=process.env.USERPROFILE || process.env.HOME;
  if(typeof home!=='string'||!path.isAbsolute(home))throw new Error('Native Windows USERPROFILE is unavailable; refusing to launch candidate.');
  const common=path.join(home,'.yutang-observer-isolated');
  if(await fs.access(common).then(()=>true,()=>false))throw new Error('Pre-existing browser state found on disposable runner; refusing to overwrite it.');
  const userData=path.join(base,'user-data'),memory=path.join(base,'memory');
  const locationFile=path.join(base,'runtime-location.json');
  const paths={stateDir:path.join(base,'state'),memoryDir:memory,memoryDbPath:path.join(memory,'shared.sqlite'),mediaEnvFile:path.join(base,'media','.env'),mediaSettingsFile:path.join(base,'media','settings.local.json'),mediaRuntimeRoot:path.join(base,'media'),mediaModelsDir:path.join(base,'media','models')};
  for(const d of [userData,memory,paths.stateDir,paths.mediaRuntimeRoot])await fs.mkdir(d,{recursive:true});
  await fs.writeFile(locationFile,JSON.stringify({version:1,...paths}));
  await fs.writeFile(paths.mediaEnvFile,'');
  await fs.writeFile(paths.mediaSettingsFile,JSON.stringify({enabled:false,backend:'local-whisper'}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowedEnv.test(key)));
  Object.assign(env,{DSH_HOME:path.join(home,'.dsh'),DOUYIN_DESKTOP_USER_DATA:userData,DOUYIN_RUNTIME_LOCATION_FILE:locationFile,DOUYIN_DESKTOP_SMOKE:'1'});
  // Keep native Windows user-profile paths. Only YuTang state, app userData and memory are redirected to disposable paths.
  // No GITHUB_TOKEN, CI tokens, personal credentials or model API keys are passed to the EXE.
  const edgeExe=process.env.YUTANG_EDGE_EXE;
  assert.ok(typeof edgeExe === 'string' && path.isAbsolute(edgeExe), 'Verified Microsoft Edge executable path is required');
  try { await fs.access(edgeExe); } catch { throw new Error('Verified Microsoft Edge executable path is required'); }
  const unrelatedProfile=path.join(base,'unrelated-edge-profile');
  let unrelatedEdgeChild=null;
  const preExistingEdgeValue=ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 3");
  const preExistingEdge=Array.isArray(preExistingEdgeValue)?preExistingEdgeValue:(preExistingEdgeValue?[preExistingEdgeValue]:[]);
  assert.equal(preExistingEdge.length,0,'Cold-start test requires zero pre-existing Edge processes before candidate launch.');
  const child=spawn(exeFile,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore',shell:false});
  const candidateExit={error:null,exit:null};
  child.once('error',error=>{candidateExit.error=safeText(error?.message||error);});
  child.once('exit',(code,signal)=>{candidateExit.exit={code,signal};});
  const controlDir=path.join(common,'control');
  const control=path.join(controlDir,'browser.json');
  const profile=path.join(common,'cli-profile');
  const envKeys=['HOMEDRIVE','HOMEPATH','USERNAME','USERDOMAIN','SystemDrive','ProgramFiles','ProgramFiles(x86)','ProgramData','SystemRoot','TEMP','TMP'];
  const report={type:'WINDOWS_EDGE_LAUNCH_IN_EPHEMERAL_CI_ONLY',candidateSha256:EXPECTED_EXE,realAccount:false,modelKey:false,externalEdgeNetworkBlocked:false,publicDouyinOnlyTestTarget:PUBLIC_VIDEO_URL,environmentProfile:'isolated-safe-expanded',safeEnvPresence:Object.fromEntries(envKeys.map(key=>[key,Boolean(env[key])]))};
  let backendPid=null;
  try {
    const readyDeadline=Date.now()+85000;
    let ready=null;
    while(Date.now()<readyDeadline){
      if(candidateExit.error)throw new Error('Candidate EXE spawn error: '+candidateExit.error);
      if(candidateExit.exit)throw new Error('Candidate EXE exited before desktop readiness: '+JSON.stringify(candidateExit.exit));
      try{const x=await readJSON(path.join(userData,'desktop-smoke.json'));if(x.ready===true){ready=x;break;}}
      catch(error){if(error.code!=='ENOENT')throw error;}
      await delay(250);
    }
    if(!ready)throw new Error('Packaged EXE startup unavailable after 85000ms; candidateExit='+JSON.stringify(candidateExit));
    backendPid=ready.backendPid;
    assert.equal(ready.configured,false,'EXE must not be configured with a model key');
    assert.equal(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(path.join(home,'.yutang-observer-isolated','memory')).toLowerCase(),'candidate must use new isolated memory');
    assert.notEqual(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(memory).toLowerCase(),'candidate must not inherit injected old shared memory');
    assert.match(ready.origin,/^http:\/\/127\.0\.0\.1:\d{4,5}$/);
    report.desktopReady=true;
    report.candidatePid=child.pid;
    report.candidateExit=candidateExit;
    report.backendPid=ready.backendPid;
    console.log('PHASE_EXE_DESKTOP_READY: true; isolated memory and no model key confirmed');
    const bootstrap=await (await fetch(ready.origin+'/api/bootstrap',{signal:AbortSignal.timeout(5000)})).json();
    assert.equal(typeof bootstrap.token,'string');assert.ok(bootstrap.token.length>10);
    const redactionPaths=[base,home,userData,memory,profile,path.dirname(control),locationFile];
    const firstOpen=await requestBrowserOpen(ready.origin,bootstrap.token,redactionPaths);
    report.browserOpenHttpStatus=firstOpen.status;
    report.browserOpenHttpBody=firstOpen.body;
    console.log('PHASE_OPEN_BROWSER_REQUEST: '+String(firstOpen.status));
    const outcome=await until(async()=>{
      const x=await readJSON(control);
      if(x.ready===true)return {kind:'ready',state:x};
      if(x.launchFailure)return {kind:'failed',state:x};
      return null;
    },20000,'dedicated browser ready/failure state');
    if(outcome.kind==='failed'){
      const failure=outcome.state.launchFailure||{};
      report.hostFailure={code:typeof failure.code==='string'?failure.code.slice(0,80):null,message:safeText(failure.message,redactionPaths),details:safeText(failure.details,redactionPaths)};
      throw new Error('Browser host reported '+(report.hostFailure.code||'unknown failure'));
    }
    let state=outcome.state;
    const firstFirewallBlock=isExpectedFirewallBlock(firstOpen.status,firstOpen.body);
    report.douyinNavigationBlockedByFirewall=firstFirewallBlock;
    report.videoPlaybackTested=false;
    if(firstFirewallBlock) {
      console.log('EXPECTED_FIREWALL_BLOCK: browser host is ready; Douyin navigation is intentionally blocked in this no-network test.');
    } else {
      assert.equal(firstOpen.status,200,'Browser open API must return HTTP 200 or the expected outbound-firewall denial; received '+String(firstOpen.status));
    }
    const initialCheck=await inspectReadyBrowser(state,ready.backendPid,profile,controlDir);
    try {
      report.rendererSandbox = await inspectRendererSandbox(PORT, { profile, hostPid: state.pid });
      console.log('RENDERER_AND_NETWORK_SANDBOX_DIAGNOSTIC '+JSON.stringify({
        rendererSandboxVerified:report.rendererSandbox.rendererSandboxVerified,
        rendererProcessCount:report.rendererSandbox.rendererProcessCount,
        networkServiceSandboxEnabled:report.rendererSandbox.networkServiceSandboxEnabled,
        networkServiceSandboxType:report.rendererSandbox.networkServiceSandboxType,
        networkServiceLockdown:report.rendererSandbox.networkServiceLockdown,
        networkServiceIntegrity:report.rendererSandbox.networkServiceIntegrity,
        networkServiceLowboxAppContainer:report.rendererSandbox.networkServiceLowboxAppContainer,
        networkServiceWindowsTokenVerified:report.rendererSandbox.networkServiceWindowsTokenVerified,networkServiceProcessOwned:report.rendererSandbox.networkServiceProcessOwned
      }));
      assert.equal(report.rendererSandbox.rendererSandboxVerified, true, 'Edge internal sandbox page did not prove renderer AppContainer/Lockdown/Untrusted integrity.');
      assert.equal(report.rendererSandbox.networkServiceSandboxReported, true, 'Edge internal sandbox page did not report Network Service sandbox type Network with the feature enabled.');
      assert.equal(report.rendererSandbox.networkServiceWindowsTokenVerified, true, 'Network Service process token AppContainer SID did not match edge://sandbox.');
      assert.equal(report.rendererSandbox.networkServiceProcessOwned, true, 'Network Service process was not verified as a child of this dedicated Edge host/profile.');
    } catch (error) {
      report.rendererSandbox = { accessible:false, error:safeText(error?.message || error, redactionPaths) };
      console.log('RENDERER_AND_NETWORK_SANDBOX_DIAGNOSTIC '+JSON.stringify(report.rendererSandbox));
      throw error;
    }
    // Use the production Core BrowserController against the candidate-owned Edge.
    // No model, login, cookie import, search scraping, likes, comments, follows or posting.
    // Stop immediately on login/captcha/unsupported pages; never automate a verification.
    const publicVideoProbe={
      target:'public-single-video',
      requestedVideoId:PUBLIC_VIDEO_ID,
      outcome:'not_started',
      loginRequired:false,
      verificationRequired:false,
      unsupportedPage:false,
      frames:0,
      captureMethods:[],
      frameTimes:[],
      decodedFrameCounts:[],
      frameHashes:[],
      playbackProgressSeconds:0
    };
    let verificationController=null;
    try {
      const runtimeBase=path.join(userData,'runtimes');
      const runtimeEntries=(await fs.readdir(runtimeBase)).filter(name=>/^[a-f0-9]{20}$/.test(name));
      assert.equal(runtimeEntries.length,1,'Expected exactly one prepared private runtime for this candidate.');
      const runtime=path.join(runtimeBase,runtimeEntries[0]);
      const {BrowserController,verifySharedVideoFrameProof}=await import(pathToFileURL(path.join(runtime,'core.mjs')).href);
      const {ApiAgent}=await import(pathToFileURL(path.join(runtime,'api-agent.mjs')).href);
      verificationController=new BrowserController({
        source:'verification',
        memory:{recordVideo(){}},
        personaMemory:{recordViewing(){}}
      });
      const openResult=await verificationController.execute('douyin_open_video',{url:PUBLIC_VIDEO_URL},{signal:AbortSignal.timeout(45000)});
      let pageState=openResult?.state||openResult;
      let currentUrl=verificationController.page?.url()||'';
      let currentOrigin=null,currentPath=null;
      try{const parsed=new URL(currentUrl);currentOrigin=parsed.origin;currentPath=parsed.pathname;}catch{}
      publicVideoProbe.pageOrigin=currentOrigin;
      publicVideoProbe.pagePath=currentPath;
      publicVideoProbe.loginRequired=pageState?.loginRequired===true;
      publicVideoProbe.verificationRequired=pageState?.verificationRequired===true;
      publicVideoProbe.unsupportedPage=pageState?.unsupportedPage===true;
      publicVideoProbe.actualVideoId=typeof pageState?.video?.id==='string'?pageState.video.id:null;
      publicVideoProbe.readyState=Number.isInteger(pageState?.video?.readyState)?pageState.video.readyState:null;
      publicVideoProbe.initialPaused=typeof pageState?.video?.paused==='boolean'?pageState.video.paused:null;
      publicVideoProbe.durationSeconds=Number.isFinite(pageState?.video?.duration)?pageState.video.duration:null;
      if(publicVideoProbe.loginRequired) publicVideoProbe.outcome='safe_stop_login_required';
      else if(publicVideoProbe.verificationRequired) publicVideoProbe.outcome='safe_stop_verification_required';
      else if(publicVideoProbe.unsupportedPage||currentOrigin!=='https://www.douyin.com') publicVideoProbe.outcome='safe_stop_unsupported_or_redirected';
      else if(publicVideoProbe.actualVideoId!==PUBLIC_VIDEO_ID||publicVideoProbe.readyState<2) publicVideoProbe.outcome='safe_stop_video_not_ready_or_identity_mismatch';
      else {
        const playResult=await verificationController.execute('douyin_play',{}, {signal:AbortSignal.timeout(10000)});
        pageState=playResult?.state||playResult;
        if(pageState?.loginRequired||pageState?.verificationRequired||pageState?.unsupportedPage||pageState?.video?.id!==PUBLIC_VIDEO_ID||pageState?.video?.paused!==false){
          publicVideoProbe.outcome=pageState?.loginRequired?'safe_stop_login_required_after_play':pageState?.verificationRequired?'safe_stop_verification_required_after_play':'safe_stop_playback_not_confirmed';
        }else{
          const observed=await verificationController.captureSharedFrames(2.2,AbortSignal.timeout(20000));
          const proofValid=verifySharedVideoFrameProof(observed,PUBLIC_VIDEO_ID);
          const frames=Array.isArray(observed?.frames)?observed.frames:[];
          const canvasOnly=frames.length===3&&frames.every(frame=>frame.captureMethod==='video-canvas-jpeg-v1'&&frame.mimeType==='image/jpeg');
          publicVideoProbe.proofValid=proofValid;
          publicVideoProbe.frames=frames.length;
          publicVideoProbe.captureMethods=frames.map(frame=>frame.captureMethod);
          publicVideoProbe.frameTimes=frames.map(frame=>Number(frame.time));
          publicVideoProbe.decodedFrameCounts=frames.map(frame=>({before:frame.captureInterval?.before?.decodedFrames,after:frame.captureInterval?.after?.decodedFrames}));
          publicVideoProbe.playbackProgressSeconds=Number(observed?.observation?.playbackProgressSeconds)||0;
          publicVideoProbe.actualWallSeconds=Number(observed?.observation?.actualWallSeconds)||0;
          publicVideoProbe.afterPaused=observed?.state?.video?.paused;
          if(!proofValid) publicVideoProbe.outcome='capture_proof_rejected';
          else if(!canvasOnly) publicVideoProbe.outcome='safe_stop_canvas_capture_not_available';
          else{
            for(let i=0;i<frames.length;i++){
              const bytes=Buffer.from(frames[i].data,'base64');
              if(bytes.length<800||bytes.length>2_000_000)throw new Error('Public video frame size outside safe capture bounds.');
              const hash=createHash('sha256').update(bytes).digest('hex');
              publicVideoProbe.frameHashes.push(hash);
              await fs.writeFile(path.join(videoEvidenceDir,'frame-'+String(i+1)+'.jpg'),bytes,{flag:'wx'});
            }
            if(new Set(publicVideoProbe.frameHashes).size!==3)throw new Error('Public video did not produce three distinct frame images.');
            if(!(publicVideoProbe.frameTimes[0]<publicVideoProbe.frameTimes[1]&&publicVideoProbe.frameTimes[1]<publicVideoProbe.frameTimes[2]))throw new Error('Public video playback timestamps did not advance.');

            // Exercise the production multimodal ApiAgent request builder with an offline provider stub.
            // The stub validates that real captured frames become model-facing image_url parts; it never calls the network.
            let modelInputReport=null;
            const apiAgent=new ApiAgent({
              controller:verificationController,
              config:{apiKey:'',baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
              fetchImpl:async()=>{throw new Error('Live model HTTP calls are forbidden in the credential-free CI probe.');}
            });
            const offlineDecision=await apiAgent.decideWatch({
              observation:observed,
              context:'',
              watchOptions:{mode:'recommend',topics:[],exclude:[]},
              decisionProvider:async({messages})=>{
                const userContent=messages.find(message=>message.role==='user')?.content;
                const imageParts=Array.isArray(userContent)?userContent.filter(part=>part?.type==='image_url'):[];
                const textPart=Array.isArray(userContent)?userContent.find(part=>part?.type==='text')?.text:'';
                assert.ok(imageParts.length>=1&&imageParts.length<=3,'Production ApiAgent must pass one storyboard or the original sampled images.');
                assert.ok(imageParts.every(part=>typeof part.image_url?.url==='string'&&part.image_url.url.startsWith('data:image/jpeg;base64,')),'Model-facing frames must be inline JPEG image_url data.');
                assert.ok(String(textPart).includes(PUBLIC_VIDEO_ID),'Model-facing text must bind frames to the verified public video ID.');
                const manifest=apiAgent.lastVisualPacking;
                modelInputReport={
                  provider:'offline-test-stub-no-network',
                  model:'deepseek-flash',
                  imageParts:imageParts.length,
                  inputImages:manifest?.inputImages??null,
                  outputImages:manifest?.outputImages??imageParts.length,
                  storyboardStatus:manifest?.status??'unknown',
                  allImagePartsAreInlineJpeg:true,
                  videoIdentityInText:String(textPart).includes(PUBLIC_VIDEO_ID)
                };
                return{
                  text:JSON.stringify({action:'stop',reason:'Offline payload-path test only; no live model inference.',topics:[],reflection:'The production adapter received the verified sampled frames.'}),
                  usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}
                };
              }
            });
            assert.equal(offlineDecision.decision.action,'stop');
            assert.ok(modelInputReport?.allImagePartsAreInlineJpeg===true);
            publicVideoProbe.modelInputPayloadVerified=true;
            publicVideoProbe.modelInferencePerformed=false;
            publicVideoProbe.modelInput=modelInputReport;
            publicVideoProbe.outcome='PASS_PUBLIC_VIDEO_CORE_CAPTURE_AND_MODEL_INPUT_PACKING';
            publicVideoProbe.proofValid=true;
            report.videoPlaybackTested=true;
          }
        }
      }
    }catch(error){
      publicVideoProbe.outcome='safe_stop_or_probe_error';
      publicVideoProbe.errorName=String(error?.name||'Error').slice(0,80);
      publicVideoProbe.errorCode=typeof error?.code==='string'?error.code.slice(0,80):null;
      // No error message, page text, cookies, author/title, or request headers are written to evidence.
    }finally{
      if(verificationController?.page&&!verificationController.page.isClosed()){
        await verificationController.page.evaluate(()=>{for(const video of document.querySelectorAll('video'))HTMLMediaElement.prototype.pause.call(video);}).catch(()=>{});
        await verificationController.page.close().catch(()=>{});
      }
    }
    report.publicVideoProbe=publicVideoProbe;
    console.log('PUBLIC_DOYIN_VIDEO_PROBE_RESULT '+JSON.stringify(publicVideoProbe));
    await fs.writeFile(path.join(videoEvidenceDir,'probe-result.json'),JSON.stringify(publicVideoProbe,null,2)+'\n',{flag:'wx'});
    report.coldStartVerified=true;
    report.preExistingEdgeProcessCount=preExistingEdge.length;
    await fs.mkdir(unrelatedProfile,{recursive:true});
    unrelatedEdgeChild=spawn(edgeExe,[
      '--user-data-dir='+unrelatedProfile,'--remote-debugging-port=9231',
      '--remote-debugging-address=127.0.0.1','--no-first-run','about:blank'
    ],{detached:true,windowsHide:true,stdio:'ignore',shell:false});
    unrelatedEdgeChild.unref();
    await until(async()=>{
      const response=await fetch('http://127.0.0.1:9231/json/version',{signal:AbortSignal.timeout(2000)});
      if(!response.ok)return null;
      const version=await response.json();
      if(!/(?:Edg|Chrome)/.test(String(version.Browser)))return null;
      return assertUnrelatedEdgeAlive(unrelatedProfile,9231);
    },20000,'independent unrelated Edge process and CDP listener started after cold candidate launch');
    const lifecycle={launchCount:1,closeCount:0,hostPids:[state.pid],cycles:[]};
    Object.assign(report,initialCheck.ownership,{
      hostPid:state.pid,backendPid:ready.backendPid,hostSummary:initialCheck.hostSummary,
      browserVersion:initialCheck.browserVersion,browserReady:true,cdpResponded:true
    });
    const unrelatedInitial=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
    console.log('PASS_WINDOWS_PACKAGED_EXE_INITIAL_BROWSER '+JSON.stringify({
      hostPid:state.pid,browserVersion:initialCheck.browserVersion,
      edgeProcessCount:initialCheck.ownership.edgeProcessCount,
      listenerCount:initialCheck.ownership.listenerCount,
      loopbackOnly:initialCheck.ownership.loopbackOnly,
      sandboxFlagsChecked:initialCheck.ownership.flagsChecked,
      networkSandboxFlagPassed:initialCheck.hostSummary.edgeWithNetworkSandboxArg>0,
      unrelatedEdgeStartedAfterColdStart:true,
      unrelatedEdgeStillAlive:unrelatedInitial.processCount>0&&unrelatedInitial.listenerCount>0
    }));

    // Close the owned Edge through its loopback CDP endpoint, then prove the host and every Edge child exit.
    // Repeat two restarts to exercise stale-state handling and the exact detached host spawn path.
    for(let cycle=1;cycle<=2;cycle++) {
      const previousPid=state.pid, previousStartedAt=state.startedAt;
      const closeResult=await closeEdgeViaCdp(PORT);
      const closeProof=await waitForBrowserGone(previousPid,profile,controlDir,PORT);
      const unrelatedAfterClose=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
      lifecycle.closeCount++;
      const cycleReport={cycle,closedPid:previousPid,closeViaCdp:closeResult.closed===true,closeVerified:closeProof.clean===true,processesRemaining:closeProof.edgeAndHostProcesses,listenersRemaining:closeProof.listeners,unrelatedEdgeStillAlive:unrelatedAfterClose.processCount>0&&unrelatedAfterClose.listenerCount>0};
      assert.equal(cycleReport.closeVerified,true,'Owned Edge or browser-host remained after CDP Browser.close');

      const nextOpen=await requestBrowserOpen(ready.origin,bootstrap.token,redactionPaths);
      const nextFirewallBlock=isExpectedFirewallBlock(nextOpen.status,nextOpen.body);
      assert.ok(nextOpen.status===200||nextFirewallBlock,'Restarted browser open failed unexpectedly: '+String(nextOpen.status)+' '+String(nextOpen.body||''));
      cycleReport.restartOpenStatus=nextOpen.status;
      cycleReport.restartNavigationBlockedByFirewall=nextFirewallBlock;
      const nextState=await waitForNewBrowserState(control,previousPid,previousStartedAt,profile);
      const nextCheck=await inspectReadyBrowser(nextState,ready.backendPid,profile,controlDir);
      const unrelatedAfterRestart=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
      cycleReport.restartedPid=nextState.pid;
      cycleReport.unrelatedEdgeStillAliveAfterRestart=unrelatedAfterRestart.processCount>0&&unrelatedAfterRestart.listenerCount>0;
      cycleReport.restartReady=true;
      cycleReport.restartBrowserVersion=nextCheck.browserVersion;
      cycleReport.restartEdgeProcessCount=nextCheck.ownership.edgeProcessCount;
      cycleReport.restartListenerCount=nextCheck.ownership.listenerCount;
      cycleReport.restartLoopbackOnly=nextCheck.ownership.loopbackOnly;
      lifecycle.launchCount++;
      lifecycle.hostPids.push(nextState.pid);
      lifecycle.cycles.push(cycleReport);
      state=nextState;
      console.log('PASS_WINDOWS_PACKAGED_EXE_RESTART_CYCLE '+JSON.stringify(cycleReport));
    }

    const finalPid=state.pid;
    const finalClose=await closeEdgeViaCdp(PORT);
    const finalProof=await waitForBrowserGone(finalPid,profile,controlDir,PORT);
    lifecycle.closeCount++;
    lifecycle.finalCloseVerified=finalClose.closed===true&&finalProof.clean===true;
    lifecycle.finalHostPid=finalPid;
    lifecycle.finalProcessesRemaining=finalProof.edgeAndHostProcesses;
    lifecycle.finalListenersRemaining=finalProof.listeners;
    assert.equal(lifecycle.finalCloseVerified,true,'Final Edge/browser-host close left a process or listener behind');
    const unrelatedFinal=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
    const unrelatedClose=await closeEdgeViaCdp(9231);
    const unrelatedClean=await waitForBrowserGone(unrelatedEdgeChild.pid,unrelatedProfile,unrelatedProfile,9231);
    assert.equal(unrelatedClean.clean,true,'Unrelated Edge test process did not close cleanly');
    report.unrelatedEdgeIsolation={separateProfile:true,separatePort:9231,remainedAliveDuringCandidateCloseAndRestart:true,finalCloseViaCdp:unrelatedClose.closed===true,finalCleanupVerified:unrelatedClean.clean===true};
    report.lifecycle=lifecycle;
    report.cleanupVerified=true;
    report.notProven=['Network Service lockdown/integrity restrictions beyond the verified AppContainer SID','Model reasoning','Long-term autonomy','Memory synchronization','Signed release trust','General user PC safety'];
    if(publicVideoProbe.outcome!=='PASS_PUBLIC_VIDEO_CORE_CAPTURE_AND_MODEL_INPUT_PACKING')report.notProven.unshift('Public Douyin video playback and Core frame capture (safe-stop outcome: '+publicVideoProbe.outcome+')');
    console.log('PASS_WINDOWS_PACKAGED_EXE_RESTART_AND_CLEANUP '+JSON.stringify(report));
    return report;
  } catch (error) {
    // Only redacted state, response text and browser-host log tail are emitted; no credentials or raw command lines.
    const redactPaths=[base,home,userData,memory,profile,path.dirname(control),locationFile];
    let state = null, hostLogTail=null, hostProcessSummary=null;
    try { state = await readJSON(control); } catch {}
    try { hostLogTail=safeText(await readTail(path.join(path.dirname(control),'browser-host.log')),redactPaths); } catch {}
    let edgeProcessCount=null, hostAlive=null, debugListenerCount=null;
    try { edgeProcessCount=ps('Get-Process -Name msedge -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count'); } catch {}
    if(Number.isSafeInteger(state?.pid)&&state.pid>0) {
      try { hostAlive=ps('Get-Process -Id '+state.pid+' -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count')>0; } catch {}
      try {
        const processes=ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4");
        const items=Array.isArray(processes)?processes:[processes];
        hostProcessSummary=summarizeHostProcesses(items,state.pid,Number.isSafeInteger(report.backendPid)?report.backendPid:null,profile,path.dirname(control));
      } catch {}
    }
    try { debugListenerCount=ps('Get-NetTCPConnection -LocalPort 9227 -State Listen -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count'); } catch {}
    const coldStart = await readColdStartDiagnostics(userData, child.pid, exeFile, redactPaths);
    console.error('COLD_START_EVIDENCE '+JSON.stringify(coldStart));
    console.error('FAIL_CLOSED_DIAGNOSTICS '+JSON.stringify({
      desktopReady:report.desktopReady===true, candidatePid:child.pid, candidateExit,
      browserOpenHttpStatus:report.browserOpenHttpStatus??null,
      browserOpenHttpBody:report.browserOpenHttpBody??null,
      safeEnvPresence:report.safeEnvPresence??null,
      hostStatePresent:Boolean(state), hostReady:state?.ready===true,
      hostStatePid:Number.isSafeInteger(state?.pid)?state.pid:null,
      hostProfileMatches:state?.profile===profile,hostPort:state?.port??null,
      hostStartedAt:Number.isFinite(state?.startedAt)?state.startedAt:null,
      hostAgeMs:Number.isFinite(state?.startedAt)?Math.max(0,Date.now()-state.startedAt):null,
      hostFailureCode:typeof state?.launchFailure?.code==='string'?state.launchFailure.code.slice(0,80):null,
      hostFailureMessage:safeText(state?.launchFailure?.message,redactPaths),
      hostFailureDetails:safeText(state?.launchFailure?.details,redactPaths),
      hostAlive, edgeProcessCount, debugListenerCount, hostProcessSummary, hostLogTail,
      phaseErrorCode:typeof error?.code==='string'?error.code.slice(0,80):null,
      phaseErrorMessage:safeText(error?.message,redactPaths)
    }));
    throw error;
  } finally {
    // The GitHub-hosted VM is disposable. Only terminate processes whose command line contains this unique profile.
    try {
      let state=null;
      try { state=await readJSON(control); } catch {}
      const currentProcesses=asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe' OR Name = '"+FILE.replace(/\.exe$/i,'')+".exe'\" | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4"));
      if(Number.isSafeInteger(state?.pid)&&state.pid>0) {
        const ownedHost=currentProcesses.find(p=>Number(p.ProcessId)===state.pid&&/node\.exe$/i.test(String(p.Name||''))&&/browser-host\.mjs/i.test(String(p.CommandLine||''))&&String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase()));
        if(ownedHost)try { execFileSync('taskkill.exe',['/PID',String(state.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {}
      }
      if(Number.isSafeInteger(backendPid)&&backendPid>0) {
        const ownedBackend=currentProcesses.find(p=>Number(p.ProcessId)===backendPid&&/node\.exe$/i.test(String(p.Name||''))&&/api-worker\.mjs/i.test(String(p.CommandLine||'')));
        if(ownedBackend)try { execFileSync('taskkill.exe',['/PID',String(backendPid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {}
      }
      if(Number.isSafeInteger(child.pid)&&child.pid>0) {
        const ownedApp=currentProcesses.find(p=>Number(p.ProcessId)===child.pid&&String(p.ExecutablePath||'').toLowerCase()===path.resolve(exeFile).toLowerCase());
        if(ownedApp)try { execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {}
      }
      await delay(1000);
      const processFilter=`Name = 'msedge.exe' OR Name = 'node.exe' OR Name = '${FILE}'`;
      const processQuery=`Get-CimInstance Win32_Process -Filter "${processFilter}" | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 3`;
      let rows=[];
      try { const value=ps(processQuery); rows=Array.isArray(value)?value:(value?[value]:[]); }
      catch { process.exitCode=1; rows=[{ProcessId:'unknown',Name:'unverified',CommandLine:profile}]; }
      const belongsToCandidate=p=>Number(p.ProcessId)===child.pid&&String(p.ExecutablePath||'').toLowerCase()===path.resolve(exeFile).toLowerCase();
      const belongsToBackend=p=>Number(p.ProcessId)===backendPid&&/node\.exe$/i.test(String(p.Name||''))&&/api-worker\.mjs/i.test(String(p.CommandLine||''));
      const belongsToBrowser=p=>String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase())||String(p.CommandLine||'').toLowerCase().includes(controlDir.toLowerCase());
      let survivors=rows.filter(p=>belongsToBrowser(p)||belongsToCandidate(p)||belongsToBackend(p));
      for(const item of survivors) { if(Number.isSafeInteger(Number(item.ProcessId)))try { execFileSync('taskkill.exe',['/PID',String(item.ProcessId),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {} }
      if(survivors.length) {
        await delay(1000);
        try {
          const value=ps(processQuery);
          const after=Array.isArray(value)?value:(value?[value]:[]);
          survivors=after.filter(p=>belongsToBrowser(p)||belongsToCandidate(p)||belongsToBackend(p));
        } catch { survivors=[{ProcessId:'unknown',Name:'unverified'}]; }
      }
      if(survivors.length) {
        console.error('CANDIDATE_PROCESS_CLEANUP_FAILED '+JSON.stringify(survivors.map(p=>({pid:p.ProcessId,name:p.Name}))));
        process.exitCode=1;
      } else {
        await fs.rm(common,{recursive:true,force:true});
        console.log('CANDIDATE_PROCESS_CLEANUP_VERIFIED: no host or Edge process remains');
      }
    } catch(error) {
      console.error('CANDIDATE_PROCESS_CLEANUP_UNVERIFIED '+safeText(error.message,[base,home,userData,memory,profile,controlDir]));
      process.exitCode=1;
    }
    try {
      let unrelatedRows=ownedProfileProcesses(unrelatedProfile,unrelatedProfile);
      for(const item of unrelatedRows) {
        if(Number.isSafeInteger(Number(item.ProcessId)))try { execFileSync('taskkill.exe',['/PID',String(item.ProcessId),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {}
      }
      if(unrelatedRows.length)await delay(1000);
      unrelatedRows=ownedProfileProcesses(unrelatedProfile,unrelatedProfile);
      const unrelatedListeners=loopbackListeners(9231);
      if(unrelatedRows.length||unrelatedListeners.length) {
        console.error('UNRELATED_EDGE_CLEANUP_FAILED '+JSON.stringify({processes:unrelatedRows.map(p=>({pid:p.ProcessId,name:p.Name})),listeners:unrelatedListeners}));
        process.exitCode=1;
      } else {
        console.log('UNRELATED_EDGE_CLEANUP_VERIFIED: no separate Edge process or listener remains');
      }
    } catch(error) {
      console.error('UNRELATED_EDGE_CLEANUP_UNVERIFIED '+safeText(error.message,[base,home,userData,memory,profile,controlDir,unrelatedProfile]));
      process.exitCode=1;
    }
    await fs.rm(base,{recursive:true,force:true}).catch(()=>{});
  }
}

if(process.argv.includes('--self-test'))selfTest();
else {
  const exe=process.argv[2];
  if(!exe)throw new Error('Specify exact candidate EXE path; only in GitHub Windows CI');
  run(path.resolve(exe)).catch(e=>{console.error('FAIL_CLOSED_WINDOWS_EDGE_SMOKE:',e.message);process.exitCode=1;});
}
