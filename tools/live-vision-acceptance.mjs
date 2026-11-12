#!/usr/bin/env node
// One-shot, opt-in live DeepSeek vision acceptance. Never runs in ordinary PR CI.
// Reads only a previously verified public-video evidence directory; does not use browser tools,
// execute decisions, write memory, upload audio, transcribe audio, or persist API credentials.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BENCHMARK_VIDEO_ID = '7577614489533680959';
export const REQUIRED_OUTCOME = 'PASS_PUBLIC_VIDEO_CORE_CAPTURE_AND_MODEL_INPUT_PACKING';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function verifyCaptureEvidence(evidence, frameBuffers) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('视频证据 JSON 无效。');
  if (evidence.outcome !== REQUIRED_OUTCOME || evidence.modelInferencePerformed !== false ||
      evidence.modelInputPayloadVerified !== true || evidence.modelInput?.provider !== 'offline-test-stub-no-network') {
    throw new Error('输入证据不是尚未进行真实推理的已通过公开视频采集样本。');
  }
  const id = evidence.actualVideoId;
  if (id !== BENCHMARK_VIDEO_ID || evidence.requestedVideoId !== id ||
      evidence.pageOrigin !== 'https://www.douyin.com' || evidence.pagePath !== '/video/' + id) {
    throw new Error('公开视频身份或来源不匹配。');
  }
  if (evidence.loginRequired !== false || evidence.verificationRequired !== false ||
      evidence.unsupportedPage !== false || evidence.proofValid !== true ||
      evidence.readyState < 2 || evidence.initialPaused !== false || evidence.afterPaused !== false) {
    throw new Error('视频证据包含登录、验证、页面或播放状态风险。');
  }
  if (evidence.frames !== 3 || !Array.isArray(frameBuffers) || frameBuffers.length !== 3 ||
      !Array.isArray(evidence.frameTimes) || evidence.frameTimes.length !== 3 ||
      !Array.isArray(evidence.frameHashes) || evidence.frameHashes.length !== 3 ||
      !Array.isArray(evidence.captureMethods) || evidence.captureMethods.length !== 3 ||
      !Array.isArray(evidence.decodedFrameCounts) || evidence.decodedFrameCounts.length !== 3) {
    throw new Error('真实视频采样必须恰好包含三帧及完整证明。');
  }
  if (evidence.captureMethods.some(method => method !== 'video-canvas-jpeg-v1') ||
      evidence.frameTimes.some((time, index) => !Number.isFinite(time) || time < 0 || (index > 0 && time <= evidence.frameTimes[index - 1])) ||
      evidence.decodedFrameCounts.some(item => !Number.isSafeInteger(item?.before) || !Number.isSafeInteger(item?.after) || item.after <= item.before) ||
      !Number.isFinite(evidence.playbackProgressSeconds) || evidence.playbackProgressSeconds < 1) {
    throw new Error('采样画面缺少真实播放推进或解码帧证据。');
  }
  if (evidence.audioCapture?.outcome !== 'PASS_PUBLIC_VIDEO_AUDIO_CAPTURE' ||
      evidence.audioCapture.videoIdMatch !== true || evidence.audioCapture.audioPersisted !== false ||
      evidence.audioCapture.audioUploaded !== false || evidence.audioCapture.transcriptionPerformed !== false) {
    throw new Error('音频附属证据不符合本次只做视觉推理的边界。');
  }
  const frames = frameBuffers.map((bytes, index) => {
    if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > 2_000_000 ||
        bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('采样帧不是有界 JPEG 文件。');
    const hash = sha256(bytes);
    if (hash !== evidence.frameHashes[index]) throw new Error('采样帧 SHA-256 与原始采集证据不一致。');
    return {
      mimeType: 'image/jpeg',
      data: bytes.toString('base64'),
      videoId: id,
      time: evidence.frameTimes[index],
    };
  });
  if (evidence.modelInput?.inputImages !== 3 || evidence.modelInput?.outputImages !== 1 ||
      evidence.modelInput?.allImagePartsAreInlineJpeg !== true || evidence.modelInput?.videoIdentityInText !== true) {
    throw new Error('此前生产分镜输入契约未通过，拒绝调用真实模型。');
  }
  return frames;
}

export function createVisionObservation(evidence, frames) {
  const id = evidence.actualVideoId;
  return {
    state: {
      url: 'https://www.douyin.com/video/' + id,
      loginRequired: false,
      verificationRequired: false,
      privateChatVisible: false,
      unsupportedPage: false,
      video: {
        id,
        url: 'https://www.douyin.com/video/' + id,
        time: evidence.frameTimes[2],
        duration: evidence.durationSeconds,
        readyState: evidence.readyState,
        paused: false,
      },
    },
    frames,
    observation: {
      videoId: id,
      beforeTime: evidence.frameTimes[0],
      afterTime: evidence.frameTimes[2],
      actualWallSeconds: evidence.actualWallSeconds,
      playbackProgressSeconds: evidence.playbackProgressSeconds,
    },
  };
}

export function scoreVisionDecision(decision) {
  if (!decision || decision.action !== 'stop' || typeof decision.reason !== 'string' ||
      typeof decision.reflection !== 'string' || !Array.isArray(decision.topics)) {
    return { passed: false, score: 0, checks: { safeStop: false, porkTrotter: false, utensil: false, cooking: false, visibleText: false } };
  }
  const text = [decision.reason, decision.reflection, ...decision.topics.map(item => item?.topic || '')].join('\n');
  const checks = {
    safeStop: decision.action === 'stop',
    porkTrotter: /猪蹄|猪脚|猪足|猪爪|pork\s*trotter|pig\s*feet/i.test(text),
    utensil: /漏勺|滤勺|笊篱|网勺|金属筛|金属勺|strainer|colander|slotted\s*spoon/i.test(text),
    cooking: /汤汁|汤水|汤|沸腾|翻滚|烹饪|煮|炖|油锅|broth|boiling|cooking|hot\s*liquid/i.test(text),
    visibleText: /猪蹄爆米花|只要\s*3\s*秒|爆米花/i.test(text),
  };
  const score = [checks.porkTrotter, checks.utensil, checks.cooking, checks.visibleText].filter(Boolean).length;
  return { passed: checks.safeStop && checks.porkTrotter && score >= 3, score, checks };
}

const REVIEW_CONTEXT = [
  '这是一次仅视觉的单次验收，不是自主观看会话，不会执行任何后续工具动作。',
  '请只根据本次三帧分镜识别可直接看到的主要物体、器具、动作和可读字幕。',
  '请在 reason 和 reflection 中写明可核实的物体与动作；若不确定请明确说明，不要猜测。',
  '只描述采样时间点能支持的事实，不得推断音频、未采样过程或整条视频内容。',
  '本次 action 必须为 stop。不要搜索、停留、分享、评论或执行其他动作。',
].join('\n');

function safeError(error, secret) {
  let message = String(error?.message || error || 'unknown error');
  if (secret) message = message.split(secret).join('[redacted]');
  return message
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image-data-redacted]')
    .slice(0, 500);
}

async function main() {
  if (process.env.YUTANG_ALLOW_LIVE_VISION_ACCEPTANCE !== '1') {
    throw new Error('未明确启用真实模型验收；没有发送网络请求。设置 YUTANG_ALLOW_LIVE_VISION_ACCEPTANCE=1 后再运行。');
  }
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY；没有发送网络请求。');
  const evidenceDir = process.argv[2] || process.env.YUTANG_EVIDENCE_DIR;
  if (!evidenceDir) throw new Error('请提供含 probe-result.json 与三张 frame-N.jpg 的证据目录。');

  const resolved = path.resolve(evidenceDir);
  const evidence = JSON.parse(await fs.readFile(path.join(resolved, 'probe-result.json'), 'utf8'));
  const frameBuffers = await Promise.all([1, 2, 3].map(index => fs.readFile(path.join(resolved, 'frame-' + index + '.jpg'))));
  const frames = verifyCaptureEvidence(evidence, frameBuffers);
  const observation = createVisionObservation(evidence, frames);

  // Import the exact pinned production ApiAgent. It owns the real DeepSeek request path,
  // request timeout, image storyboard packing, JSON parsing, and decision validation.
  const { ApiAgent, normalizeApiConfig } = await import('../upstream/api-agent.mjs');
  const config = normalizeApiConfig({
    apiKey,
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
  });
  const agent = new ApiAgent({
    controller: { execute: async () => { throw new Error('Live vision acceptance has no browser-tool execution path.'); } },
    config,
    apiTimeoutMs: 45_000,
    maxTokens: 1_200,
    maxFrames: 3,
    maxFrameBytes: 2_000_000,
  });
  const startedAt = Date.now();
  const result = await agent.decideWatch({
    observation,
    context: REVIEW_CONTEXT,
    watchOptions: { mode: 'recommend', topics: [], exclude: [] },
    shareContext: { enabled: false, paused: true, dailyRemaining: 0, recipients: [] },
    commentContext: { enabled: false, paused: true, remainingDaily: 0, remainingSession: 0 },
  });
  const elapsedMs = Date.now() - startedAt;
  const semantic = scoreVisionDecision(result.decision);
  const report = {
    status: semantic.passed ? 'PASS_LIVE_DEEPSEEK_VISION_SEMANTIC_SAMPLE' : 'FAIL_LIVE_DEEPSEEK_VISION_SEMANTIC_SAMPLE',
    provider: 'DeepSeek API',
    model: config.model,
    requestCount: 1,
    videoId: evidence.actualVideoId,
    frameCount: frames.length,
    frameTimes: evidence.frameTimes,
    storyboard: agent.lastVisualPacking,
    elapsedMs,
    usage: result.usage,
    decision: result.decision,
    semantic,
    actionExecuted: false,
    browserToolsExecuted: false,
    audioSent: false,
    transcriptionPerformed: false,
    memoryWritten: false,
    scope: 'three verified JPEG samples only; no claim about unseen intervals or the full video',
  };
  console.log('YUTANG_LIVE_VISION_RESULT ' + JSON.stringify(report));
  if (!semantic.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('YUTANG_LIVE_VISION_FAIL_CLOSED ' + safeError(error, process.env.DEEPSEEK_API_KEY || ''));
    process.exitCode = 1;
  });
}
