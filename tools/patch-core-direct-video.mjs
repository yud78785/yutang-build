#!/usr/bin/env node
// Fail-closed, hash-pinned candidate-only patch: skip unrelated recommendation readiness
// when a caller explicitly requests one canonical public Douyin video URL.
import { readFile, writeFile, lstat, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const EXPECTED_POST_JOBGUARD_SHA256 = '0b5e3a8c37017bec0d50e1895b9192ac8634a3e4b65b71e7b3f9475862975329';

export function normalizeDirectVideoUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'www.douyin.com' ||
        url.port || url.username || url.password || !/^\/video\/[0-9]{1,30}$/.test(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}

export function isSameDirectVideoPage(pageAddress, target) {
  const verified = normalizeDirectVideoUrl(target);
  if (!verified) return false;
  try {
    const page = new URL(pageAddress);
    return page.protocol === 'https:' && page.hostname === 'www.douyin.com' &&
      !page.port && !page.username && !page.password &&
      page.pathname === new URL(verified).pathname;
  } catch { return false; }
}

const VIDEO_ACTIONS = "const VIDEO_ACTIONS=new Set(['douyin_open','douyin_search','douyin_open_video','douyin_next','douyin_previous','douyin_observe','douyin_screenshot','douyin_video_zoom','douyin_play','douyin_listen']);";
const CONNECT_BEFORE = '  async connect(signal, { launch = true, create = true, authorizePrepare } = {}) {';
const CONNECT_AFTER = `  async connect(signal, { launch = true, create = true, authorizePrepare, initialDirectVideoUrl = null, initialDirectVideoReceipt = null } = {}) {
    if (initialDirectVideoUrl !== null && (normalizeDirectVideoUrl(initialDirectVideoUrl) !== initialDirectVideoUrl ||
        !initialDirectVideoReceipt || initialDirectVideoReceipt.completed !== false))
      throw new Error('Direct video initialization target was not verified.');`;
const FEED_BEFORE = '      else await this.navigate(RECOMMEND,signal);';
const FEED_AFTER = `      else if (initialDirectVideoUrl) {
         await this.navigateDirectVideo(initialDirectVideoUrl,signal);
         initialDirectVideoReceipt.completed = true;
       } else await this.navigate(RECOMMEND,signal);`;
const CALL_BEFORE = '        await this.connect(signal);\n        aborted(signal);';
const CALL_AFTER = `        const initialDirectVideoUrl = name === 'douyin_open_video' ? normalizeDirectVideoUrl(args.url) : null;
        const initialDirectVideoReceipt = initialDirectVideoUrl ? { completed: false } : null;
        await this.connect(signal, initialDirectVideoUrl ? { initialDirectVideoUrl, initialDirectVideoReceipt } : undefined);
        aborted(signal);`;
const OPEN_BEFORE = '          if (args.url) await this.navigate(`https://www.douyin.com/video/${/\\/video\\/(\\d+)/.exec(args.url)[1]}`,signal);';
const OPEN_AFTER = `          if (args.url) {
            const directTarget = \`https://www.douyin.com/video/\${/\\/video\\/(\\d+)/.exec(args.url)[1]}\`;
            if (initialDirectVideoReceipt?.completed !== true) await this.navigateDirectVideo(directTarget,signal);
          }`;
const NAVIGATE_BEFORE = '  async navigate(url, signal) {';
const NAVIGATE_AFTER = [
  '  async navigateDirectVideo(url, signal) {',
  '    const verified = normalizeDirectVideoUrl(url);',
  "    if (verified !== url) throw new Error('Direct video navigation target was not canonical.');",
  "    const videoId = verified.slice(verified.lastIndexOf('/video/') + 7);",
  "    if (!/^[0-9]+$/.test(videoId)) throw new Error('Direct video navigation target has no video ID.');",
  '    aborted(signal);',
  '    try {',
  "      await this.page.goto(verified, { waitUntil: 'commit', timeout: 15_000 });",
  '    } catch (error) {',
  "      const timedOut = error?.name === 'TimeoutError' || /timeout|timed out/i.test(String(error?.message || ''));",
  "      throw Object.assign(new Error(timedOut ? 'Direct video navigation commit timed out.' : 'Direct video navigation failed before commit.'), {",
  "        code: timedOut ? 'DIRECT_VIDEO_COMMIT_TIMEOUT' : 'DIRECT_VIDEO_COMMIT_FAILED',",
  '        cause: error,',
  '      });',
  '    }',
  '    aborted(signal);',
  '    const contextDeadline = Date.now() + 5_000;',
  '    let contextError = null;',
  '    while (true) {',
  '      aborted(signal);',
  '      try {',
  '        await this.page.evaluate(name => { window.name = name; }, browserPageLabel(this.source));',
  '        aborted(signal);',
  '        break;',
  '      } catch (error) {',
  '        if (signal?.aborted) aborted(signal);',
  "        const message = String(error?.message || '');",
  '        if (!/Execution context was destroyed|Cannot find context with specified id|context was destroyed during navigation/i.test(message)) throw error;',
  '        contextError = error;',
  '        if (Date.now() >= contextDeadline) {',
  "          throw Object.assign(new Error('Direct video page context did not stabilize after commit.'), { code: 'DIRECT_VIDEO_CONTEXT_TIMEOUT', cause: contextError });",
  '        }',
  '        await delay(100, undefined, { signal });',
  '      }',
  '    }',
  '    let settleContextRetries = 0;',
  '    for (;;) {',
  '      aborted(signal);',
  '      try {',
  "        await this.settle(signal, { kind: 'video', videoId });",
  '        aborted(signal);',
  '        break;',
  '      } catch (error) {',
  '        if (signal?.aborted) aborted(signal);',
  "        const message = String(error?.message || '');",
  "        if (!/Execution context was destroyed|Cannot find context with specified id|context was destroyed during navigation/i.test(message)) throw error;",
  '        if (settleContextRetries >= 1) {',
  "          throw Object.assign(new Error('Direct video state read context reset more than once.'), { code: 'DIRECT_VIDEO_SETTLE_CONTEXT_RETRY_EXHAUSTED', cause: error });",
  '        }',
  '        let identityOk = false;',
  '        try { identityOk = !this.page?.isClosed?.() && normalizeDirectVideoUrl(this.page?.url?.()) === verified; } catch {}',
  '        if (!identityOk) {',
  "          throw Object.assign(new Error('Direct video page identity changed during state read.'), { code: 'DIRECT_VIDEO_SETTLE_IDENTITY_CHANGED', cause: error });",
  '        }',
  '        settleContextRetries++;',
  '        await delay(150, undefined, { signal });',
  '      }',
  '    }',
  '  }',
  '',
  '  async navigate(url, signal) {',
].join('\n');
const HELPERS = normalizeDirectVideoUrl.toString();

function swapOnce(s, before, after, label) {
  if (s.split(before).length !== 2 || s.includes(after)) throw new Error(label + ' pinned source anchor mismatch; refusing patch.');
  return s.replace(before, after);
}
export function applyPatch(original, expectedSha256 = EXPECTED_POST_JOBGUARD_SHA256) {
  const bytes = Buffer.isBuffer(original) ? original : Buffer.from(original, 'utf8');
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedSha256) throw new Error('Post-JobGuard core SHA256 mismatch; refusing patch.');
  let source = bytes.toString('utf8');
  if (source.includes('initialDirectVideoUrl') || source.includes('function normalizeDirectVideoUrl'))
    throw new Error('Direct-video patch already present or unexpected target.');
  source = swapOnce(source, VIDEO_ACTIONS, VIDEO_ACTIONS + '\n' + HELPERS, 'helper insertion');
  source = swapOnce(source, CONNECT_BEFORE, CONNECT_AFTER, 'connect options');
  source = swapOnce(source, FEED_BEFORE, FEED_AFTER, 'initial recommendation');
  source = swapOnce(source, CALL_BEFORE, CALL_AFTER, 'execute-to-connect');
  source = swapOnce(source, OPEN_BEFORE, OPEN_AFTER, 'target navigation');
  source = swapOnce(source, NAVIGATE_BEFORE, NAVIGATE_AFTER, 'direct video commit navigation');
  const output = Buffer.from(source, 'utf8');
  return { patched: source, sha256: createHash('sha256').update(output).digest('hex') };
}

async function main() {
  const target = process.argv[2];
  if (!target || !path.isAbsolute(target)) throw new Error('Absolute core.mjs path required.');
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing non-file or symlink.');
  const { patched, sha256 } = applyPatch(await readFile(target));
  const temp = target + '.direct-video-' + process.pid + '.tmp';
  try { await writeFile(temp, patched, { flag: 'wx' }); await rename(temp, target); }
  finally { await rm(temp, { force: true }).catch(() => {}); }
  console.log('PATCH_DIRECT_VIDEO_CANONICAL_FASTPATH ' + JSON.stringify({ sha256 }));
  console.log('LIMIT: source and packaged propagation only; real public video behavior still needs exact-EXE Windows test.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => { console.error('DIRECT_VIDEO_PATCH_FAIL_CLOSED: ' + error.message); process.exitCode = 1; });
