import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDouyinAiSummaryEntryReadOnly as inspect} from '../tools/douyin-ai-summary-entry-readonly.mjs';
const id='7512345678901234567';
const state={url:`https://www.douyin.com/video/${id}`,pageKind:'video',videoSelection:{candidateCount:1,ambiguous:false,identityConflict:false},video:{id,url:`https://www.douyin.com/video/${id}`,readyState:4},loginRequired:false,verificationRequired:false,privateChatVisible:false};
const first=()=>{};
const url='https://so-landing.douyin.com/search_ai_mobile/pc';
const makeFrame=({count,onCount,onVisible}={})=>({url(){return url},getByText(value,option){assert.equal(value,'视频总结');assert.equal(option.exact,true);return{async count(){onCount?.();return count??1},async isVisible(){onVisible?.();return true}}}});

test('already aborted signal does not read browser',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const page={async evaluate(){calls++;return state},frames(){calls++;return []}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.status,'blocked');assert.equal(r.reasonCode,'READ_ABORTED');assert.equal(calls,0);
});
test('abort during initial page read prevents iframe enumeration',async()=>{
 let frames=0;const controller=new AbortController();
 const page={async evaluate(){controller.abort();return state},frames(){frames++;return []}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.equal(frames,0);
});
test('abort during iframe count avoids a later isVisible and final page read',async()=>{
 let count=0,visible=0,evals=0;const controller=new AbortController();
 const frame=makeFrame({onCount:()=>{count++;controller.abort();},onVisible:()=>{visible++}});
 const page={async evaluate(){evals++;return state},frames(){return[frame]}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.equal(count,1);assert.equal(visible,0);assert.equal(evals,1);
});
test('abort during isVisible discards earlier AI entry observation',async()=>{
 let evals=0;const controller=new AbortController();
 const frame=makeFrame({onVisible:()=>controller.abort()});
 const page={async evaluate(){evals++;return state},frames(){return[frame]}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.equal(r.aiSummaryEntryVisible,false);assert.equal(evals,1);
});
test('abort during final state read refuses a stale AI entry',async()=>{
 let evals=0;const controller=new AbortController();const frame=makeFrame();
 const page={async evaluate(){evals++;if(evals===2)controller.abort();return state},frames(){return[frame]}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.equal(r.aiSummaryEntryVisible,false);assert.equal(evals,2);
});
test('nonaborted valid AI iframe still yields only entry-visible evidence, not summary content',async()=>{
 const controller=new AbortController();const frame=makeFrame();
 const page={async evaluate(){return state},frames(){return[frame]}};
 const r=await inspect({page,readPageState:first,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.status,'entry_visible');assert.equal(r.aiSummaryEntryVisible,true);assert.equal(r.aiSummaryGenerated,false);assert.equal(r.aiSummaryText,null);
});
