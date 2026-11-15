'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const vm=require('node:vm');
const {run,parseArgs,parseBridgeConfig,validateSingleTargetTab,guardGetExpression}=require('../tools/run-vendored-douyin-get-readonly.cjs');
const videoId='7433523124836060416';
const token='0123456789abcdef1234567890abcdef';
const env={YUTANG_DOUYIN_BRIDGE_TOKEN:token};
const targetStatus={ok:true,connections:{'douyin.com':[{alive:true,url:`https://www.douyin.com/video/${videoId}`}]}};

function blob(file) {const content=fs.readFileSync(file);return crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')}
const vendor=path.resolve(__dirname,'../third_party/qinuoyun-douyin-cli-v2');
test('the invoked get.js, helpers.js and BridgeClient are BYTE-EXACT upstream MIT original files',()=>{
 assert.equal(blob(path.join(vendor,'lib/commands/get.js')),'0d39a1e2a52ab09ef1b0d9593db0ebfff5772a5d');
 assert.equal(blob(path.join(vendor,'lib/commands/helpers.js')),'1ffc2838a69c50ffec76b2c77182296e574e589e');
 assert.equal(blob(path.join(vendor,'lib/client/bridge-client.js')),'c69757008661e13f37707002f1a4bc3a8d666044');
});
test('accepts 19-digit IDs as strings; rejects user-supplied JavaScript and non-get arguments before any call',async()=>{
 assert.equal(parseArgs([videoId]).ok,true);
 let connected=0;
 for(const args of [["7433523124836060416');window.__bridge.post('x')//"],['abc'],[videoId,'--all'],[videoId,'--count','21'],[videoId,'--count','0'],[videoId,'--count','1','--reply'],['012']]){
  const r=await run({argv:args,env,makeClient:()=>{connected++;throw Error('would connect')}});
  assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);
 }
 assert.equal(connected,0);
});
test('must have a valid secret before any local HTTP request',async()=>{
 let connects=0;
 const r=await run({argv:[videoId],env:{},makeClient:()=>{connects++;throw Error('connected unexpectedly')}});
 assert.equal(r.reasonCode,'BRIDGE_TOKEN_REQUIRED');assert.equal(connects,0);
 for(const bad of ['no','contains whitespace', '0123456789abcdef\nX'])assert.equal(parseBridgeConfig({YUTANG_DOUYIN_BRIDGE_TOKEN:bad}).ok,false);
});
test('rejects invalid or remote port and keeps host pinned to loopback',async()=>{
 for(const port of ['0','65536','abc','127.0.0.1:19422','-1'])assert.equal(parseBridgeConfig({...env,YUTANG_DOUYIN_BRIDGE_PORT:port}).ok,false);
 let opts;
 const r=await run({argv:[videoId],env,makeClient:config=>{opts=config;return {status:async()=>targetStatus,call:async()=>({ok:true,value:{status_code:0,comments:[]}})}}});
 assert.equal(opts.host,'127.0.0.1');assert.equal(r.reasonCode,'NO_COMMENTS_RETURNED');
});
async function withMockBridge(value, fn, options={}){
 const seen=[];
 const server=http.createServer(async(req,res)=>{
  let content='';for await(const b of req)content+=b;
  const body=content?JSON.parse(content):null;
  seen.push({path:req.url,method:req.method,authorization:req.headers.authorization,body});
  res.setHeader('content-type','application/json');
  if(req.url==='/api/status' && req.method==='GET')res.end(JSON.stringify(options.statusReply??targetStatus));
  else if(req.url==='/api/call' && req.method==='POST')res.end(JSON.stringify(options.reply??{ok:true,value}));
  else {res.statusCode=404;res.end(JSON.stringify({ok:false,error:'Invalid path'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await fn({port:server.address().port,seen});}
 finally {await new Promise(resolve=>server.close(resolve));}
}
test('FULL original get.js -> original BridgeClient -> real loopback HTTP request -> sanitized comment result',async()=>{
 await withMockBridge({status_code:0,has_more:1,cursor:20,comments:[
  {cid:'7646173181204321234',aweme_id:videoId,text:'  测试公开评论，注意只读  ',user:{nickname:'private account',uid:'SECRET_UID'},digg_count:500,reply_comment_total:5},
 ]},async({port,seen})=>{
  const r=await run({argv:[videoId,'--count','10'],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
  assert.equal(r.status,'ok');assert.equal(r.videoId,videoId);
  assert.deepEqual(r.comments,[{commentId:'7646173181204321234',text:'测试公开评论，注意只读'}]);
  assert.equal(r.readOnlyCommand,true);
  assert.equal(seen.length,2);assert.equal(seen[0].method,'GET');assert.equal(seen[0].path,'/api/status');
  assert.equal(seen[1].method,'POST');assert.equal(seen[1].path,'/api/call');
  assert.equal(seen[1].authorization,'Bearer '+token);
  assert.deepEqual(seen[1].body,{site:'douyin.com',expression:guardGetExpression(`window.__bridge.getComments('${videoId}', 0, 10)`,videoId),awaitPromise:true,connIndex:0,timeout:15000});
  assert.doesNotMatch(JSON.stringify(r),/private|SECRET|nickname|uid|digg|cookie/i);
 });
});
test('a response bound to a different video fails closed without leaking any comments',async()=>{
 await withMockBridge({status_code:0,comments:[{cid:'123',aweme_id:'7999999999999999999',text:'wrong-video'}]},async({port})=>{
  const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
  assert.equal(r.reasonCode,'BRIDGE_GET_OR_VALIDATION_FAILED');assert.deepEqual(r.comments,[]);
 });
});
test('refuses body with missing status code, non-array comments, malformed comment ID and excessive rows',async()=>{
 for(const value of [{comments:[]},{status_code:0,comments:null},{status_code:1,comments:[{cid:'123',text:'x'}]},
  {status_code:0,comments:[{cid:123,text:'bad'}]},{status_code:0,comments:[{cid:'1',text:'a'.repeat(513)}]},
  {status_code:0,comments:Array.from({length:11},(_,i)=>({cid:String(i+1),text:'x'}))}]){
  await withMockBridge(value,async({port})=>{const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);});
 }
});
test('an empty first page is not called success',async()=>{
 await withMockBridge({status_code:0,comments:[]},async({port})=>{const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});assert.equal(r.reasonCode,'NO_COMMENTS_RETURNED');});
});
test('Bridge denial, arbitrary server error payloads, and HTML errors are redacted',async()=>{
 await withMockBridge({},async({port})=>{const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});assert.equal(r.status,'blocked');assert.doesNotMatch(JSON.stringify(r),/password|token/i);},{reply:{ok:false,error:'private token abc123 password'}});
 await withMockBridge({},async({port})=>{const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});assert.equal(r.status,'blocked');assert.doesNotMatch(JSON.stringify(r),/password|secret/i);},{reply:{ok:true,value:{status_code:403,error:'private password'}}});
});
test('missing local Bridge server returns a blocked receipt, not a false success',async()=>{
 const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:'1'}});
 assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);
});

test('no tab, multiple tabs and wrong video registration refuse command BEFORE calling eval',async()=>{
 for(const statusReply of [
   {ok:true,connections:{}},
   {ok:true,connections:{'douyin.com':[]}},
   {ok:true,connections:{'douyin.com':[targetStatus.connections['douyin.com'][0],targetStatus.connections['douyin.com'][0]]}},
   {ok:true,connections:{'douyin.com':[{alive:false,url:`https://www.douyin.com/video/${videoId}`}]}} ,
   {ok:true,connections:{'douyin.com':[{alive:true,url:'https://www.douyin.com/video/7999999999999999999'}]}} ,
   {ok:true,connections:{'douyin.com':[{alive:true,url:`https://www.douyin.com/video/${videoId}?modal_id=123`}]}} ,
 ]){
  await withMockBridge({status_code:0,comments:[{cid:'123',text:'not allowed'}]},async({port,seen})=>{
   const r=await run({argv:[videoId],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
   assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);
   assert.deepEqual(seen.map(x=>x.path),['/api/status']);
  },{statusReply});
 }
});
test('stale registered URL cannot bypass current-page route guard during SPA navigation',async()=>{
 const expression=guardGetExpression(`window.__bridge.getComments('${videoId}', 0, 10)`,videoId);
 let called=0;
 const browser={window:{__bridge:{async getComments(){called++;return {status_code:0,comments:[{cid:'1',text:'ok'}]}}}},URL,location:{href:'https://www.douyin.com/video/7999999999999999999'}};
 assert.equal(JSON.stringify(await vm.runInNewContext(expression,browser)),JSON.stringify({status_code:-1,comments:[]}));assert.equal(called,0);
 browser.location.href=`https://www.douyin.com/video/${videoId}?modal_id=123`;
 assert.equal(JSON.stringify(await vm.runInNewContext(expression,browser)),JSON.stringify({status_code:-1,comments:[]}));assert.equal(called,0);
 browser.location.href=`https://www.douyin.com/video/${videoId}`;
 const result=await vm.runInNewContext(expression,browser);assert.equal(result.status_code,0);assert.equal(called,1);
});
test('invalid or missing status payload cannot be mistaken for a registered target',()=>{
 for(const s of [null,{}, {ok:false}, {ok:true,connections:[]}, {ok:true,connections:{'douyin.com':[{}]}},
   {ok:true,connections:{'douyin.com':[{alive:true,url:'javascript:alert(1)'}]}}]){
   assert.equal(validateSingleTargetTab(s,videoId).ok,false);
 }
});
