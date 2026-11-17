import test from 'node:test';
import assert from 'node:assert/strict';
import { patchText } from '../tools/apply_windows147_safe_defaults.mjs';

test('friend interaction master default changes from on to off', () => {
  const source = 'const defaults = () => ({ version: 1, enabled: true });';
  const patched = patchText('friend-interactions.mjs', source);
  assert.ok(patched.includes('enabled: false'));
});

test('missing friend policy test proves disabled state and zero actions', () => {
  const source = [
    "test('old', async t => {",
    '  const f = fixture(t, { missingPolicy: true });',
    '});',
    '',
    "test('next', () => {});"
  ].join('\n');
  const patched = patchText('tests/friend-interactions.test.mjs', source);
  assert.ok(patched.includes('policy.enabled, false'));
  assert.ok(patched.includes('assert.deepEqual(f.calls, [])'));
  assert.ok(patched.includes('f.shared.enabled, false'));
});

test('auto-prepare fixtures explicitly opt in and child probes use their own temporary browser directories', () => {
  const unit = "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-')), calls = { prepare: 0, start: 0, model: 0, sent: 0 }; let present = true;";
  const edge = "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);";
  const child = "DEEPSEEK_SHARED_MEMORY_DB: path.join(directory, 'memory', 'absent.sqlite') } });";
  const patched = patchText('tests/friend-auto-prepare.test.mjs', unit + '\\n' + edge + '\\n' + child);
  assert.ok(patched.includes('friend-interactions-policy.json'));
  assert.ok(patched.includes('enabled: true'));
  assert.ok(patched.includes('douyin-auto-prepare-'));
  assert.ok(patched.includes("DOUYIN_BROWSER_PROFILE_DIR: path.join(directory, '.yutang-observer-isolated', 'cli-profile')"));
  assert.ok(patched.includes("DOUYIN_BROWSER_CONTROL_DIR: path.join(directory, '.yutang-observer-isolated', 'control')"));
});
test('chat starting recovery fixture explicitly opts in', () => {
  const source = "  let starts=0;const friend=new FriendInteractions({stateDir,getChat:()=>service,getShare:()=>({state:()=>({enabled:true}),configure:async()=>{}}),modelReady:()=>true,startChat:async chat=>{starts++;return chat.start({schedule:false});}});";
  const patched = patchText('tests/chat-starting-recovery.test.mjs', source);
  assert.ok(patched.includes('friend-interactions-policy.json'));
  assert.ok(patched.includes('enabled: true'));
});

test('chat and share isolation fixture explicitly opts in', () => {
  const source = "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));";
  const patched = patchText('tests/friend-chat-share-isolation.test.mjs', source);
  assert.ok(patched.includes('friend-interactions-policy.json'));
  assert.ok(patched.includes('enabled: true'));
});

test('setup UI explains prepare page remains paused until explicit watch opt-in', () => {
  const source = 'function ApiSettings() {\n    <p className="muted">填写后离开输入框即可保存。</p>';
  const patched = patchText('desktop/ui-api/src/main.jsx', source);
  assert.ok(patched.includes('视频保持暂停'));
  assert.ok(patched.includes('明确开启自主观看'));
});

test('packaged verifier asserts UI and API default off before explicit opt in', () => {
  const label = '允许好友互动';
  const source = [
    `  await page.getByRole('switch', { name: '${label}', exact: true }).waitFor();`,
    `  if (!(await readStatus('/api/interactions/state')).policy.enabled) { await page.getByRole('switch', { name: '${label}', exact: true }).click(); await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true); }`,
    `  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
    `  await until(async () => await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked') === 'true');`,
    `  assert.equal(await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked'), 'true');`,
    "  assert.equal(checks.status['/api/interactions/state'].policy.enabled, false);",
    '  const receipt = { renderer: { friendMasterDefaultEnabled:true } };'
  ].join('\n');
  const patched = patchText('desktop/scripts/verify-packaged-api.mjs', source);
  assert.ok(patched.includes('assert.equal(friendMasterDefaultEnabled, false'));
  assert.ok(patched.includes("getAttribute('aria-checked'), 'false'"));
  assert.ok(patched.includes("friendMasterDefaultEnabled: checks.status['/api/interactions/state'].policy.enabled"));
});
test('autonomous startup plays a paused unready video before waiting for its first decoded frame', () => {
  const source = "      if (readyWork(state) || isLivePreview(state)||isLiveRoom(state)) return current;";
  const patched = patchText('autonomous-watch.mjs', source);
  assert.ok(patched.includes('state.video?.id && state.video.readyState < 2 && state.video.paused === true'));
  assert.ok(patched.includes("current = await this.execute('douyin_play')"));
  assert.ok(patched.includes('continue;'));
});

test('patcher fails closed when source anchor is ambiguous', () => {
  const anchor = 'const defaults = () => ({ version: 1, enabled: true });';
  assert.throws(() => patchText('friend-interactions.mjs', anchor + '\n' + anchor), /ANCHOR_MISMATCH/);
});
