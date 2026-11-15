// SPDX-License-Identifier: MIT
// Adapted data fields / endpoint contract from these MIT-licensed projects:
//   qinuoyun/douyin @ e1e58a0ee9c0fb5ecbdfaeda1025de996e8e50a7
//     scripts/douyin.user.js and lib/commands/helpers.js
//   Tommyapi/OpenMediaCrawl @ 7c89b4bf0eef55e9ae7a05174f32fbfcd7d724c3
//     src/platforms/douyin/web/normalize.ts
// Corresponding MIT copyright and license notices are retained in
//   docs/douyin-mit-network-reuse-notice.md
// This module NEVER sends requests. It listens only to already-occurring
// Playwright page responses and discards URL, headers, cookies, and user data.

const ORIGIN = 'https://www.douyin.com';
const API_PATH = '/aweme/v1/web/comment/list/';
const WORK_ID = /^\d{10,30}$/;
const COMMENT_ID = /^\d{1,64}$/;
const TEXT_LIMIT = 512;
const RESPONSE_CHAR_LIMIT = 196608;

export function normalizeDouyinCommentApiResponse({url, responseBody, expectedVideoId, limit = 12} = {}) {
  if (typeof expectedVideoId !== 'string' || !WORK_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new TypeError('INVALID_LIMIT');
  let requested;
  try { requested = new URL(url); } catch { return null; }
  if (requested.origin !== ORIGIN || requested.username || requested.password ||
      requested.pathname !== API_PATH || requested.hash ||
      requested.searchParams.getAll('aweme_id').length !== 1 ||
      requested.searchParams.get('aweme_id') !== expectedVideoId) return null;
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody) ||
      responseBody.status_code !== 0 || !Array.isArray(responseBody.comments) ||
      responseBody.comments.length > 100) return null;
  const comments = [], seen = new Set();
  for (const record of responseBody.comments) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.cid !== 'string' || !COMMENT_ID.test(record.cid) ||
        (record.aweme_id != null && record.aweme_id !== expectedVideoId) ||
        typeof record.text !== 'string' || record.text.length > TEXT_LIMIT) return null;
    const text = record.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!text || seen.has(record.cid)) continue;
    seen.add(record.cid);
    if (comments.length < limit) comments.push({commentId:record.cid, videoId:expectedVideoId, text});
  }
  return {status:comments.length?'api_response_observed':'api_response_empty',
    source:'already_loaded_first_party_comment_api',
    scope:'captured_page_response_only_not_independently_dom_visible',
    videoId:expectedVideoId, comments, count:comments.length,
    aiSummaryGenerated:false, aiSummaryText:null};
}

function empty(videoId, reasonCode) {
  return {status:'not_observed', reasonCode, source:'already_loaded_first_party_comment_api',
    scope:'captured_page_response_only_not_independently_dom_visible', videoId,
    comments:[], count:0, aiSummaryGenerated:false, aiSummaryText:null};
}

export function startPassiveDouyinCommentCapture(page, expectedVideoId, {
  limit = 12, maxResponses = 4, maxDurationMs = 15000,
} = {}) {
  if (!WORK_ID.test(expectedVideoId || '')) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isSafeInteger(maxResponses) || maxResponses < 1 || maxResponses > 10 ||
      !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 50 || maxDurationMs > 60000) {
    throw new TypeError('INVALID_CAPTURE_LIMIT');
  }
  if (typeof page?.on !== 'function' || typeof page?.off !== 'function')
    throw new TypeError('RESPONSE_LISTENER_UNAVAILABLE');
  let closed = false, inspected = 0, timer;
  const inflight = new Set(), records = new Map();
  const onResponse = response => {
    if (closed || inspected >= maxResponses) return;
    let url;
    try {
      url = new URL(response.url());
      if (url.origin !== ORIGIN || url.pathname !== API_PATH || url.username || url.password || url.hash ||
          url.searchParams.getAll('aweme_id').length !== 1 || url.searchParams.get('aweme_id') !== expectedVideoId ||
          response.status() !== 200 || response.request()?.method() !== 'GET') return;
    } catch { return; }
    inspected++;
    const task = (async () => {
      try {
        const bodyString = await response.text();
        if (closed || typeof bodyString !== 'string' || bodyString.length > RESPONSE_CHAR_LIMIT) return;
        const result = normalizeDouyinCommentApiResponse({
          url:url.href, responseBody:JSON.parse(bodyString), expectedVideoId, limit,
        });
        if (!result || result.status !== 'api_response_observed') return;
        for (const comment of result.comments) if (records.size < limit && !records.has(comment.commentId))
          records.set(comment.commentId,comment);
      } catch { /* page failures never expose raw request or private data */ }
    })();
    inflight.add(task);
    void task.finally(() => inflight.delete(task));
  };
  page.on('response',onResponse);
  // Fail closed for long-lived hosts as well as one-shot CLI instances.
  timer = setTimeout(() => {closed = true; page.off('response',onResponse);records.clear();},maxDurationMs);
  timer.unref?.();
  return {
    async stop() {
      // First detach from new responses, then await currently handled ones.
      page.off('response',onResponse);
      clearTimeout(timer);
      if (closed) return empty(expectedVideoId,'CAPTURE_EXPIRED');
      // Avoid indefinitely awaiting a pending/abandoned response.text().
      await Promise.race([Promise.allSettled([...inflight]),
        new Promise(resolve => {setTimeout(resolve,500);})]);
      closed = true;
      const comments = [...records.values()];records.clear();
      return comments.length ? {
        status:'api_response_observed',source:'already_loaded_first_party_comment_api',
        scope:'captured_page_response_only_not_independently_dom_visible', videoId:expectedVideoId,
        comments,count:comments.length,aiSummaryGenerated:false,aiSummaryText:null,
      } : empty(expectedVideoId,'NO_RELEVANT_CAPTURED_COMMENT_RESPONSE');
    },
  };
}

export function makePassiveDouyinCommentReader(observeDom, {capture = startPassiveDouyinCommentCapture} = {}) {
  if (typeof observeDom !== 'function') throw new TypeError('DOM_OBSERVER_REQUIRED');
  return async args => {
    let tap = null, captureResult;
    try { tap = capture(args.page,args.expectedVideoId,{limit:args.limit}); }
    catch { /* Old page adapters may not support response events; DOM reader still works */ }
    let result;
    try { result = await observeDom(args); }
    finally { if (tap) try { captureResult = await tap.stop(); } catch { captureResult = empty(args.expectedVideoId,'CAPTURE_STOP_FAILED'); } }
    if (!result || typeof result !== 'object') return result;
    return {...result, passiveNetwork: captureResult ?? empty(args.expectedVideoId,'RESPONSE_LISTENER_UNAVAILABLE')};
  };
}
