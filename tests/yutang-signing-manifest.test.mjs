import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { build, verifyOnly, validatedManifest } from '../tools/signing/yutang-manifest.mjs';
import { UNSIGNED_BASELINE } from '../tools/signing/signed-acceptance-registry.mjs';

const NAME = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
const THUMB = 'A'.repeat(40), upstream = 'a'.repeat(40), patch = 'b'.repeat(40);

async function withFixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-signing-test-'));
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const out = path.join(dir, 'out');
  await fs.mkdir(out);
  const exe = path.join(dir, NAME);
  const raw = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 12)]);
  await fs.writeFile(exe, raw);
  const exeSha = createHash('sha256').update(raw).digest('hex');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = path.join(dir, 'public.pem'), priv = path.join(dir, 'private.pem');
  await fs.writeFile(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  await fs.writeFile(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const receipt = path.join(dir, 'receipt.json'), metadata = path.join(dir, 'metadata.json');
  const rec = { schema: 'yutang.windows-local-signing-receipt.v1', file: exe,
    originalUnsignedSha256: UNSIGNED_BASELINE.sha256, sha256: exeSha, size: raw.length,
    authenticode: { status: 'Valid', thumbprint: THUMB, subject: 'CN=Test Only' } };
  const meta = { repository: 'yud78785/yutang-build', version: '1.4.7', tag: 'v1.4.7',
    authenticodeThumbprint: THUMB,
    source: { upstreamCommit: upstream, yutangPatchCommit: patch },
    candidate: { workflowRunId: 1001, artifactId: 2002 } };
  // Synthetic acceptance is injected directly into unit tests only.
  // The CLI never imports this fixture and the reviewed production registry remains empty.
  const approved = {
    schema: 'yutang.signed-candidate-acceptance.v1',
    version: meta.version,
    candidate: { ...meta.candidate },
    source: { ...meta.source },
    signedSha256: exeSha,
    unsignedSha256: UNSIGNED_BASELINE.sha256,
    authenticodeThumbprint: THUMB,
    windows2022: {
      runner: 'windows-2022', status: 'PASS', sha256: exeSha,
      sourceArtifactId: meta.candidate.artifactId, workflowRunId: 60000000002, jobId: 70000000002
    },
    windows2025: {
      runner: 'windows-2025', status: 'PASS', sha256: exeSha,
      sourceArtifactId: meta.candidate.artifactId, workflowRunId: 60000000003, jobId: 70000000003
    }
  };
  const write = async () => {
    await fs.writeFile(receipt, JSON.stringify(rec));
    await fs.writeFile(metadata, JSON.stringify(meta));
  };
  await write();
  const opts = { exe, receipt, metadata, 'private-key': priv, 'public-key': pub, 'out-dir': out };
  const verifyOpts = { exe, manifest: path.join(out, 'yutang-update-manifest.json'),
    signature: path.join(out, 'yutang-update-manifest.sig'), 'public-key': pub, 'publisher-thumbprint': THUMB };
  return { dir, out, exe, rec, meta, receipt, metadata, write, opts, verifyOpts, approved };
}
test('offline signing binds updater schema, raw Ed25519 base64 and EXE hash', async t => {
  const f = await withFixture(t);
  const result = await build(f.opts, { reviewedRegistry: [f.approved] });
  assert.equal(result.status, 'LOCAL_MANIFEST_PREPARED_NOT_RELEASED');
  const manifest = JSON.parse(await fs.readFile(f.verifyOpts.manifest, 'utf8'));
  assert.deepEqual(Object.keys(manifest), ['schema','repository','tag','version','asset','source','candidate','authenticode']);
  assert.equal(manifest.asset.sha256, result.exeSha256);
  assert.equal(manifest.candidate.artifactId, 2002);
  assert.equal(manifest.authenticode.thumbprint, THUMB);
  assert.equal(Buffer.from((await fs.readFile(f.verifyOpts.signature, 'utf8')).trim(), 'base64').length, 64);
  assert.equal((await verifyOnly(f.verifyOpts)).status, 'OFFLINE_MANIFEST_AND_HASH_VALID_AUTHENTICODE_NOT_CHECKED');
});
test('invalid or mismatched Authenticode receipt cannot prepare a manifest', async t => {
  const f = await withFixture(t);
  f.rec.authenticode.status = 'NotSigned'; await f.write();
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /SIGNED_RECEIPT_OR_BINARY_MISMATCH/);
  f.rec.authenticode.status = 'Valid'; f.rec.sha256 = 'e'.repeat(64); await f.write();
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /SIGNED_RECEIPT_OR_BINARY_MISMATCH/);
});
test('wrong public key is rejected', async t => {
  const f = await withFixture(t);
  const other = generateKeyPairSync('ed25519');
  await fs.writeFile(f.opts['public-key'], other.publicKey.export({ type:'spki', format:'pem' }));
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /SIGNING_KEY_NOT_PINNED/);
});
test('changing manifest or EXE fails verification', async t => {
  const f = await withFixture(t);
  await build(f.opts, { reviewedRegistry: [f.approved] });
  const original = await fs.readFile(f.verifyOpts.manifest);
  await fs.writeFile(f.verifyOpts.manifest, Buffer.concat([original,Buffer.from(' ')]));
  await assert.rejects(verifyOnly(f.verifyOpts), /MANIFEST_SIGNATURE_INVALID/);
  await fs.writeFile(f.verifyOpts.manifest, original);
  await fs.appendFile(f.exe, Buffer.from('x'));
  await assert.rejects(verifyOnly(f.verifyOpts), /MANIFEST_BINARY_MISMATCH/);
});
test('publisher thumbprint must match externally pinned identity', async t => {
  const f = await withFixture(t); await build(f.opts, { reviewedRegistry: [f.approved] });
  await assert.rejects(verifyOnly({...f.verifyOpts, 'publisher-thumbprint':'F'.repeat(40)}), /MANIFEST_PUBLISHER_INVALID/);
});
test('existing outputs cannot be overwritten', async t => {
  const f = await withFixture(t); await build(f.opts, { reviewedRegistry: [f.approved] });
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /OUTPUT_ALREADY_EXISTS/);
});
test('source provenance and artifact must be valid', async t => {
  const f = await withFixture(t);
  f.meta.candidate.artifactId = 0; await f.write();
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /MANIFEST_CANDIDATE_INVALID/);
  f.meta.candidate.artifactId = 2002; f.meta.source.yutangPatchCommit = 'bad'; await f.write();
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /MANIFEST_SOURCE_INVALID/);
});
test('schema rejects wrong repository and filename', () => {
  const basic = { schema: 'yutang.windows-update-manifest.v1', repository: 'yud78785/yutang-build',
    tag: 'v1.4.7', version: '1.4.7', asset:{ name:NAME,size:2048,sha256:'a'.repeat(64) },
    source:{upstreamCommit:upstream,yutangPatchCommit:patch}, candidate:{workflowRunId:1,artifactId:2},
    authenticode:{thumbprint:THUMB,subject:'CN=Test Only'} };
  assert.ok(validatedManifest(basic, THUMB));
  assert.throws(() => validatedManifest({...basic,repository:'someone/else'}, THUMB), /MANIFEST_IDENTITY_INVALID/);
  assert.throws(() => validatedManifest({...basic,asset:{...basic.asset,name:'wrong.exe'}}, THUMB), /MANIFEST_ASSET_INVALID/);
});

test('unsigned Windows run and artifact IDs cannot be reused for a signed 1.4.7 manifest', async t => {
  const f = await withFixture(t);
  f.meta.candidate.workflowRunId = 43541915930; await f.write();
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE/);
  f.meta.candidate.workflowRunId = 1001;
  for (const artifactId of [14092434238, 14092741259, 14093021418]) {
    f.meta.candidate.artifactId = artifactId;
    await f.write();
    await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }), /UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE/);
  }
});

test('manifest CLI is fail-closed before independent signed-EXE acceptance', async t => {
  const f = await withFixture(t);
  await assert.rejects(build(f.opts), /SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
  const entries = await fs.readdir(f.out);
  assert.deepEqual(entries, []);
});
test('self-reported PASS and arbitrary new run IDs are not independently reviewed evidence', async t => {
  const f = await withFixture(t);
  f.meta.signedAcceptance = {
    windows2022: {status:'PASS'}, windows2025: {status:'PASS'},
    sha256: f.rec.sha256
  };
  f.meta.candidate.workflowRunId = 987654321;
  f.meta.candidate.artifactId = 123456789;
  await f.write();
  await assert.rejects(build(f.opts), /SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
});
test('a mock signed acceptance with the wrong signed SHA is rejected before signing', async t => {
  const f = await withFixture(t);
  f.approved.windows2022.sha256 = 'e'.repeat(64);
  await assert.rejects(build(f.opts, { reviewedRegistry: [f.approved] }),
    /SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
});
