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

export const EXPECTED_EXE = '84321ec6c827de90e95d0d03b76a693444f8ea8c22c9c71c709e2e496bde753a';
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
    edgeWithNoSandbox: edge.filter(p => /--no-sandbox|--disable-setuid-sandbox/i.test(String(p.CommandLine || ''))).length
  };
}
const ps = script => {
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:25000,maxBuffer:8*1024*1024});
  const json=out.trim();return json?JSON.parse(json):[];
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
  return { state, browserVersion: version.Browser, hostSummary, ownership };
}
async function run(exeFile) {
  if (process.platform!=='win32' || process.env.GITHUB_ACTIONS!=='true' || process.env.YUTANG_EDGE_FIREWALL_CONFIRMED!=='yes')
    throw new Error('Refusing candidate launch outside pre-guarded ephemeral Windows GitHub runner');
  assert.equal(path.basename(exeFile),FILE);
  assert.equal(await sha256(exeFile),EXPECTED_EXE,'Candidate EXE does not match immutable build');
  const base=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(),'yutang-edge-ci-'));
  const home=process.env.USERPROFILE || process.env.HOME;
  if(typeof home!=='string'||!path.isAbsolute(home))throw new Error('Native Windows USERPROFILE is unavailable; refusing to launch candidate.');
  const common=path.join(home,'.dsh','douyin-browser');
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
  assert.ok(typeof edgeExe==='string'&&path.isAbsolute(edgeExe)&&fs.existsSync(edgeExe),'Verified Microsoft Edge executable path is required');
  const unrelatedProfile=path.join(base,'unrelated-edge-profile');
  await fs.mkdir(unrelatedProfile,{recursive:true});
  let unrelatedEdgeChild=null;
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
  },20000,'independent unrelated Edge process and CDP listener');
  const child=spawn(exeFile,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore',shell:false});
  const controlDir=path.join(common,'control');
  const control=path.join(controlDir,'browser.json');
  const profile=path.join(common,'cli-profile');
  const envKeys=['HOMEDRIVE','HOMEPATH','USERNAME','USERDOMAIN','SystemDrive','ProgramFiles','ProgramFiles(x86)','ProgramData','SystemRoot','TEMP','TMP'];
  const report={type:'WINDOWS_EDGE_LAUNCH_IN_EPHEMERAL_CI_ONLY',candidateSha256:EXPECTED_EXE,realAccount:false,modelKey:false,externalEdgeNetworkBlocked:true,environmentProfile:'isolated-safe-expanded',safeEnvPresence:Object.fromEntries(envKeys.map(key=>[key,Boolean(env[key])]))};
  let backendPid=null;
  try {
    const ready=await until(async()=>{const x=await readJSON(path.join(userData,'desktop-smoke.json'));return x.ready===true?x:null;},85000,'packaged EXE startup');
    backendPid=ready.backendPid;
    assert.equal(ready.configured,false,'EXE must not be configured with a model key');
    assert.equal(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(memory).toLowerCase(),'unexpected memory folder');
    assert.match(ready.origin,/^http:\/\/127\.0\.0\.1:\d{4,5}$/);
    report.desktopReady=true;
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
    report.notProven=['Effective renderer sandbox integrity','Douyin video playback (outbound blocked by design)','Model reasoning','Long-term autonomy','General user PC safety'];
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
    console.error('FAIL_CLOSED_DIAGNOSTICS '+JSON.stringify({
      desktopReady:report.desktopReady===true, browserOpenHttpStatus:report.browserOpenHttpStatus??null,
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
    await fs.rm(base,{recursive:true,force:true}).catch(()=>{});
  }
}

if(process.argv.includes('--self-test'))selfTest();
else {
  const exe=process.argv[2];
  if(!exe)throw new Error('Specify exact candidate EXE path; only in GitHub Windows CI');
  run(path.resolve(exe)).catch(e=>{console.error('FAIL_CLOSED_WINDOWS_EDGE_SMOKE:',e.message);process.exitCode=1;});
}
