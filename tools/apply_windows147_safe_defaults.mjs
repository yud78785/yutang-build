import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const BASE='9c49833078f4b4d18b9211ef86d024e7f2e15739';
const B={
'friend-interactions.mjs':'be5b6764cc56b0c77cb8bc84554751166be3a0f1',
'tests/friend-interactions.test.mjs':'c19a00077aa866a61d460280ab7d5d7513db05ba',
'tests/friend-auto-prepare.test.mjs':'b3947d922993120361d507b5b2afcc7bd3390c5b',
'tests/friend-chat-share-isolation.test.mjs':'58deaee9f8a1e00cc9fb49cdb6229bf1b4cf4f3b'};
const U={
'scheduled-watch.mjs':'ffc931887d0ff65d88df3b361b847a473684de17',
'browser-pages.mjs':'8a0a74b4d237b0051d08697a81e3deb84fa580dc'};
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');
function once(s,a,b,n){let i=s.indexOf(a);if(i<0||s.indexOf(a,i+a.length)>=0)throw Error('ANCHOR_MISMATCH '+n);return s.slice(0,i)+b+s.slice(i+a.length)}
function testBlock(s,anchor,repl){let i=s.indexOf(anchor);if(i<0||s.indexOf(anchor,i+anchor.length)>=0)throw Error('TEST_ANCHOR_MISMATCH');let a=s.lastIndexOf('test(',i),z=s.indexOf('\n\ntest(',i);if(a<0||z<0)throw Error('TEST_BOUNDS');return s.slice(0,a)+repl+s.slice(z)}
function ui(s){let i=s.indexOf('function ApiSettings('),a=s.indexOf('    <p className="muted">',i),z=s.indexOf('</p>',a);if(i<0||a<0||z<0)throw Error('UI_ANCHOR');let p=s.slice(a,z+4);if(!p.includes('填写后离开输入框'))throw Error('UI_SOURCE_MISMATCH');return s.slice(0,z+4)+'\n    <p className="muted">打开抖音会先进入准备页，视频保持暂停；连接模型后，在业务设置中明确开启自主观看，程序接管准备页后才会播放。</p>'+s.slice(z+4)}
function verifier(s){const l='允许好友互动';const a=[
`  await page.getByRole('switch', { name: '${l}', exact: true }).waitFor();`,
`  if (!(await readStatus('/api/interactions/state')).policy.enabled) { await page.getByRole('switch', { name: '${l}', exact: true }).click(); await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true); }`,
`  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
`  await until(async () => await page.getByRole('switch', { name: '${l}', exact: true }).getAttribute('aria-checked') === 'true');`,
`  assert.equal(await page.getByRole('switch', { name: '${l}', exact: true }).getAttribute('aria-checked'), 'true');`].join('\n');
const b=[
`  await page.getByRole('switch', { name: '${l}', exact: true }).waitFor();`,
`  const friendMasterDefaultEnabled = (await readStatus('/api/interactions/state')).policy.enabled;`,
`  assert.equal(friendMasterDefaultEnabled, false, 'Friend interaction master switch must default off.');`,
`  assert.equal(await page.getByRole('switch', { name: '${l}', exact: true }).getAttribute('aria-checked'), 'false');`,
`  await page.getByRole('switch', { name: '${l}', exact: true }).click();`,
`  await until(async () => (await readStatus('/api/interactions/state')).policy.enabled === true);`,
`  await until(async () => await page.getByRole('switch', { name: '${l}', exact: true }).getAttribute('aria-checked') === 'true');`,
`  assert.equal(await page.getByRole('switch', { name: '${l}', exact: true }).getAttribute('aria-checked'), 'true');`].join('\n');
s=once(s,a,b,'verifier default off');return once(s,'friendMasterDefaultEnabled:true','friendMasterDefaultEnabled','receipt default')}
export function patchText(p,s){
if(p==='friend-interactions.mjs')return once(s,'const defaults = () => ({ version: 1, enabled: true });','const defaults = () => ({ version: 1, enabled: false });','friend default');
if(p==='tests/friend-interactions.test.mjs')return testBlock(s,'const f = fixture(t, { missingPolicy: true });',`test('missing friend policy defaults off without actions', async t => {
  const f = fixture(t, { missingPolicy: true });
  assert.equal(f.coordinator.state().policy.enabled, false);
  assert.equal(fs.existsSync(f.coordinator.policyFile), false);
  await f.coordinator.reconcile(); await f.coordinator.reconcile();
  assert.deepEqual(f.calls, []);
  assert.equal(f.shared.enabled, false);
  assert.equal(f.current.running, false);
});`);
if(p==='tests/friend-auto-prepare.test.mjs'){
s=once(s,'const create = (chat = service, extra = {}) => { const coordinator = new FriendInteractions({ stateDir, getChat: () => chat, getShare: () => share, modelReady: () => true, startChat: async (value, { signal }) => { calls.start++; return value.start({ schedule: false, signal }); }, ...extra }); coordinators.push(coordinator); return coordinator; };','const create = (chat = service, extra = {}) => { const coordinator = new FriendInteractions({ stateDir, getChat: () => chat, getShare: () => share, modelReady: () => true, startChat: async (value, { signal }) => { calls.start++; return value.start({ schedule: false, signal }); }, ...extra }); fs.writeFileSync(coordinator.policyFile, JSON.stringify({ version: 1, enabled: true })); coordinators.push(coordinator); return coordinator; };','auto prepare explicit opt in');
return once(s,"const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory);","const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-auto-prepare-edge-')), controlDirectory = path.join(stateDir, 'control'); fs.mkdirSync(controlDirectory); fs.writeFileSync(path.join(stateDir, 'friend-interactions-policy.json'), JSON.stringify({ version: 1, enabled: true }));",'edge prepare opt in')}
if(p==='tests/friend-chat-share-isolation.test.mjs')return once(s,"  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));","  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyin-chat-share-isolation-'));\n  write(path.join(stateDir, 'friend-interactions-policy.json'), { version: 1, enabled: true });",'chat share opt in');
if(p==='desktop/ui-api/src/main.jsx')return ui(s);
if(p==='desktop/scripts/verify-packaged-api.mjs')return verifier(s);
throw Error('unsupported patch path '+p)}
export async function apply(root){
const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(head!==BASE)throw Error('wrong upstream commit '+head);
for(const [p,h] of Object.entries(U)){const s=await fs.readFile(path.join(root,p),'utf8');if(blob(s)!==h)throw Error('unchanged blob mismatch '+p)}
const schedule=await fs.readFile(path.join(root,'scheduled-watch.mjs'),'utf8');if(!schedule.includes('defaultPolicy={enabled:false}'))throw Error('autonomous watch default must remain off');
const pages=await fs.readFile(path.join(root,'browser-pages.mjs'),'utf8');if(!pages.includes('adoptSharedPreparePage')||!pages.includes('entry?.release()'))throw Error('prepare adoption missing');
const launcher=await fs.readFile(path.join(root,'browser-launcher.mjs'),'utf8');if(!launcher.includes('entry.adopted')||!launcher.includes('entry.release =')||!launcher.includes('pauseAll'))throw Error('prepare pause guard missing');
const core=await fs.readFile(path.join(root,'core.mjs'),'utf8');if(!core.includes('this.page=await adoptSharedPreparePage'))throw Error('core adoption missing');
const receipt=JSON.parse(await fs.readFile(path.join(root,'openrouter-desktop-patch-receipt.json'),'utf8'));if(receipt.upstreamCommit!==BASE)throw Error('OpenRouter source receipt invalid');
const upd=JSON.parse(await fs.readFile(path.join(root,'windows-update-trust-patch-receipt.json'),'utf8'));if(upd.upstreamCommit!==BASE)throw Error('update trust source receipt invalid');
const uiPath=path.join(root,'desktop/ui-api/src/main.jsx'),verPath=path.join(root,'desktop/scripts/verify-packaged-api.mjs');
for(const [p,h] of [['desktop/ui-api/src/main.jsx',receipt.modifiedSourceSha256['desktop/ui-api/src/main.jsx']],['desktop/scripts/verify-packaged-api.mjs',upd.modifiedSourceSha256['desktop/scripts/verify-packaged-api.mjs']]])if(hash(await fs.readFile(path.join(root,p)))!==h)throw Error('post patch sha mismatch '+p);
const changed=[];
for(const [p,h] of Object.entries(B)){const f=path.join(root,p),s=await fs.readFile(f,'utf8');if(blob(s)!==h)throw Error('source blob mismatch '+p);const n=patchText(p,s);await fs.writeFile(f,n);changed.push({path:p,originalBlob:h,patchedSha256:hash(n)})}
for(const p of ['desktop/ui-api/src/main.jsx','desktop/scripts/verify-packaged-api.mjs']){const f=path.join(root,p),s=await fs.readFile(f,'utf8'),n=patchText(p,s);await fs.writeFile(f,n);changed.push({path:p,originalPostPatchSha256:hash(s),patchedSha256:hash(n)})}
const friend=await fs.readFile(path.join(root,'friend-interactions.mjs'),'utf8'),u=await fs.readFile(uiPath,'utf8'),v=await fs.readFile(verPath,'utf8');
if(!friend.includes('const defaults = () => ({ version: 1, enabled: false });'))throw Error('friend default not off');
if(!u.includes('视频保持暂停')||!u.includes('明确开启自主观看'))throw Error('prepare disclosure missing');
if(!v.includes('friendMasterDefaultEnabled, false'))throw Error('packaged default-off assertion missing');
const out={schema:'yutang.windows147-safe-defaults.v1',status:'PASS_EXACT_SOURCE_SAFE_DEFAULTS_AND_PREPARE_DISCLOSURE',upstreamCommit:BASE,changed,friendInteractionsDefaultEnabled:false,scheduledAutonomousWatchDefaultEnabled:false,preparePageStartsPaused:true,prepareAdoptionPathVerified:true,uiExplainsExplicitWatchOptIn:true,realModelCalled:false,realMessageSent:false,release:false};
await fs.writeFile(path.join(root,'windows147-safe-defaults-patch-receipt.json'),JSON.stringify(out,null,2)+'\n');console.log('PASS_SAFE_DEFAULTS_PATCH '+JSON.stringify(out));return out}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)apply(process.argv[2]).catch(e=>{console.error('SAFE_DEFAULTS_FAIL_CLOSED '+e.message);process.exitCode=1});
