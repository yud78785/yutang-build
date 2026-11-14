import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  UPDATE_MANIFEST_PUBLIC_KEY, UPDATE_PUBLISHER_THUMBPRINT, newerVersion, UpdateService
} from '../tools/windows147-update-patched/update-service.mjs';
import {inspectBootstrap} from '../tools/signing/check-first-release-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, '../tools/signing/check-first-release-bootstrap.mjs');
const acceptedReceipt = () => ({
  schema: 'yutang.windows-openrouter-candidate.v1',
  status: 'PASS_WINDOWS_PACKAGED_SMOKE_AND_EDGE_SECURITY',
  productVersion: '1.4.7',
  sha256: '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34',
  yutangPatchCommit: '9cc16d7e64d59dc141e9c6687b8dd461934fcc35',
  upstreamCommit: '9c49833078f4b4d18b9211ef86d024e7f2e15739',
  runnerImage: 'win25-vs2026',
  bytes: 125446071,
  signatureStatus: 'NotSigned',
  release: false,
  updateTrustPatch: {
    schema: 'yutang.windows-update-trust-patch.v1',
    manifestPublicKeyConfigured: false,
    authenticodePublisherThumbprintConfigured: false,
    updatesDisabledUntilTrustConfigured: true,
    release: false
  }
});

test('accepted updater template is fail-closed with no network calls', async () => {
  assert.equal(UPDATE_MANIFEST_PUBLIC_KEY,'');
  assert.equal(UPDATE_PUBLISHER_THUMBPRINT,'');
  let calls=0;
  const service = new UpdateService({
    version:'1.4.7',directory:path.resolve(os.tmpdir()),
    fetchImpl: async () => {calls++; throw Error('UNEXPECTED_NET_ACCESS');}
  });
  const state=await service.check();
  assert.equal(calls,0);
  assert.equal(state.status,'untrusted-release-channel');
});

test('release version equality and downgrade are not updates', () => {
  assert.equal(newerVersion('1.4.7','1.4.7'),false);
  assert.equal(newerVersion('1.4.6','1.4.7'),false);
  assert.equal(newerVersion('1.4.8','1.4.7'),true);
});

test('same-version signed 1.4.7 proposal is not an updater path', () => {
  const result=inspectBootstrap(acceptedReceipt(),'1.4.7');
  assert.equal(result.status,'BLOCKED_FOR_AUTOMATIC_UPDATE_BOOTSTRAP');
  assert.equal(result.proposedVersionIsHigher,false);
  assert.equal(result.manualBootstrapDistributionRequired,true);
  assert.equal(result.currentClientCanAutomaticallyInstallSignedRelease,false);
  assert.ok(result.reasons.includes('TARGET_VERSION_NOT_HIGHER'));
  assert.equal(result.signedWindowsAcceptance,'NOT_EVALUATED');
});

test('higher version still requires manually bootstrapping signed client with new pins', () => {
  const result=inspectBootstrap(acceptedReceipt(),'1.4.8');
  assert.equal(result.proposedVersionIsHigher,true);
  assert.ok(result.reasons.includes('SOURCE_UPDATE_TRUST_DISABLED'));
  assert.ok(result.reasons.includes('NEW_PINNED_CLIENT_BUILD_AND_RETEST_REQUIRED'));
  assert.equal(result.currentClientCanAutomaticallyInstallSignedRelease,false);
});

test('wrong SHA, source commit, signature status and fake source provenance are rejected', () => {
  for(const change of [
    {sha256:'a'.repeat(64)},
    {yutangPatchCommit:'f'.repeat(40)},
    {signatureStatus:'Valid'},
    {runnerImage:'linux'},
    {status:'PENDING'},
    {release:true},
    {bytes:125446072}
  ]){
    assert.throws(()=>inspectBootstrap({...acceptedReceipt(),...change},'1.4.8'),
      /UNSIGNED_147_ACCEPTANCE_IDENTITY_MISMATCH/);
  }
});

test('a different update trust state is not mistaken for the accepted unsigned binary', () => {
  for(const values of [
    {manifestPublicKeyConfigured:true},
    {authenticodePublisherThumbprintConfigured:true},
    {updatesDisabledUntilTrustConfigured:false},
    {release:true}
  ]){
    const receipt=acceptedReceipt();
    Object.assign(receipt.updateTrustPatch,values);
    assert.throws(()=>inspectBootstrap(receipt,'1.4.8'),/SOURCE_UPDATE_TRUST_RECEIPT_INCONSISTENT/);
  }
});

test('invalid version values fail closed', () => {
  for(const value of ['1.4','v1.4.8','1.4.8-rc.1','1.4.08','1.4.8\nhi','999999999999999999999.1.0']){
    assert.throws(()=>inspectBootstrap(acceptedReceipt(),value),/TARGET_VERSION_INVALID/);
  }
});

test('real Node CLI prints planning status only; source JSON is never modified', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yutang-bootstrap-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const filepath=path.join(dir,'receipt.json');
  const original=JSON.stringify(acceptedReceipt(),null,2);
  await fs.writeFile(filepath,original);
  const run=spawnSync(process.execPath,[cli,'--receipt',filepath,'--target-version','1.4.8'],
    {encoding:'utf8',timeout:12000});
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.parse(run.stdout).status,'BLOCKED_FOR_AUTOMATIC_UPDATE_BOOTSTRAP');
  assert.equal(await fs.readFile(filepath,'utf8'),original);
  const wrong=spawnSync(process.execPath,[cli,'--receipt',filepath,'--target-version','1.4.x'],
    {encoding:'utf8',timeout:12000});
  assert.notEqual(wrong.status,0);
  assert.match(wrong.stderr,/TARGET_VERSION_INVALID/);
});