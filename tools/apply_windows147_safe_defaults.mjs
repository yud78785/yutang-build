import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BASE = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const ORIGINAL = {
  'friend-interactions.mjs': 'be5b6764cc56b0c77cb8bc84554751166be3a0f1',
  'tests/friend-interactions.test.mjs': 'c19a00077aa866a61d460280ab7d5d7513db05ba',
  'tests/friend-auto-prepare.test.mjs': 'b3947d922993120361d507b5b2afcc7bd3390c5b',
  'tests/friend-chat-share-isolation.test.mjs': '58deaee9f8a1e00cc9fb49cdb6229bf1b4cf4f3b',
  'tests/chat-starting-recovery.test.mjs': 'b38ad6c0ab98ff830672c3ae16770d247e0d67eb',
  'autonomous-watch.mjs': '7d69508238232651a7965872493142d58bf47bce',
};
const blobSha = value => createHash('sha1').update('blob ' + Buffer.byteLength(value) + '\0').update(value).digest('hex');
const sha256 = value => createHash('sha256').update(value).digest('hex');
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) throw new Error('SAFE_DEFAULTS_ANCHOR_MISMATCH: ' + label);
  return source.slice(0, first) + after + source.slice(first + before.length);
}
function replaceTest(source, anchor, replacement) {
  const at = source.indexOf(anchor);
  if (at < 0 || source.indexOf(anchor, at + anchor.length) >= 0) throw new Error('SAFE_DEFAULTS_TEST_ANCHOR_MISMATCH');
  const start = source.lastIndexOf('test(', at);
  const end = source.indexOf('\n\ntest(', at);
  if (start < 0 || end < 0) throw new Error('SAFE_DEFAULTS_TEST_BOUNDS');
  return source.slice(0, start) + replacement + source.slice(end);
}
function patchUi(source) {
  const component = source.indexOf('function ApiSettings(');
  const start = source.indexOf('    <p className="muted">', component);
  const close = source.indexOf('</p>', start);
  if (component < 0 || start < 0 || close < 0) throw new Error('SAFE_DEFAULTS_UI_ANCHOR_MISSING');
  const original = source.slice(start, close + 4);
  if (!original.includes('填写后离开输入框')) throw new Error('SAFE_DEFAULTS_UI_SOURCE_CHANGED');
  return source.slice(0, close + 4) + '\n    <p className="muted">打开抖音会先进入准备页，视频保持暂停；连接模型后，在业务设置中明确开启自主观看，程序接管准备页后才会播放。</p>' + source.slice(close + 4);
}
function patchVerifier(source) {
  const label = '允许好友互动';
  const before = [
    `  await page.getByRole('switch', { name: '${label}', exact: true }).waitFor();`,
    `  if (!(await readStatus('/api/interactions/state')).policy.enabled) { await page.getByRole('switch', { name: '${label}', exact: true }).click(); await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true); }`,
    `  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
    `  await until(async () => await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked') === 'true');`,
    `  assert.equal(await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked'), 'true');`,
  ].join('\n');
  const after = [
    `  await page.getByRole('switch', { name: '${label}', exact: true }).waitFor();`,
    `  const friendMasterDefaultEnabled = (await readStatus('/api/interactions/state')).policy.enabled;`,
    `  assert.equal(friendMasterDefaultEnabled, false, 'Friend interaction master switch must default off.');`,
    `  assert.equal(await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked'), 'false');`,
    `  await page.getByRole('switch', { name: '${label}', exact: true }).click();`,
    `  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
    `  await until(async () => await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked') === 'true');`,
    `  assert.equal(await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked'), 'true');`,
  ].join('\n');
  let result = replaceOnce(source, before, after, 'packaged verifier proves default off before explicit opt in');
  return replaceOnce(
    result,
    'friendMasterDefaultEnabled:true',
    "friendMasterDefaultEnabled: checks.status['/api/interactions/state'].policy.enabled",
    'packaged receipt records actual default-off status'
  );
}
export function patchText(file, source) {
  if (file === 'autonomous-watch.mjs') return replaceOnce(
    source,
    "      if (readyWork(state) || isLivePreview(state)||isLiveRoom(state)) return current;",
    "      if (state.video?.id && state.video.readyState < 2 && state.video.paused === true) {\n        current = await this.execute('douyin_play');\n        continue;\n      }\n      if (readyWork(state) || isLivePreview(state)||isLiveRoom(state)) return current;",
    'prime paused unready video before readiness wait');
  if (file === 'friend-interactions.mjs') return replaceOnce(source, 'const defaults = () => ({ version: 1, enabled: true });', 'const defaults = () => ({ version: 1, enabled: false });', 'friend default');
  if (file === 'tests/friend-interactions.test.mjs') return replaceTest(source, 'const f = fixture(t, { missingPolicy: true });', `test('missing friend policy defaults off without actions', async t => {
  const f = fixture(t, { missingPolicy: true });
  assert.equal(f.coordinator.state().policy.enabled, false);
  assert.equal(fs.existsSync(f.coordinator.policyFile), false);
  await f.coordinator.reconcile(); await f.coordinator.reconcile();
  assert.deepEqual(f.calls, []);
  assert.equal(f.shared.enabled, false);
  assert.equal(f.current.running, false);
});`);
  if (file === 'tests/friend-auto-prepare.test.mjs') {
    let result = replaceOnce(source,
      "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-')), calls = { prepare: 0, start: 0, model: 0, sent: 0 }; let present = true;",
      "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-')), calls = { prepare: 0, start: 0, model: 0, sent: 0 }; let present = true;\n  fs.writeFileSync(path.join(stateDir, 'friend-interactions-policy.json'), JSON.stringify({ version: 1, enabled: true }));",
      'auto prepare unit fixture explicit opt in');
    result = replaceOnce(result,
      "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);",
      "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory); fs.writeFileSync(path.join(stateDir, 'friend-interactions-policy.json'), JSON.stringify({ version: 1, enabled: true }));",
      'Edge prepare explicit opt in');
    return replaceOnce(result,
      "DEEPSEEK_SHARED_MEMORY_DB: path.join(directory, 'memory', 'absent.sqlite') } });",
      "DEEPSEEK_SHARED_MEMORY_DB: path.join(directory, 'memory', 'absent.sqlite'), DOUYIN_BROWSER_PROFILE_DIR: path.join(directory, '.yutang-observer-isolated', 'cli-profile'), DOUYIN_BROWSER_CONTROL_DIR: path.join(directory, '.yutang-observer-isolated', 'control') } });",
      'child probe uses its own temporary browser profile and control directory');
  }
  if (file === 'tests/chat-starting-recovery.test.mjs') return replaceOnce(
    source,
    '  let starts=0;const friend=new FriendInteractions({stateDir,getChat:()=>service,getShare:()=>({state:()=>({enabled:true}),configure:async()=>{}}),modelReady:()=>true,startChat:async chat=>{starts++;return chat.start({schedule:false});}});',
    "  fs.writeFileSync(path.join(stateDir, 'friend-interactions-policy.json'), JSON.stringify({ version: 1, enabled: true }));\n  let starts=0;const friend=new FriendInteractions({stateDir,getChat:()=>service,getShare:()=>({state:()=>({enabled:true}),configure:async()=>{}}),modelReady:()=>true,startChat:async chat=>{starts++;return chat.start({schedule:false});}});",
    'chat starting recovery explicit opt in');
  if (file === 'tests/friend-chat-share-isolation.test.mjs') return replaceOnce(source,
    "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));",
    "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));\n  write(path.join(stateDir, 'friend-interactions-policy.json'), { version: 1, enabled: true });",
    'chat share explicit opt in');
  if (file === 'desktop/ui-api/src/main.jsx') return patchUi(source);
  if (file === 'desktop/scripts/verify-packaged-api.mjs') return patchVerifier(source);
  throw new Error('SAFE_DEFAULTS_UNSUPPORTED_PATH: ' + file);
}
export async function apply(root) {
  const actual = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actual !== BASE) throw new Error('SAFE_DEFAULTS_WRONG_UPSTREAM_COMMIT: ' + actual);
  for (const [file, expected] of Object.entries(ORIGINAL)) {
    const value = await fs.readFile(path.join(root, file), 'utf8');
    if (blobSha(value) !== expected) throw new Error('SAFE_DEFAULTS_SOURCE_BLOB_MISMATCH: ' + file);
  }
  const schedule = await fs.readFile(path.join(root, 'scheduled-watch.mjs'), 'utf8');
  if (!schedule.includes('defaultPolicy={enabled:false}')) throw new Error('AUTONOMOUS_WATCH_DEFAULT_MUST_REMAIN_OFF');
  const pages = await fs.readFile(path.join(root, 'browser-pages.mjs'), 'utf8');
  if (!pages.includes('adoptSharedPreparePage') || !pages.includes('entry?.release()')) throw new Error('PREPARE_PAGE_ADOPTION_PATH_MISSING');
  const launcher = await fs.readFile(path.join(root, 'browser-launcher.mjs'), 'utf8');
  if (!launcher.includes('entry.adopted') || !launcher.includes('entry.release =') || !launcher.includes('pauseAll')) throw new Error('PREPARE_PAGE_PAUSE_GUARD_MISSING');
  const core = await fs.readFile(path.join(root, 'core.mjs'), 'utf8');
  if (!core.includes('this.page=await adoptSharedPreparePage')) throw new Error('CORE_PREPARE_PAGE_ADOPTION_MISSING');
  const openrouter = JSON.parse(await fs.readFile(path.join(root, 'openrouter-desktop-patch-receipt.json'), 'utf8'));
  const update = JSON.parse(await fs.readFile(path.join(root, 'windows-update-trust-patch-receipt.json'), 'utf8'));
  if (openrouter.upstreamCommit !== BASE || update.upstreamCommit !== BASE) throw new Error('PRIOR_SOURCE_RECEIPT_MISMATCH');
  const uiPath = path.join(root, 'desktop/ui-api/src/main.jsx');
  const verifierPath = path.join(root, 'desktop/scripts/verify-packaged-api.mjs');
  if (sha256(await fs.readFile(uiPath)) !== openrouter.modifiedSourceSha256['desktop/ui-api/src/main.jsx']) throw new Error('UI_SOURCE_RECEIPT_SHA_MISMATCH');
  if (sha256(await fs.readFile(verifierPath)) !== update.modifiedSourceSha256['desktop/scripts/verify-packaged-api.mjs']) throw new Error('VERIFIER_SOURCE_RECEIPT_SHA_MISMATCH');
  const changed = [];
  for (const [file, expected] of Object.entries(ORIGINAL)) {
    const target = path.join(root, file);
    const original = await fs.readFile(target, 'utf8');
    const patched = patchText(file, original);
    await fs.writeFile(target, patched);
    changed.push({ file, originalBlobSha1: expected, patchedSha256: sha256(patched) });
  }
  for (const file of ['desktop/ui-api/src/main.jsx', 'desktop/scripts/verify-packaged-api.mjs']) {
    const target = path.join(root, file);
    const original = await fs.readFile(target, 'utf8');
    const patched = patchText(file, original);
    await fs.writeFile(target, patched);
    changed.push({ file, originalSourceSha256: sha256(original), patchedSha256: sha256(patched) });
  }
  const autonomousWatch = await fs.readFile(path.join(root, 'autonomous-watch.mjs'), 'utf8');
  if (!autonomousWatch.includes('state.video?.id && state.video.readyState < 2 && state.video.paused === true') ||
      !autonomousWatch.includes("current = await this.execute('douyin_play')")) throw new Error('PREPARE_PAGE_UNREADY_VIDEO_PRIMING_NOT_PROVEN');
  const friend = await fs.readFile(path.join(root, 'friend-interactions.mjs'), 'utf8');
  const ui = await fs.readFile(uiPath, 'utf8');
  const verifier = await fs.readFile(verifierPath, 'utf8');
  if (!friend.includes('const defaults = () => ({ version: 1, enabled: false });')) throw new Error('FRIEND_INTERACTIONS_DEFAULT_OFF_NOT_PROVEN');
  if (!ui.includes('视频保持暂停') || !ui.includes('明确开启自主观看')) throw new Error('PREPARE_PAGE_DISCLOSURE_NOT_PROVEN');
  if (!verifier.includes('assert.equal(friendMasterDefaultEnabled, false') || !verifier.includes("assert.equal(checks.status['/api/interactions/state'].policy.enabled, false);") || !verifier.includes("friendMasterDefaultEnabled: checks.status['/api/interactions/state'].policy.enabled")) throw new Error('PACKAGED_DEFAULT_OFF_ASSERTION_MISSING');
  const receipt = {
    schema: 'yutang.windows147-safe-defaults.v1',
    status: 'PASS_EXACT_SOURCE_SAFE_DEFAULTS_AND_PREPARE_DISCLOSURE',
    upstreamCommit: BASE,
    changed,
    friendInteractionsDefaultEnabled: false,
    scheduledAutonomousWatchDefaultEnabled: false,
    preparePageStartsPaused: true,
    prepareAdoptionPathVerified: true,
    preparePageUnreadyVideoPrimedBeforeWait: true,
    uiExplainsExplicitWatchOptIn: true,
    realModelCalled: false,
    realMessageSent: false,
    release: false,
  };
  await fs.writeFile(path.join(root, 'windows147-safe-defaults-patch-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('PASS_SAFE_DEFAULTS_PATCH ' + JSON.stringify(receipt));
  return receipt;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  apply(process.argv[2]).catch(error => { console.error('SAFE_DEFAULTS_FAIL_CLOSED ' + error.message); process.exitCode = 1; });
}
