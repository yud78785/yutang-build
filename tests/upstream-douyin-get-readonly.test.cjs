'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {run,parseArgs,parseBridgeConfig,selectUpstreamConnection,makeReadOnlyExpression,validateReadResult}=require('../tools/run-upstream-douyin-get-readonly.cjs');
const vid='7433523124836060416',acct='123456789012345678',acct2='234567890123456789',secret='0123456789abcdef-secret-123456';
const env={YUTANG_DOUYIN_BRIDGE_TOKEN:secret};
const tab=(a=acct,opts={})=>({id:opts.id??`conn-${a}`,account:a,channel:`douyin.com#${a}`,alive:opts.alive??true,
  clientVersion:opts.version??3,url:opts.url??`https://www.douyin.com/video/${vid}`});
const summary=(tabs=[tab()])=>({ok:true,connections:{'douyin.com':tabs},accounts:{'douyin.com':tabs.map(t=>({account:t.account,channel:t.channel,connId:t.id,alive:t.alive,clientVersion:t.clientVersion}))}});
const result=(rows=[{commentId:'7654321098765432101',text:' 公开评论 '}],account=acct)=>({ok:true,account,channel:`douyin.com#${account}`,value:{tag:'yt_readonly_v1',status:'ok',videoId:vid,comments:rows}});
function gitBlob(filename){const b=fs.readFileSync(filename);return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');}
async function localBridge(status,answer,fn){
 const received=[];
 const server=http.createServer(async(req,res)=>{
  let text='';for await(const b of req)text+=b;
  received.push({method:req.method,path:req.url,headers:req.headers,body:text?JSON.parse(text):null});
  res.setHeader('content-type','application/json');
  if(req.method==='GET'&&req.url==='/api/status')res.end(JSON.stringify(status));
  else if(req.method==='POST'&&req.url==='/api/call'){
    const out=typeof answer==='function'?answer(received.at(-1).body):answer;
    res.end(JSON.stringify(out));
  }else {res.statusCode=404;res.end('{}');}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try {await fn({port:server.address().port,received});} finally {await new Promise(ok=>server.close(ok));}
}

test('MIT upstream BridgeClient is exact original source; no sqlite modules are imported',()=>{
 assert.equal(gitBlob(path.join(__dirname,'../third_party/Yht20927-douyin-cli-20261113/lib/client/bridge-client.js')),'5c7fd38f25c27f198a2ea5021343ed3c9376fd3e');
 const source=fs.readFileSync(path.join(__dirname,'../tools/run-upstream-douyin-get-readonly.cjs'),'utf8');
 assert.doesNotMatch(source,/require\([^\n]*get\.js|require\([^\n]*better-sqlite3|persistEntities|markGet\(/);
});
test('numeric IDs only and at most 20 comments, optional exact account',()=>{
 assert.deepEqual(parseArgs([vid,'--count','20','--account',acct]),{ok:true,videoId:vid,count:20,account:acct});
 assert.deepEqual(parseArgs([vid,'--account',acct,'--count','1']),{ok:true,videoId:vid,count:1,account:acct});
 for(const args of [['abc'],[vid,'--count','21'],[vid,'--all'],[vid,'--account','xxx'],[vid,'--count','01'],[vid,'--count','2','--count','3'],[vid,'--account',acct,'--account',acct]])assert.equal(parseArgs(args).ok,false);
});
test('requires locally managed token and loopback port before any connection',async()=>{
 assert.equal(parseBridgeConfig({}).ok,false);
 for(const p of ['0','65536','abc','127.0.0.1:19422'])assert.equal(parseBridgeConfig({...env,YUTANG_DOUYIN_BRIDGE_PORT:p}).ok,false);
 let created=0;const r=await run({argv:[vid],env:{},makeClient:()=>{created++;throw Error('must not instantiate')}});assert.equal(r.reasonCode,'BRIDGE_TOKEN_REQUIRED');assert.equal(created,0);
});
test('newer multi-account schema and protocol v3 are enforced',()=>{
 assert.equal(selectUpstreamConnection(summary(),vid).account,acct);
 assert.equal(selectUpstreamConnection(summary([tab(acct),tab(acct2)]),vid).reasonCode,'ACCOUNT_SELECTION_REQUIRED');
 assert.equal(selectUpstreamConnection(summary([tab(acct),tab(acct2)]),vid,acct2).account,acct2);
 assert.equal(selectUpstreamConnection(summary([tab(acct),tab(acct)]),vid,acct).reasonCode,'TARGET_ACCOUNT_NOT_UNIQUE');
 assert.equal(selectUpstreamConnection(summary([tab(acct,{version:2})]),vid).reasonCode,'UPSTREAM_USERSCRIPT_VERSION_MISMATCH');
 assert.equal(selectUpstreamConnection(summary([tab(acct,{url:`https://www.douyin.com/video/${acct2}`})]),vid).reasonCode,'TARGET_VIDEO_ROUTE_MISMATCH');
 const s=summary();s.accounts['douyin.com'][0].connId='other-conn';assert.equal(selectUpstreamConnection(s,vid).reasonCode,'ACCOUNT_STATUS_CONFLICT');
});
test('browser expression has only one getter, zero posts and strips personal author data',async()=>{
 let calls=0;const obj={location:{href:`https://www.douyin.com/video/${vid}`},URL,
  window:{__bridge:{async getComments(id,cursor,count){calls++;assert.equal(id,vid);assert.equal(cursor,0);assert.equal(count,10);return{status_code:0,comments:[{cid:'7654321098765432101',aweme_id:vid,text:'  第一条评论  ',user:{uid:'SHOULD_NOT_LEAK',nickname:'private user'}}]}}}}};
 const evalResult=await vm.runInNewContext(makeReadOnlyExpression(vid,10),obj);
 assert.equal(calls,1);assert.equal(evalResult.status,'ok');
 assert.equal(JSON.stringify(evalResult.comments),JSON.stringify([{commentId:'7654321098765432101',text:'第一条评论'}]));
 assert.doesNotMatch(JSON.stringify(evalResult),/SHOULD_NOT_LEAK|nickname|private user/);
});
test('SPA navigation before call, bad iframe hostname or contradictory modal blocks GET',async()=>{
 let calls=0;const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{async getComments(){calls++;return{status_code:0,comments:[]}}}}};
 for(const bad of [`https://www.douyin.com/video/${acct2}`,`https://www.douyin.com/video/${vid}?modal_id=${acct2}`,`https://www.douyin.com.evil.com/video/${vid}`,`http://www.douyin.com/video/${vid}`]){
   context.location.href=bad;const x=await vm.runInNewContext(makeReadOnlyExpression(vid,10),context);assert.equal(x.status,'route_mismatch');
 }
 assert.equal(calls,0);
});
test('SPA navigation during awaited API rejects all earlier comments',async()=>{
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{async getComments(){context.location.href=`https://www.douyin.com/video/${acct2}`;return{status_code:0,comments:[{cid:'1234',text:'stale'}]};}}}};
 const x=await vm.runInNewContext(makeReadOnlyExpression(vid,10),context);assert.equal(x.status,'route_mismatch');assert.equal(x.comments.length,0);
});
test('invalid cross-video comment and malformed API payload are not passed to host',async()=>{
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{getComments:async()=>({status_code:0,comments:[{cid:'1234',aweme_id:acct2,text:'cross video'}]})}}};
 const x=await vm.runInNewContext(makeReadOnlyExpression(vid,10),context);assert.equal(x.status,'api_invalid');assert.equal(x.comments.length,0);
});
test('real unmodified BridgeClient does GET status and ONE POST read to pinned account',async()=>{
 await localBridge(summary(),result(),async({port,received})=>{
   const r=await run({argv:[vid,'--count','10'],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
   assert.equal(r.status,'ok');assert.deepEqual(r.comments,[{commentId:'7654321098765432101',text:' 公开评论 '}]);
   assert.deepEqual(received.map(x=>`${x.method} ${x.path}`),['GET /api/status','POST /api/call']);
   assert.equal(received[1].body.account,acct);assert.equal(received[1].body.opType,'read');assert.equal(received[1].body.noThrottle,false);
   assert.equal(received[1].body.awaitPromise,true);assert.equal(received[1].body.timeout,15000);
   assert.equal(received[1].headers.authorization,`Bearer ${secret}`);
   assert.doesNotMatch(JSON.stringify(r),/123456789012345678|secret|account|Bearer/i);
 });
});
test('multiple accounts only send the requested account and never server rotation',async()=>{
 await localBridge(summary([tab(acct),tab(acct2)]),result([{commentId:'1234',text:'ok'}],acct2),async({port,received})=>{
  const r=await run({argv:[vid,'--account',acct2],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
  assert.equal(r.status,'ok');assert.equal(received[1].body.account,acct2);assert.equal(received[1].body.opType,'read');
 });
});
test('wrong echoed account, invalid result or no visible rows fail closed',async()=>{
 for(const answer of [result([{commentId:'1234',text:'ok'}],acct2),
  {ok:true,account:acct,channel:`douyin.com#${acct}`,value:{tag:'other',status:'ok',videoId:vid,comments:[]}},
  result([]),result([{commentId:'a;',text:'oops'}])]){
   await localBridge(summary(),answer,async({port})=>{
     const r=await run({argv:[vid],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
     assert.equal(r.status,'blocked');assert.equal(r.comments.length,0);
   });
 }
});
test('unverified status or missing target stops before POST /api/call',async()=>{
 for(const status of [summary([]),{ok:false,connections:{}},{ok:true,connections:{}},summary([tab(acct,{version:2})])]){
  await localBridge(status,result(),async({port,received})=>{
   const r=await run({argv:[vid],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:String(port)}});
   assert.equal(r.status,'blocked');assert.deepEqual(received.map(x=>x.path),['/api/status']);
  });
 }
});
test('simulated unavailable bridge does not leak address or token',async()=>{
 const r=await run({argv:[vid],env:{...env,YUTANG_DOUYIN_BRIDGE_PORT:'1'}});
 assert.equal(r.status,'blocked');assert.deepEqual(r.comments,[]);
 assert.doesNotMatch(JSON.stringify(r),/0123456789abcdef-secret-123456|127\.0\.0\.1/);
});

test('same server-dispatched expression is idempotent across WS timeout HTTP retry',async()=>{
 let apiCalls=0;
 const holder={resolve:null};
 const response=new Promise(resolve=>{holder.resolve=resolve});
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{getComments(){apiCalls++;return response}}}};
 const id='11111111-2222-4333-8444-555555555555';
 const script=makeReadOnlyExpression(vid,10,id);
 const p1=vm.runInNewContext(script,context);
 const p2=vm.runInNewContext(script,context);
 holder.resolve({status_code:0,comments:[{cid:'12345',aweme_id:vid,text:'single request'}]});
 const [v1,v2]=await Promise.all([p1,p2]);
 assert.equal(apiCalls,1,'WS-to-HTTP retry must not cause two Douyin comment requests');
 assert.equal(v1.status,'ok');assert.equal(v2.status,'ok');
 assert.deepEqual(JSON.parse(JSON.stringify(v1.comments)),JSON.parse(JSON.stringify(v2.comments)));
});

test('late HTTP retry after first response reuses sanitized result, no second site GET',async()=>{
 let calls=0;
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{async getComments(){calls++;return {status_code:0,comments:[{cid:'12345',aweme_id:vid,text:'comment'}]}}}}};
 const expr=makeReadOnlyExpression(vid,10,'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee');
 const first=await vm.runInNewContext(expr,context);
 const late=await vm.runInNewContext(expr,context);
 assert.equal(calls,1);
 assert.equal(first.status,'ok');assert.equal(late.status,'ok');
 assert.equal(context.window[Symbol.for('yutang.public_comment_readonly_once.v1')].size,1);
});
test('two distinct read request IDs do not share the site response',async()=>{
 let calls=0;
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{async getComments(){calls++;return{status_code:0,comments:[{cid:'12345',text:'ok'}]}}}}};
 const one=makeReadOnlyExpression(vid,10,'11111111-2222-4333-8444-555555555555');
 const two=makeReadOnlyExpression(vid,10,'22222222-3333-4444-8555-666666666666');
 await Promise.all([vm.runInNewContext(one,context),vm.runInNewContext(two,context)]);
 assert.equal(calls,2);
});
test('invalid task identifiers cannot be injected into the page eval',()=>{
 for(const id of ["x');window.__bridge.post()//",'','1234','11111111-2222-4333-8444-555555555555\npost']){
  assert.throws(()=>makeReadOnlyExpression(vid,10,id),/INVALID_REQUEST_ID/);
 }
});
test('cached result is not returned after navigation to a different video',async()=>{
 let calls=0;
 const context={URL,location:{href:`https://www.douyin.com/video/${vid}`},window:{__bridge:{async getComments(){calls++;return{status_code:0,comments:[{cid:'12345',text:'first'}]}}}}};
 const expr=makeReadOnlyExpression(vid,10,'11111111-2222-4333-8444-555555555555');
 assert.equal((await vm.runInNewContext(expr,context)).status,'ok');
 context.location.href='https://www.douyin.com/video/7999999999999999999';
 const recheck=await vm.runInNewContext(expr,context);
 assert.equal(recheck.status,'route_mismatch');assert.deepEqual(JSON.parse(JSON.stringify(recheck.comments)),[]);
 assert.equal(calls,1);
});
