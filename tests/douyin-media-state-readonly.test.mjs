import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inspectDouyinMediaStateReadOnly as inspect } from '../tools/douyin-media-state-readonly.mjs';

const videoId = '7445301722639060233';
function pageFixture({ videos, label = 'deepseek-douyin-api', pathname = '/video/' + videoId,
  uiError = false, uiLoading = false, fail = false } = {}) {
  const calls = [];
  const data = videos ?? [{ error: { code: 4, message: 'PRIVATE_TOKEN_SHOULD_NOT_LEAK' },
    readyState: 0, networkState: 3, currentTime: 0, duration: NaN,
    paused: true, videoWidth: 0, videoHeight: 0,
    currentSrc: 'https://media.example/video?token=PRIVATE_TOKEN_SHOULD_NOT_LEAK' }];
  const page = {
    async evaluate(fn, arg) {
      calls.push('evaluate');
      if (fail) throw Error('SECRET_SESSION_COOKIES_MUST_NOT_LEAK');
      const ctx = {
        window: { name: label }, location: { origin: 'https://www.douyin.com', pathname },
        document: { querySelectorAll: selector => selector === 'video' || selector === '.xgplayer video'
          ? data : [], querySelector: selector => selector === '.xgplayer-is-error' && uiError ||
            selector === '.xgplayer-isloading' && uiLoading ? {} : null },
      };
      return vm.runInNewContext('(' + fn.toString() + ')(' + JSON.stringify(arg) + ')', ctx);
    },
    goto() { throw Error('NAVIGATION_FORBIDDEN'); },
    click() { throw Error('CLICK_FORBIDDEN'); },
    fetch() { throw Error('FETCH_FORBIDDEN'); },
  };
  return { page, calls };
}

test('read-only exact target media error 4 without leaking media URL or error message', async () => {
  const f = pageFixture({ uiError: true });
  const r = await inspect({ page: f.page, expectedVideoId: videoId });
  assert.equal(r.status, 'observed');
  assert.equal(r.errorCode, 4);
  assert.equal(r.errorCategory, 'source_not_supported');
  assert.equal(r.readyState, 0);
  assert.equal(r.networkState, 3);
  assert.equal(r.currentTimeMs, 0);
  assert.equal(r.playerUiError, true);
  assert.equal(r.playbackVerified, false);
  assert.equal(r.audioCaptured, false);
  assert.deepEqual(f.calls, ['evaluate']);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_TOKEN|media\.example|COOKIE/);
});
test('network code 2 and decode code 3 map correctly, without implying root cause', async () => {
  for (const [errorCode, expected] of [[2, 'network'], [3, 'decode'], [1, 'aborted']]) {
    const f = pageFixture({ videos: [{ error: { code: errorCode }, readyState: 0, networkState: 2,
      currentTime: 0, duration: Infinity, paused: true, videoWidth: 0, videoHeight: 0 }] });
    const r = await inspect({ page: f.page, expectedVideoId: videoId });
    assert.equal(r.errorCategory, expected);
    assert.equal(r.status, 'observed');
  }
});
test('a loaded video is not claimed as verified playback on single snapshot', async () => {
  const f = pageFixture({ videos: [{ error: null, readyState: 4, networkState: 1,
    currentTime: 18.2, duration: 180, paused: false, videoWidth: 1920, videoHeight: 1080 }] });
  const r = await inspect({ page: f.page, expectedVideoId: videoId });
  assert.equal(r.currentTimeMs, 18200);
  assert.equal(r.durationMs, 180000);
  assert.equal(r.playbackVerified, false);
  assert.equal(r.audioCaptured, false);
});
test('missing video and multiple videos fail closed without asserting playback', async () => {
  for (const [list, expected] of [[[], 'no_video'], [[{}, {}], 'ambiguous']]) {
    const r = await inspect({ page: pageFixture({ videos: list }).page, expectedVideoId: videoId });
    assert.equal(r.status, expected);
    assert.equal(r.playbackVerified, false);
  }
});
test('wrong page, wrong owner label and bad video ID are rejected', async () => {
  for (const opts of [{ pathname: '/video/888888888888' }, { label: 'other-browser' }]) {
    const r = await inspect({ page: pageFixture(opts).page, expectedVideoId: videoId });
    assert.equal(r.status, 'unavailable');
    assert.equal(r.reasonCode, 'MEDIA_PAGE_IDENTITY_MISMATCH');
  }
  await assert.rejects(inspect({ page: pageFixture().page, expectedVideoId: 'bad_id' }), /INVALID_MEDIA_VIDEO_ID/);
});
test('inaccessible page and evaluation error return redacted unavailable', async () => {
  const f = pageFixture({ fail: true });
  const r = await inspect({ page: f.page, expectedVideoId: videoId });
  assert.equal(r.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(r), /SECRET_SESSION/);
  const noPage = await inspect({ expectedVideoId: videoId });
  assert.equal(noPage.reasonCode, 'MEDIA_PAGE_EVALUATION_UNAVAILABLE');
});
test('untrusted page result cannot inject arbitrary fields, malformed values fail closed', async () => {
  for (const item of [
    {status:'observed', videoCount:1, errorCode:7, readyState:4, networkState:1, currentTimeMs:0,
      durationMs:null, paused:true, videoWidth:1, videoHeight:1, playerUiError:false, playerUiLoading:false},
    'STRANGE_PAGE_TEXT'
  ]) {
    const r = await inspect({ page: {evaluate:async()=>item}, expectedVideoId: videoId });
    assert.equal(r.status, 'unavailable');
  }
});
