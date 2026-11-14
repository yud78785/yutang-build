// SOURCE-ONLY helper. Never launches a browser, navigates, clicks, sends messages, or persists content.
// Inject ONLY the existing pinned upstream readPageState and readCommentDom functions.
const ORIGIN = 'https://www.douyin.com';
const VIDEO_ID = /^\d{10,30}$/;
const PRIVATE_BLOCKERS = [
  ['privateChatVisible', 'PRIVATE_CHAT_VISIBLE'],
  ['loginRequired', 'LOGIN_REQUIRED'],
  ['verificationRequired', 'VERIFICATION_REQUIRED'],
  ['unsupportedPage', 'UNSUPPORTED_PAGE'],
  ['blocked', 'PAGE_BLOCKED'],
];

function validPublicUrl(value, expectedVideoId, videoUrl = false) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.origin !== ORIGIN || url.username || url.password) return false;
    if (videoUrl) return url.href === `${ORIGIN}/video/${expectedVideoId}`;
    return true;
  } catch { return false; }
}

function checkState(state, expectedVideoId) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'STATE_UNAVAILABLE';
  for (const [property, code] of PRIVATE_BLOCKERS) if (state[property] === true) return code;
  if (state.videoSelection?.identityConflict === true) return 'VIDEO_IDENTITY_CONFLICT';
  if (state.video?.id !== expectedVideoId) return 'VIDEO_ID_MISMATCH';
  if (!Number.isInteger(state.video?.readyState) || state.video.readyState < 2) return 'VIDEO_NOT_READY';
  if (!validPublicUrl(state.video?.url, expectedVideoId, true)) return 'VIDEO_URL_UNVERIFIED';
  if (!validPublicUrl(state.url || state.video.url, expectedVideoId)) return 'PAGE_ORIGIN_UNVERIFIED';
  return null;
}

function fail(reasonCode, expectedVideoId) {
  return {
    status: 'blocked', reasonCode, videoId: expectedVideoId,
    comments: [], visibleCommentCount: 0,
    aiSummary: { verified: false, reasonCode: 'DEDICATED_AI_SUMMARY_NOT_INSPECTED' },
  };
}

function cleanText(value) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}

export function classifyPublicCommentEvidence({ stateBefore, stateAfter, commentRows, expectedVideoId, limit = 12 } = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new TypeError('INVALID_COMMENT_LIMIT');
  const first = checkState(stateBefore, expectedVideoId);
  if (first) return fail(first, expectedVideoId);
  const last = checkState(stateAfter, expectedVideoId);
  if (last) return fail('POST_OBSERVATION_' + last, expectedVideoId);
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
    comments,
    visibleCommentCount: comments.length,
    aiSummary: { verified: false, reasonCode: 'DEDICATED_AI_SUMMARY_NOT_INSPECTED' },
  };
}

export async function observePublicCommentsReadOnly({ page, readPageState, readCommentDom, expectedVideoId, limit = 12 } = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (typeof page?.evaluate !== 'function' || typeof readPageState !== 'function' || typeof readCommentDom !== 'function') {
    throw new TypeError('READ_ONLY_ADAPTER_REQUIRED');
  }
  const before = await page.evaluate(readPageState);
  const reason = checkState(before, expectedVideoId);
  if (reason) return fail(reason, expectedVideoId);
  const rows = await page.evaluate(readCommentDom, expectedVideoId);
  const after = await page.evaluate(readPageState);
  return classifyPublicCommentEvidence({ stateBefore: before, stateAfter: after, commentRows: rows, expectedVideoId, limit });
}
