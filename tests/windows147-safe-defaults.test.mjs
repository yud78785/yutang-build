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

test('auto-prepare unit and Edge fixtures explicitly opt in', () => {
  const unit = "  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-')), calls = { prepare: 0, start: 0, model: 0, sent: 0 }; let present = true;";
  const edge = "const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);";
  const patched = patchText('tests/friend-auto-prepare.test.mjs', unit + '\\n' + edge);
  assert.ok(patched.includes('friend-interactions-policy.json'));
  assert.ok(patched.includes('enabled: true'));
  assert.ok(patched.includes('douyin-auto-prepare-'));
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

test('packaged verifier keeps default-off assertion and records observed state', () => {
  const source = "  assert.equal(checks.status['/api/interactions/state'].policy.enabled, false);\n  const receipt = { renderer: { friendMasterDefaultEnabled:true } };";
  const patched = patchText('desktop/scripts/verify-packaged-api.mjs', source);
  assert.ok(patched.includes("friendMasterDefaultEnabled: checks.status['/api/interactions/state'].policy.enabled"));
});

test('patcher fails closed when source anchor is ambiguous', () => {
  const anchor = 'const defaults = () => ({ version: 1, enabled: true });';
  assert.throws(() => patchText('friend-interactions.mjs', anchor + '\n' + anchor), /ANCHOR_MISMATCH/);
});
