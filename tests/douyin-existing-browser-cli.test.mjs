import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  parseReadOnlyArgs,checkPinnedSourceRoot,runReadOnlySourcePreflight,
} from '../tools/run-douyin-existing-browser-readonly.mjs';
const videoId='7512345678901234567';
const args=['--video-id',videoId,'--upstream-root',path.resolve('/tmp')];
const noLoad=()=>{throw Error('must not load any upstream code');};
const base={argv:args,platform:'win32',nodeVersion:'22.16.0',rootCheck:()=>({ok:true,root:'/tmp'})};

test('parse only two required, exact, independent options',()=>{
  assert.equal(parseReadOnlyArgs(args).ok,true);
  assert.equal(parseReadOnlyArgs([...args,'--verbose','true']).ok,false);
  assert.equal(parseReadOnlyArgs(['--video-id',videoId]).ok,false);
  assert.equal(parseReadOnlyArgs(['--video-id',videoId,'--video-id',videoId]).ok,false);
  assert.equal(parseReadOnlyArgs(['--video-id','not-valid','--upstream-root','/tmp']).ok,false);
  assert.equal(parseReadOnlyArgs(['--video-id',videoId,'--upstream-root','relative']).ok,false);
});
test('invalid inputs cannot import or connect',async()=>{
 const r=await runReadOnlySourcePreflight({argv:['--something','1'],platform:'win32',load:noLoad});
 assert.equal(r.reasonCode,'ARGUMENTS_REQUIRED');
});
test('non-Windows environment never attempts source imports',async()=>{
 const r=await runReadOnlySourcePreflight({...base,platform:'linux',load:noLoad});
 assert.equal(r.reasonCode,'WINDOWS_REQUIRED');
});
test('Node version gate requires 22.13 or higher',async()=>{
 for(const nodeVersion of ['20.12.0','22.0.0','22.12.9','bogus']){
  const r=await runReadOnlySourcePreflight({...base,nodeVersion,load:noLoad});
  assert.equal(r.reasonCode,'NODE_22_13_OR_NEWER_REQUIRED');
 }
});
test('pinned source root failure is fail-closed before import',async()=>{
 const r=await runReadOnlySourcePreflight({...base,rootCheck:()=>({ok:false,reasonCode:'UPSTREAM_COMMIT_NOT_PINNED'}),load:noLoad});
 assert.equal(r.reasonCode,'UPSTREAM_COMMIT_NOT_PINNED');
});
test('nonexistent checkout is rejected without writing',()=>{
 assert.equal(checkPinnedSourceRoot(path.resolve('/tmp/no-yutang-real-root-12345')).ok,false);
});
test('unversioned folder with files fails git-pinning verification',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'yt-source-test-'));
 try{
  for(const file of ['core.mjs','comment-browser.mjs','browser-launcher.mjs','package.json'])writeFileSync(path.join(dir,file),'');
  const r=checkPinnedSourceRoot(dir);assert.equal(r.ok,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('an actual local Git repo at wrong SHA is refused',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'yt-source-git-'));
 try{
  for(const file of ['core.mjs','comment-browser.mjs','browser-launcher.mjs','package.json'])writeFileSync(path.join(dir,file),'');
  execFileSync('git',['init','-q'],{cwd:dir,stdio:'ignore'});
  execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.org','commit','-q','--allow-empty','-m','fixture'],{cwd:dir,stdio:'ignore'});
  const r=checkPinnedSourceRoot(dir);assert.equal(r.ok,false);assert.equal(r.reasonCode,'UPSTREAM_COMMIT_NOT_PINNED');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('upstream dynamic import exception is sanitized',async()=>{
 const r=await runReadOnlySourcePreflight({...base,load:()=>{throw Error('PRIVATE_API_TOKEN_DO_NOT_LEAK')}});
 assert.equal(r.reasonCode,'PINNED_UPSTREAM_IMPORT_FAILED');assert.doesNotMatch(JSON.stringify(r),/TOKEN|PRIVATE/);
});
test('missing critical upstream exports never reaches connector',async()=>{
 const r=await runReadOnlySourcePreflight({...base,load:async()=>[{},{}],controllerFactory:noLoad});
 assert.equal(r.reasonCode,'PINNED_UPSTREAM_EXPORTS_MISSING');
});
test('controller failure redacted',async()=>{
 const r=await runReadOnlySourcePreflight({...base,load:async()=>[{BrowserController:class{},readPageState:()=>{}},{readCommentDom:()=>{}}],controllerFactory:()=>{throw Error('Windows user path should not leak')}});
 assert.equal(r.reasonCode,'UPSTREAM_CONTROLLER_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/Windows user path/);
});
test('valid pinned source plus absent existing Edge must be BLOCKED, not opened',async()=>{
 let count=0;
 const r=await runReadOnlySourcePreflight({...base,
  load:async()=>[{BrowserController:class{},readPageState:()=>{}},{readCommentDom:()=>{}}],
  controllerFactory:()=>({async connectExistingBrowser(){count++;return null;},openBrowser(){throw Error('unsafe')}}),
 });
 assert.equal(r.reasonCode,'DEDICATED_BROWSER_NOT_RUNNING');assert.equal(count,1);
 assert.equal(r.browserLaunchedByThisProbe,false);
});
test('connector may only report evidence from an owned, matching public video tab',async()=>{
 const readState=()=>{};const readComments=()=>{};
 const state={url:`https://www.douyin.com/video/${videoId}`,pageKind:'video',videoSelection:{candidateCount:1,ambiguous:false,identityConflict:false},
  video:{id:videoId,url:`https://www.douyin.com/video/${videoId}`,readyState:4},
  loginRequired:false,verificationRequired:false,privateChatVisible:false,unsupportedPage:false};
 let connectCount=0;
 const page={url(){return state.url},isClosed(){return false},frames(){return []},
  async evaluate(fn){if(fn===readState)return state;if(fn===readComments)return{rows:[]};
    if(String(fn).includes('documentOrigin'))return{label:'deepseek-douyin-api',documentOrigin:123456789,locationHref:state.url};
    return 'deepseek-douyin-api';},
  goto(){throw Error('not allowed')},click(){throw Error('not allowed')},fill(){throw Error('not allowed')},};
 const browser={isConnected(){return true},contexts(){return[{pages(){return[page]}}]}};
 const r=await runReadOnlySourcePreflight({...base,
   load:async()=>[{BrowserController:class{},readPageState:readState},{readCommentDom:readComments}],
   controllerFactory:()=>({async connectExistingBrowser(){connectCount++;return browser;}}),
 });
 assert.equal(connectCount,1);assert.equal(r.status,'read_only_evidence');
 assert.equal(r.publicCommentsStatus,'no_visible_comments');assert.equal(r.aiSummaryEntryVisible,false);
 assert.equal(r.aiSummaryGenerated,false);assert.equal(r.clickedByThisProbe,false);
});
test('CLI on actual local environment exits BLOCKED, clean JSON and no new browser',()=>{
 const script=fileURLToPath(new URL('../tools/run-douyin-existing-browser-readonly.mjs',import.meta.url));
 const cp=(()=>{try{execFileSync(process.execPath,[script,...args],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});return null;}catch(error){return error;}})();
 assert.ok(cp);assert.equal(cp.status,2);const receipt=JSON.parse(cp.stdout.toString());
 if(process.platform!=='win32')assert.equal(receipt.reasonCode,'WINDOWS_REQUIRED');
 assert.equal(receipt.browserLaunchedByThisProbe,false);
});
