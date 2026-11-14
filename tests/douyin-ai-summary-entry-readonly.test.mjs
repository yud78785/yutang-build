import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectDouyinAiSummaryEntryReadOnly} from '../tools/douyin-ai-summary-entry-readonly.mjs';
const id='7512345678901234567';
const state={url:`https://www.douyin.com/video/${id}`,pageKind:'video',
 videoSelection:{candidateCount:1,ambiguous:false,identityConflict:false},
 video:{id,url:`https://www.douyin.com/video/${id}`,readyState:4},
 loginRequired:false,verificationRequired:false,privateChatVisible:false,unsupportedPage:false};
function frame(url='https://so-landing.douyin.com/search_ai_mobile/pc',count=1,visible=true){
 const calls=[];
 return {calls,url(){return url},getByText(t,opts){calls.push([t,opts]);return{async count(){return count},async isVisible(){return visible}}},
 click(){throw Error('MUST_NOT_CLICK')},evaluate(){throw Error('MUST_NOT_INSPECT_PRIVATE_CONTENT')}};
}
function page({frames=[],states=[state,state]}={}){
 let i=0;const calls=[];
 return {calls,frames(){calls.push('frames');return frames},async evaluate(fn){calls.push('evaluate');return states[Math.min(i++,states.length-1)]},
 click(){throw Error('MUST_NOT_CLICK')},goto(){throw Error('MUST_NOT_NAVIGATE')},keyboard:{press(){throw Error('MUST_NOT_PRESS_KEY')}}};
}
const inspect=(p)=>inspectDouyinAiSummaryEntryReadOnly({page:p,readPageState:()=>{},expectedVideoId:id});
test('single visible iframe video summary entry is recognized without clicking',async()=>{
 const f=frame(),p=page({frames:[f]});const r=await inspect(p);
 assert.equal(r.status,'entry_visible');assert.equal(r.aiSummaryEntryVisible,true);
 assert.equal(r.aiSummaryGenerated,false);assert.equal(r.aiSummaryText,null);
 assert.deepEqual(f.calls,[['视频总结',{exact:true}]]);
 assert.deepEqual(p.calls,['evaluate','frames','evaluate','frames']);
});
test('the entry is not the AI summary content',async()=>{
 const r=await inspect(page({frames:[frame()]}));
 assert.equal(r.aiSummaryText,null);assert.equal(r.aiSummaryGenerated,false);
});
test('a missing iframe remains unobserved without claims of unavailability',async()=>{
 const r=await inspect(page());assert.equal(r.status,'not_observed');
 assert.equal(r.reasonCode,'SUMMARY_ENTRY_NOT_VISIBLE');
});
test('hidden and missing labels are not misclassified as generated summary',async()=>{
 for(const f of [frame(undefined,0),frame(undefined,1,false)]){
  const r=await inspect(page({frames:[f]}));assert.equal(r.status,'not_observed');
 }
});
test('a malicious or unrecognized iframe domain/path is ignored',async()=>{
 for(const url of ['https://evil.example/search_ai_mobile/pc',
  'https://so-landing.douyin.com.evil.example/search_ai_mobile/pc',
  'http://so-landing.douyin.com/search_ai_mobile/pc',
  'https://so-landing.douyin.com/fake'] ){
  const r=await inspect(page({frames:[frame(url)]}));assert.equal(r.status,'not_observed');
 }
});
test('two genuine-looking AI frames are ambiguous and block',async()=>{
 const r=await inspect(page({frames:[frame(),frame()]}));
 assert.equal(r.status,'blocked');assert.equal(r.reasonCode,'OFFICIAL_AI_FRAME_AMBIGUOUS');
});
test('multiple identical summary labels fail closed without clicking',async()=>{
 const r=await inspect(page({frames:[frame(undefined,2)]}));
 assert.equal(r.reasonCode,'SUMMARY_ENTRY_AMBIGUOUS');
});
test('wrong video, homepage, login and verification block before iframe inspection',async()=>{
 for(const bad of [{...state,url:'https://www.douyin.com/'},
  {...state,video:{...state.video,id:'7523456789012345678'}},
  {...state,loginRequired:true},{...state,verificationRequired:true}]){
  const p=page({frames:[frame()],states:[bad,bad]});const r=await inspect(p);
  assert.equal(r.status,'blocked');assert.deepEqual(p.calls,['evaluate']);
 }
});
test('page changed during iframe inspection never yields an accepted entry',async()=>{
 const r=await inspect(page({frames:[frame()],states:[state,{...state,url:'https://www.douyin.com/video/7523456789012345678'}]}));
 assert.equal(r.status,'blocked');assert.equal(r.aiSummaryEntryVisible,false);
});
test('redacts iframe and page errors',async()=>{
 const p=page({frames:[{url(){return 'https://so-landing.douyin.com/search_ai_mobile/pc'},getByText(){throw Error('secret keys')}}]});
 const r=await inspect(p);assert.equal(r.reasonCode,'AI_FRAME_READ_FAILED');assert.doesNotMatch(JSON.stringify(r),/secret|keys/);
});
test('invalid arguments block before accessing any browser API',async()=>{
 let count=0;const p={evaluate(){count++;throw Error('unexpected')}};
 await assert.rejects(inspectDouyinAiSummaryEntryReadOnly({page:p,readPageState:()=>{},expectedVideoId:id}),/READ_ONLY_FRAME_ADAPTER_REQUIRED/);
 assert.equal(count,0);
});

test('iframe replacement after summary entry was read is never accepted',async()=>{
 const f=frame(),replacement=frame(),p=page({frames:[f]});let n=0;
 p.frames=()=>{p.calls.push('frames');return ++n===1?[f]:[replacement]};
 const r=await inspect(p);
 assert.equal(r.status,'blocked');assert.equal(r.reasonCode,'AI_FRAME_CHANGED_AFTER_READ');
 assert.equal(r.aiSummaryEntryVisible,false);
});
test('iframe navigation after label observation is not accepted',async()=>{
 let n=0;const base='https://so-landing.douyin.com/search_ai_mobile/pc';
 const f=frame(base),p=page({frames:[f]});
 f.url=()=>++n>=3?'https://evil.example/intercept':base;
 const r=await inspect(p);
 assert.equal(r.status,'blocked');assert.equal(r.aiSummaryEntryVisible,false);
});
