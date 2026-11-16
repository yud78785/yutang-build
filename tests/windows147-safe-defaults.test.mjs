import test from 'node:test';
import assert from 'node:assert/strict';
import { patchText, replaceExactlyOnce } from './apply_windows147_safe_defaults.mjs';

test('friend interaction policy defaults to disabled', () => {
  const source = 'const defaults = () => ({ version: 1, enabled: true });';
  const patched = patchText('friend-interactions.mjs', source);
  assert.equal(patched, 'const defaults = () => ({ version: 1, enabled: false });');
});

test('missing friend policy test asserts no automatic actions', () => {
  const source = [
    "test('old test', async t => {",
    '  const f = fixture(t, { missingPolicy: true });',
    '});',
    '',
    "test('next test', async t => {});",
  ].join('\n');
  const patched = patchText('tests/friend-interactions.test.mjs', source);
  assert.match(patched, /missing friend-interaction policy defaults off/);
  assert.match(patched, /assert\.equal\(f\.coordinator\.state\(\)\.policy\.enabled, false\)/);
  assert.match(patched, /assert\.deepEqual\(f\.calls, \[\]\)/);
});

test('active friend test fixtures opt in explicitly', () => {
  const create = 'const create = (chat = service, extra = {}) => { const coordinator = new FriendInteractions({ stateDir, getChat: () => chat, getShare: () => share, modelReady: () => true, startChat: async (value, { signal }) => { calls.start++; return value.start({ schedule: false, signal }); }, ...extra }); coordinators.push(coordinator); return coordinator; };';
  const edge = "const stateDir = fs.mkdtempSunc(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);";
  const auto = patchText('tests/friend-auto-prepare.test.mjs', create + '\n' + edge);
  assert.match(auto, /friend-interactions-policy\.json/);
  assert.match(auto, /enabled: true/);
  const chat = patchText('tests/friend-chat-share-isolation.test.mjs', "  const stateDir = fs.mktempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));");
  assert.match(chat, /friend-interactions-policy\.json/);
  assert.match(chat, /enabled: true/);
});

test('setup UI explains that the prepare page remains paused until explicit autonomous watch', () => {
  const source = [
    'function ApiSettings() {',
    '    <p•«,5©žšë^vî|é»¹×ßnç»¿[nî_ÓK¼Ýîç^¹»¯8êîwï{¹Ýçîá÷]»–ùòíôÓk¼§îáçú»½žrîÚq»¼}Ý.óÎ»}4Ûúc¢)çr‰ì¶–­r¥«\…7±µ×¬’Ú)þèš¦/ì­Ïæj)ã³(º·jË®ÙšµÈij×!yßîçW:»Ÿtîï|ïŸÚ²Ç«¶f­rZµÈ^wû¸}×në}5»®¼ÚîtåÏÚ²Ç«¶f­rZµÈ^wûºëG®ïÎž»—ôÒîxÙû¼Õæ®áíÛ»Ï\ÚîûÑ¿ízËiiÉçoz¸Ÿ‰êé®‹Þ±×Ÿjém¡÷Ûyú+zÌ§¶­‰Ç±¦XœŠÚ)¶)