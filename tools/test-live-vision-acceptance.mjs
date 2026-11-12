import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BENCHMARK_VIDEO_ID,
  REQUIRED_OUTCOME,
  verifyCaptureEvidence,
  createVisionObservation,
  scoreVisionDecision,
} from './live-vision-acceptance.mjs';

function fixture() {
  const buffers = [1, 2, 3].map(index => Buffer.from([0xff, 0xd8, index, 0xff, 0xd9]));
  const evidence = {
    outcome: REQUIRED_OUTCOME,
    requestedVideoId: BENCHMARK_VIDEO_ID,
    actualVideoId: BENCHMARK_VIDEO_ID,
    pageOrigin: 'https://www.douyin.com',
    pagePath: '/video/' + BENCHMARK_VIDEO_ID,
    loginRequired: false,
    verificationRequired: false,
    unsupportedPage: false,
    proofValid: true,
    readyState: 4,
    initialPaused: false,
    afterPaused: false,
    frames: 3,
    frameTimes: [1.1, 2.2, 3.3],
    frameHashes: buffers.map(bytes => createHash('sha256').update(bytes).digest('hex')),
    captureMethods: ['video-canvas-jpeg-v1', 'video-canvas-jpeg-v1', 'video-canvas-jpeg-v1'],
    decodedFrameCounts: [{before:1,after:2},{before:2,after:3},{before:3,after:4}],
    playbackProgressSeconds: 2.2,
    actualWallSeconds: 2.3,
    durationSeconds: 1082.5,
    modelInferencePerformed: false,
    modelInputPayloadVerified: true,
    modelInput: {
      provider: 'offline-test-stub-no-network',
      inputImages: 3,
      outputImages: 1,
      allImagePartsAreInlineJpeg: true,
      videoIdentityInText: true,
    },
    audioCapture: {
      outcome: 'PASS_PUBLIC_VIDEO_AUDIO_CAPTURE',
      videoIdMatch: true,
      audioPersisted: false,
      audioUploaded: false,
      transcriptionPerformed: false,
    },
  };
  return { evidence, buffers };
}

test('只接受与同一公开视频绑定、播放推进且哈希匹配的三帧证据', () => {
  const { evidence, buffers } = fixture();
  const frames = verifyCaptureEvidence(evidence, buffers);
  assert.equal(frames.length, 3);
  assert.ok(frames.every(frame => frame.videoId === BENCHMARK_VIDEO_ID && frame.mimeType === 'image/jpeg'));
  const observation = createVisionObservation(evidence, frames);
  assert.equal(observation.state.video.id, BENCHMARK_VIDEO_ID);
  assert.deepEqual(observation.frames.map(frame => frame.time), [1.1, 2.2, 3.3]);
});

test('错误作品、登录验证、无播放推进、旧离线模型结果或帧哈希不匹配均拒绝', () => {
  const { evidence, buffers } = fixture();
  const cases = [
    value => { value.actualVideoId = '1234567890123456789'; },
    value => { value.loginRequired = true; },
    value => { value.verificationRequired = true; },
    value => { value.playbackProgressSeconds = 0; },
    value => { value.modelInferencePerformed = true; },
    value => { value.modelInputPayloadVerified = false; },
    value => { value.audioCapture.audioUploaded = true; },
    value => { value.frameTimes[1] = value.frameTimes[0]; },
  ];
  for (const mutate of cases) {
    const altered = structuredClone(evidence);
    mutate(altered);
    assert.throws(() => verifyCaptureEvidence(altered, buffers));
  }
  assert.throws(() => verifyCaptureEvidence(evidence, [buffers[0], Buffer.from('not-jpeg'), buffers[2]]), /JPEG/);
});

test('视觉语义评分要求识别猪蹄，并至少命中器具、烹饪过程、可读字幕中的两项', () => {
  const pass = scoreVisionDecision({
    action: 'stop',
    reason: '画面中可见金属漏勺盛着切块猪蹄，下方汤汁持续翻滚。',
    reflection: '字幕能辨认出“猪蹄爆米花”，但三帧不足以说明完整烹饪过程。',
    topics: [{topic:'烹饪',signal:'neutral'}],
  });
  assert.equal(pass.passed, true);
  assert.equal(pass.score, 4);
  assert.equal(scoreVisionDecision({
    action:'stop', reason:'这是一个食物场景。', reflection:'采样不足。', topics:[]
  }).passed, false);
  assert.equal(scoreVisionDecision({
    action:'skip', reason:'猪蹄在锅里。', reflection:'看到漏勺。', topics:[]
  }).passed, false);
});

test('不接受没有安全停止动作的模型结果', () => {
  assert.equal(scoreVisionDecision({
    action:'share', reason:'猪蹄在漏勺里，汤汁沸腾。', reflection:'字幕出现爆米花。', topics:[]
  }).passed, false);
});
