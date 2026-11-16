// Read visible public comments from an ALREADY OPEN upstream-owned Douyin video
// tab in the ALREADY RUNNING dedicated Edge profile. No npm, launch, login,
// navigation, click, scroll, fetch to Douyin, post, or file write.
// One fixed, read-only CDP Runtime.evaluate expression, never user-supplied JS.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {diagnoseExistingDouyinEdge, exactVideoRoute, localHostPaths, parseDiagnosticArgs} from './diagnose-existing-douyin-edge.mjs';

const PORT = 9227;
const OWNER_LABELS = new Set(['deepseek-douyin-api', 'deepseek-douyin-dsh']);
const MAX_COMMENTS = 12;
const MAX_TARGETS = 30;
const TARGET_ID = /^[A-Za-z0-9_-]{8,100}$/;

function result(status, reasonCode, videoId, extra={}) {
  return {status, reasonCode, videoId, source:'existing_dedicated_edge_visible_dom',
    observationScope:'currently_visible_loaded_public_comment_rows_only',
    comments:[], visibleCommentCount:0, aiSummaryGenerated:false, aiSummaryText:null,
    browserStartedByProbe:false, browserNavigatedByProbe:false, clickedByProbe:false,
    networkRequestsToDouyinByProbe:false, persistentDataModifiedByProbe:false,
    ...extra};
}

export function isUpstreamCandidateUrl(value) {
  if(typeof value!=='string') return false;
  if(value==='about:blank'||value.startsWith('about:blank#')) return true;
  try {
    const u=new URL(value);
    if(u.username||u.password||u.hash) return false;
    return u.origin==='https://www.douyin.com' ||
      (u.origin==='https://live.douyin.com'&&/^\/\d{4,30}\/?$/.test(u.pathname));
  }catch{return false;}
}
export function safeTarget(t,port=PORT) {
  if(!t||t.type!=='page'||typeof t.id!=='string'||!TARGET_ID.test(t.id)||
    typeof t.url!=='string'||typeof t.webSocketDebuggerUrl!=='string') return false;
  try {
    const u=new URL(t.webSocketDebuggerUrl);
    return u.protocol==='ws:' && ['127.0.0.1','localhost'].includes(u.hostname) &&
      u.port===String(port) && u.pathname===`/devtools/page/${t.id}` && !u.username && !u.password &&
      !u.search && !u.hash;
  }catch{return false;}
}

// Only reads page ownership metadata. No DOM or contents from non-video tabs.
export function ownershipExpression() {
  return "(()=>({label:typeof window.name==='string'?window.name:null,origin:location.origin,path:location.pathname}))()";
}
export function commentExpression(videoId,limit=MAX_COMMENTS) {
  if(!/^\d{10,30}$/.test(videoId||'')||!Number.isInteger(limit)||limit<1||limit>MAX_COMMENTS)
    throw Error('INVALID_VIDEO_OR_LIMIT');
  return `(()=>{
    const id=${JSON.stringify(videoId)};
    const blocked=reasonCode=>({status:'blocked',reasonCode,videoId:id,comments:[]});
    const pageOk=()=>{try{const u=new URL(location.href);
      return u.origin==='https://www.douyin.com'&&!u.username&&!u.password&&!u.hash&&
        u.pathname==='/video/'+id&&['modal_id','aweme_id'].every(k=>u.searchParams.getAll(k).every(v=>v===id));
      }catch{return false;}};
    if(!pageOk())return blocked('VIDEO_ROUTE_CHANGED');
    if(!['deepseek-douyin-api','deepseek-douyin-dsh'].includes(window.name))return blocked('TAB_NOT_UPSTREAM_OWNED');
    const visible=e=>{if(!e||!e.getBoundingClientRect)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&
        s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;};
    if([...document.querySelectorAll('[data-e2e="im-dialog"],#captcha_container,[id^="captcha_container"],[data-e2e="captcha-container"]')].some(visible))return blocked('PRIVATE_OR_VERIFICATION_OVERLAY');
    const media=[...document.querySelectorAll('video')].filter(e=>visible(e)&&!e.closest('[data-e2e="im-dialog"]'));
    if(media.length!==1||media[0].readyState<2)return blocked('SINGLE_READY_VIDEO_NOT_VERIFIED');
    const player=media[0].closest('[data-e2e="player-container"]');
    const playerId=/(?:^|\\s)video_(\\d+)(?:\\s|$)/.exec(player?.className||'')?.[1];
    if(playerId&&playerId!==id)return blocked('PLAYER_VIDEO_ID_MISMATCH');
    const all=[...document.querySelectorAll('[data-e2e="comment-item"]')];
    if(all.length>100)return blocked('COMMENT_ROW_LIMIT_EXCEEDED');
    const comments=[],seen=new Set();
    for(const row of all){
      if(!visible(row)||row.closest('[data-e2e="im-dialog"]')||row.parentElement?.closest('[data-e2e="comment-item"]'))continue;
      const bound=row.closest('[data-aweme-id],[data-video-id]');
      const attached=bound?.getAttribute('data-aweme-id')||bound?.getAttribute('data-video-id');
      if(attached&&attached!==id)return blocked('CROSS_VIDEO_COMMENT_ROW');
      if(['sending','pending','reviewing','failed','rejected','error'].includes(row.getAttribute('data-send-status'))||
         ['sending','pending','reviewing','failed','rejected','error'].includes(row.getAttribute('data-comment-status')))continue;
      const nodes=[...row.querySelectorAll('[data-e2e="comment-content"],.comment-item-content,.FduGc_lz > .Sh1Da424')]
        .filter(e=>e.closest('[data-e2e="comment-item"]')===row);
      if(nodes.length!==1||!visible(nodes[0]))continue;
      const original=nodes[0].innerText;
      if(typeof original!=='string'||original.length>512)continue;
      const text=original.replace(/[\\u0000-\\u001f\\u007f]/g,'').trim().slice(0,120);
      if(!text)continue;
      const ids=[row.getAttribute('data-comment-id'),/^comment_(\\d+)$/.exec(row.id||'')?.[1]].filter(Boolean);
      const cid=new Set(ids).size===1&&/^\\d{1,64}$/.test(ids[0])?ids[0]:null;
      const key=cid?'id:'+cid:'text:'+text;
      if(seen.has(key))continue;
      seen.add(key);
      if(comments.length<${limit})comments.push({commentId:cid,text});
    }
    if(!pageOk())return blocked('VIDEO_ROUTE_CHANGED');
    return {status:comments.length?'ok':'no_visible_comments',reasonCode:comments.length?null:'COMMENTS_NOT_VISIBLE_OR_NOT_LOADED',videoId:id,comments};
  })()`;
}

// CDP target URLs come only from a verified localhost /json/list, and are
// reconstructed rather than taken directly from untrusted target metadata.
export async function cdpEval(t, expression, {port=PORT,makeSocket=(url)=>new WebSocket(url),timeoutMs=2800}={}) {
  if(!safeTarget(t,port)||typeof expression!=='string'||expression.length>12500)throw Error('CDP_TARGET_NOT_SAFE');
  const endpoint=`ws://127.0.0.1:${port}/devtools/page/${t.id}`;
  const socket=makeSocket(endpoint);
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{clearTimeout(timer);try{socket.close()}catch{}};
    const done=(error,value)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value)};
    const timer=setTimeout(()=>done(Error('CDP_EVAL_TIMEOUT')),timeoutMs);
    socket.addEventListener('open',()=>{
      try{socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:false,silent:true,includeCommandLineAPI:false,userGesture:false}}))}
      catch{done(Error('CDP_SEND_FAILED'))}
    },{once:true});
    socket.addEventListener('error',()=>done(Error('CDP_SOCKET_FAILURE')),{once:true});
    socket.addEventListener('close',()=>done(Error('CDP_SOCKET_CLOSED')),{once:true});
    socket.addEventListener('message',event=>{
      try{
        if(typeof event.data!=='string'||event.data.length>16384)return done(Error('CDP_RESULT_TOO_LARGE'));
        const message=JSON.parse(event.data);
        if(message.id!==1)return;
        if(message.error||message.result?.exceptionDetails||message.result?.result?.value===undefined)
          return done(Error('CDP_EVAL_NOT_VERIFIED'));
        done(null,message.result.result.value);
      }catch{done(Error('CDP_EVAL_MALFORMED'))}
    });
  });
}

export async function listLocalTargets({fetcher=globalThis.fetch,port=PORT}={}) {
  const reply=await fetcher(`http://127.0.0.1:${port}/json/list`,{redirect:'error',signal:AbortSignal.timeout(1500)});
  if(!reply?.ok)return null;
  if(Number(reply.headers?.get?.('content-length')||0)>131072)return null;
  const body=await reply.text();
  if(typeof body!=='string'||body.length>131072)return null;
  const data=JSON.parse(body);
  if(!Array.isArray(data)||data.length>100||data.some(x=>!x||typeof x!=='object'))return null;
  return data.filter(x=>x.type==='page');
}

async function ownedTargetScan(targets,videoId,{evalTarget,port}) {
  if(!Array.isArray(targets)||targets.length>100)return {ok:false,reasonCode:'CDP_TARGET_LIST_UNVERIFIED'};
  const candidates=targets.filter(x=>isUpstreamCandidateUrl(x.url));
  if(candidates.length>MAX_TARGETS)return {ok:false,reasonCode:'TOO_MANY_ELIGIBLE_TABS'};
  const matched=[];
  for(const tab of candidates){
    if(!safeTarget(tab,port))return {ok:false,reasonCode:'CDP_TARGET_UNVERIFIED'};
    let v;
    try{v=await evalTarget(tab,ownershipExpression(),{port})}catch{return {ok:false,reasonCode:'TAB_OWNERSHIP_READ_FAILED'}};
    if(!v||typeof v!=='object'||typeof v.label!=='string')return {ok:false,reasonCode:'TAB_OWNERSHIP_UNVERIFIED'};
    if(OWNER_LABELS.has(v.label)){
      if(tab.url===`about:blank`||tab.url.startsWith('about:blank#')){
        if(v.origin!=='null'||v.path!=='blank')return {ok:false,reasonCode:'TAB_METADATA_CHANGED'};
      }else{
        try{const u=new URL(tab.url);if(v.origin!==u.origin||v.path!==u.pathname)return {ok:false,reasonCode:'TAB_METADATA_CHANGED'}}catch{return {ok:false,reasonCode:'TAB_METADATA_CHANGED'}}
      }
      matched.push(tab);
    }
  }
  if(matched.length!==1)return {ok:false,reasonCode:matched.length?'MULTIPLE_UPSTREAM_OWNED_TABS':'NO_UPSTREAM_OWNED_TAB'};
  const tab=matched[0];
  if(!exactVideoRoute(tab.url,videoId))return {ok:false,reasonCode:'OWNED_TAB_NOT_TARGET_VIDEO'};
  return {ok:true,tab};
}

export function validateVisibleReceipt(v,videoId) {
  if(!v||typeof v!=='object'||Array.isArray(v)||v.videoId!==videoId||!Array.isArray(v.comments)||v.comments.length>MAX_COMMENTS||
    !['ok','no_visible_comments'].includes(v.status))return result('blocked','CDP_COMMENT_RESULT_INVALID',videoId);
  if(v.status==='no_visible_comments'){
    if(v.comments.length||v.reasonCode!=='COMMENTS_NOT_VISIBLE_OR_NOT_LOADED')return result('blocked','CDP_COMMENT_RESULT_INVALID',videoId);
    return result('no_visible_evidence','COMMENTS_NOT_VISIBLE_OR_NOT_LOADED',videoId);
  }
  if(v.comments.length===0)return result('blocked','CDP_COMMENT_RESULT_INVALID',videoId);
  const comments=[],seen=new Set();
  for(const c of v.comments){
    if(!c||typeof c!=='object'||Array.isArray(c)||
       (c.commentId!==null&&(typeof c.commentId!=='string'||!/^\d{1,64}$/.test(c.commentId)))||
       typeof c.text!=='string'||!c.text.trim()||c.text.length>120||/[\u0000-\u001f\u007f]/.test(c.text))
       return result('blocked','CDP_COMMENT_RESULT_INVALID',videoId);
    const key=c.commentId?'id:'+c.commentId:'text:'+c.text;
    if(seen.has(key))return result('blocked','CDP_COMMENT_RESULT_INVALID',videoId);
    seen.add(key);comments.push({commentId:c.commentId,text:c.text});
  }
  return result('read_only_evidence',null,videoId,{comments,visibleCommentCount:comments.length});
}

export async function readExistingDouyinComments({argv=process.argv.slice(2),
  preflight=diagnoseExistingDouyinEdge, targets=listLocalTargets, evalTarget=cdpEval,
  lockCheck=({home=os.homedir()}={})=>{
    const file=path.win32.join(path.win32.dirname(localHostPaths(home).stateFile),'tab-api.lock');
    try{return !fs.existsSync(file)}catch{return false}
  }, port=PORT}={}) {
  const args=parseDiagnosticArgs(argv);
  if(!args.ok||!args.videoId)return result('blocked','VIDEO_ID_REQUIRED',null);
  let initial;
  try{initial=await preflight({argv})}catch{return result('blocked','DEDICATED_EDGE_PREFLIGHT_FAILED',args.videoId)}
  if(initial?.status!=='target_video_metadata_seen')return result('blocked',initial?.reasonCode||'DEDICATED_EDGE_NOT_READY',args.videoId);
  if(!lockCheck())return result('blocked','UPSTREAM_BROWSER_LOCK_PRESENT',args.videoId);
  let before;
  try{before=await targets({port})}catch{return result('blocked','CDP_TARGET_LIST_FAILED',args.videoId)}
  const scan=await ownedTargetScan(before,args.videoId,{evalTarget,port});
  if(!scan.ok)return result('blocked',scan.reasonCode,args.videoId);
  let found;
  try{found=await evalTarget(scan.tab,commentExpression(args.videoId),{port})}catch{return result('blocked','COMMENT_DOM_EVALUATION_FAILED',args.videoId)}
  if(found?.status==='blocked')return result('blocked',
    ['VIDEO_ROUTE_CHANGED','TAB_NOT_UPSTREAM_OWNED','PRIVATE_OR_VERIFICATION_OVERLAY','SINGLE_READY_VIDEO_NOT_VERIFIED',
     'PLAYER_VIDEO_ID_MISMATCH','COMMENT_ROW_LIMIT_EXCEEDED','CROSS_VIDEO_COMMENT_ROW'].includes(found.reasonCode)?found.reasonCode:'COMMENT_DOM_NOT_VERIFIED',args.videoId);
  let final;
  try{final=await targets({port})}catch{return result('blocked','FINAL_CDP_TARGET_LIST_FAILED',args.videoId)}
  const ending=await ownedTargetScan(final,args.videoId,{evalTarget,port});
  if(!ending.ok||ending.tab.id!==scan.tab.id)return result('blocked','OWNED_TAB_CHANGED_WHILE_READING',args.videoId);
  if(!lockCheck())return result('blocked','UPSTREAM_BROWSER_LOCK_APPEARED',args.videoId);
  try {const after=await preflight({argv});
    if(after?.status!=='target_video_metadata_seen')return result('blocked','DEDICATED_HOST_CHANGED_WHILE_READING',args.videoId);
  }catch{return result('blocked','DEDICATED_HOST_CHANGED_WHILE_READING',args.videoId)}
  return validateVisibleReceipt(found,args.videoId);
}

const isEntry=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isEntry)void readExistingDouyinComments().then(r=>{
  process.stdout.write(JSON.stringify(r)+'\n',()=>process.exit(r.status==='read_only_evidence'?0:2));
},()=>process.stdout.write(JSON.stringify(result('blocked','UNEXPECTED_READ_FAILURE',null))+'\n',()=>process.exit(2)));
