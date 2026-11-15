import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {normalizeDouyinCommentApiResponse as normalize, startPassiveDouyinCommentCapture as start, makePassiveDouyinCommentReader as reader} from '../tools/douyin-passive-comment-network.mjs';
const id='7433523124836060416';
const url=`https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=${id}&cursor=0`;
const rec=(cid='123',text='  真正公开评论  ')=>({cid,aweme_id:id,text,digg_count:12,reply_comment_total:1,reply_id:'0'});
const ok=(comments=[rec()])=>({status_code:0,comments,cursor:20,has_more:1});
const normalizeOne=(responseBody=ok(),overrides={})=>normalize({url,responseBody,expectedVideoId:id,...overrides});
class Page extends EventEmitter {}
const response=(requestUrl=url, data=ok(),opts={})=>({url:()=>requestUrl,status:()=>opts.status??200,request:()=>({method:()=>opts.method??'GET'}),text:async()=>JSON.stringify(data)});

test('MIT field adapter returns only cid, aweme_id and bounded public text',()=>{
 const r=normalizeOne();assert.equal(r.status,'api_response_observed');
 assert.deepEqual(r.comments,[{commentId:'123',videoId:id,text:'真正公开评论'}]);
 assert.equal(r.aiSummaryGenerated,false);assert.equal(r.aiSummaryText,null);
 assert.doesNotMatch(JSON.stringify(r),/digg_count|reply_comment_total|user|cookie/);
});
test('strict first party exact path and aweme ID',()=>{
 for(const bad of [url.replace('www.douyin.com','evil.example'),url.replace('www.douyin.com','www.douyin.com.evil.example'),url.replace('/list/','/list/reply/'),
  url.replace(id,'7523456789012345678'),url+'&aweme_id='+id,url+'#ignored']){
  assert.equal(normalizeOne(ok(),{url:bad}),null);
 }
});
test('error/invalid response and mixed video rows fail closed',()=>{
 for(const invalid of [{status_code:1,comments:[rec()]},{comments:[rec()]},{status_code:0,comments:{}},
  ok([{...rec(),aweme_id:'7523456789012345678'}]),ok([{...rec(),cid:123}]),ok([{...rec(),text:'x'.repeat(513)}]),
  ok(new Array(101).fill(rec()))])assert.equal(normalizeOne(invalid),null);
});
test('numeric 19-digit IDs are not coerced and duplicates are collapsed',()=>{
 const rows=[rec('7433523124836060417','评论1'),rec('7433523124836060417','重复'),rec('7433523124836060418','评论2')];
 const r=normalizeOne(ok(rows));assert.deepEqual(r.comments.map(x=>x.commentId),['7433523124836060417','7433523124836060418']);
});
test('limit selects first rows but checks late row consistency',()=>{
 const rows=Array.from({length:25},(_,i)=>rec(String(i+1),'评论'+i));
 assert.equal(normalizeOne(ok(rows),{limit:3}).comments.length,3);
 rows[24]={...rows[24],aweme_id:'7523456789012345678'};
 assert.equal(normalizeOne(ok(rows),{limit:3}),null);
});
test('already-captured Playwright response is accepted without requests, clicks or navigation',async()=>{
 const page=new Page();page.goto=()=>{throw Error('forbidden')};page.click=()=>{throw Error('forbidden')};
 const tap=start(page,id);page.emit('response',response());
 const result=await tap.stop();assert.equal(result.status,'api_response_observed');
 assert.equal(result.comments[0].commentId,'123');assert.equal(page.listenerCount('response'),0);
});
test('wrong video, POST, non-200 and other origins are discarded',async()=>{
 const page=new Page(),tap=start(page,id);
 for(const r of [response(url.replace(id,'7523456789012345678')),response(url,ok(),{method:'POST'}),response(url,ok(),{status:403}),response(url.replace('www.douyin.com','evil.example'))])page.emit('response',r);
 const t=await tap.stop();assert.equal(t.status,'not_observed');assert.deepEqual(t.comments,[]);
});
test('response payload cannot leak user, cookie or auth fields',async()=>{
 const p=new Page(),tap=start(p,id);p.emit('response',response(url,{...ok(),cookie:'SECRET_COOKIE',user:{email:'secret@private'},comments:[{...rec(),user:{email:'private@site'}}]}));
 const s=JSON.stringify(await tap.stop());assert.doesNotMatch(s,/SECRET|private|email|cookie/i);
});
test('passthrough wrapper preserves DOM and attaches passive evidence separately',async()=>{
 const page=new Page(),observeDom=async()=>{page.emit('response',response());return {status:'no_visible_comments',comments:[]}};
 const r=await reader(observeDom)({page,expectedVideoId:id,limit:12});
 assert.equal(r.status,'no_visible_comments');assert.deepEqual(r.comments,[]);
 assert.equal(r.passiveNetwork.status,'api_response_observed');assert.equal(page.listenerCount('response'),0);
});
test('observer errors detach listener without suppressing caller error',async()=>{
 const page=new Page();const wrapped=reader(async()=>{throw Error('DOM_BLOCKED')});
 await assert.rejects(wrapped({page,expectedVideoId:id,limit:12}),/DOM_BLOCKED/);
 assert.equal(page.listenerCount('response'),0);
});
test('page without EventEmitter support still works with DOM-only reader',async()=>{
 const wrapped=reader(async()=>({status:'no_visible_comments',comments:[]}));
 const r=await wrapped({page:{},expectedVideoId:id,limit:12});
 assert.equal(r.passiveNetwork.reasonCode,'RESPONSE_LISTENER_UNAVAILABLE');
});
test('first party response with invalid text is not accepted as proof',async()=>{
 const page=new Page(),tap=start(page,id);page.emit('response',response(url,ok([{...rec(),text:1}])));
 const r=await tap.stop();assert.equal(r.status,'not_observed');
});
