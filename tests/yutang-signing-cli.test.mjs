import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../tools/signing/yutang-manifest.mjs');
const name = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe';
const thumbprint = 'A'.repeat(40);
const upstream = '9c49833078f4b4d18b9211ef86d024e7f2e15739';
const patch = '9cc16d7e64d59dc141e9c6687b8dd461934fcc35';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yutang-cli-offline-'));
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  const outDir = path.join(dir, 'out');
  await fs.mkdir(outDir);
  const exe = path.join(dir, name);
  const contents = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 0x5a)]);
  await fs.writeFile(exe, contents);
  const digest = createHash('sha256').update(contents).digest('hex');
  const receiptPath = path.join(dir, 'receipt.json');
  const metadataPath = path.join(dir, 'metadata.json');
  const privatePath = path.join(dir, 'test-private.pem');
  const publicPath = path.join(dir, 'test-public.pem');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  await fs.writeFile(privatePath, privateKey.export({ type:'pkcs8',format:'pem' }), {mode:0o600});
  await fs.writeFile(publicPath, publicKey.export({ type:'spki',format:'pem' }));
  const receipt = {
    schema:'yutang.windows-local-signing-receipt.v1', file:exe,
    sha256:digest, originalUnsignedSha256:'b'.repeat(64), size:contents.length,
    authenticode:{status:'Valid', thumbprint, subject:'CN=MOCK TEST ONLY'}
  };
  const metadata = {
    repository:'yud78785/yutang-build',tag:'v1.4.7',version:'1.4.7',
    authenticodeThumbprint:thumbprint,
    source:{upstreamCommit:upstream,yutangPatchCommit:patch},
    candidate:{workflowRunId:1001,artifactId:2002}
  };
  async function writeInputs() {
    await fs.writeFile(receiptPath, JSON.stringify(receipt));
    await fs.writeFile(metadataPath, JSON.stringify(metadata));
  }
  await writeInputs();
  const manifest = path.join(outDir,'yutang-update-manifest.json');
  const signature = path.join(outDir,'yutang-update-manifest.sig');
  const buildArgs = ['build','--exe',exe,'--receipt',receiptPath,'--metadata',metadataPath,
    '--private-key',privatePath,'--public-key',publicPath,'--out-dir',outDir];
  const verifyArgs = ['verify','--exe',exe,'--manifest',manifest,'--signature',signature,
    '--public-key',publicPath,'--publisher-thumbprint',thumbprint];
  return { dir, outDir, exe, manifest, signature, receipt, metadata, writeInputs, buildArgs, verifyArgs };
}

function cli(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding:'utf8', timeout:10000 });
}

function isRejected(result, reason) {
  assert.notEqual(result.status, 0, 'expected fail-closed');
  assert.match(result.stderr, new RegExp(reason));
}

test('real CLI build then verify works with test-only Ed25519 keys and mock MZ bytes', async t => {
  const f = await fixture(t);
  const built = cli(f.buildArgs);
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).status,'LOCAL_MANIFEST_PREPARED_NOT_RELEASED');
  const manifest = JSON.parse(await fs.readFile(f.manifest,'utf8'));
  assert.equal(manifest.asset.sha256, f.receipt.sha256);
  assert.equal(manifest.source.yutangPatchCommit,patch);
  assert.equal(manifest.candidate.workflowRunId,1001);
  const checked = cli(f.verifyArgs);
  assert.equal(checked.status,0,checked.stderr);
  assert.equal(JSON.parse(checked.stdout).status,'OFFLINE_MANIFEST_AND_HASH_VALID_AUTHENTICODE_NOT_CHECKED');
});

test('CLI refuses historical unsigned run and artifact IDs even with fabricated Valid receipt', async t => {
  const f = await fixture(t);
  f.metadata.candidate.workflowRunId = 43541915930;
  await f.writeInputs();
  isRejected(cli(f.buildArgs),'UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE');
  f.metadata.candidate.workflowRunId = 1001;
  f.metadata.candidate.artifactId = 14092434238;
  await f.writeInputs();
  isRejected(cli(f.buildArgs),'UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE');
  assert.deepEqual(await fs.readdir(f.outDir),[]);
});

test('CLI verify rejects tampering, wrong publisher pin and changed executable bytes', async t => {
  const f = await fixture(t);
  assert.equal(cli(f.buildArgs).status,0);
  isRejected(cli([...f.verifyArgs.slice(0,-1),'F'.repeat(40)]),'MANIFEST_PUBLISHER_INVALID');
  const saved = await fs.readFile(f.manifest);
  await fs.appendFile(f.manifest, Buffer.from(' '));
  isRejected(cli(f.verifyArgs),'MANIFEST_SIGNATURE_INVALID');
  await fs.writeFile(f.manifest,saved);
  await fs.appendFile(f.exe,Buffer.from('x'));
  isRejected(cli(f.verifyArgs),'MANIFEST_BINARY_MISMATCH');
});

test('CLI fails closed on duplicate arguments, missing options and existing outputs', async t => {
  const f = await fixture(t);
  isRejected(cli([...f.buildArgs,'--out-dir',f.outDir]),'ARGUMENT_INVALID');
  isRejected(cli(['build','--exe',f.exe]),'ARGUMENT_MISSING_');
  assert.equal(cli(f.buildArgs).status,0);
  isRejected(cli(f.buildArgs),'OUTPUT_ALREADY_EXISTS');
});
