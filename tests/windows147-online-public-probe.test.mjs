import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePublicReceipt} from '../tools/windows147-online-public-probe.mjs';
const SHA='3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const s=fs.readFileSync(new URL('../tools/windows147-online-public-probe.mjs', import.meta.url),'utf8');
const green={status:200,page:{origin:'https://www.douyin.com',ready:'complete',challenged:false,titleLength:8,bodyLength:220,bodyChildren:8,paintBytes:10000},sandbox:{rendererSandboxVerified:true,networkServiceWindowsTokenVerified:true,networkServiceLowIntegrityVerified:true,networkServiceProcessOwned:true},identity:{loopbackOnly:true,listenerMatchesEdge:true},cleaned:true};
test('positive green receipt only says PUBLIC_WEB_ONLY',()=>assert.equal(validatePublicReceipt(green),'PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY'));
for(const [name,change] of [
  ['403',{status:403}],['redirect',{status:302}],['empty body',{page:{...green.page,bodyLength:0}}],
  ['empty screenshot',{page:{...green.page,paintBytes:0}}],['login challenge',{page:{...green.page,challenged:true}}],
  ['wrong origin',{page:{...green.page,origin:'https://evil.example'}}],
  ['loading-only',{page:{...green.page,ready:'loading'}}],
  ['missing renderer',{sandbox:{...green.sandbox,rendererSandboxVerified:false}}],
  ['network not appcontainer',{sandbox:{...green.sandbox,networkServiceWindowsTokenVerified:false}}],
  ['network not low integrity',{sandbox:{...green.sandbox,networkServiceLowIntegrityVerified:false}}],
  ['network not owned',{sandbox:{...green.sandbox,networkServiceProcessOwned:false}}],
  ['CDP not loopback',{identity:{...green.identity,loopbackOnly:false}}],
  ['CDP wrong PID',{identity:{...green.identity,listenerMatchesEdge:false}}],
  ['cleanup incomplete',{cleaned:false}]
])test(name+' fails closed',()=>assert.throws(()=>validatePublicReceipt({...green,...change})));
test('exact unsigned EXE SHA and size are fixed',()=>{assert.ok(s.includes(SHA));assert.match(s,/const BYTES = 125446071/);assert.match(s,/9cc16d7e64d59dc141e9c6687b8dd461934fcc35/)});
test('never handles user passwords, logs page text or signs binaries',()=>{
 assert.match(s,/GITHUB_ACTIONS!=='true'/);
 assert.match(s,/YUTANG_PUBLIC_WEB_TEST_AUTHORIZED/);
 assert.match(s,/modelKeyUsed:false/);
 assert.match(s,/releaseAuthorized:false/);
 assert.doesNotMatch(s,/signtool.exe|\bSign-YuTangCandidate.ps1\b|console\.log\(\s*token|console\.log\(\s*page\.text/i);
});
test('approved public origin is fixed; no site URL argument',()=>{assert.match(s,/const ORIGIN = 'https:\/\/www.douyin.com'/);assert.match(s,/PUBLIC_PAGE_LEFT_APPROVED_ORIGIN/);assert.match(s,/PUBLIC_PAGE_LOGIN_OR_CHALLENGE/)});
test('candidate-only process cleanup bounds remain explicit',()=>{assert.match(s,/CANDIDATE_PROCESSES_OR_CDP_REMAIN/);assert.match(s,/backendPid/);assert.match(s,/DEDICATED_BROWSER_CLOSE_TIMEOUT/);assert.match(s,/CANDIDATE_STATE_ALREADY_EXISTS/)});

test('only the main frame document status can count',()=>{assert.match(s,/Page\.getFrameTree/);assert.match(s,/event\.frameId!==mainFrameId/);assert.match(s,/PUBLIC_MAIN_FRAME_MISSING/)});
