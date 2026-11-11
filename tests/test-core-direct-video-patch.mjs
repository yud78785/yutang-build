import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import {
  applyPatch, normalizeDirectVideoUrl, isSameDirectVideoPage,
  EXPECTED_POST_JOBGUARD_SHA256
} from '../tools/patch-core-direct-video.mjs';

const id = '7577614489533680959';
const direct = 'https://www.douyin.com/video/' + id;
assert.equal(normalizeDirectVideoUrl(direct), direct);
assert.equal(normalizeDirectVideoUrl(direct + '?share_token=SECRET#tag'), direct);
for (const unsafe of [
  'http://www.douyin.com/video/' + id,
  'https://www.douyin.com.evil.example/video/' + id,
  'https://attacker@www.douyin.com/video/' + id,
  'https://www.douyin.com/video/not-a-number',
  'https://www.douyin.com/video/' + id + '/other',
  'https://evil.example/video/' + id,
  'file:///video/' + id,
  'https://www.douyin.com/video/' + id + ':9227'
]) assert.equal(normalizeDirectVideoUrl(unsafe), null, unsafe);
assert.equal(isSameDirectVideoPage(direct+'?foo=bar',direct),true);
assert.equal(isSameDirectVideoPage('https://www.douyin.com/video/'+id+'9',direct),false);
assert.equal(isSameDirectVideoPage('https://evil.example/video/'+id,direct),false);
assert.equal(isSameDirectVideoPage('https://www.douyin.com/login',direct),false);

const actionAnchor = "const VIDEO_ACTIONS=new Set(['douyin_open','douyin_search','douyin_open_video','douyin_next','douyin_previous','douyin_observe','douyin_screenshot','douyin_video_zoom','douyin_play','douyin_listen']);";
const fixture = [
  actionAnchor,
  "const RECOMMEND = 'https://www.douyin.com/?recommend=1';",
  "const aborted = () => {};",
  'class Probe {',
  '  constructor(start="about:blank") { this.current=start; this.visited=[]; this.page={url:()=>this.current}; }',
  '  async navigate(url,signal) { this.visited.push(url); this.current=url; }',
  '  async connect(signal, { launch = true, create = true, authorizePrepare } = {}) {',
  '    if (this.page.url()==="about:blank") {',
  '       if (false) await this.navigate("never",signal);',
  '       else await this.navigate(RECOMMEND,signal);',
  '    }',
  '  }',
  '  async execute(name,args={}) {',
  '    const signal=null;',
  '        await this.connect(signal);',
  '        aborted(signal);',
  "        if (name==='douyin_open_video') {",
  '          if (args.url) await this.navigate(`https://www.douyin.com/video/${/\\/video\\/(\\d+)/.exec(args.url)[1]}`,signal);',
  '        }',
  '  }',
  '}',
  'globalThis.Probe = Probe;'
].join('\n');
const hash = createHash('sha256').update(fixture).digest('hex');
assert.notEqual(hash,EXPECTED_POST_JOBGUARD_SHA256,'synthetic fixture must not be mistaken for real core');
assert.throws(()=>applyPatch(fixture),/SHA256 mismatch/);
const {patched} = applyPatch(fixture,hash);
assert.match(patched,/initialDirectVideoReceipt.completed = true/);
assert.match(patched,/initialDirectVideoReceipt\?\.completed !== true/);
const context = vm.createContext({URL,globalThis:{}});
vm.runInContext(patched,context,{timeout:1000});
const Probe = context.globalThis.Probe;
const one = new Probe();
await one.execute('douyin_open_video',{url:direct});
assert.deepEqual(Array.from(one.visited),[direct],'explicit direct video must skip unrelated recommendation');
const two = new Probe();
await two.execute('douyin_open',{});
assert.deepEqual(Array.from(two.visited),['https://www.douyin.com/?recommend=1'],'non-target action preserves original feed');
const three = new Probe(direct+'?tracked=1');
await three.execute('douyin_open_video',{url:direct});
assert.deepEqual(Array.from(three.visited),[direct],'existing page needs re-navigation unless this connect navigated successfully');
const four = new Probe();
await four.execute('douyin_open_video',{url:'https://evil.example/video/'+id});
assert.deepEqual(Array.from(four.visited),['https://www.douyin.com/?recommend=1',direct],'foreign URL not eligible for new fastpath');
const five = new Probe();
await five.connect(null,{initialDirectVideoUrl:'https://evil.example/video/'+id, initialDirectVideoReceipt:{completed:false}}).then(
  ()=>assert.fail('unsafe direct-target option was accepted'),
  e=>assert.match(String(e.message),/not verified/)
);

for (const tampered of [fixture.replace(actionAnchor,''),fixture+'\n'+actionAnchor,fixture.replace('else await this.navigate(RECOMMEND,signal);','else {}'),patched]) {
  assert.throws(()=>applyPatch(tampered,createHash('sha256').update(tampered).digest('hex')),/(anchor mismatch|already present)/);
}
const six=new Probe('https://www.douyin.com/?recommend=1');
await six.execute('douyin_open_video',{url:direct});
assert.deepEqual(Array.from(six.visited),[direct],'prepared nonblank page must navigate explicitly');
const seven=new Probe();
seven.navigate=async()=>{throw new Error('injected navigation failure');};
await assert.rejects(seven.execute('douyin_open_video',{url:direct}),/injected navigation failure/);
console.log('PASS canonical target, navigation receipt, no duplicate on fresh page, strict fallback and negative patch regressions');
