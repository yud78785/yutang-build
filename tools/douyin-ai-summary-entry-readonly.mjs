// Source-only gate for Douyin's visible AI video-summary entry. Does not click anything.
// A visible '视频总结' entry is NOT evidence that any summary was generated.
import { classifyPublicCommentEvidence } from './douyin-public-comment-readonly.mjs';

const VIDEO_ID = /^\d{10,30}$/;
const AI_ORIGIN = 'https://so-landing.douyin.com';
const AI_PATH = '/search_ai_mobile/pc';

function aiFrameUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.origin === AI_ORIGIN && !u.username && !u.password &&
      (u.pathname === AI_PATH || u.pathname.startsWith(AI_PATH + '/')) && !u.hash;
  } catch { return false; }
}
function result(status, reasonCode, videoId, frameCount = 0) {
  return {
    status, reasonCode, videoId,
    evidenceSource: 'visible_official_ai_iframe_entry_only',
    matchingFrameCount: frameCount,
    aiSummaryEntryVisible: status === 'entry_visible',
    aiSummaryGenerated: false,
    aiSummaryText: null,
  };
}
function videoGate(state, id) {
  return classifyPublicCommentEvidence({
    stateBefore: state, stateAfter: state, commentRows: { rows: [] },
    expectedVideoId: id,
  });
}

export async function inspectDouyinAiSummaryEntryReadOnly({page, readPageState, expectedVideoId}={}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId)) throw new TypeError('INVALID_VIDEO_ID');
  if (typeof page?.evaluate !== 'function' || typeof page?.frames !== 'function' || typeof readPageState !== 'function')
    throw new TypeError('READ_ONLY_FRAME_ADAPTER_REQUIRED');
  let before;
  try { before = await page.evaluate(readPageState); }
  catch { return result('blocked', 'INITIAL_PAGE_READ_FAILED', expectedVideoId); }
  const first = videoGate(before, expectedVideoId);
  if (first.status === 'blocked') return result('blocked', first.reasonCode, expectedVideoId);

  let frames;
  try { frames = page.frames(); }
  catch { return result('blocked', 'FRAME_LIST_FAILED', expectedVideoId); }
  if (!Array.isArray(frames) || frames.length > 30) return result('blocked', 'FRAME_LIST_UNVERIFIED', expectedVideoId);
  const matched = [];
  try { for (const frame of frames) if (aiFrameUrl(frame?.url?.())) matched.push(frame); }
  catch { return result('blocked', 'FRAME_IDENTITY_READ_FAILED', expectedVideoId); }
  if (matched.length > 1) return result('blocked', 'OFFICIAL_AI_FRAME_AMBIGUOUS', expectedVideoId, matched.length);

  let labelVisible = false, initialFrameUrl = null;
  if (matched.length === 1) {
    try {
      const frame = matched[0];
      initialFrameUrl = frame.url();
      const entry = frame.getByText('视频总结', { exact: true });
      const count = await entry.count();
      if (!Number.isSafeInteger(count) || count < 0 || count > 1)
        return result('blocked', 'SUMMARY_ENTRY_AMBIGUOUS', expectedVideoId, 1);
      labelVisible = count === 1 && await entry.isVisible();
      if (!aiFrameUrl(frame.url()) || initialFrameUrl !== frame.url())
        return result('blocked', 'AI_FRAME_CHANGED', expectedVideoId, 1);
    } catch { return result('blocked', 'AI_FRAME_READ_FAILED', expectedVideoId, 1); }
  }

  let after;
  try { after = await page.evaluate(readPageState); }
  catch { return result('blocked', 'FINAL_PAGE_READ_FAILED', expectedVideoId, matched.length); }
  const second = videoGate(after, expectedVideoId);
  if (second.status === 'blocked') return result('blocked', 'POST_OBSERVATION_' + second.reasonCode, expectedVideoId, matched.length);
  if (before.url !== after.url || before.video.url !== after.video.url)
    return result('blocked', 'VIDEO_CHANGED_WHILE_READING', expectedVideoId, matched.length);
  // A frame can navigate or be replaced after the original label check, even
  // when the top-level video URL stays unchanged. Verify ownership again.
  try {
    const currentFrames = page.frames();
    if (!Array.isArray(currentFrames) || currentFrames.length > 30)
      return result('blocked', 'FINAL_FRAME_LIST_UNVERIFIED', expectedVideoId, matched.length);
    const currentMatched = currentFrames.filter(frame => aiFrameUrl(frame?.url?.()));
    if (currentMatched.length !== matched.length ||
        (matched.length === 1 && (currentMatched[0] !== matched[0] || currentMatched[0]?.url() !== initialFrameUrl)))
      return result('blocked', 'AI_FRAME_CHANGED_AFTER_READ', expectedVideoId, matched.length);
  } catch { return result('blocked', 'FINAL_FRAME_IDENTITY_READ_FAILED', expectedVideoId, matched.length); }
  if (matched.length === 0 || !labelVisible)
    return result('not_observed', 'SUMMARY_ENTRY_NOT_VISIBLE', expectedVideoId, matched.length);
  return result('entry_visible', null, expectedVideoId, 1);
}
