#!/usr/bin/env node
// Derived from the 1.4.6 lifecycle probe; pinned to the 1.4.7 candidate and its real Windows profile/AppContainer requirements.
// YuTang state is isolated without replacing USERPROFILE, APPDATA, or LOCALAPPDATA.
// Candidate-only Windows CI probe. Does not login, run a model, send a message, or modify real profiles.
// A Windows Firewall rule must already block outbound Edge traffic; this probe fails closed without it.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const EXPECTED_EXE = process.env.YUTANG_EXPECTED_CANDIDATE_SHA256 || '';
const FILE = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
const PORT = 9227;
const allowedEnv = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata|username|userdomain|public|allusersprofile|programw6432|os|processor_architecture|number_of_processors|homedrive|homepath|userprofile|appdata|localappdata|temp|tmp|systemdrive|home)$/i;

export function createCandidateEnvironment(sourceEnv, userData, locationFile) {
  if (!sourceEnv || typeof sourceEnv !== 'object' || Array.isArray(sourceEnv)) throw new Error('Native Windows environment is required.');
  for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
    if (typeof sourceEnv[key] !== 'string' || !path.isAbsolute(sourceEnv[key])) throw new Error('Native Windows ' + key + ' is unavailable; refusing Edge launch.');
  }
  if (typeof userData !== 'string' || !path.isAbsolute(userData) || typeof locationFile !== 'string' || !path.isAbsolute(locationFile)) {
    throw new Error('Candidate-only data paths must be absolute.');
  }
  const env = Object.fromEntries(Object.entries(sourceEnv).filter(([key]) => allowedEnv.test(key)));
  for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME']) {
    if (sourceEnv[key] !== undefined && env[key] !== sourceEnv[key]) throw new Error('Native Windows profile environment was not preserved: ' + key);
  }
  Object.assign(env, {
    DOUYIN_DESKTOP_USER_DATA: userData,
    DOUYIN_DESKTOP_SMOKE: '1',
    DOUYIN_RUNTIME_LOCATION_FILE: locationFile
  });
  return env;
}

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
  const unreadable = family.filter(p => typeof p.CommandLine !== 'string');
  if (unreadable.length) throw Object.assign(new Error('Unreadable MS Edge child process command line (PIDs: ' + unreadable.map(p => Number(p.ProcessId)).join(',') + ')'), { code: 'EDGE_CHILD_COMMAND_LINE_UNREADABLE' });
  const unsafe = family.filter(p => /(?:^|\s)--(?:no-sandbox|disable-setuid-sandbox)(?:\s|=|$)/i.test(p.CommandLine));
  if (unsafe.length) throw Object.assign(new Error('Unsafe MS Edge sandbox-disabling command line (PIDs: ' + unsafe.map(p => Number(p.ProcessId)).join(',') + ')'), { code: 'EDGE_UNSAFE_SANDBOX_FLAG' });
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
  const nativeEnv={PATH:'C:\\Windows\\System32',USERPROFILE:'C:\\Users\\runneradmin',APPDATA:'C:\\Users\\runneradmin\\AppData\\Roaming',LOCALAPPDATA:'C:\\Users\\runneradmin\\AppData\\Local',HOME:'C:\\Users\\runneradmin'};
  const isolatedEnv=createCandidateEnvironment(nativeEnv,'D:\\a\\_temp\\candidate\\user-data','C:\\Users\\runneradmin\\.yutang-observer-isolated\\runtime-location.json');
  for(const key of ['USERPROFILE','APPDATA','LOCALAPPDATA','HOME']) assert.equal(isolatedEnv[key],nativeEnv[key],key+' must remain the native Windows profile path');
  assert.equal(isolatedEnv.DOUYIN_DESKTOP_USER_DATA,'D:\\a\\_temp\\candidate\\user-data');
  assert.equal(isolatedEnv.DOUYIN_RUNTIME_LOCATION_FILE,'C:\\Users\\runneradmin\\.yutang-observer-isolated\\runtime-location.json');
  assert.throws(()=>createCandidateEnvironment({...nativeEnv,USERPROFILE:undefined},'D:\\a\\user-data','C:\\Users\\runneradmin\\.yutang-observer-isolated\\runtime-location.json'),/USERPROFILE/);
  assert.throws(()=>createCandidateEnvironment(nativeEnv,'relative','C:\\Users\\runneradmin\\.yutang-observer-isolated\\runtime-location.json'),/absolute/);
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
  assert.equal(isExpectedFirewallBlock(500, JSON.stringify({error:'page.goto: net::ERR_NETWORK_ACCESS_DENIED at https://www.douyin.com/?recommend=1'})), true);
  assert.equal(isExpectedFirewallBlock(500, JSON.stringify({error:'page.goto: Timeout 25000ms exceeded.\\nCall log:\\n  - navigating to "https://www.douyin.com/?recommend=1", waiting until "domcontentloaded"'})), true);
  assert.equal(isExpectedFirewallBlock(500, 'page.goto: Timeout 25000ms exceeded at https://example.com waiting until domcontentloaded'), false);
  assert.equal(isExpectedFirewallBlock(500, 'page.goto: Timeout 15000ms exceeded at https://www.douyin.com/video/123 waiting until domcontentloaded'), false);
  assert.equal(isExpectedFirewallBlock(200, 'page.goto: Timeout 25000ms exceeded at https://www.douyin.com/?recommend=1'), false);
  assert.equal(hasHostAncestor(300,100,list),false);
  assert.throws(()=>verifyProcessSnapshot({...good,listenerPids:[300]}),/listener PID/);
  assert.throws(()=>verifyProcessSnapshot({...good,portAddresses:['0.0.0.0']}),/loopback/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===200?{...p,ParentProcessId:300}:p)}),/descendant/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===201?{...p,CommandLine:p.CommandLine+' --no-sandbox'}:p)}),/Unsafe/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===201?{...p,CommandLine:null}:p)}),error=>error?.code==='EDGE_CHILD_COMMAND_LINE_UNREADABLE');
  assert.throws(()=>verifyProcessSnapshot({...good,profile:'C:\\another'}),/No MS Edge/);
  console.log('PASS Windows process ownership, loopback binding, native profile preservation and unreadable-commandline fail-closed regression assertions');
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
    edgeUnreadableCommandLineCount: edge.filter(p => typeof p.CommandLine !== 'string').length,
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
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);',
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
    '      int integritySize = 0;',
    '      GetTokenInformation(token, 25, IntPtr.Zero, 0, out integritySize);',
    '      if (integritySize <= 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "TokenIntegrityLevel size query failed");',
    '      IntPtr integrityBuffer = Marshal.AllocHGlobal(integritySize);',
    '      int integrityRid;',
    '      string integrityLevel;',
    '      try {',
    '        if (!GetTokenInformation(token, 25, integrityBuffer, integritySize, out integritySize)) throw new Win32Exception(Marshal.GetLastWin32Error(), "TokenIntegrityLevel query failed");',
    '        IntPtr integritySid = Marshal.ReadIntPtr(integrityBuffer);',
    '        if (integritySid == IntPtr.Zero) throw new InvalidOperationException("TokenIntegrityLevel SID is null");',
    '        IntPtr countPointer = GetSidSubAuthorityCount(integritySid);',
    '        if (countPointer == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetSidSubAuthorityCount failed");',
    '        byte subAuthorityCount = Marshal.ReadByte(countPointer);',
    '        if (subAuthorityCount == 0) throw new InvalidOperationException("TokenIntegrityLevel SID has no sub-authority");',
    '        IntPtr ridPointer = GetSidSubAuthority(integritySid, (uint)(subAuthorityCount - 1));',
    '        if (ridPointer == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetSidSubAuthority failed");',
    '        integrityRid = Marshal.ReadInt32(ridPointer);',
    '        integrityLevel = integrityRid >= 0x5000 ? "ProtectedProcess" : integrityRid >= 0x4000 ? "System" : integrityRid >= 0x3000 ? "High" : integrityRid >= 0x2100 ? "MediumPlus" : integrityRid >= 0x2000 ? "Medium" : integrityRid >= 0x1000 ? "Low" : "Untrusted";',
    '      } finally { Marshal.FreeHGlobal(integrityBuffer); }',
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
    '      return new { processId = pid, isAppContainer = isAppContainer, appContainerSid = sidText, integrityRid = integrityRid, integrityLevel = integrityLevel };',
    '    } finally { if (token != IntPtr.Zero) CloseHandle(token); CloseHandle(process); }',
    '  }',
    '}'
  ].join('\n');
  const script = "$ErrorActionPreference='Stop'\n$source=@'\n" + csharp + "\n'@\nAdd-Type -TypeDefinition $source -ErrorAction Stop\n[YuTangProcessTokenInspector]::Read(" + String(pid) + ") | ConvertTo-Json -Compress";
  return ps(script);
};
const asRows = value => Array.isArray(value) ? value : value ? [value] : [];
// Only accept a narrowly identified external-navigation failure after the workflow
// has verified its signed-Edge outbound firewall rule. Some Windows/Edge builds report
// ERR_NETWORK_ACCESS_DENIED; others surface the same blocked request as the bounded
// 25s domcontentloaded navigation timeout. Do not accept arbitrary HTTP 500 responses.
export function isExpectedFirewallBlock(status, body) {
  const text = String(body || '');
  if (status !== 500 || !/douyin\.com/i.test(text)) return false;
  if (/ERR_NETWORK_ACCESS_DENIED/i.test(text)) return true;
  return /page\.goto:\s*Timeout 25000ms exceeded/i.test(text) &&
    /https:\/\/www\.douyin\.com\//i.test(text) &&
    /domcontentloaded/i.test(text);
}

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
          const networkServiceLowIntegrityVerified = networkServiceToken?.integrityRid === 0x1000 && networkServiceToken?.integrityLevel === 'Low';
          let networkServiceProcessOwned = false;
          let networkServiceProcessDetails = null;
          try {
            const processList = asRows(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Depth 3 -Compress"));
            const networkProcess = processList.find(item => Number(item.ProcessId) === networkServicePid);
            const profileArgPresent = Boolean(networkProcess && typeof networkProcess.CommandLine === 'string' && typeof profile === 'string' && networkProcess.CommandLine.toLowerCase().includes(profile.toLowerCase()));
            const hostAncestorPresent = Boolean(Number.isSafeInteger(hostPid) && hasHostAncestor(networkServicePid, hostPid, processList));
            const lineage = [];
            const byPid = new Map(processList.map(item => [Number(item.ProcessId), item]));
            let cursor = networkProcess;
            for (let depth = 0; cursor && depth < 16; depth++) {
              lineage.push({
                pid: Number(cursor.ProcessId),
                parentPid: Number(cursor.ParentProcessId) || null,
                name: String(cursor.Name || ''),
                profileArgPresent: typeof cursor.CommandLine === 'string' && typeof profile === 'string' && cursor.CommandLine.toLowerCase().includes(profile.toLowerCase()),
                typeUtility: /(?:^|\s)--type=utility(?:\s|$)/i.test(String(cursor.CommandLine || '')),
                networkService: /network\.mojom\.NetworkService/i.test(String(cursor.CommandLine || ''))
              });
              const parentPid = Number(cursor.ParentProcessId);
              if (!Number.isSafeInteger(parentPid) || parentPid < 1) break;
              cursor = byPid.get(parentPid);
            }
            networkServiceProcessOwned = Boolean(networkProcess && /msedge\.exe$/i.test(String(networkProcess.Name || '')) && hostAncestorPresent);
            networkServiceProcessDetails = {
              name: String(networkProcess?.Name || ''),
              parentPid: Number(networkProcess?.ParentProcessId) || null,
              profileArgPresent,
              hostAncestorPresent,
              lineage
            };
          } catch (error) {
            networkServiceProcessDetails = { errorName: String(error?.name || 'Error'), errorCode: typeof error?.code === 'string' ? error.code : null };
          }
          const networkServiceFullIsolationVerified = networkServiceWindowsTokenVerified && networkServiceLowIntegrityVerified && networkServiceProcessOwned;
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
            networkServiceLowIntegrityVerified,
            networkServiceTokenIntegrityLevel: networkServiceToken?.integrityLevel || null,
            networkServiceTokenIntegrityRid: networkServiceToken?.integrityRid ?? null,
            networkServiceProcessOwned,
            networkServiceProcessDetails,
            networkServiceFullIsolationVerified,
            networkServiceReportedNotSandboxed: networkServiceRow?.[3] === 'Not Sandboxed',
            networkServiceSandboxReported: networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network',
            explicitSandboxPositive: rendererSandboxVerified && networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network',
            explicitSandboxFullPositive: rendererSandboxVerified && networkServiceSandboxEnabled && networkServiceRow?.[3] === 'Network' && networkServiceFullIsolationVerified && networkServiceLowIntegrityVerified,
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
    const guardRows = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'jobguard.exe'\" | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress -Depth 3"));
    const guards = guardRows.filter(item => Number(item.ParentProcessId) === hostPid);
    const listeners = loopbackListeners(port);
    if (!owned.length && !guards.length && !listeners.length) return { clean: true, hostPid, edgeAndHostProcesses: 0, jobGuardProcesses: 0, listeners: 0 };
    return null;
  }, 15000, 'browser-host, Edge and Job Object helper process cleanup');
}



async function forceWindowsDesktopExit({ candidatePid, exeFile, backendPid, hostPid, profile, controlDir, unrelatedProfile, userData }) {
  // In an ephemeral Windows CI runner only. Kill the verified Electron main process,
  // not its process tree; surviving children are release-blocking.
  const rows = asRows(ps("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4"));
  const candidate = rows.find(p => Number(p.ProcessId) === candidatePid);
  assert.ok(candidate && String(candidate.ExecutablePath || '').toLowerCase() === path.resolve(exeFile).toLowerCase(),
    'Refusing forced desktop exit: packaged candidate EXE identity not proven');
  const backend = rows.find(p => Number(p.ProcessId) === backendPid);
  assert.ok(backend && /node\.exe$/i.test(String(backend.Name || '')) &&
    /api-worker\.mjs/i.test(String(backend.CommandLine || '')),
    'Refusing forced desktop exit: API backend identity not proven');
  const desktopPid = Number(backend.ParentProcessId);
  const desktop = rows.find(p => Number(p.ProcessId) === desktopPid);
  assert.ok(Number.isSafeInteger(desktopPid) && desktopPid > 0 && desktop &&
    String(desktop.Name || '') === '大肥鱼抖音助手.exe' &&
    hasHostAncestor(desktopPid, candidatePid, rows),
    'Refusing forced desktop exit: Electron main process is not owned by the packaged EXE');
  const desktopGuards = rows.filter(p => /jobguard\.exe$/i.test(String(p.Name || '')) && Number(p.ParentProcessId) === desktopPid);
  assert.equal(desktopGuards.length, 1, 'Expected exactly one desktop-owned Job Object helper for the API worker');
  const desktopGuard = desktopGuards[0];
  const desktopGuardPid = Number(desktopGuard.ProcessId);
  assert.ok(Number.isSafeInteger(desktopGuardPid) && desktopGuardPid > 0, 'Invalid desktop Job Object helper PID');
  assert.match(String(desktopGuard.CommandLine || ''), new RegExp('--owner-pid\\s+' + String(desktopPid) + '\\s+--target-pid\\s+' + String(backendPid) + '(?:\\s|$)', 'i'), 'Desktop Job Object helper was not bound to the exact desktop/API worker PID pair');
  const desktopGuardPath = path.resolve(String(desktopGuard.ExecutablePath || ''));
  const relativeDesktopGuard = path.relative(path.join(userData, 'runtimes'), desktopGuardPath);
  const desktopGuardParts = relativeDesktopGuard.split(/[\\/]+/);
  assert.ok(desktopGuardParts.length === 2 && /^[a-f0-9]{20}$/i.test(desktopGuardParts[0]) && /^jobguard\.exe$/i.test(desktopGuardParts[1]), 'Desktop Job Object helper is outside the isolated prepared runtime');
  const host = rows.find(p => Number(p.ProcessId) === hostPid);
  assert.ok(host && Number(host.ParentProcessId) === backendPid &&
    /browser-host\.mjs/i.test(String(host.CommandLine || '')) &&
    String(host.CommandLine || '').toLowerCase().includes(profile.toLowerCase()),
    'Refusing forced desktop exit: dedicated browser-host identity not proven');
  const guards = rows.filter(p => /jobguard\.exe$/i.test(String(p.Name || '')) &&
    Number(p.ParentProcessId) === hostPid);
  assert.equal(guards.length, 1, 'Expected an active Job Object helper before desktop forced exit');
  const edge = rows.filter(p => /msedge\.exe$/i.test(String(p.Name || '')) &&
    hasHostAncestor(Number(p.ProcessId), hostPid, rows));
  assert.ok(edge.length > 0, 'No candidate-owned Edge descendants before desktop forced exit');
  const beforeListeners = loopbackListeners(PORT);
  assert.ok(beforeListeners.length > 0 && beforeListeners.every(item =>
    edge.some(p => Number(p.ProcessId) === Number(item.OwningProcess))),
    'Candidate-owned CDP listener not proven before desktop forced exit');
  assertUnrelatedEdgeAlive(unrelatedProfile, 9231);
  const ownedDescendants = rows.filter(p => hasHostAncestor(Number(p.ProcessId), desktopPid, rows));
  const trackedPids = [...new Set([candidatePid, desktopPid, ...ownedDescendants.map(p => Number(p.ProcessId))])];
  assert.ok(trackedPids.includes(backendPid) && trackedPids.includes(hostPid) &&
    trackedPids.includes(Number(guards[0].ProcessId)) && trackedPids.includes(desktopGuardPid),
    'Desktop process ancestry does not contain required API/host/browser guard/desktop guard processes');
  const filter = trackedPids.map(pid => 'ProcessId = ' + String(pid)).join(' OR ');
  const started = Date.now();
  execFileSync('taskkill.exe', ['/PID', String(desktopPid), '/F'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024
  });
  const proof = await until(async () => {
    const tracked = asRows(ps('Get-CimInstance Win32_Process -Filter "' + filter + '" | Select-Object ProcessId,Name | ConvertTo-Json -Compress -Depth 3'));
    const remainingOwned = ownedProfileProcesses(profile, controlDir);
    const remainingListeners = loopbackListeners(PORT);
    if (tracked.length || remainingOwned.length || remainingListeners.length) return null;
    return { trackedProcessesRemaining:0, profileProcessesRemaining:0, cdpListenersRemaining:0 };
  }, 20000, 'desktop forced-exit process tree cleanup without recursive taskkill');
  const unrelated = assertUnrelatedEdgeAlive(unrelatedProfile, 9231);
  assert.ok(unrelated.processCount > 0 && unrelated.listenerCount > 0,
    'Unrelated Edge sentinel did not survive desktop forced exit');
  return {
    mode:'kill-electron-main-only', forcedPid:desktopPid, candidatePid, backendPid, hostPid, desktopGuardPid,
    desktopGuardVerified:true,
    trackedProcessesBefore:trackedPids.length, ownedEdgeBefore:edge.length,
    cdpListenersBefore:beforeListeners.length, elapsedMs:Date.now()-started,
    ...proof, unrelatedEdgeSurvived:true, recursiveTaskkillUsed:false
  };
}

async function forceWindowsJobObjectExit({ mode, hostPid, backendPid, profile, controlDir, unrelatedProfile, userData }) {
  // This is only called in a disposable Windows CI runner after the EXE has been hash-verified.
  // Never use /T: recursive taskkill would hide a broken KILL_ON_JOB_CLOSE implementation.
  assert.ok(mode === 'host' || mode === 'guard', 'Unsupported force-exit test mode');
  const rows = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe' OR Name = 'jobguard.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4"));
  const host = rows.find(p => Number(p.ProcessId) === hostPid);
  assert.ok(host && /node\.exe$/i.test(String(host.Name || '')) &&
    /browser-host\.mjs/i.test(String(host.CommandLine || '')) &&
    String(host.CommandLine || '').toLowerCase().includes(profile.toLowerCase()) &&
    Number(host.ParentProcessId) === backendPid, 'Refusing forced kill: browser-host PID ownership is not proven');
  const guards = rows.filter(p => /jobguard\.exe$/i.test(String(p.Name || '')) &&
    Number(p.ParentProcessId) === hostPid);
  assert.equal(guards.length, 1, 'Expected exactly one live Job Object helper owned by the browser-host');
  const guard = guards[0];
  const guardPid = Number(guard.ProcessId);
  assert.ok(Number.isSafeInteger(guardPid) && guardPid > 0, 'Invalid Job Object helper PID');
  assert.match(String(guard.CommandLine || ''), new RegExp('--owner-pid\\s+' + String(hostPid) + '(?:\\s|$)', 'i'),
    'Job Object helper was not launched for the exact host PID');
  // Electron prepares a private copy of the packaged runtime under this candidate's isolated userData.
  // Verify its exact per-run runtime namespace, not the original installer staging directory.
  const guardPath = path.resolve(String(guard.ExecutablePath || ''));
  const relativeGuard = path.relative(path.join(userData, 'runtimes'), guardPath);
  const guardParts = relativeGuard.split(/[\\/]+/);
  assert.ok(guardParts.length === 2 && /^[a-f0-9]{20}$/i.test(guardParts[0]) &&
    /^jobguard\.exe$/i.test(guardParts[1]),
    'Refusing forced kill: Job Object helper is not inside the candidate isolated prepared runtime');
  const edgePids = rows.filter(p => /msedge\.exe$/i.test(String(p.Name || '')) &&
    hasHostAncestor(Number(p.ProcessId), hostPid, rows)).map(p => Number(p.ProcessId));
  assert.ok(edgePids.length > 0, 'No candidate-owned Edge descendants existed before forced kill');
  const listeners = loopbackListeners(PORT);
  assert.ok(listeners.length > 0 &&
    listeners.every(item => edgePids.includes(Number(item.OwningProcess))),
    'Candidate-owned CDP listener not proven before forced kill');
  const unrelatedBefore = assertUnrelatedEdgeAlive(unrelatedProfile, 9231);
  assert.ok(unrelatedBefore.processCount > 0, 'Unrelated Edge sentinel not ready before force-exit test');
  const targetPid = mode === 'guard' ? guardPid : hostPid;
  const started = Date.now();
  execFileSync('taskkill.exe', ['/PID', String(targetPid), '/F'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024
  });
  const allTrackedPids = [...new Set([hostPid, guardPid, ...edgePids])];
  const filter = allTrackedPids.map(pid => 'ProcessId = ' + String(pid)).join(' OR ');
  const proof = await until(async () => {
    const tracked = asRows(ps('Get-CimInstance Win32_Process -Filter "' + filter + '" | Select-Object ProcessId,Name | ConvertTo-Json -Compress -Depth 3'));
    const remainingOwned = ownedProfileProcesses(profile, controlDir);
    const remainingListeners = loopbackListeners(PORT);
    if (tracked.length || remainingOwned.length || remainingListeners.length) return null;
    return {trackedProcessesRemaining:0,profileProcessesRemaining:0,cdpListenersRemaining:0};
  }, 20000, 'Job Object forced-exit cleanup without recursive taskkill');
  const unrelatedAfter = assertUnrelatedEdgeAlive(unrelatedProfile, 9231);
  assert.ok(unrelatedAfter.processCount > 0 && unrelatedAfter.listenerCount > 0,
    'Unrelated Edge was terminated by the force-exit test');
  return {
    mode: mode === 'host' ? 'kill-host-only' : 'kill-jobguard-only',
    forcedPid: targetPid, hostPid, guardPid,
    ownedEdgeBefore: edgePids.length,
    cdpListenersBefore: listeners.length,
    elapsedMs: Date.now() - started,
    ...proof, unrelatedEdgeSurvived: true,
    recursiveTaskkillUsed: false
  };
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
  let processes, listeners, hostSummary, ownership;
  let unreadableCommandLineRetries = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    processes = asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4"));
    listeners = loopbackListeners(PORT);
    hostSummary = summarizeHostProcesses(processes, state.pid, backendPid, profile, controlDir);
    try {
      ownership = verifyProcessSnapshot({
        processes, hostPid: state.pid, profile,
        listenerPids: listeners.map(item => Number(item.OwningProcess)),
        portAddresses: listeners.map(item => item.LocalAddress)
      });
      break;
    } catch (error) {
      if (error?.code !== 'EDGE_CHILD_COMMAND_LINE_UNREADABLE' || attempt === 5) throw error;
      unreadableCommandLineRetries++;
      await delay(150);
    }
  }
  if (!ownership) throw new Error('Edge process ownership snapshot did not stabilize within the bounded retry window.');
  assert.equal(hostSummary.hostFound, true, 'Browser host PID is not present in the process snapshot');
  assert.equal(hostSummary.hostIsNode, true, 'Browser host is not the expected Node process');
  assert.equal(hostSummary.hostCommandHasBrowserHost, true, 'Browser host command line does not identify browser-host.mjs');
  assert.equal(hostSummary.hostCommandProfileMatches, true, 'Browser host profile argument does not match the isolated profile');
  assert.equal(hostSummary.hostCommandControlMatches, true, 'Browser host control argument does not match the isolated control directory');
  assert.equal(hostSummary.hostParentIsBackend, true, 'Browser host is not a child of the expected API backend');
  assert.ok(hostSummary.edgeWithPortArg > 0, 'Edge command line does not include the expected CDP port');
  assert.ok(hostSummary.edgeWithLoopbackArg > 0, 'Edge command line does not include the loopback-only CDP address');
  assert.equal(hostSummary.edgeWithNoSandbox, 0, 'A sandbox-disabling Edge argument was detected');
  assert.ok(hostSummary.edgeWithNetworkSandboxArg > 0, 'Network Service sandbox launch flag was not passed to Edge');
  return { state, browserVersion: version.Browser, hostSummary, ownership, unreadableCommandLineRetries };
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
          const code=/^[A-Z][A-Z0-9_]{0,64}$/.test(String(record.code||''))?record.code:null;
          const target=/^(?:blank|startup-root|same-origin|other|invalid)$/.test(String(record.target||''))?record.target:null;
          const reason=/^[a-z0-9-]{1,60}$/.test(String(record.reason||''))?record.reason:null;
          const attempt=Number.isSafeInteger(record.attempt)&&record.attempt>=1&&record.attempt<=3?record.attempt:null;
          report.startupEvents.push({ event, stage, code, target, reason, attempt, seq: Number(record.seq), at: String(record.at).slice(0,30) });
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

async function run(exeFile, { forceMode = null, stressRestarts = 2, desktopOnly = false } = {}) {
  if (forceMode !== null && forceMode !== 'host' && forceMode !== 'guard' && forceMode !== 'desktop') throw new Error('Invalid force-exit mode');
  if (typeof desktopOnly !== 'boolean') throw new Error('Invalid desktop-only cold-start mode');
  if (desktopOnly && (forceMode !== null || stressRestarts !== 2)) throw new Error('Desktop-only cold start cannot mix forced-exit or browser stress options');
  if (!Number.isSafeInteger(stressRestarts) || stressRestarts < 2 || stressRestarts > 8) throw new Error('Cold-start restart count must be bounded to 2..8');
  if (forceMode !== null && stressRestarts !== 2) throw new Error('Do not mix forced-exit and cold-start stress tests');
  if (process.platform!=='win32' || process.env.GITHUB_ACTIONS!=='true' || process.env.YUTANG_EDGE_FIREWALL_CONFIRMED!=='yes')
    throw new Error('Refusing candidate launch outside pre-guarded ephemeral Windows GitHub runner');
  assert.equal(path.basename(exeFile),FILE);
  assert.equal(await sha256(exeFile),EXPECTED_EXE,'Candidate EXE does not match immutable build');
  const base=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(),'yutang-edge-ci-'));
  const originalHome=process.env.USERPROFILE;
  if(typeof originalHome!=='string'||!path.isAbsolute(originalHome))throw new Error('Native Windows USERPROFILE is unavailable; refusing to launch candidate.');
  const home=path.resolve(originalHome);
  const common=path.join(home,'.yutang-observer-isolated');
  if(await fs.access(common).then(()=>true,()=>false)) { await fs.rm(base,{recursive:true,force:true}); throw new Error('Pre-existing candidate state found in native runner profile; refusing to overwrite it.'); }
  const userData=path.join(base,'user-data'),memory=path.join(common,'memory');
  const locationFile=path.join(common,'runtime-location.json');
  await fs.mkdir(userData,{recursive:true});
  const env=createCandidateEnvironment(process.env,userData,locationFile);
  // Preserve the real Windows account profile and its AppData roots. Only YuTang state and Electron userData are isolated.
  // In ephemeral offline Windows CI only, capture bounded Playwright startup traces
  // into the candidate's isolated browser-host.log; diagnostics are redacted before output.
  env.DEBUG = 'pw:browser*';
  env.DEBUG_COLORS = '0';
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
  const desktopBootStart=Date.now();
  const child=spawn(exeFile,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore',shell:false});
  const candidateExit={error:null,exit:null};
  child.once('error',error=>{candidateExit.error=safeText(error?.message||error);});
  child.once('exit',(code,signal)=>{candidateExit.exit={code,signal};});
  const controlDir=path.join(common,'control');
  const control=path.join(controlDir,'browser.json');
  const profile=path.join(common,'cli-profile');
  const envKeys=['USERPROFILE','APPDATA','LOCALAPPDATA','HOME','HOMEDRIVE','HOMEPATH','USERNAME','USERDOMAIN','SystemDrive','ProgramFiles','ProgramFiles(x86)','ProgramData','SystemRoot','TEMP','TMP'];
  const report={type:'WINDOWS_EDGE_LAUNCH_IN_EPHEMERAL_CI_ONLY',candidateSha256:EXPECTED_EXE,realAccount:false,modelKey:false,externalEdgeNetworkBlocked:true,environmentProfile:'native-user-profile-with-isolated-yutang-state',safeEnvPresence:Object.fromEntries(envKeys.map(key=>[key,Boolean(env[key])]))};
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
    assert.equal(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(memory).toLowerCase(),'1.4.7 must use the isolated candidate memory root');
    assert.notEqual(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(path.join(home,'.dsh','douyin-browser','memory')).toLowerCase(),'1.4.7 must not fall back to the legacy memory root');
    assert.match(ready.origin,/^http:\/\/127\.0\.0\.1:\d{4,5}$/);
    report.desktopReady=true;
    report.candidatePid=child.pid;
    report.candidateExit=candidateExit;
    report.backendPid=ready.backendPid;
    console.log('PHASE_EXE_DESKTOP_READY: true; isolated memory and no model key confirmed');
    const bootstrap=await (await fetch(ready.origin+'/api/bootstrap',{signal:AbortSignal.timeout(5000)})).json();
    assert.equal(typeof bootstrap.token,'string');assert.ok(bootstrap.token.length>10);
    if(desktopOnly){
      assert.equal(await fs.access(control).then(()=>true,()=>false),false,
        'Desktop-only smoke unexpectedly spawned a dedicated browser host');
      assert.equal(ownedProfileProcesses(profile,controlDir).length,0,
        'Desktop-only smoke unexpectedly created an owned Edge/host process');
      assert.equal(loopbackListeners(PORT).length,0,
        'Desktop-only smoke unexpectedly opened the dedicated CDP port');
      console.log('PASS_WINDOWS_DESKTOP_COLD_START '+JSON.stringify({
        candidateSha256:EXPECTED_EXE,desktopReady:true,localApiReady:true,
        configured:false,processId:child.pid,workerPid:backendPid,
        coldStartupElapsedMs:Date.now()-desktopBootStart,
        browserHostNotStarted:true,cdpListeners:0,uniqueIsolatedProfile:true
      }));
      return report;
    }
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
        networkServiceWindowsTokenVerified:report.rendererSandbox.networkServiceWindowsTokenVerified,networkServiceProcessOwned:report.rendererSandbox.networkServiceProcessOwned,networkServiceProcessDetails:report.rendererSandbox.networkServiceProcessDetails
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
    const lifecycle={launchCount:1,closeCount:0,hostPids:[state.pid],cycles:[],expectedLaunches:stressRestarts+1};
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
    for(let cycle=1;cycle<=stressRestarts;cycle++) {
      const previousPid=state.pid, previousStartedAt=state.startedAt;
      const closeResult=await closeEdgeViaCdp(PORT);
      const closeProof=await waitForBrowserGone(previousPid,profile,controlDir,PORT);
      const unrelatedAfterClose=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
      lifecycle.closeCount++;
      const cycleReport={cycle,closedPid:previousPid,closeViaCdp:closeResult.closed===true,closeVerified:closeProof.clean===true,processesRemaining:closeProof.edgeAndHostProcesses,listenersRemaining:closeProof.listeners,unrelatedEdgeStillAlive:unrelatedAfterClose.processCount>0&&unrelatedAfterClose.listenerCount>0};
      assert.equal(cycleReport.closeVerified,true,'Owned Edge or browser-host remained after CDP Browser.close');

      const restartStarted=Date.now();
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
      cycleReport.restartElapsedMs=Date.now()-restartStarted;
      lifecycle.launchCount++;
      lifecycle.hostPids.push(nextState.pid);
      lifecycle.cycles.push(cycleReport);
      state=nextState;
      console.log('PASS_WINDOWS_PACKAGED_EXE_RESTART_CYCLE '+JSON.stringify(cycleReport));
    }

    const finalPid=state.pid;
    if(forceMode){
      report.forcedExit = forceMode === 'desktop'
        ? await forceWindowsDesktopExit({
            candidatePid:child.pid, exeFile, backendPid:ready.backendPid, hostPid:finalPid,
            profile, controlDir, unrelatedProfile, userData
          })
        : await forceWindowsJobObjectExit({
            mode: forceMode, hostPid:finalPid, backendPid:ready.backendPid, profile, controlDir, unrelatedProfile, userData
          });
      lifecycle.closeCount++;
      lifecycle.finalCloseVerified = report.forcedExit.trackedProcessesRemaining === 0 &&
        report.forcedExit.profileProcessesRemaining === 0 && report.forcedExit.cdpListenersRemaining === 0;
      lifecycle.finalTerminationMode = report.forcedExit.mode;
      lifecycle.finalHostPid = finalPid;
      lifecycle.finalProcessesRemaining = report.forcedExit.profileProcessesRemaining;
      lifecycle.finalListenersRemaining = report.forcedExit.cdpListenersRemaining;
      assert.equal(lifecycle.finalCloseVerified,true,'Job Object forced exit left candidate-owned processes or listeners');
    } else {
      const finalClose=await closeEdgeViaCdp(PORT);
      const finalProof=await waitForBrowserGone(finalPid,profile,controlDir,PORT);
      lifecycle.closeCount++;
      lifecycle.finalCloseVerified=finalClose.closed===true&&finalProof.clean===true;
      lifecycle.finalHostPid=finalPid;
      lifecycle.finalProcessesRemaining=finalProof.edgeAndHostProcesses;
      lifecycle.finalListenersRemaining=finalProof.listeners;
      assert.equal(lifecycle.finalCloseVerified,true,'Final Edge/browser-host close left a process or listener behind');
    }
    const unrelatedFinal=assertUnrelatedEdgeAlive(unrelatedProfile,9231);
    const unrelatedClose=await closeEdgeViaCdp(9231);
    const unrelatedClean=await waitForBrowserGone(unrelatedEdgeChild.pid,unrelatedProfile,unrelatedProfile,9231);
    assert.equal(unrelatedClean.clean,true,'Unrelated Edge test process did not close cleanly');
    report.unrelatedEdgeIsolation={separateProfile:true,separatePort:9231,remainedAliveDuringCandidateCloseAndRestart:true,finalCloseViaCdp:unrelatedClose.closed===true,finalCleanupVerified:unrelatedClean.clean===true};
    report.lifecycle=lifecycle;
    report.cleanupVerified=true;
    report.notProven=['Network Service lockdown/integrity restrictions beyond the verified AppContainer SID','Real Douyin video playback (outbound blocked by design)','Model reasoning','Long-term autonomy','Memory synchronization','Signed release trust','General user PC safety'];
    if(forceMode) console.log('PASS_WINDOWS_PACKAGED_EXE_JOB_OBJECT_FORCED_EXIT '+JSON.stringify(report.forcedExit));
    if(stressRestarts>2) {
      assert.equal(lifecycle.launchCount,stressRestarts+1,'Cold-start stress did not complete every requested launch');
      console.log('PASS_WINDOWS_COLD_START_STRESS '+JSON.stringify({
        candidateSha256:EXPECTED_EXE,launchCount:lifecycle.launchCount,
        distinctHostPidCount:new Set(lifecycle.hostPids).size,
        restarts:stressRestarts,cleanFinalShutdown:lifecycle.finalCloseVerified,
        everyRestartReady:lifecycle.cycles.every(x=>x.restartReady && x.restartLoopbackOnly),
        everyRestartClean:lifecycle.cycles.every(x=>x.closeVerified && x.processesRemaining===0 && x.listenersRemaining===0),
        restartElapsedMs:lifecycle.cycles.map(x=>x.restartElapsedMs)
      }));
    }
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
      const currentProcesses=asRows(ps("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe' OR Name = 'jobguard.exe' OR Name = '"+FILE.replace(/\.exe$/i,'')+".exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4"));
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
      const processFilter=`Name = 'msedge.exe' OR Name = 'node.exe' OR Name = 'jobguard.exe' OR Name = '${FILE}'`;
      const processQuery=`Get-CimInstance Win32_Process -Filter "${processFilter}" | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 3`;
      let rows=[];
      try { const value=ps(processQuery); rows=Array.isArray(value)?value:(value?[value]:[]); }
      catch { process.exitCode=1; rows=[{ProcessId:'unknown',Name:'unverified',CommandLine:profile}]; }
      const belongsToCandidate=p=>Number(p.ProcessId)===child.pid&&String(p.ExecutablePath||'').toLowerCase()===path.resolve(exeFile).toLowerCase();
      const belongsToBackend=p=>Number(p.ProcessId)===backendPid&&/node\.exe$/i.test(String(p.Name||''))&&/api-worker\.mjs/i.test(String(p.CommandLine||''));
      const backendRow=rows.find(p=>Number(p.ProcessId)===backendPid);
      const desktopPid=Number(backendRow?.ParentProcessId)||0;
      const belongsToGuard=p=>/jobguard\.exe$/i.test(String(p.Name||''))&&[Number(state?.pid)||0,desktopPid].includes(Number(p.ParentProcessId));
      const belongsToBrowser=p=>String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase())||String(p.CommandLine||'').toLowerCase().includes(controlDir.toLowerCase());
      let survivors=rows.filter(p=>belongsToBrowser(p)||belongsToCandidate(p)||belongsToBackend(p)||belongsToGuard(p));
      for(const item of survivors) { if(Number.isSafeInteger(Number(item.ProcessId)))try { execFileSync('taskkill.exe',['/PID',String(item.ProcessId),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000}); } catch {} }
      if(survivors.length) {
        await delay(1000);
        try {
          const value=ps(processQuery);
          const after=Array.isArray(value)?value:(value?[value]:[]);
          survivors=after.filter(p=>belongsToBrowser(p)||belongsToCandidate(p)||belongsToBackend(p)||belongsToGuard(p));
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

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  if(process.argv.includes('--self-test'))selfTest();
  else {
    const exe=process.argv[2];
    if(!exe)throw new Error('Specify exact candidate EXE path; only in GitHub Windows CI');
    const modes = ['--force-host','--force-guard','--force-desktop'].filter(flag => process.argv.includes(flag));
    if(modes.length > 1) throw new Error('Only one forced-exit mode may be selected');
    const forceMode = modes[0] === '--force-host' ? 'host' : modes[0] === '--force-guard' ? 'guard' : modes[0] === '--force-desktop' ? 'desktop' : null;
    const desktopOnly=process.argv.includes('--desktop-only');
    const stressArgs=process.argv.filter(arg=>arg.startsWith('--stress-restarts='));
    if(stressArgs.length>1)throw new Error('Only one cold-start stress count may be selected');
    const stressRestarts=stressArgs.length ? Number(stressArgs[0].slice('--stress-restarts='.length)) : 2;
    run(path.resolve(exe), { forceMode, stressRestarts, desktopOnly }).then(async report=>{const resultPath=process.env.YUTANG_EDGE_RESULT_PATH;if(resultPath)await fs.writeFile(resultPath,JSON.stringify(report,null,2)+'\n');}).catch(e=>{console.error('FAIL_CLOSED_WINDOWS_EDGE_SMOKE:',e.message);process.exitCode=1;});
  }
}
