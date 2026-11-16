import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {commentExpression,ownershipExpression,safeTarget,isUpstreamCandidateUrl,
  cdpEval,validateVisibleReceipt,readExistingDouyinComments} from '../tools/read-existing-douyin-comments.mjs';

const id='7512345678901234567';
const other='7523456789012345678';
const url=`https://www.douyin.com/video/${id}`;
function target(idStr='ABCDEF1234567890',u=url){return{type:'page',id:idStr,url:u,webSocketDebuggerUrl:`ws://127.0.0.1:9227/devtools/page/${idStr}`};}
function preflight({argv}){assert.deepEqual(argv,['--video-id',id]);return{status:'target_video_metadata_seen'};}
const rect=()=>({width:100,height:50,top:0,left:0,right:100,bottom:50});
function fakePage({route=url,owner='deepseek-douyin-api',ready=4,comments=['  hello public  '],rowVideo=id,otherVideo=false,privateVisible=false}={}){
  const video={readyState:ready,getBoundingClientRect:rect,closest(s){return s.includes('player-container')?{className:`video_${otherVideo?other:id}`}:null}};
  const rows=comments.map((str,i)=>{
    const row={id:`comment_${i+101}`,parentElement:{closest:()=>null},getBoundingClientRect:rect,
      getAttribute(k){return k==='data-comment-id'?String(i+101):null},
      closest(k){return k.includes('data-aweme-id')?{getAttribute(x){return x==='data-aweme-id'?rowVideo:null}}:null},
      querySelectorAll(){return [text]}};
    const text={innerText:str,textContent:'HIDDEN_PRIVATE_DO_NOT_READ',closest(){return row},getBoundingClientRect:rect};return row;
  });
  const overlay={getBoundingClientRect:rect};
  const ctx={URL,innerWidth:1000,innerHeight:800,location:{href:route},window:{name:owner},getComputedStyle(){return{display:'block',visibility:'visible',opacity:'1'}},
    document:{querySelectorAll(q){if(q==='video')return[video];if(q==='[data-e2e="comment-item"]')return rows;
      if(q.includes('#captcha_container'))return privateVisible?[overlay]:[];return[];}}};
  Object.defineProperty(ctx.location,'origin',{get(){return new URL(ctx.location.href).origin}});
  Object.defineProperty(ctx.location,'pathname',{get(){return new URL(ctx.location.href).pathname}});
  return ctx;
}
async function evalFake(tab,expression,{ctx}={}){
  if(expression===ownershipExpression())return{label:ctx.window.name,origin:ctx.location.origin,path:ctx.location.pathname};
  return vm.runInNewContext(expression,ctx);
}
function configured({tabs=[target()],ctx=fakePage(),lockFree=true,onEval=null,targetsChange=null}={}){
  let calls=[];let listReads=0;
  const r=readExistingDouyinComments({argv:['--video-id',id],preflight,lockCheck:()=>lockFree,
    targets:async()=>{listReads++;return targetsChange?targetsChange(listReads):tabs},
    evalTarget:async(tab,expr)=>{calls.push([tab.id,expr]);return onEval?onEval(tab,expr,{ctx}):evalFake(tab,expr,{ctx})}});
  return {r,calls};
}

test('upstream candidates include owned blank/live pages but never third-party private pages',()=>{
  for(const u of ['about:blank','about:blank#hash',url,'https://live.douyin.com/123456'])assert.equal(isUpstreamCandidateUrl(u),true,u);
  for(const u of ['about:config','https://private.example/account','https://live.douyin.com/profile','https://www.douyin.com.evil.example/video/123','javascript:alert(1)'])assert.equal(isUpstreamCandidateUrl(u),false,u);
});
test('CDP websocket target must be local and match its exact page ID and port',()=>{
 const t=target();assert.equal(safeTarget(t),true);
 for(const bad of [{webSocketDebuggerUrl:'ws://foreign.example:9227/devtools/page/'+t.id},{webSocketDebuggerUrl:'ws://127.0.0.1:9227/devtools/browser/'+t.id},
  {webSocketDebuggerUrl:'wss://127.0.0.1:9227/devtools/page/'+t.id},{webSocketDebuggerUrl:'ws://127.0.0.1:9222/devtools/page/'+t.id},
  {id:'../../../etc/passwd'},{webSocketDebuggerUrl:t.webSocketDebuggerUrl+'?secret=1'}])
  assert.equal(safeTarget({...t,...bad}),false,JSON.stringify(bad));
});
test('only numeric work ID can be embedded in a fixed DOM read expression',()=>{
 assert.ok(commentExpression(id).includes(`const id="${id}"`));
 assert.throws(()=>commentExpression("0');fetch('https://bad.example')//"));
 assert.throws(()=>commentExpression(id,100));
 const x=commentExpression(id);
 assert.doesNotMatch(x,/\b(fetch|click|scrollTo|goto|postMessage)\s*\(/);
});
test('read-only DOM expression returns only visible public comment text and IDs',()=>{
 const ctx=fakePage();
 const v=vm.runInNewContext(commentExpression(id),ctx);
 assert.equal(v.status,'ok');
 assert.equal(JSON.stringify(v.comments),JSON.stringify([{commentId:'101',text:'hello public'}]));
 assert.doesNotMatch(JSON.stringify(v),/HIDDEN_PRIVATE_DO_NOT_READ/);
 assert.equal(validateVisibleReceipt(v,id).status,'read_only_evidence');
});
test('wrong video, wrong owner, pending media, captcha and row-vs-video mismatch are blocked inside browser',()=>{
 const scenarios=[{route:`https://www.douyin.com/video/${other}`}, {owner:'personal'}, {ready:1}, {privateVisible:true}, {rowVideo:other}, {otherVideo:true}];
 for(const s of scenarios){const v=vm.runInNewContext(commentExpression(id),fakePage(s));assert.equal(v.status,'blocked',JSON.stringify(s));assert.deepEqual(JSON.parse(JSON.stringify(v.comments)),[])}
});
test('zero loaded public comment rows is not falsely reported as video has no comments',()=>{
 const v=vm.runInNewContext(commentExpression(id),fakePage({comments:[]}));
 assert.equal(v.status,'no_visible_comments');assert.equal(validateVisibleReceipt(v,id).status,'no_visible_evidence');
});
test('host revalidates comment IDs/text and returns no author or private fields',()=>{
 const v={status:'ok',reasonCode:null,videoId:id,comments:[{commentId:'101',text:'public',user:{uid:'PRIVATE'}}]};
 const r=validateVisibleReceipt(v,id);assert.equal(r.status,'read_only_evidence');
 assert.deepEqual(r.comments,[{commentId:'101',text:'public'}]);assert.doesNotMatch(JSON.stringify(r),/uid|PRIVATE|user/);
 for(const rows of [[{commentId:'x',text:'public'}],[{commentId:'1',text:'secret\n'}],[{commentId:'1',text:'x'},{commentId:'1',text:'repeat'}]]){
  assert.equal(validateVisibleReceipt({...v,comments:rows},id).status,'blocked');
 }
});
test('one owned target results in read-only evidence, never login or website network',async()=>{
 const {r,calls}=configured();const v=await r;
 assert.equal(v.status,'read_only_evidence');assert.deepEqual(v.comments,[{commentId:'101',text:'hello public'}]);
 assert.equal(v.networkRequestsToDouyinByProbe,false);assert.equal(v.browserStartedByProbe,false);
 assert.equal(calls.filter(x=>x[1]===ownershipExpression()).length,2);
 assert.equal(calls.length,3); // ownership, comments, final ownership
});
test('private site metadata is skipped without evaluating that tab',async()=>{
 const t=[target(), {type:'page',id:'DEADBEEF12345678',url:'https://private.example/account?secret=123',webSocketDebuggerUrl:'ws://127.0.0.1:9227/devtools/page/DEADBEEF12345678'}];
 const {r,calls}=configured({tabs:t});assert.equal((await r).status,'read_only_evidence');
 assert.ok(calls.every(c=>c[0]==='ABCDEF1234567890'));
});
test('second upstream-owned about:blank or numeric live page blocks all DOM comment reads',async()=>{
 for(const u of ['about:blank','https://live.douyin.com/123456']){
  const t=[target(),target('00000000ABCDEF12',u)];let commentCalls=0;
  const {r}=configured({tabs:t,onEval:async(tab,expr,{ctx})=>{
    if(expr===ownershipExpression())return{label:'deepseek-douyin-api',origin:u==='about:blank'&&tab.id!=='ABCDEF1234567890'?'null':new URL(tab.url).origin,path:u==='about:blank'&&tab.id!=='ABCDEF1234567890'?'blank':new URL(tab.url).pathname};
    commentCalls++;return evalFake(tab,expr,{ctx});}});
  const v=await r;assert.equal(v.status,'blocked',u);assert.equal(v.reasonCode,'MULTIPLE_UPSTREAM_OWNED_TABS');assert.equal(commentCalls,0);
 }
});
test('second public Douyin tab with another unrelated window.name does not leak contents',async()=>{
 const t=[target(),target('00000000ABCDEF12',`https://www.douyin.com/video/${other}`)];const calls=[];
 const {r}=configured({tabs:t,onEval:async(tab,expr,{ctx})=>{
  calls.push([tab.id,expr]);if(expr===ownershipExpression())return{label:tab.id==='ABCDEF1234567890'?'deepseek-douyin-api':'',origin:'https://www.douyin.com',path:new URL(tab.url).pathname};
  return evalFake(tab,expr,{ctx});}});
 assert.equal((await r).status,'read_only_evidence');assert.equal(calls.filter(x=>x[0]==='00000000ABCDEF12').length,2);
 assert.ok(calls.filter(x=>x[0]==='00000000ABCDEF12').every(x=>x[1]===ownershipExpression()));
});
test('CDP owner list changed after comment read discards earlier text',async()=>{
 const {r}=configured({targetsChange:n=>n===1?[target()]:[target('ABCDEF1234567890',`https://www.douyin.com/video/${other}`)]});
 const v=await r;assert.equal(v.status,'blocked');assert.deepEqual(v.comments,[]);
});
test('browser operation lock stops all CDP work and never deletes foreign locks',async()=>{
 const {r,calls}=configured({lockFree:false});const v=await r;
 assert.equal(v.reasonCode,'UPSTREAM_BROWSER_LOCK_PRESENT');assert.equal(calls.length,0);
});
test('preflight fails before connecting to any page websocket',async()=>{
 const r=await readExistingDouyinComments({argv:['--video-id',id],preflight:async()=>({status:'blocked',reasonCode:'DEDICATED_BROWSER_NOT_RUNNING'}),
  evalTarget:()=>{throw Error('must not connect')},targets:()=>{throw Error('must not list')}});
 assert.equal(r.reasonCode,'DEDICATED_BROWSER_NOT_RUNNING');
});
test('wrong-video browser output cannot return comments even with valid ownership',async()=>{
 const {r}=configured({onEval:async(tab,expr,{ctx})=>expr===ownershipExpression()?evalFake(tab,expr,{ctx}):
   {status:'ok',videoId:other,comments:[{commentId:'1234',text:'from wrong video'}]}});
 const v=await r;assert.equal(v.status,'blocked');assert.deepEqual(v.comments,[]);
});

function sendFrame(socket, value){
 const data=Buffer.from(JSON.stringify(value));let prefix;
 if(data.length<126){prefix=Buffer.from([0x81,data.length])}
 else if(data.length<=65535){prefix=Buffer.alloc(4);prefix[0]=0x81;prefix[1]=126;prefix.writeUInt16BE(data.length,2)}
 else{prefix=Buffer.alloc(10);prefix[0]=0x81;prefix[1]=127;prefix.writeBigUInt64BE(BigInt(data.length),2)}
 socket.write(Buffer.concat([prefix,data]));
}
function receiveWebSocket(socket,onMessage){
 let chunks=Buffer.alloc(0);
 socket.on('data',buf=>{
  chunks=Buffer.concat([chunks,buf]);
  while(chunks.length>=2){
   const marker=chunks[1];const masked=!!(marker&0x80);let n=marker&0x7f,offset=2;
   if(n===126){if(chunks.length<4)return;n=chunks.readUInt16BE(2);offset=4}
   if(n===127){if(chunks.length<10)return;n=Number(chunks.readBigUInt64BE(2));offset=10}
   if(chunks.length<offset+(masked?4:0)+n)return;
   const mask=masked?chunks.subarray(offset,offset+4):null;
   if(mask)offset+=4;
   const body=Buffer.from(chunks.subarray(offset,offset+n));
   if(mask)for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
   chunks=chunks.subarray(offset+n);
   if((chunks[0]&0x0f)===8)continue;
   try{onMessage(JSON.parse(body.toString('utf8')))}catch{}
  }
 });
}
async function withCDPServer(handler,fn){
 const received=[];
 const upgradedSockets=new Set();
 const server=http.createServer((req,res)=>{res.statusCode=404;res.end('not found')});
 server.on('upgrade',(req,socket)=>{
  upgradedSockets.add(socket);socket.on('close',()=>upgradedSockets.delete(socket));
  const key=req.headers['sec-websocket-key'];
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  receiveWebSocket(socket,packet=>{received.push(packet);sendFrame(socket,handler(packet))});
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{await fn(server.address().port,received)}finally{for(const socket of upgradedSockets)socket.destroy();await new Promise(ok=>server.close(ok))}
}
test('real built-in Node WebSocket connects to local CDP wire protocol with ONE read-only Runtime.evaluate',async()=>{
 await withCDPServer(packet=>({id:packet.id,result:{result:{type:'object',value:{label:'deepseek-douyin-api',origin:'https://www.douyin.com',path:'/video/'+id}}}}),async(port,received)=>{
  const t={...target(),webSocketDebuggerUrl:`ws://127.0.0.1:${port}/devtools/page/ABCDEF1234567890`};
  const value=await cdpEval(t,ownershipExpression(),{port,timeoutMs:2000});
  assert.equal(value.label,'deepseek-douyin-api');
  assert.equal(received.length,1);assert.equal(received[0].method,'Runtime.evaluate');
  assert.equal(received[0].params.expression,ownershipExpression());
  assert.equal(received[0].params.userGesture,false);
 });
});
