// Read a single pre-existing, owner-verified public Douyin HTMLMediaElement.
// No navigation, play, download, fetch, permissions, cookies, media URLs or writes.
const VIDEO_ID = /^\d{10,30}$/;
const SOURCE = 'existing_owned_douyin_media_element';
const ERROR_CODES = Object.freeze({ 1: 'aborted', 2: 'network', 3: 'decode', 4: 'source_not_supported' });

function unavailable(videoId, reasonCode = 'MEDIA_DIAGNOSTIC_UNAVAILABLE') {
  return { status: 'unavailable', reasonCode, videoId, evidenceSource: SOURCE,
    playbackVerified: false, audioCaptured: false };
}
function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function sanitize(value, videoId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable(videoId);
  if (value.status === 'page_mismatch') return unavailable(videoId, 'MEDIA_PAGE_IDENTITY_MISMATCH');
  if (value.status === 'no_video') return { ...unavailable(videoId, 'NO_VIDEO_ELEMENT'), status: 'no_video' };
  if (value.status === 'ambiguous') return { ...unavailable(videoId, 'MEDIA_ELEMENTS_AMBIGUOUS'), status: 'ambiguous' };
  if (value.status !== 'observed' ||
      !integerBetween(value.videoCount, 1, 30) ||
      !integerBetween(value.readyState, 0, 4) ||
      !integerBetween(value.networkState, 0, 3) ||
      !integerBetween(value.currentTimeMs, 0, 86_400_000) ||
      !(value.durationMs === null || integerBetween(value.durationMs, 0, 86_400_000)) ||
      !integerBetween(value.videoWidth, 0, 8192) ||
      !integerBetween(value.videoHeight, 0, 8192) ||
      !(value.errorCode === null || integerBetween(value.errorCode, 1, 4)) ||
      typeof value.paused !== 'boolean' ||
      typeof value.playerUiError !== 'boolean' || typeof value.playerUiLoading !== 'boolean') {
    return unavailable(videoId, 'MEDIA_DIAGNOSTIC_INVALID');
  }
  return {
    status: 'observed', reasonCode: null, videoId, evidenceSource: SOURCE,
    // HTMLMediaElement error codes are not conclusive root-cause diagnoses.
    errorCode: value.errorCode,
    errorCategory: value.errorCode === null ? null : ERROR_CODES[value.errorCode],
    readyState: value.readyState,
    networkState: value.networkState,
    currentTimeMs: value.currentTimeMs,
    durationMs: value.durationMs,
    videoWidth: value.videoWidth,
    videoHeight: value.videoHeight,
    paused: value.paused,
    playerUiError: value.playerUiError,
    playerUiLoading: value.playerUiLoading,
    videoCount: value.videoCount,
    // One instantaneous observation cannot prove frame progression or audio.
    playbackVerified: false,
    audioCaptured: false,
  };
}

export async function inspectDouyinMediaStateReadOnly({ page, expectedVideoId } = {}) {
  if (typeof expectedVideoId !== 'string' || !VIDEO_ID.test(expectedVideoId))
    throw new TypeError('INVALID_MEDIA_VIDEO_ID');
  if (typeof page?.evaluate !== 'function') return unavailable(expectedVideoId, 'MEDIA_PAGE_EVALUATION_UNAVAILABLE');
  try {
    const observed = await page.evaluate(({ videoId }) => {
      if (location.origin !== 'https://www.douyin.com' ||
          location.pathname !== '/video/' + videoId ||
          !['deepseek-douyin-api', 'deepseek-douyin-dsh'].includes(window.name)) {
        return { status: 'page_mismatch' };
      }
      const allVideos = document.querySelectorAll('video');
      if (allVideos.length === 0) return { status: 'no_video' };
      const ownedVideos = document.querySelectorAll('.xgplayer video');
      const selected = ownedVideos.length ? ownedVideos : allVideos;
      if (selected.length !== 1 || allVideos.length > 30) return { status: 'ambiguous' };
      const video = selected[0];
      const toMs = number => Number.isFinite(number) && number >= 0 && number <= 86400
        ? Math.round(number * 1000) : null;
      return {
        status: 'observed', videoCount: allVideos.length,
        errorCode: video.error?.code ?? null,
        readyState: video.readyState, networkState: video.networkState,
        currentTimeMs: toMs(video.currentTime), durationMs: toMs(video.duration),
        paused: video.paused,
        videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        playerUiError: document.querySelector('.xgplayer-is-error') !== null,
        playerUiLoading: document.querySelector('.xgplayer-isloading') !== null,
      };
    }, { videoId: expectedVideoId });
    return sanitize(observed, expectedVideoId);
  } catch {
    return unavailable(expectedVideoId);
  }
}
