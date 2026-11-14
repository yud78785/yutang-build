import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPublicCommentEvidence, observePublicCommentsReadOnly} from '../tools/douyin-public-comment-readonly.mjs';

const id = '7512345678901234567';
const state = Object.freeze({url:`https://www.douyin.com/video/${id}`,pageKind:'video',videoSelection:{candidateCount:1,ambiguous:false,identityConflict:false},video:{id,url:`https://www.douyin.com/video/${id}`,readyState:4},
  loginRequired:false,verificationRequired:false,privateChatVisible:false,unsupportedPage:false});
const row = (text = '公开评论') => ({videoId:id,commentId:'12345678',text,mine:false,sent:false,pending:false,failed:false});
const inspect = (overrides={}) => classifyPublicCommentEvidence({stateBefore:state,stateAfter:state,
  commentRows:{rows:[row()]},expectedVideoId:id,...overrides});

test('visible comment is returned as bounded, source-derived content only',()=>{
  const r=inspect(); assert.equal(r.status,'ok'); assert.deepEqual(r.comments,[{text:'公开评论',commentId:'12345678'}]);
  assert.equal(r.aiSummary.verified,false);
});
test('AI summary is NOT invented even when a public comment mentions it',()=>{
  const r=inspect({commentRows:{rows:[row('AI总结：这是某条评论，而非官方总结。')]}});
  assert.equal(r.status,'ok');assert.equal(r.aiSummary.reasonCode,'DEDICATED_AI_SUMMARY_NOT_INSPECTED');
});
test('empty DOM does not prove the video has no comments',()=>{
  const r=inspect({commentRows:{rows:[]}});assert.equal(r.status,'no_visible_comments');assert.equal(r.reasonCode,'COMMENTS_NOT_VISIBLE_OR_NOT_LOADED');
});
for(const [property,code] of [['privateChatVisible','PRIVATE_CHAT_VISIBLE'],['loginRequired','LOGIN_REQUIRED'],
 ['verificationRequired','VERIFICATION_REQUIRED'],['unsupportedPage','UNSUPPORTED_PAGE'],['blocked','PAGE_BLOCKED']]) {
 test(`fails closed on ${property}`,()=>{const s={...state,[property]:true};assert.equal(inspect({stateBefore:s}).reasonCode,code);});
}
test('refuses wrong video or conflicting video identity',()=>{
  assert.equal(inspect({stateBefore:{...state,video:{...state.video,id:'7523456789012345678'}}}).reasonCode,'VIDEO_ID_MISMATCH');
  assert.equal(inspect({stateBefore:{...state,videoSelection:{identityConflict:true}}}).reasonCode,'VIDEO_IDENTITY_CONFLICT');
});
test('refuses unready media and unauthorized origins',()=>{
  assert.equal(inspect({stateBefore:{...state,video:{...state.video,readyState:1}}}).reasonCode,'VIDEO_NOT_READY');
  assert.equal(inspect({stateBefore:{...state,url:'https://evil.example/'}}).reasonCode,'PAGE_VIDEO_ROUTE_UNVERIFIED');
  assert.equal(inspect({stateBefore:{...state,video:{...state.video,url:`https://evil.example/video/${id}`}}}).reasonCode,'VIDEO_URL_UNVERIFIED');
});
test('refuses stale video navigation and changed pages without leaking comments',()=>{
  const r=inspect({stateAfter:{...state,url:'https://www.douyin.com/?recommend=1'}});
  assert.equal(r.status,'blocked');assert.equal(r.reasonCode,'POST_OBSERVATION_PAGE_VIDEO_ROUTE_UNVERIFIED');assert.deepEqual(r.comments,[]);
});
test('refuses cross-video, malformed and excessive comment rows',()=>{
  assert.equal(inspect({commentRows:{rows:[{...row(),videoId:'7523456789012345678'}]}}).reasonCode,'COMMENT_ROW_NOT_BOUND_TO_VIDEO');
  assert.equal(inspect({commentRows:{rows:[{...row(),text:'x'.repeat(513)}]}}).status,'blocked');
  assert.equal(inspect({commentRows:{rows:new Array(101).fill(row())}}).reasonCode,'COMMENT_ROWS_UNVERIFIED');
});
test('pending, failed, empty and duplicates are not presented as verified public comments',()=>{
  const rows=[{...row('审核中'),pending:true},{...row('失败'),failed:true},{...row('')},row('  有效评论  '),row('重复ID')];
  const r=inspect({commentRows:{rows}});assert.equal(r.status,'ok');assert.deepEqual(r.comments,[{text:'有效评论',commentId:'12345678'}]);
});
test('comment limit is strict and invalid argument fails before browser access',()=>{
  const rows=Array.from({length:26},(_,i)=>({...row('评论'+i),commentId:String(i+1)}));
  assert.equal(inspect({commentRows:{rows},limit:3}).comments.length,3);
  assert.throws(()=>inspect({limit:21}),/INVALID_COMMENT_LIMIT/);
  assert.throws(()=>inspect({expectedVideoId:'not-a-video'}),/INVALID_VIDEO_ID/);
});
test('adapter only evaluates upstream read functions in order without click or navigation',async()=>{
  const calls=[], first=()=>{}, second=()=>{};
  const page={async evaluate(fn,arg){calls.push([fn,arg]);if(fn===first)return {...state};return {rows:[row('这就是公开评论')]};},
    click(){throw Error('click forbidden');},goto(){throw Error('navigate forbidden');},fill(){throw Error('fill forbidden');}};
  const result=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id});
  assert.equal(result.status,'ok');assert.deepEqual(calls,[[first,undefined],[second,id],[first,undefined]]);
});
test('adapter never reads comments when login or verification is visible',async()=>{
  const calls=[];const first=()=>{},second=()=>{};
  const page={async evaluate(fn){calls.push(fn);if(fn===second)throw Error('comment read must not happen');return {...state,loginRequired:true};}};
  const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id});
  assert.equal(r.reasonCode,'LOGIN_REQUIRED');assert.deepEqual(calls,[first]);
});
test('adapter never leaks stale comments when page changes after read',async()=>{
  const first=()=>{},second=()=>{};let n=0;
  const page={async evaluate(fn){if(fn===second)return{rows:[row('confidential stale snippet')]};n++;return n===1?state:{...state,video:{...state.video,id:'7523456789012345678'}};}};
  const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id});
  assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);assert.doesNotMatch(JSON.stringify(r),/confidential/);
});

// New guard tests use the *actual* fields produced by upstream readPageState.
test('refuses homepage video even if its visible video ID matches',()=>{
 const r=inspect({stateBefore:{...state,url:'https://www.douyin.com/?recommend=1'}});
 assert.equal(r.reasonCode,'PAGE_VIDEO_ROUTE_UNVERIFIED');
});
test('refuses ambiguous or unproven active video selection',()=>{
 assert.equal(inspect({stateBefore:{...state,videoSelection:{candidateCount:2,ambiguous:true}}}).reasonCode,'VIDEO_SELECTION_NOT_UNIQUE');
 assert.equal(inspect({stateBefore:{...state,videoSelection:{candidateCount:0,ambiguous:false}}}).reasonCode,'VIDEO_SELECTION_NOT_UNIQUE');
 assert.equal(inspect({stateBefore:{...state,videoSelection:undefined}}).reasonCode,'VIDEO_SELECTION_NOT_UNIQUE');
});
test('requires a single video detail page, not search, live or image post',()=>{
 for (const pageKind of ['search','live-room','image-post','unknown'])
   assert.equal(inspect({stateBefore:{...state,pageKind}}).reasonCode,'NOT_SINGLE_VIDEO_PAGE');
});
test('accepts bounded query on exact video path; rejects another video and anchors',()=>{
 const withQuery={...state,url:`https://www.douyin.com/video/${id}?recommend=1`};
 assert.equal(inspect({stateBefore:withQuery,stateAfter:withQuery}).status,'ok');
 assert.equal(inspect({stateBefore:{...state,url:`https://www.douyin.com/video/${id}#comment`}}).reasonCode,'PAGE_VIDEO_ROUTE_UNVERIFIED');
 assert.equal(inspect({stateBefore:{...state,url:'https://www.douyin.com/video/7523456789012345678'}}).reasonCode,'PAGE_VIDEO_ROUTE_UNVERIFIED');
});
test('fails closed with redacted reason on each browser evaluation exception',async()=>{
 const first=()=>{},second=()=>{};
 const a=await observePublicCommentsReadOnly({page:{async evaluate(){throw Error('private token and credentials')}},readPageState:first,readCommentDom:second,expectedVideoId:id});
 assert.equal(a.reasonCode,'INITIAL_PAGE_READ_FAILED');assert.doesNotMatch(JSON.stringify(a),/private|token/);
 let n=0;const b=await observePublicCommentsReadOnly({page:{async evaluate(fn){if(fn===second)throw Error('private data');return state;}},readPageState:first,readCommentDom:second,expectedVideoId:id});
 assert.equal(b.reasonCode,'COMMENT_DOM_READ_FAILED');assert.doesNotMatch(JSON.stringify(b),/private/);
 const c=await observePublicCommentsReadOnly({page:{async evaluate(fn){if(fn===second)return{rows:[row('sensitive')]};return ++n===1?state:Promise.reject(Error('secret'));}},readPageState:first,readCommentDom:second,expectedVideoId:id});
 assert.equal(c.reasonCode,'FINAL_PAGE_READ_FAILED');assert.deepEqual(c.comments,[]);
});
test('invalid limit and arguments never touch browser',async()=>{
 let evaluated=false;const page={async evaluate(){evaluated=true;return state;}};
 await assert.rejects(observePublicCommentsReadOnly({page,readPageState:()=>{},readCommentDom:()=>{},expectedVideoId:id,limit:21}),/INVALID_COMMENT_LIMIT/);
 assert.equal(evaluated,false);
});

test('conflicting modal_id or aweme_id never matches an otherwise valid video detail URL',()=>{
 for(const key of ['modal_id','aweme_id']){
  const bad={...state,url:`https://www.douyin.com/video/${id}?${key}=7523456789012345678`};
  assert.equal(inspect({stateBefore:bad}).reasonCode,'PAGE_VIDEO_ROUTE_UNVERIFIED');
  const good={...state,url:`https://www.douyin.com/video/${id}?${key}=${id}`};
  assert.equal(inspect({stateBefore:good,stateAfter:good}).status,'ok');
 }
});
test('non-boolean pending status cannot be silently treated as a published comment',()=>{
 const r=inspect({commentRows:{rows:[{...row('尚未发布'),pending:'true'}]}});
 assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);
});
