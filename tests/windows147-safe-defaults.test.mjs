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

test('auto-prepare unit and Edge test fixtures explicitly opt in', () => {
  const helper = 'const create = (chat = service, extra = {}) => { const coordinator = new FriendInteractions({ stateDir, getChat: () => chat, getShare: () => share, modelReady: () => true, startChat: async (value, { signal }) => { calls.start++; return value.start({ schedule: false, signal }); }, ...extra }); coordinators.push(coordinator); return coordinator; };';
  const edge = "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);";
  const patched = patchText('tests/friend-auto-prepare.test.mjs', helper + '\n' + edge);
  assert.ok(patched.includes('friend-interactions-policy.json'));
  assert.ok(patched.includes('enabled: true'));
  assert.ok(patched.includes('fs.writeFileSync(path.join(stateDir'));
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

test('packaged verifier keeps default-off assertion and records observed state', () => {
  const source = "  assert.equal(checks.status['/api/interactions/state'].policy.enabled, false);\n  const receipt = { renderer: { friendMasterDefaultEnabled:true } };";
  const patched = patchText('desktop/scripts/verify-packaged-api.mjs', source);
  assert.ok(patched.includes("friendMasterDefaultEnabled: checks.status['/api/interactions/state'].policy.enabled"));
});

test('patcher fails closed when source anchor is ambiguous', () => {
  const anchor = 'const defaults = () => ({ version: 1, enabled: true });';
  assert.throws(() => patchText('friend-interactions.mjs', anchor + '\n' + anchor), /ANCHOR_MISMATCH/);
});
