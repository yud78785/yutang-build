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

export function validatePublicReceipt({status, page, sandbox, identity, cleaned}) {
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
  assert.equal(cleaned, true, 'PROCESSES_NOT_CLEANED');
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
  const raw = execFileSync('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command', psCode],
    { encoding: 'utf8', windowsHide: true, timeout: 12000, maxBuffer: 1_000_000 }).trim();
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function processes() {
  return windowsJson("Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe' OR Name = 'node.exe' OR Name = 'jobguard.exe' OR Name = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe'\" | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress -Depth 4");
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
async function inspectOnlinePage() {
  const info=await version();
  const ws=await wsOpen(info.webSocketDebuggerUrl);
  let id=1;
  try {
    const targets=await command(ws,id++,'Target.getTargets');
    const pages=(targets.targetInfos||[]).filter(t=>t.type==='page'&&t.url?.startsWith(ORIGIN+'/'));
    assert.equal(pages.length,1,'APPROVED_PUBLIC_PAGE_NOT_UNIQUE');
    const attached=await command(ws,id++,'Target.attachToTarget',{targetId:pages[0].targetId,flatten:true});
    const sessionId=attached.sessionId;
    assert.ok(typeof sessionId==='string' && sessionId.length>0,'CDP_SESSION_MISSING');
    await command(ws,id++,'Page.enable',{},sessionId);
    await command(ws,id++,'Runtime.enable',{},sessionId);
    await command(ws,id++,'Network.enable',{},sessionId);
    const frameTree=await command(ws,id++,'Page.getFrameTree',{},sessionId);
    const mainFrameId=frameTree.frameTree?.frame?.id;
    assert.ok(typeof mainFrameId==='string'&&mainFrameId.length>0,'PUBLIC_MAIN_FRAME_MISSING');
    let responseTimer;
    const responsePromise=new Promise((resolve,reject)=>{
      const receive=e=>{
        let item; try {item=JSON.parse(String(e.data));} catch{return;}
        if(item.sessionId!==sessionId || item.method!=='Network.responseReceived')return;
        const event=item.params;
        if(event?.type!=='Document'||event.frameId!==mainFrameId||!String(event.response?.url||'').startsWith(ORIGIN+'/'))return;
        clearTimeout(responseTimer);ws.removeEventListener('message',receive);
        resolve(Number(event.response.status));
      };
      ws.addEventListener('message',receive);
      responseTimer=setTimeout(()=>{ws.removeEventListener('message',receive);reject(new Error('PUBLIC_DOCUMENT_STATUS_TIMEOUT'));},30000);
    });
    await command(ws,id++,'Page.reload',{ignoreCache:true},sessionId);
    const status=await responsePromise;
    let page;
    for(let attempt=0;attempt<24;attempt++){
      const r=await command(ws,id++,'Runtime.evaluate',{
        expression:"JSON.stringify({origin:location.origin,ready:document.readyState,titleLength:document.title.length,bodyLength:(document.body?.innerText||'').length,bodyChildren:document.body?.children.length||0,challenged:/(?:请完成.{0,8}验证|安全验证|人机验证|拖动滑块|captcha required)/i.test((document.body?.innerText||'').slice(0,4000))||/(?:captcha|verify|login)/i.test(location.pathname)})",
        returnByValue:true
      },sessionId);
      if(typeof r.result?.value==='string') page=JSON.parse(r.result.value);
      if(page?.ready==='complete' && page.bodyLength>=30 && page.titleLength>0)break;
      await delay(300);
    }
    const captured=await command(ws,id++,'Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
    if (!page) throw new Error('PUBLIC_DOM_UNAVAILABLE');
    page.paintBytes=typeof captured.data==='string'?Math.floor(captured.data.length*3/4):0;
    return {status,page};
  } finally {try{ws.close();}catch{}}
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
async function waitCleanup({exePid,backendPid,hostPid,profile,controlDir,trackedEdgePids=new Set()}) {
  return until(()=>{
    const procs=processes();
    const owned=procs.filter(p=>Number(p.ProcessId)===exePid ||
      (backendPid > 0 && Number(p.ProcessId)===backendPid) ||
      String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase()) ||
      String(p.CommandLine||'').toLowerCase().includes(controlDir.toLowerCase()) ||
      (/jobguard\.exe$/i.test(String(p.Name||'')) &&
        (Number(p.ParentProcessId)===exePid || Number(p.ParentProcessId)===hostPid)));
    return !owned.length && trackedEdgeSurvivors(procs,trackedEdgePids).length===0 && listeners().length===0;
  },20000,'CANDIDATE_PROCESSES_OR_CDP_REMAIN');
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
  const trackedEdgePids=new Set();
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
    for(const pid of ownedEdgePids(initialSnapshot,hostPid)) trackedEdgePids.add(pid);
    assert.ok(trackedEdgePids.size>0,'CANDIDATE_EDGE_PROCESS_IDS_NOT_CAPTURED');
    const sandbox=await inspectRendererSandbox(PORT,{profile,hostPid});
    const online=await inspectOnlinePage();
    for(const pid of ownedEdgePids(processes(),hostPid)) trackedEdgePids.add(pid);
    await closeDedicatedBrowser();
    await until(()=>{
      const rows=processes();
      return listeners().length===0 &&
        !rows.some(p=>String(p.CommandLine||'').toLowerCase().includes(profile.toLowerCase())) &&
        trackedEdgeSurvivors(rows,trackedEdgePids).length===0;
    },20000,'BROWSER_NOT_CLEANED');
    // Terminate ONLY the process handle spawned from this exact pinned EXE, not another app.
    if(!exited)child.kill();
    cleaned=await waitCleanup({exePid:child.pid,backendPid,hostPid,profile,controlDir,trackedEdgePids});
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
    if(!exited)try{child.kill();}catch{}
    let cleanupError=null;
    try {
      await waitCleanup({exePid:child.pid,backendPid,hostPid,profile,controlDir,trackedEdgePids});
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
