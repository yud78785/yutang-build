#!/usr/bin/env node
// Isolated GitHub Windows runner only. Reuses accepted EXE; never signs, modifies or installs it.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createCandidateEnvironment, inspectRendererSandbox, verifyProcessSnapshot, hasHostAncestor } from './windows_147_isolated_edge_lifecycle.mjs';

const NAME = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
const SHA = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const BYTES = 125446071;
const PORT = 9227;
const ORIGIN = 'https://www.douyin.com';
const MAX_DELAY = 90000;
const PUBLIC_READY_WAIT_MS = 45000;

export function summarizePublicPageState(status,page) {
  const ready=['loading','interactive','complete'].includes(page?.ready)?page.ready:'unknown';
  return {
    documentHttp200:status===200,
    approvedOrigin:page?.origin===ORIGIN,
    readiness:ready,
    titlePresent:Number(page?.titleLength)>0,
    bodyLengthAtLeast30:Number(page?.bodyLength)>=30,
    bodyChildrenPresent:Number(page?.bodyChildren)>0,
    screenshotMoreThan2KiB:Number(page?.paintBytes)>2048,
    challengeDetected:page?.challenged===true
  };
}

export function validatePublicPageEvidence({status, page, sandbox, identity}) {
  assert.equal(status, 200, 'PUBLIC_DOCUMENT_NOT_HTTP_200');
  assert.equal(page?.origin, ORIGIN, 'PUBLIC_PAGE_LEFT_APPROVED_ORIGIN');
  assert.equal(page?.ready, 'complete', 'PUBLIC_PAGE_NOT_FULLY_LOADED');
  assert.equal(page?.challenged, false, 'PUBLIC_PAGE_LOGIN_OR_CHALLENGE');
  assert.ok(page?.titleLength > 0 && page?.bodyLength >= 30 && page?.bodyChildren > 0 && page?.paintBytes > 2048, 'PUBLIC_PAGE_NOT_RENDERED');
  assert.equal(sandbox?.rendererSandboxVerified, true, 'RENDERER_SANDBOX_MISSING');
  assert.equal(sandbox?.networkServiceWindowsTokenVerified, true, 'NETWORK_APPCONTAINER_TOKEN_MISSING');
  assert.equal(sandbox?.networkServiceLowIntegrityVerified, true, 'NETWORK_LOW_INTEGRITY_MISSING');
  assert.equal(sandbox?.networkServiceProcessOwned, true, 'NETWORK_PROCESS_NOT_OWNED');
  assert.equal(identity?.loopbackOnly, true, 'CDP_NOT_LOOPBACK_ONLY');
  assert.equal(identity?.listenerMatchesEdge, true, 'CDP_LISTENER_NOT_OWNED');
  return true;
}
export function validatePublicReceipt(receipt) {
  validatePublicPageEvidence(receipt);
  assert.equal(receipt.cleaned, true, 'PROCESSES_NOT_CLEANED');
  return 'PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY';
}

async function until(getValue, timeoutMs, reason) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await getValue();
    if (v) return v;
    await delay(250);
  }
  throw new Error(reason);
}
function windowsJson(psCode) {
  const utf8Ps='[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);'+psCode;
  const raw = execFileSync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command', utf8Ps],
    { encoding: 'utf8', windowsHide: true, timeout: 12000, maxBuffer: 1_000_000 }).trim();
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function processes() {
  return windowsJson("Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4");
}
function listeners() {
  return windowsJson("@(Get-NetTCPConnection -LocalPort 9227 -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress) | ConvertTo-Json -Compress");
}
async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function bounded(promise, milliseconds, label) {
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),milliseconds);});
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
async function wsOpen(url) {
  const ws = new WebSocket(url);
  await bounded(
    new Promise((resolve,reject) => { ws.addEventListener('open', resolve, {once:true}); ws.addEventListener('error',()=>reject(new Error('CDP_WEBSOCKET_FAILED')),{once:true}); }),
    6000,'CDP_WEBSOCKET_TIMEOUT'
  );
  return ws;
}
async function command(ws,id,method,params={},sessionId) {
  return await bounded(
    new Promise((resolve,reject)=>{
      const onMessage = e => {
        let result; try { result = JSON.parse(String(e.data)); } catch {return;}
        if(result.id !== id) return;
        ws.removeEventListener('message',onMessage);
        if(result.error) reject(new Error('CDP_COMMAND_ERROR_'+method));
        else resolve(result.result || {});
      };
      ws.addEventListener('message',onMessage);
      try { ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})); }
      catch(error) { ws.removeEventListener('message',onMessage); reject(error); }
    }),
    7500,'CDP_COMMAND_TIMEOUT_'+method
  );
}
async function version() {
  const r = await fetch('http://127.0.0.1:9227/json/version',{signal:AbortSignal.timeout(5000)});
  assert.equal(r.status,200,'CDP_VERSION_UNAVAILABLE');
  const info=await r.json();
  const address=new URL(info.webSocketDebuggerUrl);
  assert.equal(address.hostname,'127.0.0.1','CDP_WEBSOCKET_NOT_LOOPBACK');
  assert.equal(address.port,String(PORT),'CDP_WEBSOCKET_PORT_WRONG');
  assert.match(String(info.Browser),/(?:Edg|Chrome)/,'NOT_EDGE_BROWSER');
  return info;
}
export function observePublicCdpEvent(state,message,sessionId,mainFrameId) {
  if (!state || !message || message.sessionId!==sessionId) return;
  const method=message.method,params=message.params||{};
  if (method==='Network.responseReceived' && params.type==='Document' &&
    params.frameId===mainFrameId && String(params.response?.url||'').startsWith(ORIGIN+'/')) {
    state.mainDocumentResponseSeen=true;
    state.mainDocumentRequestId=params.requestId;
    state.mainDocumentLoaderId=typeof params.loaderId==='string'&&params.loaderId.length>0?params.loaderId:null;
    // Never attribute initial-page lifecycle events to the reloaded document.
    state.domContentLoaded=false;
    state.loadEventFired=false;
    state.mainDocumentFinished=false;
    state.mainDocumentFailed=false;
    state.resourceFailures=0;
    return;
  }
  if(!state.mainDocumentResponseSeen)return;
  // The legacy Page.loadEventFired/Page.domContentEventFired lack loaderId;
  // never attribute those events to a newly reloaded document.
  if (method==='Page.lifecycleEvent' && state.mainDocumentLoaderId &&
    params.frameId===mainFrameId && params.loaderId===state.mainDocumentLoaderId) {
    if(params.name==='DOMContentLoaded')state.domContentLoaded=true;
    else if(params.name==='load')state.loadEventFired=true;
  }
  else if (method==='Network.loadingFinished' && state.mainDocumentRequestId &&
    params.requestId===state.mainDocumentRequestId) state.mainDocumentFinished=true;
  else if (method==='Network.loadingFailed') {
    if(state.mainDocumentRequestId && params.requestId===state.mainDocumentRequestId)
      state.mainDocumentFailed=true;
    else state.resourceFailures=Math.min(99,(state.resourceFailures||0)+1);
  }
}
export function summarizePublicCdpSignals(state) {
  return {
    domContentLoaded:state?.domContentLoaded===true,
    loadEventFired:state?.loadEventFired===true,
    mainDocumentResponseSeen:state?.mainDocumentResponseSeen===true,
    mainDocumentLoaderVerified:typeof state?.mainDocumentLoaderId==='string'&&state.mainDocumentLoaderId.length>0,
    mainDocumentFinished:state?.mainDocumentFinished===true,
    mainDocumentFailed:state?.mainDocumentFailed===true,
    resourceFailures:Math.max(0,Math.min(99,Number.isSafeInteger(state?.resourceFailures)?state.resourceFailures:0))
  };
}
export function createPublicDocumentResponseWatch(ws,{sessionId,mainFrameId,timeoutMs=30000}) {
  let timer=null,listener=null,rejectPending=null,settled=false;
  const promise=new Promise((resolve,reject)=>{
    rejectPending=reject;
    const finish=(callback,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      ws.removeEventListener('message',listener);
      callback(value);
    };
    listener=e=>{
      let item;
      try {item=JSON.parse(String(e.data));} catch{return;}
      if(item.sessionId!==sessionId || item.method!=='Network.responseReceived')return;
      const event=item.params;
      if(event?.type!=='Document' || event.frameId!==mainFrameId ||
        !String(event.response?.url||'').startsWith(ORIGIN+'/'))return;
      finish(resolve,Number(event.response.status));
    };
    ws.addEventListener('message',listener);
    timer=setTimeout(()=>finish(reject,new Error('PUBLIC_DOCUMENT_STATUS_TIMEOUT')),timeoutMs);
  });
  // Page.reload may reject before its response is awaited: prevent an unhandled timeout.
  promise.catch(()=>{});
  return {promise,cancel:()=>{
    if(settled)return;
    settled=true;
    clearTimeout(timer);
    ws.removeEventListener('message',listener);
    rejectPending(new Error('PUBLIC_DOCUMENT_WATCH_CANCELLED'));
  }};
}

async function inspectOnlinePage() {
  const info=await version();
  const ws=await wsOpen(info.webSocketDebuggerUrl);
  let id=1;
  let responseWatch=null,signalListener=null;
  const lifecycle={domContentLoaded:false,loadEventFired:false,mainDocumentResponseSeen:false,
    mainDocumentFinished:false,mainDocumentFailed:false,resourceFailures:0,mainDocumentRequestId:null};
  try {
    const targets=await command(ws,id++,'Target.getTargets');
    const pages=(targets.targetInfos||[]).filter(t=>t.type==='page'&&t.url?.startsWith(ORIGIN+'/'));
    assert.equal(pages.length,1,'APPROVED_PUBLIC_PAGE_NOT_UNIQUE');
    const attached=await command(ws,id++,'Target.attachToTarget',{targetId:pages[0].targetId,flatten:true});
    const sessionId=attached.sessionId;
    assert.ok(typeof sessionId==='string' && sessionId.length>0,'CDP_SESSION_MISSING');
    await command(ws,id++,'Page.enable',{},sessionId);
    await command(ws,id++,'Page.setLifecycleEventsEnabled',{enabled:true},sessionId);
    await command(ws,id++,'Runtime.enable',{},sessionId);
    await command(ws,id++,'Network.enable',{},sessionId);
    const frameTree=await command(ws,id++,'Page.getFrameTree',{},sessionId);
    const mainFrameId=frameTree.frameTree?.frame?.id;
    assert.ok(typeof mainFrameId==='string'&&mainFrameId.length>0,'PUBLIC_MAIN_FRAME_MISSING');
    signalListener=e=>{
      let item;try{item=JSON.parse(String(e.data));}catch{return;}
      observePublicCdpEvent(lifecycle,item,sessionId,mainFrameId);
    };
    ws.addEventListener('message',signalListener);
    responseWatch=createPublicDocumentResponseWatch(ws,{sessionId,mainFrameId});
    await command(ws,id++,'Page.reload',{ignoreCache:true},sessionId);
    const status=await responseWatch.promise;
    let page;
    const readyDeadline=Date.now()+PUBLIC_READY_WAIT_MS;
    while(Date.now()<readyDeadline){
      const r=await command(ws,id++,'Runtime.evaluate',{
        expression:"JSON.stringify({origin:location.origin,ready:document.readyState,titleLength:document.title.length,bodyLength:(document.body?.innerText||'').length,bodyChildren:document.body?.children.length||0,challenged:/(?:请完成.{0,8}验证|安全验证|人机验证|拖动滑块|captcha required)/i.test((document.body?.innerText||'').slice(0,4000))||/(?:captcha|verify|login)/i.test(location.pathname)})",
        returnByValue:true
      },sessionId);
      if(typeof r.result?.value==='string') page=JSON.parse(r.result.value);
      if(page?.ready==='complete' && page.bodyLength>=30 && page.titleLength>0)break;
      if(page?.challenged===true)break;
      await delay(500);
    }
    const captured=await command(ws,id++,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
    if (!page) throw new Error('PUBLIC_DOM_UNAVAILABLE');
    page.paintBytes=typeof captured.data==='string'?Math.floor(captured.data.length*3/4):0;
    return {status,page,cdpSignals:summarizePublicCdpSignals(lifecycle)};
  } finally {
    responseWatch?.cancel();
    if(signalListener)ws.removeEventListener('message',signalListener);
    try{ws.close();}catch{}
  }
}
async function closeDedicatedBrowser() {
  const info=await version();
  const ws=await wsOpen(info.webSocketDebuggerUrl);
  try {
    const closed=new Promise(resolve=>ws.addEventListener('close',()=>resolve(true),{once:true}));
    ws.send(JSON.stringify({id:1001,method:'Browser.close'}));
    await bounded(closed,12000,'DEDICATED_BROWSER_CLOSE_TIMEOUT');
  } finally {try{ws.close();}catch{}}
}
export function ownedEdgePids(rows, hostPid) {
  return rows.filter(p=>/msedge\.exe$/i.test(String(p.Name||'')) &&
    hasHostAncestor(Number(p.ProcessId), hostPid, rows)).map(p=>Number(p.ProcessId));
}
export function trackedEdgeSurvivors(rows, trackedEdgePids) {
  return rows.filter(p=>/msedge\.exe$/i.test(String(p.Name||'')) &&
    trackedEdgePids.has(Number(p.ProcessId)));
}
export function summarizeIdentityTopology(rows,{exePid,backendPid}) {
  // Bounded, non-sensitive telemetry only. Never emit raw PIDs, process names,
  // parent chains, paths, command lines, or environment contents.
  const snapshot=Array.isArray(rows)?rows.filter(r=>r!==null&&typeof r==='object'):[];
  const wrapper=snapshot.find(r=>Number(r.ProcessId)===exePid);
  const worker=snapshot.find(r=>Number(r.ProcessId)===backendPid);
  const parentPid=Number(worker?.ParentProcessId);
  const parent=parentPid>0?snapshot.find(r=>Number(r.ProcessId)===parentPid):null;
  const guards=parentPid>0?snapshot.filter(r=>/jobguard\.exe$/i.test(String(r.Name||''))&&Number(r.ParentProcessId)===parentPid):[];
  const pairedGuardCount=guards.filter(g=>
    new RegExp('--owner-pid\\s+'+parentPid+'\\s+--target-pid\\s+'+backendPid+'(?:\\s|$)','i').test(String(g.CommandLine||''))
  ).length;
  return {
    wrapperPresent:!!wrapper,
    workerPresent:!!worker,
    immediateParentPresent:!!parent,
    immediateParentNameExpected:!!parent && String(parent.Name)==='\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',
    wrapperAncestryVerified:!!parent && hasHostAncestor(parentPid,exePid,snapshot),
    workerGuardCount:Math.min(guards.length,10),
    exactGuardPairVerified:guards.length===1&&pairedGuardCount===1
  };
}

export function safeProcessSnapshot(reader) {
  // A broken WMI query must not masquerade as missing Electron or disclose
  // the raw OS error (which may contain local paths or user information).
  try {
    const value=reader();
    if(!Array.isArray(value))throw new Error('not-a-process-array');
    return {rows:value.filter(r=>r!==null&&typeof r==='object'),error:null};
  } catch {
    return {rows:null,error:'PROCESS_SNAPSHOT_UNAVAILABLE'};
  }
}

export function identityReasonCode(error) {
  // Only fixed error codes are printed; never log untrusted process command lines or paths.
  const known=[
    'CANDIDATE_WRAPPER_IDENTITY_NOT_VERIFIED','API_WORKER_IDENTITY_NOT_VERIFIED',
    'PROCESS_SNAPSHOT_UNAVAILABLE',
    'INNER_ELECTRON_PARENT_NOT_FOUND','INNER_ELECTRON_NAME_MISMATCH',
    'INNER_ELECTRON_ANCESTRY_NOT_VERIFIED','INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED',
    'DESKTOP_JOB_GUARD_NOT_VERIFIED','DESKTOP_JOB_GUARD_PAIR_MISMATCH'
  ];
  return known.find(code=>String(error?.message||'').includes(code)) || 'IDENTITY_VERIFICATION_UNKNOWN';
}
export function verifyDesktopStopTarget(rows, {exePid, exeFile, backendPid}) {
  const wrapper=rows.find(r=>Number(r.ProcessId)===exePid);
  assert.ok(wrapper && String(wrapper.ExecutablePath||'').toLowerCase()===path.resolve(exeFile).toLowerCase(),
    'CANDIDATE_WRAPPER_IDENTITY_NOT_VERIFIED');
  const backend=rows.find(r=>Number(r.ProcessId)===backendPid);
  assert.ok(backend && /node\.exe$/i.test(String(backend.Name||'')) && /api-worker\.mjs/i.test(String(backend.CommandLine||'')),
    'API_WORKER_IDENTITY_NOT_VERIFIED');
  const desktopPid=Number(backend.ParentProcessId);
  const desktop=rows.find(r=>Number(r.ProcessId)===desktopPid);
  assert.ok(desktop, 'INNER_ELECTRON_PARENT_NOT_FOUND');
  assert.equal(String(desktop.Name), '\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',
    'INNER_ELECTRON_NAME_MISMATCH');
  assert.ok(hasHostAncestor(desktopPid,exePid,rows), 'INNER_ELECTRON_ANCESTRY_NOT_VERIFIED');
  // A matching PID and process name alone never authorize terminating an executable.
  // An unreadable or relative image path must fail closed, before taskkill can run.
  const desktopImage=String(desktop.ExecutablePath||'');
  assert.ok(path.isAbsolute(desktopImage) &&
    path.basename(desktopImage)==='\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',
    'INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED');
  const guards=rows.filter(r=>/jobguard\.exe$/i.test(String(r.Name||''))&&Number(r.ParentProcessId)===desktopPid);
  assert.equal(guards.length,1,'DESKTOP_JOB_GUARD_NOT_VERIFIED');
  assert.match(String(guards[0].CommandLine||''),new RegExp('--owner-pid\\s+'+desktopPid+'\\s+--target-pid\\s+'+backendPid+'(?:\\s|$)','i'),
    'DESKTOP_JOB_GUARD_PAIR_MISMATCH');
  return {pid:desktopPid,executablePath:desktopImage};
}
function stopVerifiedDesktop(target) {
  if (!target) return false;
  const current=processes().find(p=>Number(p.ProcessId)===target.pid);
  if (!current) return false;
  assert.equal(String(current.Name),'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',
    'INNER_ELECTRON_CHANGED_BEFORE_STOP');
  assert.ok(typeof target.executablePath==='string' && path.isAbsolute(target.executablePath) &&
    String(current.ExecutablePath||'').length>0 && path.isAbsolute(String(current.ExecutablePath)),
    'INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED');
  assert.equal(String(current.ExecutablePath).toLowerCase(),target.executablePath.toLowerCase(),
    'INNER_ELECTRON_IMAGE_CHANGED_BEFORE_STOP');
  // Matches the previously accepted Windows EXE lifecycle check: exact inner desktop PID, never /T.
  execFileSync('taskkill.exe',['/PID',String(target.pid),'/F'],{windowsHide:true,timeout:10000,stdio:'ignore'});
  return true;
}
export function ownedJobGuardForCleanup(p,{exePid,hostPid}) {
  const parentPid=Number(p.ParentProcessId);
  return /jobguard\.exe$/i.test(String(p.Name||'')) &&
    ((exePid>0 && parentPid===exePid) || (hostPid>0 && parentPid===hostPid));
}
export function cleanupRole(p,{exePid,desktopPid,backendPid,hostPid,trackedEdgePids}) {
  const pid=Number(p.ProcessId);
  if(pid===exePid)return 'packaged-wrapper';
  if(desktopPid>0 && pid===desktopPid)return 'inner-electron';
  if(pid===backendPid)return 'api-worker';
  if(hostPid>0 && pid===hostPid)return 'browser-host';
  if(trackedEdgePids.has(pid)&&/msedge\.exe$/i.test(String(p.Name||'')))return 'edge-descendant';
  if(/jobguard\.exe$/i.test(String(p.Name||'')))return 'jobguard';
  return 'owned-descendant';
}
async function waitCleanup({exePid,desktopPid,backendPid,hostPid,profile,controlDir,trackedEdgePids=new Set(),trackedOwnedPids=new Set()}) {
  try {
  return await until(()=>{
    const procs=processes();
    const owned=procs.filter(p=>trackedOwnedPids.has(Number(p.ProcessId)) || (desktopPid>0 && Number(p.ProcessId)===desktopPid) || Number(p.ProcessId)===exePid ||
      (backendPid > 0 && Number(p.ProcessId)===backendPid) ||
      String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase()) ||
      String(p.CommandLine||'').toLowerCase().includes(controlDir.toLowerCase()) ||
      ownedJobGuardForCleanup(p,{exePid,hostPid}));
    return !owned.length && trackedEdgeSurvivors(procs,trackedEdgePids).length===0 && listeners().length===0;
  },20000,'CANDIDATE_PROCESSES_OR_CDP_REMAIN');
  } catch(error) {
    try {
      const rows=processes();
      const left=rows.filter(p=>trackedOwnedPids.has(Number(p.ProcessId)) || (desktopPid>0 && Number(p.ProcessId)===desktopPid) ||
        Number(p.ProcessId)===exePid || Number(p.ProcessId)===backendPid ||
        String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase()) ||
        String(p.CommandLine||'').toLowerCase().includes(controlDir.toLowerCase()) ||
        trackedEdgePids.has(Number(p.ProcessId)) ||
        ownedJobGuardForCleanup(p,{exePid,hostPid}));
      console.error('WINDOWS_PUBLIC_WEB_CLEANUP_DIAGNOSTIC '+JSON.stringify({
        remaining: left.slice(0,40).map(p=>({pid:Number(p.ProcessId),role:cleanupRole(p,{exePid,desktopPid,backendPid,hostPid,trackedEdgePids})})),
        remainingCount:left.length,cdpListenerCount:listeners().length
      }));
    } catch { console.error('WINDOWS_PUBLIC_WEB_CLEANUP_DIAGNOSTIC_UNAVAILABLE'); }
    throw error;
  }
}
export async function run(exe) {
  if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.YUTANG_PUBLIC_WEB_TEST_AUTHORIZED!=='yes'||!process.env.RUNNER_TEMP)
    throw new Error('REFUSED_OUTSIDE_EXPLICIT_EPHEMERAL_WINDOWS_CI');
  if(process.env.YUTANG_EDGE_FIREWALL_CONFIRMED==='yes')throw new Error('OFFLINE_FIREWALL_TEST_MODE_NOT_APPLICABLE');
  assert.equal(path.basename(exe),NAME,'EXE_NAME_NOT_PINNED');
  assert.equal((await fs.stat(exe)).size,BYTES,'EXE_SIZE_NOT_PINNED');
  assert.equal(await fileHash(exe),SHA,'EXE_HASH_NOT_PINNED');
  assert.equal(listeners().length,0,'CDP_PORT_ALREADY_IN_USE');
  const home=process.env.USERPROFILE;
  assert.ok(typeof home==='string'&&path.isAbsolute(home),'NATIVE_WINDOWS_PROFILE_REQUIRED');
  const common=path.join(home,'.yutang-observer-isolated');
  try {await fs.access(common);throw new Error('CANDIDATE_STATE_ALREADY_EXISTS');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const base=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP,'yutang-public-web-'));
  const userData=path.join(base,'user-data');
  const profile=path.join(common,'cli-profile');
  const controlDir=path.join(common,'control');
  await fs.mkdir(userData,{recursive:true});
  const env=createCandidateEnvironment(process.env,userData,path.join(common,'runtime-location.json'));
  assert.ok(!('GITHUB_TOKEN' in env)&&!('GH_TOKEN' in env),'CI_CREDENTIAL_PROPAGATION');
  const child=spawn(exe,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,shell:false,stdio:'ignore'});
  let childError=null,exited=false,hostPid=0,backendPid=0,cleaned=false;
  let desktopTarget=null;
  let lastIdentityReason='IDENTITY_VERIFICATION_NOT_OBSERVED';
  let lastIdentityTopology=null;
  const trackedEdgePids=new Set();
  const trackedOwnedPids=new Set();
  child.once('error',e=>{childError=e;});child.once('exit',()=>{exited=true;});
  try {
    const desktop=await until(async()=>{
      if(childError||exited)throw new Error('DESKTOP_EXE_FAILED_TO_START');
      try {const obj=JSON.parse(await fs.readFile(path.join(userData,'desktop-smoke.json'),'utf8'));return obj.ready===true?obj:null;}
      catch(e){if(e.code==='ENOENT')return null;throw e;}
    },MAX_DELAY,'DESKTOP_EXE_READY_TIMEOUT');
    assert.equal(desktop.configured,false,'MODEL_CONFIG_MUST_BE_ABSENT');
    backendPid=Number(desktop.backendPid);
    assert.ok(Number.isSafeInteger(backendPid)&&backendPid>0,'API_WORKER_PID_INVALID');
    // Capture the identity-verified inner desktop BEFORE browser API navigation, so
    // a network error can still trigger the same owned Job Object shutdown.
    desktopTarget=await until(()=>{
      const snapshot=safeProcessSnapshot(processes);
      if(snapshot.error){lastIdentityReason=snapshot.error;return null;}
      const earlyRows=snapshot.rows;
      lastIdentityTopology=summarizeIdentityTopology(earlyRows,{exePid:child.pid,backendPid});
      try {
        const target=verifyDesktopStopTarget(earlyRows,{exePid:child.pid,exeFile:exe,backendPid});
        for(const p of earlyRows)if(Number(p.ProcessId)===child.pid || Number(p.ProcessId)===target.pid ||
          hasHostAncestor(Number(p.ProcessId),target.pid,earlyRows))trackedOwnedPids.add(Number(p.ProcessId));
        return target;
      } catch(error) { lastIdentityReason=identityReasonCode(error); return null; }
    },7500,'INNER_DESKTOP_IDENTITY_NOT_READY').catch(error=>{
      console.error('WINDOWS_PUBLIC_WEB_IDENTITY_GATE '+lastIdentityReason);
      if(lastIdentityTopology)console.error('WINDOWS_PUBLIC_WEB_IDENTITY_TOPOLOGY '+JSON.stringify(lastIdentityTopology));
      throw error;
    });
    assert.match(desktop.origin,/^http:\/\/127\.0\.0\.1:\d{4,5}$/,'LOCAL_API_NOT_LOOPBACK');
    const boot=await fetch(desktop.origin+'/api/bootstrap',{signal:AbortSignal.timeout(5000)});
    assert.equal(boot.status,200,'LOCAL_BOOTSTRAP_FAILED');
    const token=(await boot.json()).token;
    assert.ok(typeof token==='string'&&token.length>10,'SESSION_TOKEN_INVALID');
    const opened=await fetch(desktop.origin+'/api/browser/open',{
      method:'POST',headers:{'content-type':'application/json','x-session-token':token},body:'{}',signal:AbortSignal.timeout(49000)
    });
    assert.equal(opened.status,200,'PUBLIC_BROWSER_OPEN_FAILED_HTTP_'+opened.status);
    const state=await until(async()=>{
      try {const x=JSON.parse(await fs.readFile(path.join(controlDir,'browser.json'),'utf8'));return x.ready===true?x:null;}
      catch(e){if(e.code==='ENOENT')return null;throw e;}
    },20000,'DEDICATED_BROWSER_NOT_READY');
    hostPid=state.pid;
    assert.equal(path.resolve(state.profile).toLowerCase(),path.resolve(profile).toLowerCase(),'PROFILE_ISOLATION_FAILED');
    assert.equal(state.port,PORT,'CDP_PORT_MISMATCH');
    const sock=listeners();
    const initialSnapshot=processes();
    const identity=verifyProcessSnapshot({processes:initialSnapshot,hostPid,profile,
      listenerPids:sock.map(x=>Number(x.OwningProcess)),portAddresses:sock.map(x=>x.LocalAddress)});
    desktopTarget=verifyDesktopStopTarget(initialSnapshot,{exePid:child.pid,exeFile:exe,backendPid});
    for(const p of initialSnapshot)if(Number(p.ProcessId)===child.pid || Number(p.ProcessId)===desktopTarget.pid ||
      hasHostAncestor(Number(p.ProcessId),desktopTarget.pid,initialSnapshot))trackedOwnedPids.add(Number(p.ProcessId));
    for(const pid of ownedEdgePids(initialSnapshot,hostPid)) trackedEdgePids.add(pid);
    assert.ok(trackedEdgePids.size>0,'CANDIDATE_EDGE_PROCESS_IDS_NOT_CAPTURED');
    const sandbox=await inspectRendererSandbox(PORT,{profile,hostPid});
    const online=await inspectOnlinePage();
    try { validatePublicPageEvidence({status:online.status,page:online.page,sandbox,identity}); }
    catch(error) {
      console.error('WINDOWS_PUBLIC_WEB_PAGE_DIAGNOSTIC '+JSON.stringify({
        ...summarizePublicPageState(online.status,online.page),...online.cdpSignals}));
      throw error;
    }
    console.log('WINDOWS_PUBLIC_PAGE_GATE_OK '+JSON.stringify({exeSha256:SHA,httpStatus:online.status,rendered:true,cleanupPending:true}));
    const beforeClose=processes();
    for(const p of beforeClose)if(hasHostAncestor(Number(p.ProcessId),desktopTarget.pid,beforeClose))
      trackedOwnedPids.add(Number(p.ProcessId));
    for(const pid of ownedEdgePids(beforeClose,hostPid)) trackedEdgePids.add(pid);
    await closeDedicatedBrowser();
    await until(()=>{
      const rows=processes();
      return listeners().length===0 &&
        !rows.some(p=>String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase())) &&
        trackedEdgeSurvivors(rows,trackedEdgePids).length===0;
    },20000,'BROWSER_NOT_CLEANED');
    // The verified inner Electron main, not the outer portable wrapper, owns the API Job Object.
    stopVerifiedDesktop(desktopTarget);
    if(!exited)child.kill();
    cleaned=await waitCleanup({exePid:child.pid,desktopPid:desktopTarget.pid,backendPid,hostPid,profile,controlDir,trackedEdgePids,trackedOwnedPids});
    const status=validatePublicReceipt({status:online.status,page:online.page,sandbox,identity,cleaned});
    const receipt={status,exeSha256:SHA,exeBytes:BYTES,sourceCandidate:'9cc16d7e64d59dc141e9c6687b8dd461934fcc35',
      documentHttpStatus:online.status,renderedPage:true,rendererSandboxVerified:true,
      networkServiceAppContainer:true,networkServiceLowIntegrity:true,cdpLoopbackOnly:true,
      noResidualCandidateProcesses:true,trackedEdgeProcessCount:trackedEdgePids.size,accountUsed:false,modelKeyUsed:false,videoPlaybackClaimed:false,
      personalComputerAcceptance:false,releaseAuthorized:false};
    return receipt;
  } catch(error) {
    console.error('WINDOWS_PUBLIC_WEB_STAGE_FAILED '+String(error?.message||'unknown').slice(0,180));
    throw error;
  } finally {
    let cleanupError=null;
    if(!desktopTarget && Number.isSafeInteger(backendPid) && backendPid>0) {
      try {
        const snapshot=safeProcessSnapshot(processes);
        if(snapshot.error)throw new Error(snapshot.error);
        const remainingRows=snapshot.rows;
        lastIdentityTopology=summarizeIdentityTopology(remainingRows,{exePid:child.pid,backendPid});
        desktopTarget=verifyDesktopStopTarget(remainingRows,{exePid:child.pid,exeFile:exe,backendPid});
        for(const p of remainingRows)if(Number(p.ProcessId)===child.pid || Number(p.ProcessId)===desktopTarget.pid ||
          hasHostAncestor(Number(p.ProcessId),desktopTarget.pid,remainingRows))
          trackedOwnedPids.add(Number(p.ProcessId));
      } catch(error) {
        console.error('WINDOWS_PUBLIC_WEB_FINAL_IDENTITY_GATE '+identityReasonCode(error));
        if(lastIdentityTopology)console.error('WINDOWS_PUBLIC_WEB_FINAL_IDENTITY_TOPOLOGY '+JSON.stringify(lastIdentityTopology));
        cleanupError=new Error('EARLY_DESKTOP_IDENTITY_NOT_VERIFIED');
      }
    }
    if(desktopTarget)try{stopVerifiedDesktop(desktopTarget);}catch{cleanupError=new Error('VERIFIED_DESKTOP_STOP_FAILED');}
    if(!exited)try{child.kill();}catch{}
    try {
      await waitCleanup({exePid:child.pid,desktopPid:desktopTarget?.pid||0,backendPid,hostPid,profile,controlDir,trackedEdgePids,trackedOwnedPids});
      cleaned=true;
    } catch { cleanupError=new Error('CANDIDATE_PROCESS_CLEANUP_UNVERIFIED'); }
    if(cleaned) {
      try {
        await fs.rm(common,{recursive:true,force:true});
        await fs.rm(base,{recursive:true,force:true});
      } catch { cleanupError=new Error('CANDIDATE_DIRECTORY_CLEANUP_UNVERIFIED'); }
    }
    if(cleanupError) throw cleanupError;
  }
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked)run(path.resolve(process.argv[2]||''))
  .then(receipt=>{console.log('WINDOWS_PUBLIC_WEB_EXE_RECEIPT '+JSON.stringify(receipt));})
  .catch(e=>{console.error('WINDOWS_PUBLIC_WEB_EXE_NOT_ACCEPTED '+String(e?.message||'unknown').slice(0,180));process.exitCode=1;});
