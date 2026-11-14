import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validatePublicReceipt, validatePublicPageEvidence, verifyDesktopStopTarget, ownedEdgePids, trackedEdgeSurvivors} from '../tools/windows147-online-public-probe.mjs';
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
  {ProcessId:101,ParentProcessId:100,Name:'\u5927\u80a5\u9c7c\u6296\u97f3\u52a9\u624b.exe',ExecutablePath:'C:\\tmp\\inner.exe'},
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
 assert.match(s,/INNER_ELECTRON_IDENTITY_NOT_VERIFIED/);
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
