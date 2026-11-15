#!/usr/bin/env node
'use strict';
// Read-only facade around UNMODIFIED MIT-vendored Douyin Comment CLI v2's get.js.
// It does not start any browser/server, install a userscript, publish comments,
// or read user profiles into its output. This command triggers ONE first-party
// GET for public comments THROUGH an already authorized Bridge connection.
// Third-party code attribution and full license are in the vendored LICENSE.
const originalGet = require('../third_party/qinuoyun-douyin-cli-v2/lib/commands/get.js');
const {BridgeClient} = require('../third_party/qinuoyun-douyin-cli-v2/lib/client/bridge-client.js');
const VIDEO_ID = /^\d{10,30}$/;
const COMMENT_ID = /^\d{1,64}$/;
const RESULT_LIMIT = 20;

function blocked(reasonCode, videoId = null) {
  return {status:'blocked',reasonCode,videoId,source:'vendored_original_get_v2',comments:[],readOnlyCommand:true};
}
function parseArgs(argv) {
  if (!Array.isArray(argv) || ![1,3].includes(argv.length)) return {ok:false,reasonCode:'ARGS_INVALID'};
  const id = argv[0];
  if (typeof id !== 'string' || !VIDEO_ID.test(id)) return {ok:false,reasonCode:'VIDEO_ID_INVALID'};
  let count = 10;
  if (argv.length === 3) {
    if (argv[1] !== '--count' || !/^[1-9]\d?$/.test(argv[2])) return {ok:false,reasonCode:'COUNT_INVALID'};
    count = Number(argv[2]);
    if (count > RESULT_LIMIT) return {ok:false,reasonCode:'COUNT_INVALID'};
  }
  return {ok:true,id,count};
}
function parseBridgeConfig(env) {
  const token=env?.YUTANG_DOUYIN_BRIDGE_TOKEN;
  if (typeof token !== 'string' || token.length < 16 || token.length > 256 || /[\r\n\s]/.test(token))
    return {ok:false,reasonCode:'BRIDGE_TOKEN_REQUIRED'};
  const inputPort=env?.YUTANG_DOUYIN_BRIDGE_PORT ?? '19422';
  if (typeof inputPort !== 'string' || !/^[1-9]\d{0,4}$/.test(inputPort) || Number(inputPort)>65535)
    return {ok:false,reasonCode:'BRIDGE_PORT_INVALID'};
  return {ok:true,token,port:Number(inputPort)};
}
function validateSingleTargetTab(status, videoId) {
  if (!status || status.ok !== true || !status.connections ||
      typeof status.connections !== 'object' || Array.isArray(status.connections))
    return {ok:false,reasonCode:'BRIDGE_STATUS_INVALID'};
  const connected = status.connections['douyin.com'];
  if (!Array.isArray(connected) || connected.length !== 1)
    return {ok:false,reasonCode:'TARGET_TAB_NOT_UNIQUE'};
  const tab = connected[0];
  if (!tab || tab.alive !== true || typeof tab.url !== 'string')
    return {ok:false,reasonCode:'TARGET_TAB_NOT_READY'};
  try {
    const url = new URL(tab.url);
    if (url.origin !== 'https://www.douyin.com' || url.username || url.password || url.hash ||
        url.pathname !== `/video/${videoId}` ||
        ['modal_id', 'aweme_id'].some(key => url.searchParams.getAll(key).some(v => v !== videoId)))
      return {ok:false,reasonCode:'TARGET_TAB_ROUTE_MISMATCH'};
  } catch { return {ok:false,reasonCode:'TARGET_TAB_ROUTE_MISMATCH'}; }
  return {ok:true};
}
function guardGetExpression(originalExpression, videoId) {
  // Original MIT get.js still constructs the exact getComments call. This
  // wrapper additionally checks the CURRENT browser URL inside page context,
  // because a registered Bridge tab URL can be stale after SPA navigation.
  return `(async()=>{const u=new URL(location.href);`+
    `if(u.origin!=='https://www.douyin.com'||u.username||u.password||u.hash||`+
    `u.pathname!=='/video/${videoId}'||`+
    `['modal_id','aweme_id'].some(k=>u.searchParams.getAll(k).some(v=>v!=='${videoId}')))`+
    `return {status_code:-1,comments:[]};return await ${originalExpression};})()`;
}
function sanitizeText(s) {return s.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,120);}
function verifyApiResponse(response, videoId, count) {
  if (!response || response.ok !== true) throw Error('BRIDGE_CALL_FAILED');
  const data=response.value;
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.status_code!==0)
    throw Error('COMMENT_API_NOT_SUCCESS');
  if (!Array.isArray(data.comments) || data.comments.length>count)
    throw Error('COMMENT_API_BAD_PAYLOAD');
  const seen = new Set();
  for(const record of data.comments) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.cid !== 'string' || !COMMENT_ID.test(record.cid) ||
        (record.aweme_id != null && record.aweme_id !== videoId) ||
        typeof record.text !== 'string' || record.text.length>512 ||
        seen.has(record.cid)) throw Error('COMMENT_API_BAD_PAYLOAD');
    seen.add(record.cid);
  }
  return data;
}

async function run({argv=process.argv.slice(2),env=process.env,makeClient=opts=>new BridgeClient(opts)}={}) {
  const options=parseArgs(argv);
  if (!options.ok) return blocked(options.reasonCode);
  const cfg=parseBridgeConfig(env);
  if (!cfg.ok) return blocked(cfg.reasonCode,options.id);
  let requests=0;
  try {
    const client=makeClient({host:'127.0.0.1',port:cfg.port,token:cfg.token});
    if (typeof client?.call!=='function' || typeof client?.status!=='function')
      return blocked('BRIDGE_STATUS_UNAVAILABLE',options.id);
    let snapshot;
    try { snapshot=await client.status(); }
    catch { return blocked('BRIDGE_STATUS_UNAVAILABLE',options.id); }
    const tabCheck=validateSingleTargetTab(snapshot,options.id);
    if (!tabCheck.ok) return blocked(tabCheck.reasonCode,options.id);
    const ctx={
      audit:{startOperation(){},endOperation(){},findLastFetchTime(){return null}},
      bridgeCall(){throw Error('REPLIES_DISABLED')},
      async loggedCall(endpoint,params,expression) {
        // Guard the only eval expression created by the original get.js.
        const expected=`window.__bridge.getComments('${options.id}', 0, ${options.count})`;
        if (requests!==0 || endpoint!=='get' || params?.aweme_id!==options.id ||
            params?.cursor!==0 || params?.count!==options.count || expression!==expected)
          throw Error('NON_GET_ACTION_REJECTED');
        requests++;
        return verifyApiResponse(await client.call({site:'douyin.com',expression:guardGetExpression(expression,options.id),awaitPromise:true,connIndex:0,timeout:15000}),options.id,options.count);
      },
    };
    const originalRows=await originalGet(ctx,[options.id,'--count',String(options.count),'--pages','1','--depth','0']);
    if (requests!==1 || !Array.isArray(originalRows) || originalRows.length>options.count)
      throw Error('ORIGINAL_GET_RESULT_INVALID');
    const result=[];
    for(const row of originalRows){
      if (!row || typeof row.cid!=='string' || !COMMENT_ID.test(row.cid) || typeof row.text!=='string')
        throw Error('ORIGINAL_GET_RESULT_INVALID');
      const text=sanitizeText(row.text);
      if(text)result.push({commentId:row.cid,text});
    }
    if (!result.length) return blocked('NO_COMMENTS_RETURNED',options.id);
    return {status:'ok',source:'vendored_original_get_v2',videoId:options.id,
      observationScope:'single_read_only_first_page_bridge_get_not_complete_inventory',
      comments:result,count:result.length,readOnlyCommand:true};
  } catch {return blocked('BRIDGE_GET_OR_VALIDATION_FAILED',options.id);}
}
module.exports={run,parseArgs,parseBridgeConfig,verifyApiResponse,validateSingleTargetTab,guardGetExpression};
if (require.main===module) {
  run().then(result=>{
    process.stdout.write(JSON.stringify(result)+'\n',()=>process.exit(result.status==='ok'?0:2));
  },()=>process.stdout.write(JSON.stringify(blocked('UNEXPECTED_FAILURE'))+'\n',()=>process.exit(2)));
}
