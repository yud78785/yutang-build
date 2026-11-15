#!/usr/bin/env node
'use strict';
// Optional, get-only facade for the UNMODIFIED, MIT-licensed Yht20927/douyin-cli
// BridgeClient. Do NOT import upstream get.js: it writes users/comments to SQLite.
// No login, browser launch, post, like, DM, audit log, DB or persistent writes.
const { BridgeClient } = require('../third_party/Yht20927-douyin-cli-20261113/lib/client/bridge-client.js');

const SITE = 'douyin.com';
const PROTOCOL_VERSION = 3; // upstream lib/commands/helpers.js CLIENT_PROTOCOL_VERSION
const VIDEO_ID = /^\d{10,30}$/;
const ACCOUNT_ID = /^\d{5,30}$/;
const COMMENT_ID = /^\d{1,64}$/;
const MAX_COMMENTS = 20;
const BRIDGE_TIMEOUT_MS = 15000;

function blocked(reasonCode, videoId = null) {
  return {status: 'blocked', reasonCode, videoId, source: 'upstream_mit_bridgeclient_readonly', comments: [], readOnlyCommand: true};
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || argv.length > 5) return {ok:false, reasonCode:'ARGS_INVALID'};
  const videoId = argv[0];
  if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return {ok:false, reasonCode:'VIDEO_ID_INVALID'};
  let count=10, account=null;
  const seen=new Set();
  for (let i=1; i<argv.length; i+=2) {
    const key=argv[i], value=argv[i+1];
    if (seen.has(key) || typeof value!=='string') return {ok:false, reasonCode:'ARGS_INVALID'};
    seen.add(key);
    if(key==='--count' && /^[1-9]\d?$/.test(value) && Number(value)<=MAX_COMMENTS) count=Number(value);
    else if(key==='--account' && ACCOUNT_ID.test(value)) account=value;
    else return {ok:false,reasonCode:'ARGS_INVALID'};
  }
  return {ok:true,videoId,count,account};
}

function parseBridgeConfig(env) {
  const token=env?.YUTANG_DOUYIN_BRIDGE_TOKEN;
  const portStr=env?.YUTANG_DOUYIN_BRIDGE_PORT ?? '19422';
  if(typeof token!=='string' || token.length<16 || token.length>256 || /\s/.test(token))
    return {ok:false,reasonCode:'BRIDGE_TOKEN_REQUIRED'};
  if(typeof portStr!=='string'|| !/^[1-9]\d{0,4}$/.test(portStr) || Number(portStr)>65535)
    return {ok:false,reasonCode:'BRIDGE_PORT_INVALID'};
  return {ok:true,token,port:Number(portStr)};
}

function isVideoUrl(raw, videoId) {
  try {
    const url=new URL(raw);
    if(url.origin!=='https://www.douyin.com' || url.username || url.password || url.hash ||
       url.pathname!==`/video/${videoId}`) return false;
    for (const key of ['aweme_id','modal_id']) {
      for(const value of url.searchParams.getAll(key)) if(value!==videoId) return false;
    }
    return true;
  } catch {return false;}
}

function selectUpstreamConnection(status, videoId, desiredAccount=null) {
  if(!status || status.ok!==true || typeof status.connections!=='object'||
     !status.connections || Array.isArray(status.connections) ||
     typeof status.accounts!=='object' || !status.accounts || Array.isArray(status.accounts))
    return {ok:false,reasonCode:'UPSTREAM_STATUS_INVALID'};
  const group=status.connections[SITE];
  const accountGroup=status.accounts[SITE];
  if(!Array.isArray(group) || !Array.isArray(accountGroup))
    return {ok:false,reasonCode:'NO_DOUYIN_CONNECTION'};
  const alive=group.filter(c=>c?.alive===true);
  if (desiredAccount===null && alive.length!==1) return {ok:false,reasonCode:'ACCOUNT_SELECTION_REQUIRED'};
  const matching=alive.filter(c=>desiredAccount===null || c.account===desiredAccount);
  if (matching.length!==1) return {ok:false,reasonCode:'TARGET_ACCOUNT_NOT_UNIQUE'};
  const tab=matching[0];
  if (typeof tab.account!=='string' || !ACCOUNT_ID.test(tab.account) ||
      typeof tab.id!=='string'||!tab.id ||
      tab.channel!==`${SITE}#${tab.account}`) return {ok:false,reasonCode:'ACCOUNT_IDENTITY_UNVERIFIED'};
  if(tab.clientVersion!==PROTOCOL_VERSION) return {ok:false,reasonCode:'UPSTREAM_USERSCRIPT_VERSION_MISMATCH'};
  if(!isVideoUrl(tab.url,videoId)) return {ok:false,reasonCode:'TARGET_VIDEO_ROUTE_MISMATCH'};
  const identities=accountGroup.filter(a=>a?.account===tab.account && a?.alive===true &&
    a?.channel===tab.channel && a?.connId===tab.id && a?.clientVersion===PROTOCOL_VERSION);
  if(identities.length!==1) return {ok:false,reasonCode:'ACCOUNT_STATUS_CONFLICT'};
  return {ok:true,account:tab.account};
}

function makeReadOnlyExpression(videoId,count) {
  if(!VIDEO_ID.test(videoId)||!Number.isInteger(count)||count<1||count>MAX_COMMENTS)
    throw new TypeError('INVALID_READ_QUERY');
  // Only digits are embedded. All raw API data stay INSIDE the existing page;
  // only bounded public comment IDs and texts are returned via the Bridge.
  return `(async()=>{
    const id=${JSON.stringify(videoId)};
    const target=()=>{
      try {
        const u=new URL(location.href);
        return u.origin==='https://www.douyin.com'&&!u.username&&!u.password&&!u.hash&&
          u.pathname==='/video/'+id&&['modal_id','aweme_id'].every(k=>u.searchParams.getAll(k).every(v=>v===id));
      } catch{return false;}
    };
    if(!target())return {tag:'yt_readonly_v1',status:'route_mismatch',videoId:id,comments:[]};
    const api=window.__bridge;
    if(!api || typeof api.getComments!=='function')
      return {tag:'yt_readonly_v1',status:'bridge_get_unavailable',videoId:id,comments:[]};
    const data=await api.getComments(id,0,${count});
    if(!target())return {tag:'yt_readonly_v1',status:'route_mismatch',videoId:id,comments:[]};
    if(!data || data.status_code!==0 || !Array.isArray(data.comments)||data.comments.length>${count})
      return {tag:'yt_readonly_v1',status:'api_invalid',videoId:id,comments:[]};
    const comments=[],seen=new Set();
    for(const row of data.comments){
      if(!row || typeof row.cid!=='string' || !/^\\d{1,64}$/.test(row.cid) ||
         (row.aweme_id!=null && row.aweme_id!==id) ||
         typeof row.text!=='string' || row.text.length>512 || seen.has(row.cid))
        return {tag:'yt_readonly_v1',status:'api_invalid',videoId:id,comments:[]};
      seen.add(row.cid);
      const text=row.text.replace(/[\\u0000-\\u001f\\u007f]/g,'').trim().slice(0,120);
      if(text)comments.push({commentId:row.cid,text});
    }
    return {tag:'yt_readonly_v1',status:'ok',videoId:id,comments};
  })()`;
}

function validateReadResult(response, videoId, account, count) {
  if (!response || response.ok!==true) return blocked('UPSTREAM_BRIDGE_CALL_FAILED',videoId);
  if (response.account!==account || (response.channel!=null && response.channel!==`${SITE}#${account}`))
    return blocked('UPSTREAM_ACCOUNT_RESPONSE_MISMATCH',videoId);
  const v=response.value;
  if (!v || v.tag!=='yt_readonly_v1' || v.videoId!==videoId || !Array.isArray(v.comments))
    return blocked('UPSTREAM_GET_RESULT_INVALID',videoId);
  if(v.status==='route_mismatch') return blocked('LIVE_VIDEO_ROUTE_CHANGED',videoId);
  if(v.status==='bridge_get_unavailable') return blocked('UPSTREAM_GET_UNAVAILABLE',videoId);
  if(v.status==='api_invalid') return blocked('UPSTREAM_COMMENT_API_REJECTED',videoId);
  if(v.status!=='ok' || v.comments.length>count) return blocked('UPSTREAM_GET_RESULT_INVALID',videoId);
  const rows=[],seen=new Set();
  for(const c of v.comments) {
    if(!c || typeof c.commentId!=='string' || !COMMENT_ID.test(c.commentId) ||
       typeof c.text!=='string' || c.text.length>120 || /[\u0000-\u001f\u007f]/.test(c.text) || seen.has(c.commentId))
      return blocked('UPSTREAM_GET_RESULT_INVALID',videoId);
    seen.add(c.commentId);
    rows.push({commentId:c.commentId,text:c.text});
  }
  if(rows.length===0) return blocked('NO_PUBLIC_COMMENTS_RETURNED',videoId);
  return {status:'ok',source:'upstream_mit_bridgeclient_readonly',videoId,
    observationScope:'first_page_api_only_not_verified_visible_dom',count:rows.length,comments:rows,
    readOnlyCommand:true};
}

async function run({argv=process.argv.slice(2),env=process.env,
  makeClient=opts=>new BridgeClient(opts)}={}) {
  const args=parseArgs(argv);
  if(!args.ok)return blocked(args.reasonCode);
  const cfg=parseBridgeConfig(env);
  if(!cfg.ok)return blocked(cfg.reasonCode,args.videoId);
  try {
    const client=makeClient({host:'127.0.0.1',port:cfg.port,token:cfg.token});
    if(typeof client?.status!=='function'||typeof client?.call!=='function')
      return blocked('UPSTREAM_CLIENT_UNAVAILABLE',args.videoId);
    let status;
    try{status=await client.status();}
    catch{return blocked('UPSTREAM_SERVER_UNREACHABLE',args.videoId);}
    const selected=selectUpstreamConnection(status,args.videoId,args.account);
    if(!selected.ok)return blocked(selected.reasonCode,args.videoId);
    const resp=await client.call({site:SITE,account:selected.account,opType:'read',
      noThrottle:false,awaitPromise:true,timeout:BRIDGE_TIMEOUT_MS,
      expression:makeReadOnlyExpression(args.videoId,args.count)});
    return validateReadResult(resp,args.videoId,selected.account,args.count);
  }catch{return blocked('UPSTREAM_GET_REQUEST_FAILED',args.videoId);}
}

module.exports={run,parseArgs,parseBridgeConfig,isVideoUrl,selectUpstreamConnection,makeReadOnlyExpression,validateReadResult};
if(require.main===module) {
  void run().then(result=>process.stdout.write(JSON.stringify(result)+'\n',()=>process.exit(result.status==='ok'?0:2)),
    ()=>process.stdout.write(JSON.stringify(blocked('UNEXPECTED_FAILURE'))+'\n',()=>process.exit(2)));
}
