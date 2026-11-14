import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectExistingDedicatedDouyinVideoReadOnly as inspect} from '../tools/douyin-existing-browser-readonly.mjs';
const id='7512345678901234567';
const address=`https://www.douyin.com/video/${id}`;
function make({urls=[address],labels=['deepseek-douyin-api'],connected=true,contextsCount=1,abort,commentStatus='ok',aiStatus='entry_visible',mutate,afterStart}={}){
 const calls=[],pages=urls.map((url,i)=>({
  _url:url,_label:labels[i]||'no-owner',_closed:false,
  url(){calls.push('page.url');return this._url},isClosed(){calls.push('page.isClosed');return this._closed},
  async evaluate(){calls.push('page.evaluate.window_name');return this._label},
  goto(){throw Error('NAVIGATE_FORBIDDEN')},click(){throw Error('CLICK_FORBIDDEN')},fill(){throw Error('FILL_FORBIDDEN')},
 }));
 const browser={isConnected(){calls.push('browser.isConnected');return connected},contexts(){calls.push('browser.contexts');return Array.from({length:contextsCount},(_,i)=>({pages(){calls.push('context.pages');return i===0?pages:[]}}));},
 close(){throw Error('CLOSE_EXISTING_BROWSER_FORBIDDEN')}};
 const controller={async connectExistingBrowser(){calls.push('controller.connectExistingBrowser');if(afterStart)afterStart();return browser},
  async connect(){throw Error('MUST_NOT_CALL_CONTROLLER_CONNECT')},openBrowser(){throw Error('MUST_NOT_OPEN_BROWSER')},
  async execute(){throw Error('MUST_NOT_EXECUTE_TOOL')}};
 const readPageState=()=>{},readCommentDom=()=>{};
 const observeComments=async opts=>{calls.push('comments.read');assert.equal(opts.page,pages[0]);if(mutate==='afterComments')pages[0]._url='https://www.douyin.com/';
  return commentStatus==='blocked'?{status:'blocked',reasonCode:'LOGIN_REQUIRED'}:{status:commentStatus,videoId:id,source:'visible_public_comment_dom',observationScope:'currently_visible_loaded_rows_only',comments:commentStatus==='ok'?[{text:'看到了公开评论',commentId:'123'}]:[],visibleCommentCount:commentStatus==='ok'?1:0};};
 const inspectSummary=async opts=>{calls.push('ai-entry.read');assert.equal(opts.page,pages[0]);if(mutate==='afterSummary')pages[0]._closed=true;
  return aiStatus==='blocked'?{status:'blocked',reasonCode:'AI_FRAME_CHANGED_AFTER_READ'}:{status:aiStatus,videoId:id,evidenceSource:'visible_official_ai_iframe_entry_only',matchingFrameCount:aiStatus==='entry_visible'?1:0,aiSummaryEntryVisible:aiStatus==='entry_visible',aiSummaryGenerated:false,aiSummaryText:null};};
 const run=()=>inspect({controller,readPageState,readCommentDom,observeComments,inspectSummary,expectedVideoId:id,signal:abort});
 return{run,calls,browser,controller,pages};
}

test('positive inspection only calls the EXISTING-browser connector and read methods',async()=>{
 const f=make(),r=await f.run();assert.equal(r.status,'read_only_evidence');assert.deepEqual(r.comments,[{text:'看到了公开评论',commentId:'123'}]);
 assert.equal(r.aiSummaryEntryVisible,true);assert.equal(r.aiSummaryGenerated,false);assert.equal(r.aiSummaryText,null);
 assert.equal(r.browserLaunchedByThisProbe,false);assert.equal(r.clickedByThisProbe,false);assert.equal(r.navigationByThisProbe,false);
 assert.ok(f.calls.includes('controller.connectExistingBrowser'));
 assert.ok(f.calls.includes('comments.read'));assert.ok(f.calls.includes('ai-entry.read'));
});
test('browser disconnected fails without looking at pages',async()=>{
 const f=make({connected:false}),r=await f.run();assert.equal(r.reasonCode,'BROWSER_NOT_CONNECTED');assert.ok(!f.calls.includes('context.pages'));
});
test('different browser contexts fail closed',async()=>{
 const f=make({contextsCount:2}),r=await f.run();assert.equal(r.reasonCode,'DEDICATED_CONTEXT_NOT_UNIQUE');
});
test('wrong URL or non-owned page is not read as another task',async()=>{
 for(const url of ['https://evil.example/video/'+id,'https://www.douyin.com/video/7523456789012345678','https://www.douyin.com/','https://www.douyin.com/video/'+id+'?modal_id=123']){
  const f=make({urls:[url]}),r=await f.run();assert.equal(r.reasonCode,'OWNED_VIDEO_PAGE_NOT_FOUND');assert.ok(!f.calls.includes('comments.read'));
 }
 const p=make({labels:['my personal tab']});assert.equal((await p.run()).status,'blocked');
});
test('duplicate owner claims are rejected',async()=>{
 const f=make({urls:[address,address],labels:['deepseek-douyin-api','deepseek-douyin-dsh']});
 const r=await f.run();assert.equal(r.reasonCode,'OWNED_VIDEO_PAGE_AMBIGUOUS');assert.ok(!f.calls.includes('comments.read'));
});
test('missing visible comments and AI entry are valid but never called summary content',async()=>{
 const f=make({commentStatus:'no_visible_comments',aiStatus:'not_observed'});const r=await f.run();
 assert.equal(r.publicCommentsStatus,'no_visible_comments');assert.deepEqual(r.comments,[]);
 assert.equal(r.aiSummaryEntryVisible,false);assert.equal(r.aiSummaryGenerated,false);assert.equal(r.aiSummaryText,null);
});
test('public comment failure blocks AI phase, not leaking earlier evidence',async()=>{
 const f=make({commentStatus:'blocked'}),r=await f.run();assert.equal(r.reasonCode,'COMMENT_LOGIN_REQUIRED');assert.ok(!f.calls.includes('ai-entry.read'));
});
test('AI entry mismatch invalidates all previous comment evidence',async()=>{
 const f=make({aiStatus:'blocked'}),r=await f.run();assert.equal(r.reasonCode,'AI_ENTRY_AI_FRAME_CHANGED_AFTER_READ');assert.deepEqual(r.comments,[]);
});
test('page changed or closed during read invalidates the whole receipt',async()=>{
 for(const mutate of ['afterComments','afterSummary']){const f=make({mutate}),r=await f.run();assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);}
});
test('abort signal stops work before reading page or after connecting',async()=>{
 const signal={aborted:true},f=make({abort:signal}),r=await f.run();assert.equal(r.reasonCode,'CANCELLED_BEFORE_READ');assert.equal(f.calls.length,0);
 const signal2={aborted:false},g=make({abort:signal2,afterStart:()=>{signal2.aborted=true}}),r2=await g.run();assert.equal(r2.reasonCode,'CANCELLED_AFTER_CONNECTION');assert.ok(!g.calls.includes('comments.read'));
});
test('no connector / missing readers abort without side effects',async()=>{
 await assert.rejects(inspect({controller:{},expectedVideoId:id,readPageState:()=>{},readCommentDom:()=>{},observeComments:()=>{},inspectSummary:()=>{}}),/PINNED_RUNTIME_READERS_REQUIRED/);
 await assert.rejects(inspect({expectedVideoId:'foo'}),/INVALID_VIDEO_ID/);
});
test('exception from existing-browser connector is sanitized',async()=>{
 const f=make();f.controller.connectExistingBrowser=async()=>{throw Error('Password in file C:\\Users\\hello\\secrets.txt')};
 const r=await f.run();assert.equal(r.reasonCode,'EXISTING_BROWSER_CONNECTION_FAILED');assert.doesNotMatch(JSON.stringify(r),/Password|Users|secrets/i);
});
test('does not include start, browser.close, newPage, goto, click, type or send calls',()=>{
 const s=fs.readFileSync(new URL('../tools/douyin-existing-browser-readonly.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/\.newPage\s*\(|\.goto\s*\(|\.click\s*\(|\.fill\s*\(|\.launch\s*\(|\.close\s*\(/);
 assert.match(s,/connectExistingBrowser\(\{ signal \}\)/);
});

test('malformed or mismatched read-only receipts are rejected', async()=>{
 const f=make();
 const result=await f.run();assert.equal(result.status,'read_only_evidence');
 // An injected reader cannot return an unrelated video or made-up summary.
 const badComment=await inspect({controller:f.controller,expectedVideoId:id,readPageState:()=>{},readCommentDom:()=>{},
  observeComments:async()=>({status:'ok',videoId:'wrong',comments:[{text:'private',commentId:null}],visibleCommentCount:1}),
  inspectSummary:async()=>({status:'entry_visible'})});
 assert.equal(badComment.reasonCode,'PUBLIC_COMMENT_RECEIPT_INVALID');assert.deepEqual(badComment.comments,[]);
 const badAi=await inspect({controller:f.controller,expectedVideoId:id,readPageState:()=>{},readCommentDom:()=>{},
  observeComments:async()=>({status:'no_visible_comments',videoId:id,source:'visible_public_comment_dom',observationScope:'currently_visible_loaded_rows_only',comments:[],visibleCommentCount:0}),
  inspectSummary:async()=>({status:'entry_visible',videoId:id,evidenceSource:'visible_official_ai_iframe_entry_only',matchingFrameCount:1,aiSummaryEntryVisible:true,aiSummaryGenerated:true,aiSummaryText:'fabricated'})});
 assert.equal(badAi.reasonCode,'AI_ENTRY_RECEIPT_INVALID');assert.deepEqual(badAi.comments,[]);
});
