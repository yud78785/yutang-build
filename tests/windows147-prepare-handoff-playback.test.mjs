import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../upstream/playwright-runtime.mjs';
import { BrowserController } from '../upstream/core.mjs';
import { AutonomousWatch } from '../upstream/autonomous-watch.mjs';

const VIDEO_ID = '7770000000000000001';
const videoBytes = fs.readFileSync(new URL('../upstream/tests/fixtures/shared-canvas-synthetic.mp4', import.meta.url));
const HTML = [
  '<!doctype html>',
  '<meta charset="utf-8">',
  '<style>html,body{margin:0;background:#111}[data-e2e="feed-active-video"]{width:520px;height:320px}video{display:block;width:480px;height:270px;object-fit:contain}</style>',
  '<div data-e2e="feed-active-video" class="video_' + VIDEO_ID + '">',
  '  <div data-e2e="player-container" class="video_' + VIDEO_ID + '">',
  '    <video src="/synthetic.mp4" muted autoplay loop playsinline preload="auto"></video>',
  '  </div>',
  '  <div data-e2e="video-desc">Synthetic Edge playback fixture</div>',
  '  <a href="https://www.douyin.com/video/' + VIDEO_ID + '">Synthetic clip</a>',
  '</div>',
].join('\n');

test('prepare page is adopted, Edge video resumes, and production visual input receives sampled frames', { timeout: 45000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yutang-prepare-handoff-'));
  const stateDir = path.join(root, 'state');
  const controlDirectory = path.join(root, 'control');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(controlDirectory, { recursive: true });

  let browser;
  let controller;
  let watch;
  let allowed = true;
  let sessionStatus = 'active';
  let requests = 0;
  let decisionCalls = 0;
  let sampledFrames = 0;
  let imageParts = 0;
  let imageDataValid = false;
  let playbackAtModel = null;
  const personaMemory = {
    context: () => 'Synthetic visual handoff test only.',
    recordObservation: () => ({ evidenceId: 'synthetic-edge-evidence' }),
  };
  const videoLimits = {
    stateDir,
    state: () => ({
      allowed,
      reasonCode: allowed ? null : 'disabled',
      reason: allowed ? '' : 'Synthetic session ended.',
      session: { id: 'synthetic-session', status: sessionStatus },
      policy: { dailyRequests: 10, dailyMinutes: null },
      daily: { requests },
      remainingSeconds: allowed ? 300 : 0,
    }),
    beforeAction: () => ({ allowed, reason: allowed ? '' : 'Synthetic session ended.' }),
    watch: () => () => {},
    notePlayback: () => {},
    reserveRequest: () => ({ requests: ++requests }),
    settleWatching: () => {},
    endSession: () => { allowed = false; sessionStatus = 'ended'; return { status: 'ended' }; },
  };

  t.after(async () => {
    if (watch?.running) watch.cancel();
    await watch?.completion?.catch(() => {});
    try { await controller?.close?.(); } finally {
      if (browser?.isConnected()) await browser.close();
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir())) throw new Error('Test cleanup escaped the temporary directory.');
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--host-resolver-rules=MAP * ~NOTFOUND'],
  });
  const context = await browser.newContext({ viewport: { width: 700, height: 500 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.mp4')) return route.fulfill({ status: 200, contentType: 'video/mp4', body: videoBytes });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
  });

  controller = new BrowserController({ source: 'api', videoLimits, personaMemory, controlDirectory });
  controller.browser = browser;
  const originalExecute = controller.execute.bind(controller);
  controller.execute = async (...args) => {
    const result = await originalExecute(...args);
    if (args[0] === 'douyin_observe') sampledFrames = result.frames?.length || 0;
    return result;
  };

  const opened = await controller.openBrowser();
  assert.equal(opened.mode, 'prepare');
  assert.equal(opened.paused, true);
  const page = context.pages()[0];
  assert.ok(page);
  const video = page.locator('video');
  await video.waitFor({ state: 'attached', timeout: 5000 });
  assert.equal(await video.evaluate(element => element.paused), true, 'Prepare page must start paused.');
  assert.ok(await video.evaluate(element => element.readyState >= 2), 'Prepared media must have a decoded current frame.');
  assert.equal(await page.evaluate(() => window.name), 'deepseek-douyin-launcher');

  const decisionProvider = async ({ messages, signal }) => {
    signal.throwIfAborted();
    decisionCalls++;
    const parts = messages[1]?.content;
    assert.ok(Array.isArray(parts), 'Production API adapter must construct multimodal user content.');
    const images = parts.filter(part => part?.type === 'image_url');
    imageParts = images.length;
    imageDataValid = images.length > 0 && images.every(part => {
      const url = part.image_url?.url || '';
      return url.startsWith('data:image/jpeg;base64,') && Buffer.from(url.split(',')[1], 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8]));
    });
    playbackAtModel = await video.evaluate(element => ({
      paused: element.paused,
      readyState: element.readyState,
      time: element.currentTime,
      name: window.name,
    }));
    return {
      text: JSON.stringify({ action: 'stop', reason: 'Synthetic playback and visual input verified.', topics: [], reflection: 'Synthetic test only.' }),
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
  };

  watch = new AutonomousWatch({
    controller,
    config: { apiKey: 'synthetic-only', baseUrl: 'https://api.deepseek.com', model: 'synthetic' },
    videoLimits,
    personaMemory,
    decisionProvider,
    stateDir,
    source: 'api',
  });
  watch.start({}, { explicit: true });
  const completion = watch.completion;
  assert.ok(completion, 'Explicit start must create a bounded watch run.');
  await completion;

  assert.equal(decisionCalls, 1, 'Production visual decision adapter must be called exactly once.');
  assert.ok(sampledFrames >= 2, 'Edge must provide multiple sampled frames.');
  assert.ok(imageParts >= 1, 'Model input must contain at least one sampled image.');
  assert.equal(imageDataValid, true, 'Model input must contain valid JPEG data URLs.');
  assert.ok(playbackAtModel && playbackAtModel.paused === false && playbackAtModel.readyState >= 2 && playbackAtModel.time > 0, 'Playback must be active when visual evidence reaches the model adapter.');
  assert.equal(playbackAtModel.name, 'deepseek-douyin-api');
  assert.equal(await video.evaluate(element => element.paused), true, 'The bounded stop path must pause the adopted video.');
  assert.equal(await page.evaluate(() => window.name), 'deepseek-douyin-api');
  assert.equal(watch.state().running, false);
  assert.equal(watch.state().status, 'stopped');
  assert.equal(allowed, false, 'Synthetic watch session must close after the stop decision.');

  const receiptPath = process.env.YUTANG_PREPARE_HANDOFF_RECEIPT;
  if (receiptPath) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify({
      schema: 'yutang.windows147-prepare-handoff-playback.v1',
      status: 'PASS_REAL_EDGE_PREPARE_ADOPTION_PLAYBACK_AND_SYNTHETIC_VISUAL_INPUT',
      upstreamCommit: process.env.UPSTREAM_COMMIT || null,
      browser: 'Microsoft Edge',
      source: 'synthetic-local-mp4',
      preparePageStartsPaused: true,
      preparePageAdopted: true,
      playbackResumed: true,
      sampledFrames,
      modelImageParts: imageParts,
      imageDataValid,
      playbackAtModel,
      decisionProvider: 'synthetic-offline',
      realModelCalled: false,
      realMessageSent: false,
      release: false,
    }, null, 2) + '\n');
  }
});
