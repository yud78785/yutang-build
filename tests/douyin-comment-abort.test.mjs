import test from 'node:test';
import assert from 'node:assert/strict';
import {observePublicCommentsReadOnly} from '../tools/douyin-public-comment-readonly.mjs';
const id='7512345678901234567';
const state={url:`https://www.douyin.com/video/${id}`,pageKind:'video',videoSelection:{candidateCount:1,ambiguous:false,identityConflict:false},video:{id,url:`https://www.douyin.com/video/${id}`,readyState:4},loginRequired:false,verificationRequired:false,privateChatVisible:false};
const row={videoId:id,commentId:'12345678',text:'not to leak',mine:false,sent:false,pending:false,failed:false};
const first=()=>{}, second=()=>{};

test('already aborted signal performs zero DOM reads',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const page={async evaluate(){calls++;return state;}};
 const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.deepEqual(r.comments,[]);assert.equal(calls,0);
});
test('aborting during initial read prevents any comment DOM scan',async()=>{
 const controller=new AbortController();let calls=0;
 const page={async evaluate(fn){calls++;controller.abort();if(fn===first)return state;throw Error('must not scan comments');}};
 const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.deepEqual(r.comments,[]);assert.equal(calls,1);
});
test('aborting during comment extraction suppresses final browser page read',async()=>{
 const controller=new AbortController();const calls=[];
 const page={async evaluate(fn){calls.push(fn);if(fn===second){controller.abort();return{rows:[row]};}return state;}};
 const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.deepEqual(r.comments,[]);assert.deepEqual(calls,[first,second]);
});
test('aborting during final state read never returns earlier comments',async()=>{
 const controller=new AbortController();const calls=[];
 const page={async evaluate(fn){calls.push(fn);if(fn===second)return{rows:[row]};if(calls.length===3)controller.abort();return state;}};
 const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id,signal:controller.signal});
 assert.equal(r.reasonCode,'READ_ABORTED');assert.deepEqual(r.comments,[]);assert.equal(calls.length,3);
});
test('nonaborted read retains existing output schema',async()=>{
 const c=new AbortController();const calls=[];
 const page={async evaluate(fn){calls.push(fn);return fn===second?{rows:[row]}:state;}};
 const r=await observePublicCommentsReadOnly({page,readPageState:first,readCommentDom:second,expectedVideoId:id,signal:c.signal});
 assert.equal(r.status,'ok');assert.deepEqual(r.comments,[{text:row.text,commentId:row.commentId}]);assert.deepEqual(calls,[first,second,first]);
});
