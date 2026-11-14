// Source-only, read-only Douyin public comment evidence gate.
// This module does not start browsers, navigate, click, scroll, post, message or persist data.
// Only pre-existing pinned readPageState/readCommentDom functions may be passed in.
const ORIGIN = 'https://www.douyin.com';
const VIDEO_ID = /^\d{10,30}$/;
const PRIVATE_BLOCKERS = [
  ['privateChatVisible', 'PRIVATE_CHAT_VISIBLE'],
  ['loginRequired', 'LOGIN_REQUIRED'],
  ['verificationRequired', 'VERIFICATION_REQUIRED'],
  ['unsupportedPage', 'UNSUPPORTED_PAGE'],
  ['blocked', 'PAGE_BLOCKED'],
];
const AI_SUMMARY_UNVERIFIED = Object.freeze({ verified: false, reasonCode: 'DEDICATED_AI_SUMMARY_NOT_INSPECTED' });

function validPublicVideoRoute(value, expectedVideoId) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    // An active video on the recommendation page is insufficient to attribute
    // an independently rendered comment drawer to the same work.
    const workQuery = ['modal_id', 'aweme_id'];
    const matchedQuery = workQuery.every(key => u.searchParams.getAll(key).every(value => value === expectedVideoId));
    return u.origin === ORIGIN && !u.username && !u.password &&
      u.pathname === `/video/${expectedVideoId}` && !u.hash && matchedQuery;
  } catch { return false; }
}
function canonicalVideoUrl(value, expectedVideoId) {
  return value === `${ORIGIN}/video/${expectedVideoId}`;
}
function checkState(state, expectedVideoId) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'STATE_UNAVAILABLE';
  for (const [property, code] of PRIVATE_BLOCKERS) if (state[property] === true) return code;
  if (state.videoSelection?.identityConflict === true) return 'VIDEO_IDENTITY_CONFLICT';
  if (state.videoSelection?.ambiguous === true || state.videoSelection?.candidateCount !== 1) return 'VIDEO_SELECTION_NOT_UNIQUE';
  if (state.pageKind !== 'video') return 'NOT_SINGLE_VIDEO_PAGE';
  if (state.video?.id !== expectedVideoId) return 'VIDEO_ID_MISMATCH';
  if (!Number.isInteger(state.video?.readyState) || state.video.readyState < 2) return 'VIDEO_NOT_READY';
  if (!canonicalVideoUrl(state.video?.url, expectedVideoId)) return 'VIDEO_URL_UNVERIFIED';
  if (!validPublicVideoRoute(state.url, expectedVideoId)) return 'PAGE_VIDEO_ROUTE_UNVERIFIED';
  return null;
}
function fail(reasonCode, expectedVideoId) {
  return {
    status: 'blocked', reasonCode, videoId: expectedVideoId,
    comments: [], visibleCommentCount: 0,
    aiSummary: { ...AI_SUMMARY_UNVERIFIED },
  };
}
function cleanText(value) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}

// Only claims currently visible, DOM-derived comments; this is not an official
// Douyin AI-summary, a complete comment inventory, or a proven comment-panel click.
export function classifyPublicCommentEvidence({ stateBefore, stateAfter, commentRows, expectedVideoId, limit = 12 } = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('INVALID_COMMENT_LIMIT');
  const beforeReason = checkState(stateBefore, expectedVideoId);
  if (beforeReason) return fail(beforeReason, expectedVideoId);
  const afterReason = checkState(stateAfter, expectedVideoId);
  if (afterReason) return fail('POST_OBSERVATION_' + afterReason, expectedVideoId);
  if (stateBefore.video.url !== stateAfter.video.url || stateBefore.url !== stateAfter.url) {
    return fail('PAGE_CHANGED_WHILE_READING', expectedVideoId);
  }
  if (!commentRows || !Array.isArray(commentRows.rows) || commentRows.rows.length > 100) {
    return fail('COMMENT_ROWS_UNVERIFIED', expectedVideoId);
  }
  const comments = [], seen = new Set();
  for (const item of commentRows.rows) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.videoId !== expectedVideoId ||
        typeof item.text !== 'string' || item.text.length > 512 ||
        ['mine', 'sent', 'pending', 'failed'].some(key => typeof item[key] !== 'boolean') ||
        (item.commentId != null && (typeof item.commentId !== 'string' || !/^\d{1,64}$/.test(item.commentId)))) {
      return fail('COMMENT_ROW_NOT_BOUND_TO_VIDEO', expectedVideoId);
    }
    if (item.pending === true || item.failed === true) continue;
    const text = cleanText(item.text);
    if (!text) continue;
    const key = item.commentId == null ? 'text:' + text : 'id:' + item.commentId;
    if (seen.has(key)) continue;
    seen.add(key);
    comments.push({ text, commentId: item.commentId ?? null });
    if (comments.length >= limit) break;
  }
  return {
    status: comments.length ? 'ok' : 'no_visible_comments',
    reasonCode: comments.length ? null : 'COMMENTS_NOT_VISIBLE_OR_NOT_LOADED',
    videoId: expectedVideoId,
    source: 'visible_public_comment_dom',
    observationScope: 'currently_visible_loaded_rows_only',
    comments,
    visibleCommentCount: comments.length,
    aiSummary: { ...AI_SUMMARY_UNVERIFIED },
  };
}

export async function observePublicCommentsReadOnly({ page, readPageState, readCommentDom, expectedVideoId, limit = 12 } = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('INVALID_COMMENT_LIMIT');
  if (typeof page?.evaluate !== 'function' || typeof readPageState !== 'function' || typeof readCommentDom !== 'function') {
    throw new TypeError('READ_ONLY_ADAPTER_REQUIRED');
  }
  let before;
  try { before = await page.evaluate(readPageState); }
  catch { return fail('INITIAL_PAGE_READ_FAILED', expectedVideoId); }
  const reason = checkState(before, expectedVideoId);
  if (reason) return fail(reason, expectedVideoId);
  let rows;
  try { rows = await page.evaluate(readCommentDom, expectedVideoId); }
  catch { return fail('COMMENT_DOM_READ_FAILED', expectedVideoId); }
  let after;
  try { after = await page.evaluate(readPageState); }
  catch { return fail('FINAL_PAGE_READ_FAILED', expectedVideoId); }
  return classifyPublicCommentEvidence({ stateBefore: before, stateAfter: after, commentRows: rows, expectedVideoId, limit });
}
