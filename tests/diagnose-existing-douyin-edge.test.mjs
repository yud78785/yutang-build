import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseDiagnosticArgs, localHostPaths, verifyHostRecord, exactVideoRoute,
  socketPortProbe, diagnoseExistingDouyinEdge,
} from '../tools/diagnose-existing-douyin-edge.mjs';

const vid = '7512345678901234567';
const home = 'C:\\Users\\isolated';
const now = 1794800000000;
const paths = localHostPaths(home);
const record = { pid: 999900, port: 9227, profile: paths.dedicatedProfile, ready: true,
  startedAt: now - 1000, instanceId: '1cf72b87-2dd3-45b0-9fad-bf21082fca44' };
const good = {
  argv: ['--video-id', vid], platform: 'win32', home, now,
  readState: () => JSON.stringify(record), isAlive: () => true,
  birthTime: async () => now - 2500,
  portProbe: async () => false,
};
const fakeFetch = async () => ({ ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ Browser: 'Edg/157.0.0.0' }) });

async function withHttp(handler, cb) {
  const requests = [];
  const server = http.createServer((req,res) => {
    requests.push({ method: req.method, url: req.url });
    const payload = handler(req);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${server.address().port}`;
  const fetcher = (url,opts) => fetch(url.replace('http://127.0.0.1:9227', target), opts);
  try { await cb(fetcher, requests, server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('read-only CLI accepts zero arguments or one numeric video-id only', () => {
  assert.deepEqual(parseDiagnosticArgs([]), { ok: true, videoId: null });
  assert.deepEqual(parseDiagnosticArgs(['--video-id',vid]), { ok: true, videoId: vid });
  for (const bad of [ ['--video-id'], ['--video-id','abc'],['--video-id',"123');alert(1)//"],
    ['--help'],['--video-id',vid,'--verbose'],['--video-id',vid,'--video-id',vid] ])
    assert.equal(parseDiagnosticArgs(bad).ok, false);
});
test('upstream Windows control and dedicated profile paths match real runtime-paths.mjs', () => {
  assert.equal(paths.stateFile, 'C:\\Users\\isolated\\.dsh\\douyin-browser\\control\\browser.json');
  assert.equal(paths.dedicatedProfile, 'C:\\Users\\isolated\\.dsh\\douyin-browser\\cli-profile');
});
test('record must match upstream exact port, profile, readiness and instance ID', () => {
  assert.equal(verifyHostRecord(record,paths.dedicatedProfile,now),true);
  for (const change of [{port:9222},{ready:false},{profile:'C:\\Users\\isolated\\AppData\\Local\\Microsoft\\Edge\\User Data'},
    {pid:0},{instanceId:'BAD'},{startedAt:now+50000}])
    assert.equal(verifyHostRecord({...record,...change},paths.dedicatedProfile,now),false);
});
test('video metadata comparator accepts exact route but refuses related and foreign URLs', () => {
  assert.equal(exactVideoRoute(`https://www.douyin.com/video/${vid}`,vid),true);
  assert.equal(exactVideoRoute(`https://www.douyin.com/video/${vid}?modal_id=${vid}`,vid),true);
  for (const url of [`https://www.douyin.com/video/${vid}#comment`, `https://www.douyin.com/video/${vid}?modal_id=123`,
    `https://www.douyin.com/video/${vid}?aweme_id=123`, `https://www.douyin.com.evil.example/video/${vid}`,
    `http://www.douyin.com/video/${vid}`, `https://www.douyin.com/video/${vid}/comments`])
    assert.equal(exactVideoRoute(url,vid),false,url);
});
test('Linux host is blocked before reading any local owner file', async () => {
  let called = 0;
  const r = await diagnoseExistingDouyinEdge({...good,platform:'linux',readState:()=>{called++;throw Error('unsafe')}});
  assert.equal(r.reasonCode,'WINDOWS_REQUIRED');assert.equal(called,0);
});
test('missing owner record identifies a free port without claiming Edge is running',async()=>{
  const r=await diagnoseExistingDouyinEdge({...good,readState:()=>{throw Error('ENOENT')},portProbe:async()=>false});
  assert.equal(r.reasonCode,'DEDICATED_BROWSER_NOT_RUNNING');assert.equal(r.browserStartedByProbe,false);
});
test('missing record and open localhost port reports foreign/unverified, not Edge',async()=>{
  const r=await diagnoseExistingDouyinEdge({...good,readState:()=>{throw Error('ENOENT')},portProbe:async()=>true});
  assert.equal(r.reasonCode,'PORT_OCCUPIED_OWNER_UNVERIFIED');assert.equal(r.cdpEndpointReachable,undefined);
});
test('unverified record cannot trigger HTTP requests or expose its raw paths',async()=>{
  let fetched=0;const bad={...record,profile:'C:\\Users\\private\\Chrome\\Profile'};
  const r=await diagnoseExistingDouyinEdge({...good,readState:()=>JSON.stringify(bad),fetcher:async()=>{fetched++;throw Error('read foreign browser')}});
  assert.equal(r.reasonCode,'DEDICATED_OWNER_RECORD_UNVERIFIED');assert.equal(fetched,0);
  assert.doesNotMatch(JSON.stringify(r),/private|isolated|Chrome|9227/);
});
test('PID not alive fails without any local HTTP request',async()=>{
  let fetched=0;
  const r=await diagnoseExistingDouyinEdge({...good,isAlive:()=>false,fetcher:async()=>{fetched++;return fakeFetch()}});
  assert.equal(r.reasonCode,'DEDICATED_HOST_PROCESS_NOT_RUNNING');assert.equal(fetched,0);
});
test('PID reuse or unverified start time stops before CDP network reads',async()=>{
  for (const birthTime of [async()=>now+5000,async()=>null]) {
    let fetched=0;
    const r=await diagnoseExistingDouyinEdge({...good,birthTime,fetcher:async()=>{fetched++;return fakeFetch()}});
    assert.equal(r.status,'blocked');assert.equal(fetched,0);
  }
});
test('real local HTTP endpoint: verified Edge host without requested video is readiness only',async()=>{
  await withHttp(()=>({Browser:'Edg/157.0.0.0'}),async(fetcher,requests)=>{
    const r=await diagnoseExistingDouyinEdge({...good,argv:[],fetcher});
    assert.equal(r.status,'edge_host_ready');assert.equal(r.dedicatedHostIdentityVerified,true);
    assert.equal(r.commentsVerified,false);assert.equal(r.targetTabOwnershipVerified,false);
    assert.deepEqual(requests,[{method:'GET',url:'/json/version'}]);
  });
});
test('real loopback HTTP: first-party target video listed once but DOM and ownership UNVERIFIED',async()=>{
  await withHttp(req=>req.url==='/json/version'?{Browser:'Edg/157.0.0.0'}:[
    {type:'page',url:`https://www.douyin.com/video/${vid}`},
    {type:'page',url:'https://private.example/account?secret=DO_NOT_LEAK'}],async(fetcher,requests)=>{
    const r=await diagnoseExistingDouyinEdge({...good,fetcher});
    assert.equal(r.status,'target_video_metadata_seen');assert.equal(r.videoId,vid);
    assert.equal(r.targetVideoTabCount,1);assert.equal(r.targetTabOwnershipVerified,false);
    assert.equal(r.commentsVerified,false);assert.equal(r.browserPageContentReadByProbe,false);
    assert.deepEqual(requests.map(x=>x.url),['/json/version','/json/list']);
    assert.doesNotMatch(JSON.stringify(r),/DO_NOT_LEAK|private|secret/);
  });
});
test('zero or duplicate candidate video tabs are not success',async()=>{
  for (const count of [0,2]) await withHttp(req=>req.url==='/json/version'?{Browser:'Edg/157.0.0.0'}:
    Array.from({length:count},()=>({type:'page',url:`https://www.douyin.com/video/${vid}`})),async fetcher=>{
      const r=await diagnoseExistingDouyinEdge({...good,fetcher});
      assert.equal(r.status,'blocked');assert.equal(r.reasonCode,count?'TARGET_VIDEO_TAB_AMBIGUOUS':'TARGET_VIDEO_TAB_NOT_FOUND');
    });
});
test('unrecognized browser version or malformed target list fail closed',async()=>{
  await withHttp(()=>({Browser:'Other/123'}),async fetcher=>{
    const r=await diagnoseExistingDouyinEdge({...good,fetcher});
    assert.equal(r.reasonCode,'DEDICATED_CDP_VERSION_UNVERIFIED');
  });
  await withHttp(req=>req.url==='/json/version'?{Browser:'Edg/157.0.0.0'}:{items:[]},async fetcher=>{
    const r=await diagnoseExistingDouyinEdge({...good,fetcher});
    assert.equal(r.reasonCode,'CDP_TARGET_LIST_UNVERIFIED');
  });
});
test('actual port probe connects only to the loopback host, without web requests',async()=>{
  await withHttp(()=>({}),async(_fetcher,_requests,port)=>{
    assert.equal(await socketPortProbe(port),true);
  });
});
test('actual CLI when run off Windows exits 2 and returns sanitized blocked JSON',()=>{
  if(process.platform==='win32')return;
  const script=join(dirname(fileURLToPath(import.meta.url)),'../tools/diagnose-existing-douyin-edge.mjs');
  let error;
  try {execFileSync(process.execPath,[script,'--video-id',vid],{timeout:3000,encoding:'utf8'});}catch(e){error=e;}
  assert.ok(error);assert.equal(error.status,2);
  const value=JSON.parse(error.stdout);assert.equal(value.reasonCode,'WINDOWS_REQUIRED');
  assert.equal(value.browserStartedByProbe,false);
});
