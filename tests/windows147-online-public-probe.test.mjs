import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validatePublicReceipt, validatePublicPageEvidence, verifyDesktopStopTarget, identityReasonCode, ownedEdgePids, trackedEdgeSurvivors, cleanupRole, ownedJobGuardForCleanup, summarizeIdentityTopology, safeProcessSnapshot, summarizePublicPageState, observePublicCdpEvent, summarizePublicCdpSignals, createPublicDocumentResponseWatch} from '../tools/windows147-online-public-probe.mjs';
const SHA='3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const s=fs.readFileSync(new URL('../tools/windows147-online-public-probe.mjs', import.meta.url),'utf8');
const green={status:200,page:{origin:'https://www.douyin.com',ready:'complete',challenged:false,titleLength:8,bodyLength:220,bodyChildren:8,paintBytes:10000},sandbox:{rendererSandboxVerified:true,networkServiceWindowsTokenVerified:true,networkServiceLowIntegrityVerified:true,networkServiceProcessOwned:true},identity:{loopbackOnly:true,listenerMatchesEdge:true},cleaned:true};
test('positive green receipt only says PUBLIC_WEB_ONLY',()=>assert.equal(validatePublicReceipt(green),'PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY'));
for(const [name,change] of [
  ['403',{status:403}],['redirect',{status:302}],['204 not a full document',{status:204}],['201 not a document',{status:201}],['empty body',{page:{...green.page,bodyLength:0}}],
  ['empty screenshot',{page:{...green.page,paintBytes:0}}],['login challenge',{page:{...green.page,challenged:true}}],
  ['wrong origin',{page:{...green.page,origin:'https://evil.example'}}],
  ['loading-only',{page:{...green.page,ready:'loading'}}],
  ['missing renderer',{sandbox:{...green.sandbox,rendererSandboxVerified:false}}],
  ['network not appcontainer',{sandbox:{...green.sandbox,networkServiceWindowsTokenVerified:false}}],
  ['network not low integrity',{sandbox:{...green.sandbox,networkServiceLowIntegrityVerified:false}}],
  ['network not owned',{sandbox:{...green.sandbox,networkServiceProcessOwned:false}}],
  ['CDP not loopback',{identity:{...green.identity,loopbackOnly:false}}],
  ['CDP wrong PID',{identity:{...green.identity,listenerMatchesEdge:false}}],
  ['cleanup incomplete',{cleaned:false}]
])test(name+' fails closed',()=>assert.throws(()=>validatePublicReceipt({...green,...change})));
test('exact unsigned EXE SHA and size are fixed',()=>{assert.ok(s.includes(SHA));assert.match(s,/const BYTES = 125446071/);assert.match(s,/9cc16d7e64d59dc141e9c6687b8dd461934fcc35/)});
test('never handles user passwords, logs page text or signs binaries',()=>{
 assert.match(s,/GITHUB_ACTIONS!=='true'/);
 assert.match(s,/YUTANG_PUBLIC_WEB_TEST_AUTHORIZED/);
 assert.match(s,/modelKeyUsed:false/);
 assert.match(s,/releaseAuthorized:false/);
 assert.doesNotMatch(s,/signtool.exe|\bSign-YuTangCandidate.ps1\b|console\.log\(\s*token|console\.log\(\s*page\.text/i);
});
test('approved public origin is fixed; no site URL argument',()=>{assert.match(s,/const ORIGIN = 'https:\/\/www.douyin.com'/);assert.match(s,/PUBLIC_PAGE_LEFT_APPROVED_ORIGIN/);assert.match(s,/PUBLIC_PAGE_LOGIN_OR_CHALLENGE/)});
test('candidate-only process cleanup bounds remain explicit',()=>{assert.match(s,/CANDIDATE_PROCESSES_OR_CDP_REMAIN/);assert.match(s,/backendPid/);assert.match(s,/DEDICATED_BROWSER_CLOSE_TIMEOUT/);assert.match(s,/CANDIDATE_STATE_ALREADY_EXISTS/)});

test('only the main frame document status can count',()=>{assert.match(s,/Page\.getFrameTree/);assert.match(s,/event\.frameId!==mainFrameId/);assert.match(s,/PUBLIC_MAIN_FRAME_MISSING/)});

test('success marker is logged only after final process and directory cleanup',()=>{
  const close=s.indexOf('} finally {',s.indexOf('export async function run(exe)'));
  const marker=s.lastIndexOf('WINDOWS_PUBLIC_WEB_EXE_RECEIPT');
  assert.ok(marker > close, 'success receipt must be emitted AFTER finally');
  assert.match(s,/CANDIDATE_PROCESS_CLEANUP_UNVERIFIED/);
  assert.match(s,/CANDIDATE_DIRECTORY_CLEANUP_UNVERIFIED/);
  assert.doesNotMatch(s,/fs\.rm\(common,\{recursive:true,force:true\}\)\.catch\(\(\)=>\{\}\)/);
});

test('renderer without profile argument is tracked by verified parent lineage',()=>{
 const rows=[
  {ProcessId:10,ParentProcessId:1,Name:'node.exe'},
  {ProcessId:11,ParentProcessId:10,Name:'msedge.exe',CommandLine:'--user-data-dir=C:\\candidate'},
  {ProcessId:12,ParentProcessId:11,Name:'msedge.exe',CommandLine:'--type=renderer'},
  {ProcessId:13,ParentProcessId:12,Name:'msedge.exe',CommandLine:'--type=utility'},
  {ProcessId:90,ParentProcessId:1,Name:'msedge.exe',CommandLine:'--unrelated'}
 ];
 assert.deepEqual(ownedEdgePids(rows,10).sort((a,b)=>a-b),[11,12,13]);
});
test('orphaned renderer remains a blocker after its parent disappears',()=>{
 const tracked=new Set([11,12,13]);
 const survivors=trackedEdgeSurvivors([
  {ProcessId:12,ParentProcessId:11,Name:'msedge.exe',CommandLine:'--type=renderer'},
  {ProcessId:90,ParentProcessId:1,Name:'msedge.exe',CommandLine:'--other'}
 ],tracked);
 assert.deepEqual(survivors.map(r=>r.ProcessId),[12]);
 assert.match(s,/trackedEdgeSurvivors\(procs,trackedEdgePids\)/);
 assert.match(s,/trackedEdgeProcessCount:trackedEdgePids\.size/);
});

test('inner desktop stop target is verified by exact wrapper and API Job Object ownership',()=>{
 const exe='C:\\candidate\\Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
 const rows=[
  {ProcessId:100,ParentProcessId:1,Name:'Dafeiyu-Douyin-API-1.4.7-win-x64.exe',ExecutablePath:path.resolve(exe)},
  {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',ExecutablePath:path.resolve('fixture','\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe')},
  {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'node api-worker.mjs'},
  {ProcessId:103,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'jobguard --owner-pid 101 --target-pid 102'}
 ];
 // The executable path check uses the host platform's path.resolve; an exact path still roundtrips.
 const target=verifyDesktopStopTarget(rows,{exePid:100,exeFile:exe,backendPid:102});
 assert.equal(target.pid,101);
 assert.throws(()=>verifyDesktopStopTarget(rows,{exePid:100,exeFile:'not-the-candidate.exe',backendPid:102}));
 assert.throws(()=>verifyDesktopStopTarget(rows.filter(p=>p.ProcessId!==103),{exePid:100,exeFile:exe,backendPid:102}));
});
test('probe stops verified inner Electron main nonrecursively, not only outer wrapper',()=>{
 assert.match(s,/stopVerifiedDesktop\(desktopTarget\)/);
 assert.match(s,/execFileSync\('taskkill\.exe',\['\/PID',String\(target\.pid\),'\/F'\]/);
 assert.doesNotMatch(s,/execFileSync\('taskkill\.exe',\['\/PID',String\(target\.pid\),'\/T'/);
 assert.match(s,/INNER_ELECTRON_PARENT_NOT_FOUND/);
 assert.match(s,/INNER_ELECTRON_NAME_MISMATCH/);
 assert.match(s,/INNER_ELECTRON_ANCESTRY_NOT_VERIFIED/);
});
test('page-only readiness is separate from entire lifecycle acceptance',()=>{
 assert.equal(validatePublicPageEvidence({...green,cleaned:false}),true);
 assert.throws(()=>validatePublicReceipt({...green,cleaned:false}));
 assert.match(s,/WINDOWS_PUBLIC_PAGE_GATE_OK/);
});
test('cleanup diagnostic logs only bounded role and PID, not command line',()=>{
 assert.match(s,/WINDOWS_PUBLIC_WEB_CLEANUP_DIAGNOSTIC/);
 assert.match(s,/role:cleanupRole/);
 assert.match(s,/remaining: left\.slice\(0,40\)/);
 assert.doesNotMatch(s,/JSON\.stringify\(.*CommandLine/);
});

test('verified internal desktop target is captured before browser API can fail',()=>{
 const early=s.indexOf("desktopTarget=await until(()=>");
 const navigate=s.indexOf("const opened=await fetch(desktop.origin+'/api/browser/open'");
 assert.ok(early>0 && navigate>early,'identity must be recorded before navigation');
 assert.match(s,/INNER_DESKTOP_IDENTITY_NOT_READY/);
});
test('early error path attempts exact verified cleanup, never blind inner-process kill',()=>{
 assert.match(s,/if\(!desktopTarget && Number\.isSafeInteger\(backendPid\) && backendPid>0\)/);
 assert.match(s,/desktopTarget=verifyDesktopStopTarget\(remainingRows/);
 assert.match(s,/EARLY_DESKTOP_IDENTITY_NOT_VERIFIED/);
 assert.match(s,/stopVerifiedDesktop\(desktopTarget\)/);
});

test('missing, relative or mismatched Electron executable path cannot authorize taskkill',()=>{
 const exe='C:\\candidate\\Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
 const rows=[
  {ProcessId:100,ParentProcessId:1,Name:'Dafeiyu-Douyin-API-1.4.7-win-x64.exe',ExecutablePath:path.resolve(exe)},
  {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',ExecutablePath:path.resolve('fixture','\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe')},
  {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'node api-worker.mjs'},
  {ProcessId:103,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'jobguard --owner-pid 101 --target-pid 102'}
 ];
 const opts={exePid:100,exeFile:exe,backendPid:102};
 assert.equal(verifyDesktopStopTarget(rows,opts).pid,101);
 for(const bad of [null,'','relative.exe',path.resolve('other','unrelated.exe')]){
  const mutated=rows.map(r=>r.ProcessId===101?{...r,ExecutablePath:bad}:r);
  assert.throws(()=>verifyDesktopStopTarget(mutated,opts),/INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED/);
 }
 assert.match(s,/path\.isAbsolute\(target\.executablePath\)/);
 assert.match(s,/INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED/);
});

test('identity errors expose fixed codes rather than raw WMI paths',()=>{
 assert.equal(identityReasonCode(new Error('INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED')), 'INNER_ELECTRON_IMAGE_PATH_NOT_VERIFIED');
 assert.equal(identityReasonCode(new Error('unrecognized path C:\\sensitive\\user')), 'IDENTITY_VERIFICATION_UNKNOWN');
 assert.match(s,/WINDOWS_PUBLIC_WEB_IDENTITY_GATE/);
 assert.match(s,/WINDOWS_PUBLIC_WEB_FINAL_IDENTITY_GATE/);
});
test('unknown inner desktop PID never counts the Windows PID-0 idle process as Electron',()=>{
 assert.match(s,/desktopPid>0 && pid===desktopPid/);
 assert.match(s,/\(desktopPid>0 && Number\(p\.ProcessId\)===desktopPid\)/);
});


test('unset browser-host PID zero cannot claim idle PID or unrelated guard',()=>{
 const identity={exePid:100,desktopPid:0,backendPid:102,hostPid:0,trackedEdgePids:new Set()};
 assert.notEqual(cleanupRole({ProcessId:0,Name:'Idle'},identity),'browser-host');
 assert.equal(ownedJobGuardForCleanup({Name:'jobguard.exe',ParentProcessId:0},identity),false);
 assert.equal(ownedJobGuardForCleanup({Name:'jobguard.exe',ParentProcessId:555},identity),false);
 assert.equal(ownedJobGuardForCleanup({Name:'jobguard.exe',ParentProcessId:100},identity),true);
});
test('positive verified host can own its jobguard and normal and diagnostic filters agree',()=>{
 const identity={exePid:100,desktopPid:101,backendPid:102,hostPid:200,trackedEdgePids:new Set()};
 assert.equal(cleanupRole({ProcessId:200,Name:'node.exe'},identity),'browser-host');
 assert.equal(ownedJobGuardForCleanup({Name:'jobguard.exe',ParentProcessId:200},identity),true);
 assert.equal(ownedJobGuardForCleanup({Name:'jobguard.exe',ParentProcessId:555},identity),false);
 assert.equal((s.match(/ownedJobGuardForCleanup\(p,\{exePid,hostPid\}\)/g)||[]).length,3);
});


test('early inner Electron check distinguishes missing parent with no termination',()=>{
 const exe='C:\\candidate\\Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
 const rows=[
  {ProcessId:100,ParentProcessId:1,Name:'candidate.exe',ExecutablePath:path.resolve(exe)},
  {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'node api-worker.mjs'}
 ];
 assert.throws(()=>verifyDesktopStopTarget(rows,{exePid:100,exeFile:exe,backendPid:102}),/INNER_ELECTRON_PARENT_NOT_FOUND/);
 assert.equal(identityReasonCode(new Error('INNER_ELECTRON_PARENT_NOT_FOUND')), 'INNER_ELECTRON_PARENT_NOT_FOUND');
});
test('early inner Electron check distinguishes unexpected basename with no termination',()=>{
 const exe='C:\\candidate\\Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
 const rows=[
  {ProcessId:100,ParentProcessId:1,Name:'candidate.exe',ExecutablePath:path.resolve(exe)},
  {ProcessId:101,ParentProcessId:100,Name:'unexpected.exe'},
  {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'node api-worker.mjs'}
 ];
 assert.throws(()=>verifyDesktopStopTarget(rows,{exePid:100,exeFile:exe,backendPid:102}),/INNER_ELECTRON_NAME_MISMATCH/);
 assert.equal(identityReasonCode(new Error('INNER_ELECTRON_NAME_MISMATCH')), 'INNER_ELECTRON_NAME_MISMATCH');
});
test('early inner Electron check distinguishes unverified ancestry with no termination',()=>{
 const exe='C:\\candidate\\Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
 const rows=[
  {ProcessId:100,ParentProcessId:1,Name:'candidate.exe',ExecutablePath:path.resolve(exe)},
  {ProcessId:101,ParentProcessId:999,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe'},
  {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'node api-worker.mjs'}
 ];
 assert.throws(()=>verifyDesktopStopTarget(rows,{exePid:100,exeFile:exe,backendPid:102}),/INNER_ELECTRON_ANCESTRY_NOT_VERIFIED/);
 assert.equal(identityReasonCode(new Error('INNER_ELECTRON_ANCESTRY_NOT_VERIFIED')), 'INNER_ELECTRON_ANCESTRY_NOT_VERIFIED');
});


test('topology snapshot is redacted and fails closed for missing parent',()=>{
  const rows=[
    {ProcessId:100,Name:'wrapper.exe',CommandLine:'secret CUSTOMER_API_KEY'},
    {ProcessId:102,ParentProcessId:101,Name:'node.exe',CommandLine:'secret api-worker.mjs'},
    {ProcessId:190,ParentProcessId:101,Name:'random.exe',CommandLine:'--owner-pid 101 --target-pid 102'}
  ];
  const details=summarizeIdentityTopology(rows,{exePid:100,backendPid:102});
  assert.deepEqual(details,{wrapperPresent:true,workerPresent:true,immediateParentPresent:false,
    immediateParentNameExpected:false,wrapperAncestryVerified:false,workerGuardCount:0,exactGuardPairVerified:false});
  assert.doesNotMatch(JSON.stringify(details),/secret|CUSTOMER_API_KEY|ProcessId|ParentProcessId|CommandLine/);
});
test('topology confirms a live verified desktop and exact guard pairing',()=>{
 const rows=[
   {ProcessId:100,ParentProcessId:1,Name:'wrapper.exe'},
   {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe'},
   {ProcessId:102,ParentProcessId:101,Name:'node.exe'},
   {ProcessId:103,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'helper --owner-pid 101 --target-pid 102'}
 ];
 const details=summarizeIdentityTopology(rows,{exePid:100,backendPid:102});
 assert.deepEqual(details,{wrapperPresent:true,workerPresent:true,immediateParentPresent:true,
   immediateParentNameExpected:true,wrapperAncestryVerified:true,workerGuardCount:1,exactGuardPairVerified:true});
});
test('topology must detect false parent name and missing wrapper ancestry',()=>{
 const rows=[
   {ProcessId:100,ParentProcessId:1,Name:'wrapper.exe'},
   {ProcessId:101,ParentProcessId:999,Name:'unexpected.exe'},
   {ProcessId:102,ParentProcessId:101,Name:'node.exe'},
   {ProcessId:103,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'helper --owner-pid 101 --target-pid 102'}
 ];
 const details=summarizeIdentityTopology(rows,{exePid:100,backendPid:102});
 assert.equal(details.immediateParentPresent,true);
 assert.equal(details.immediateParentNameExpected,false);
 assert.equal(details.wrapperAncestryVerified,false);
 assert.equal(details.exactGuardPairVerified,true);
});
test('unrelated or duplicated guards do not validate exact pairing',()=>{
 const rows=[
   {ProcessId:100,ParentProcessId:1,Name:'wrapper.exe'},
   {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe'},
   {ProcessId:102,ParentProcessId:101,Name:'node.exe'},
   {ProcessId:103,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'helper --owner-pid 101 --target-pid 999'},
   {ProcessId:104,ParentProcessId:101,Name:'jobguard.exe',CommandLine:'helper --owner-pid 101 --target-pid 102'}
 ];
 const details=summarizeIdentityTopology(rows,{exePid:100,backendPid:102});
 assert.equal(details.workerGuardCount,2);
 assert.equal(details.exactGuardPairVerified,false);
});
test('topology logs only fixed booleans/counts; PowerShell enforces UTF-8 stdout',()=>{
 assert.match(s,/WINDOWS_PUBLIC_WEB_IDENTITY_TOPOLOGY/);
 assert.match(s,/WINDOWS_PUBLIC_WEB_FINAL_IDENTITY_TOPOLOGY/);
 assert.match(s,/\[Console\]::OutputEncoding=\[System\.Text\.UTF8Encoding\]::new\(\$false\)/);
 assert.doesNotMatch(s,/JSON\.stringify\(earlyRows\)|JSON\.stringify\(remainingRows\)/);
 assert.doesNotMatch(s,/taskkill\.exe.*'\/T'/);
});

test('incomplete WMI snapshots never make diagnostics throw or disclose raw fields',()=>{
 const details=summarizeIdentityTopology([null,undefined,2,'garbled',{},
   {ProcessId:100,Name:'candidate.exe',ExecutablePath:'C:\private\path'}],{exePid:100,backendPid:102});
 assert.deepEqual(details,{wrapperPresent:true,workerPresent:false,immediateParentPresent:false,
  immediateParentNameExpected:false,wrapperAncestryVerified:false,workerGuardCount:0,exactGuardPairVerified:false});
 assert.doesNotMatch(JSON.stringify(details),/private|candidate\.exe|garbled|path/);
});
test('more than ten owned-looking guards are capped and never accepted as a unique pair',()=>{
 const rows=[{ProcessId:100,ParentProcessId:1,Name:'wrapper.exe'},
 {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe'},
 {ProcessId:102,ParentProcessId:101,Name:'node.exe'},
 ...Array.from({length:14},(_,i)=>({ProcessId:300+i,ParentProcessId:101,
  Name:'jobguard.exe',CommandLine:'jobguard --owner-pid 101 --target-pid 102'}))];
 const details=summarizeIdentityTopology(rows,{exePid:100,backendPid:102});
 assert.equal(details.workerGuardCount,10);
 assert.equal(details.exactGuardPairVerified,false);
});


test('unavailable or malformed WMI snapshot is a fixed redacted error, never an identity match',()=>{
 const secret='C:\\Users\\private\\token';
 const missing=safeProcessSnapshot(()=>{throw new Error(secret)});
 assert.deepEqual(missing,{rows:null,error:'PROCESS_SNAPSHOT_UNAVAILABLE'});
 assert.deepEqual(safeProcessSnapshot(()=>null),{rows:null,error:'PROCESS_SNAPSHOT_UNAVAILABLE'});
 assert.deepEqual(safeProcessSnapshot(()=>({ProcessId:5})),{rows:null,error:'PROCESS_SNAPSHOT_UNAVAILABLE'});
 assert.equal(identityReasonCode(new Error(missing.error)),'PROCESS_SNAPSHOT_UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(missing),/private|token|Users/);
});
test('valid sparse process snapshot keeps only object rows, snapshot gate is wired at both boundaries',()=>{
 const snapshot=safeProcessSnapshot(()=>[null,undefined,'garbled',{ProcessId:5,Name:'node.exe'},123]);
 assert.equal(snapshot.error,null);
 assert.deepEqual(snapshot.rows,[{ProcessId:5,Name:'node.exe'}]);
 assert.equal((s.match(/safeProcessSnapshot\(processes\)/g)||[]).length,2);
 assert.match(s,/lastIdentityReason=snapshot\.error;return null/);
 assert.match(s,/if\(snapshot\.error\)throw new Error\(snapshot\.error\)/);
});


test('fourth-run interactive state stays rejected, even with substantial page content',()=>{
  const interactive={...green,page:{...green.page,ready:'interactive'}};
  assert.throws(()=>validatePublicReceipt(interactive),/PUBLIC_PAGE_NOT_FULLY_LOADED/);
  assert.equal(summarizePublicPageState(200,interactive.page).readiness,'interactive');
});
test('public-page error reporting is bounded and does not expose page text, URL or credentials',()=>{
  const summary=summarizePublicPageState(200,{origin:'https://www.douyin.com',ready:'custom secret user token',
    title:'secret',body:'private data',titleLength:9,bodyLength:900,bodyChildren:2,paintBytes:4096,challenged:false});
  assert.deepEqual(summary,{documentHttp200:true,approvedOrigin:true,readiness:'unknown',titlePresent:true,
    bodyLengthAtLeast30:true,bodyChildrenPresent:true,screenshotMoreThan2KiB:true,challengeDetected:false});
  assert.doesNotMatch(JSON.stringify(summary),/secret|private|token|body\"|title\"/i);
});
test('real page readiness has a bounded longer wait but still requires complete state',()=>{
  assert.match(s,/const PUBLIC_READY_WAIT_MS = 45000/);
  assert.match(s,/const readyDeadline=Date\.now\(\)\+PUBLIC_READY_WAIT_MS/);
  assert.match(s,/while\(Date\.now\(\)<readyDeadline\)/);
  assert.match(s,/if\(page\?\.ready==='complete' && page\.bodyLength>=30 && page\.titleLength>0\)break/);
  assert.match(s,/WINDOWS_PUBLIC_WEB_PAGE_DIAGNOSTIC/);
  assert.match(s,/if\(page\?\.challenged===true\)break/);
});


test('CDP frame lifecycle signals are bounded and scoped to approved session',()=>{
 const state={resourceFailures:0};
 const sid='authorized-session',frame='main';
 const feed=(sessionId,method,params={})=>observePublicCdpEvent(state,{sessionId,method,params},sid,frame);
 feed('unrelated-session','Page.loadEventFired');
 feed(sid,'Page.domContentEventFired');
 feed(sid,'Network.responseReceived',{type:'Document',frameId:'other',requestId:'wrong',response:{url:'https://www.douyin.com/'}});
 feed(sid,'Network.responseReceived',{type:'Document',frameId:frame,requestId:'blocked',response:{url:'https://evil.example/'}});
 assert.equal(state.mainDocumentResponseSeen,undefined);
 feed(sid,'Network.responseReceived',{type:'Document',frameId:frame,requestId:'good',loaderId:'new-loader',response:{url:'https://www.douyin.com/'}});
 feed(sid,'Page.lifecycleEvent',{frameId:frame,loaderId:'new-loader',name:'DOMContentLoaded'});
 feed(sid,'Network.loadingFinished',{requestId:'good'});
 feed(sid,'Network.loadingFailed',{requestId:'another',errorText:'private token and URL'});
 assert.deepEqual(summarizePublicCdpSignals(state),{
  domContentLoaded:true,loadEventFired:false,mainDocumentResponseSeen:true,mainDocumentLoaderVerified:true,
  mainDocumentFinished:true,mainDocumentFailed:false,resourceFailures:1});
 assert.doesNotMatch(JSON.stringify(summarizePublicCdpSignals(state)),/private|token|good|blocked|URL|requestId/i);
});
test('CDP main-document failure is distinguished from ordinary resource failures',()=>{
 const state={resourceFailures:0};
 observePublicCdpEvent(state,{sessionId:'s',method:'Network.responseReceived',params:{type:'Document',frameId:'f',requestId:'x',response:{url:'https://www.douyin.com/'}}},'s','f');
 observePublicCdpEvent(state,{sessionId:'s',method:'Network.loadingFailed',params:{requestId:'x',errorText:'secret'}},'s','f');
 for(let i=0;i<150;i++)observePublicCdpEvent(state,{sessionId:'s',method:'Network.loadingFailed',params:{requestId:'other'+i}},'s','f');
 const summary=summarizePublicCdpSignals(state);
 assert.equal(summary.mainDocumentFailed,true);
 assert.equal(summary.resourceFailures,99);
 assert.doesNotMatch(JSON.stringify(summary),/secret|other/);
});
test('public document response watch resolves the exact main frame only and removes listeners',async()=>{
 const ws=new EventTarget();
 const watcher=createPublicDocumentResponseWatch(ws,{sessionId:'s',mainFrameId:'f',timeoutMs:500});
 const send=(sessionId,frameId,url,status)=>ws.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({sessionId,method:'Network.responseReceived',params:{type:'Document',frameId,response:{url,status}}})}));
 send('else','f','https://www.douyin.com/',404);
 send('s','another','https://www.douyin.com/',403);
 send('s','f','https://evil.example/',201);
 send('s','f','https://www.douyin.com/',200);
 assert.equal(await watcher.promise,200);
 watcher.cancel();
});
test('public document watcher cancels after reload failure; no leaked response timeout',async()=>{
 const ws=new EventTarget();
 const watcher=createPublicDocumentResponseWatch(ws,{sessionId:'s',mainFrameId:'f',timeoutMs:100});
 watcher.cancel();
 await assert.rejects(watcher.promise,/PUBLIC_DOCUMENT_WATCH_CANCELLED/);
});
test('public document watcher timeout remains fail closed',async()=>{
 const ws=new EventTarget();
 const watcher=createPublicDocumentResponseWatch(ws,{sessionId:'s',mainFrameId:'f',timeoutMs:5});
 await assert.rejects(watcher.promise,/PUBLIC_DOCUMENT_STATUS_TIMEOUT/);
 watcher.cancel();
});
test('interactive page stays unaccepted even when all lifecycle flags have occurred',()=>{
 const page={...green.page,ready:'interactive'};
 const flags={domContentLoaded:true,loadEventFired:true,mainDocumentResponseSeen:true,mainDocumentFinished:true};
 assert.throws(()=>validatePublicPageEvidence({...green,page}),/PUBLIC_PAGE_NOT_FULLY_LOADED/);
 assert.equal(summarizePublicCdpSignals(flags).loadEventFired,true);
 assert.match(s,/WINDOWS_PUBLIC_WEB_PAGE_DIAGNOSTIC/);
 assert.match(s,/\.\.\.online\.cdpSignals/);
});

test('old-page events never masquerade as a fresh document load',()=>{
 const state={resourceFailures:0};
 const send=(method,params={})=>observePublicCdpEvent(state,{sessionId:'s',method,params},'s','f');
 send('Network.responseReceived',{type:'Document',frameId:'f',requestId:'new',loaderId:'loader-new',response:{url:'https://www.douyin.com/'}});
 send('Page.loadEventFired');
 send('Page.domContentEventFired');
 send('Page.lifecycleEvent',{frameId:'f',loaderId:'loader-old',name:'load'});
 send('Page.lifecycleEvent',{frameId:'f',loaderId:'loader-old',name:'DOMContentLoaded'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,false);
 assert.equal(summarizePublicCdpSignals(state).domContentLoaded,false);
 send('Page.lifecycleEvent',{frameId:'f',loaderId:'loader-new',name:'load'});
 send('Page.lifecycleEvent',{frameId:'f',loaderId:'loader-new',name:'DOMContentLoaded'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,true);
 assert.equal(summarizePublicCdpSignals(state).domContentLoaded,true);
 assert.doesNotMatch(JSON.stringify(summarizePublicCdpSignals(state)),/loader-new|loader-old/);
});
test('matching loader on a different frame or session cannot set page-ready flags',()=>{
 const state={};
 const send=(sessionId,method,params)=>observePublicCdpEvent(state,{sessionId,method,params},'allowed','main');
 send('allowed','Network.responseReceived',{type:'Document',frameId:'main',requestId:'r1',loaderId:'one',response:{url:'https://www.douyin.com/'}});
 send('allowed','Page.lifecycleEvent',{frameId:'subframe',loaderId:'one',name:'load'});
 send('wrong','Page.lifecycleEvent',{frameId:'main',loaderId:'one',name:'DOMContentLoaded'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,false);
 assert.equal(summarizePublicCdpSignals(state).domContentLoaded,false);
 send('allowed','Page.lifecycleEvent',{frameId:'main',loaderId:'one',name:'DOMContentLoaded'});
 assert.equal(summarizePublicCdpSignals(state).domContentLoaded,true);
});
test('missing loader ID cannot confirm DOM or load events',()=>{
 const state={};
 const send=(method,params)=>observePublicCdpEvent(state,{sessionId:'s',method,params},'s','main');
 send('Network.responseReceived',{type:'Document',frameId:'main',requestId:'r',response:{url:'https://www.douyin.com/'}});
 send('Page.lifecycleEvent',{frameId:'main',loaderId:'',name:'load'});
 send('Page.loadEventFired',{});
 assert.equal(summarizePublicCdpSignals(state).mainDocumentLoaderVerified,false);
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,false);
 assert.equal(summarizePublicCdpSignals(state).mainDocumentResponseSeen,true);
});
test('second document resets previously confirmed loader and ready signals',()=>{
 const state={};
 const send=(method,params)=>observePublicCdpEvent(state,{sessionId:'s',method,params},'s','main');
 const doc=(loaderId,requestId)=>({type:'Document',frameId:'main',loaderId,requestId,response:{url:'https://www.douyin.com/'}});
 send('Network.responseReceived',doc('old','r1'));
 send('Page.lifecycleEvent',{frameId:'main',loaderId:'old',name:'load'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,true);
 send('Network.responseReceived',doc('new','r2'));
 send('Page.lifecycleEvent',{frameId:'main',loaderId:'old',name:'load'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,false);
 send('Page.lifecycleEvent',{frameId:'main',loaderId:'new',name:'load'});
 assert.equal(summarizePublicCdpSignals(state).loadEventFired,true);
});
test('the instrumented CDP session enables authoritative lifecycle events',()=>{
 assert.match(s,/Page\.setLifecycleEventsEnabled/);
 assert.match(s,/'Page.setLifecycleEventsEnabled',\{enabled:true\}/);
 assert.match(s,/params\.loaderId===state\.mainDocumentLoaderId/);
 assert.match(s,/assert\.equal\(page\?\.ready, 'complete'/);
});
