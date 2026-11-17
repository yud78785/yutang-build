import test from 'node:test';
import assert from 'node:assert/strict';
import { patchText } from '../tools/apply_windows147_safe_defaults.mjs';

test('friend master defaults off', () => {
  assert.match(patchText('friend-interactions.mjs', 'const defaults = () => ({ version: 1, enabled: true });'), /enabled: false/);
});

test('missing policy test proves no automatic actions', () => {
  const source = "test('old', async t => {\n  const f = fixture(t, { missingPolicy: true });\n});\n\ntest('next',()=>{});";
  const patched = patchText('tests/friend-interactions.test.mjs', source);
  assert.match(patched, /policy\.enabled, false/);
  assert.match(patched, /assert\.deepEqual\(f\.calls, \[\]\)/);
  assert.match(patched, /f\.shared\.enabled, false/);
});

test('auto-prepare unit fixture explicitly opts in', () => {
  const source = 'const create = (chat = service, extra = {}) => { const coordinator = new FriendInteractions({ stateDir, getChat: () => chat, getShare: () => share, modelReady: () => true, startChat: async (value, { signal }) => { calls.start++; return value.start({ schedule: false, signal }); }, ...extra }); coordinators.push(coordinator); return coordinator; };';
  const patched = patchText('tests/friend-auto-prepare.test.mjs', source);
  assert.match(patched, /friend-interactions-policy\.json/);
  assert.match(patched, /enabled: true/);
});

test('Edge prepare fixture explicitly opts in', () => {
  const source = "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);";
  const patched = patchText('tests/friend-auto-prepare.test.mjs', source);
  assert.match(patched, /friend-interactions-policy\.json/);
});

test('chat and share isolation fixture explicitly opts in', () => {
  const source = "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));";
  const patched = patchText('tests/friend-chat-share-isolation.test.mjs', source);
  assert.match(patched, /friend-interactions-policy\.json/);
  assert.match(patched, /enabled: true/);
});

test('setup UI explains prepare page remains paused until explicit watch opt-in', () => {
  const source = 'function ApiSettings() {\n    <p className="muted">填写后离开输入框即可保存。</p>';
  const patched = patchText('desktop/ui-api/src/main.jsx', source);
  assert.match(patched, /视频保持暂停/);
  assert.match(patched, /明确开启自主观看/);
});

test('packaged verifier asserts default off before explicit opt-in', () => {
  const label = '允许好友互动';
  const source = [
    `  await page.getByRole('switch', { name: '${label}', exact: true }).waitFor();`,
    `  if (!(await readStatus('/api/interactions/state')).policy.enabled) { await page.getByRole('switch', { name: '${label}', exact: true }).click(); await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true); }`,
    `  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
    `  await until(async () => await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked') === 'true');`,
    `  assert.equal(await page.getByRole('switch', { name: '${label}', exact: true }).getAttribute('aria-checked'), 'true');`,
    '  const receipt = { friendMasterDefaultEnabled:true };'
  ].join('\n');
  const patched = patchText('desktop/scripts/verify-packaged-api.mjs', source);
  assert.match(patched, /friendMasterDefaultEnabled, false/);
  assert.match(patched, /await page\.getByRole\('switch'.*\.click\(\)/);
});

test('patcher fails closed when a source anchor is ambiguous', () => {
  const anchor = 'const defaults = () => ({ version: 1, enabled: true });';
  assert.throws(() => patchText('friend-interactions.mjs', anchor + '\n' + anchor), /ANCHOR_MISMATCH/);
});
