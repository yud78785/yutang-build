import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFirstTaskArgs, runYuTangSourceCli, verifyPinnedApiAgentSource} from '../tools/run-yutang-first-task.mjs';
const id='7678138050912407986';const flags=['--video-id',id,'--upstream-root','/tmp/source','--instruction','总结当前可见评论'];
const evidence={status:'read_only_evidence',videoId:id,connectionMethod:'upstream_connectExistingBrowser',operationLock:'upstream_tab_api_acquired_released',temporaryOperationLockUsed:true,temporaryOperationLockCleanupVerified:true,browserLaunchedByThisProbe:false,navigationByThisProbe:false,clickedByThisProbe:false,persistentDataModifiedByThisProbe:false,publicCommentsStatus:'ok',comments:[{commentId:'99',text:'挺好'}],aiSummaryEntryVisible:false,aiSummaryGenerated:false,aiSummaryText:null};
test('CLI parser disallows unexpected flags and missing values',()=>{
 assert.equal(parseFirstTaskArgs(flags).ok,true);
 for(const bad of [flags.slice(0,3),[...flags,'--execute'],[...flags,'--allow-model','--allow-model'],['--video-id','bad',...flags.slice(2)]]){
  assert.equal(parseFirstTaskArgs(bad).ok,false);
 }
});
test('Linux is a truthful blocked result, never a Windows success',async()=>{
 const r=await runYuTangSourceCli({argv:flags,platform:'linux',read:()=>{throw Error('MUST_NOT_CONNECT')}});
 assert.equal(r.reasonCode,'WINDOWS_REQUIRED');assert.equal(r.modelCalled,false);
});
test('preview connects only existing browser source and does not load agent',async()=>{
 let seen,models=0;const r=await runYuTangSourceCli({argv:flags,platform:'win32',read:async args=>{seen=args;return evidence},loadApiAgent:async()=>{models++;throw Error('MUST_NOT_LOAD')}});
 assert.equal(r.status,'preview_only');assert.equal(models,0);
 assert.deepEqual(seen.argv,['--video-id',id,'--upstream-root','/tmp/source']);
});
test('explicit model flag alone with missing key blocks before browser',async()=>{
 let called=false;const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{},read:async()=>{called=true;return evidence}});
 assert.equal(r.reasonCode,'CLOUD_MODEL_NOT_CONFIGURED');assert.equal(called,false);
});
test('unreviewed providers cannot spend tokens',async()=>{
 const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{DEEPSEEK_API_KEY:'synthetic',DEEPSEEK_BASE_URL:'https://not-audited.example'},read:async()=>{throw Error('MUST_NOT_READ')}});
 assert.equal(r.reasonCode,'CLOUD_MODEL_ROUTE_NOT_AUDITED');
});
test('read-only browser blocked result prevents upstream agent import',async()=>{
 let loaded=0;const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{DEEPSEEK_API_KEY:'synthetic'},read:async()=>({status:'blocked',reasonCode:'OWNED_VIDEO_PAGE_NOT_FOUND'}),verifyAgent:async()=>true,loadApiAgent:async()=>{loaded++}});
 assert.equal(r.reasonCode,'READ_ONLY_EVIDENCE_UNAVAILABLE');assert.equal(loaded,0);
});
test('explicit model flag and evidence use existing ApiAgent class',async()=>{
 let calls=0,imports=0;
 class ExistingAgent {constructor(x){this.x=x;}async runTask(){calls++;await this.x.controller.execute('douyin_status',{});return {status:'completed',message:'评论一条，内容为挺好。',toolsUsed:1,usage:{requests:2}}}}
 const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{DEEPSEEK_API_KEY:'synthetic'},read:async()=>evidence,verifyAgent:async()=>true,loadApiAgent:async root=>{imports++;assert.equal(root,'/tmp/source');return{ApiAgent:ExistingAgent,normalizeApiConfig:x=>x}}});
 assert.equal(r.status,'completed_source_only');assert.equal(r.toolReads,1);assert.equal(imports,1);assert.equal(calls,1);
});
test('missing upstream real agent export fails closed',async()=>{
 const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{DEEPSEEK_API_KEY:'synthetic'},read:async()=>evidence,verifyAgent:async()=>true,loadApiAgent:async()=>({})});
 assert.equal(r.reasonCode,'PINNED_UPSTREAM_AGENT_UNAVAILABLE');
});

test('exact upstream ApiAgent blob is independently checked before model import',async()=>{
 if (process.env.YUTANG_PINNED_UPSTREAM_ROOT)
   assert.equal(await verifyPinnedApiAgentSource(process.env.YUTANG_PINNED_UPSTREAM_ROOT),true);
 assert.equal(await verifyPinnedApiAgentSource('/tmp/not-the-upstream'),false);
});
test('mismatched existing agent source cannot be loaded even with a valid browser receipt',async()=>{
 let loaded=false;
 const r=await runYuTangSourceCli({argv:[...flags,'--allow-model'],platform:'win32',env:{DEEPSEEK_API_KEY:'synthetic'},read:async()=>evidence,
   verifyAgent:async()=>false,loadApiAgent:async()=>{loaded=true;return{}}});
 assert.equal(r.reasonCode,'PINNED_UPSTREAM_AGENT_SOURCE_MISMATCH');assert.equal(loaded,false);
});
