import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSigningKeys, publicKeyOf, encryptSigningKey, decryptSigningKey,
  makeManifest, manifestBytes, signManifest, verifyManifest, sha256
} from '../tools/windows147-signing/core.mjs';

const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2046, 4)]);
const NAME = 'Dafeiyu-Douyin-API-1.4.8-win-x64.exe';
const THUMBPRINT = 'A'.repeat(40);
const WORDS = 'a local-only long sample passphrase';
const options = {
  version: '1.4.8', exeName: NAME, exeBytes: EXE,
  upstreamCommit: 'a'.repeat(40), patchCommit: 'b'.repeat(40),
  workflowRunId: 43541915930, artifactId: 14092434238,
  thumbprint: THUMBPRINT, subject: 'CN=Mock Publisher, C=RS'
};
const fixture = () => {
  const { publicKey, privateKey } = generateSigningKeys();
  const manifest = makeManifest(options);
  const bytes = manifestBytes(manifest);
  return {publicKey, privateKey, bytes, manifest, signature: signManifest(bytes, privateKey)};
};

test('encrypted private key round-trips without plaintext on disk', () => {
  const {publicKey, privateKey} = generateSigningKeys();
  const encrypted = encryptSigningKey(privateKey, WORDS);
  assert.ok(!encrypted.includes('PRIVATE KEY-----'));
  assert.equal(publicKeyOf(decryptSigningKey(encrypted, WORDS)), publicKey);
  assert.throws(()=>decryptSigningKey(encrypted, 'another long passphrase'), /KEY_DECRYPTION_FAILED/);
  assert.throws(()=>encryptSigningKey(privateKey, 'short'), /INVALID_LOCAL_KEY_PASSPHRASE/);
});

test('key envelope rejects parameter changes and ciphertext tampering', () => {
  const {privateKey} = generateSigningKeys();
  const encrypted = JSON.parse(encryptSigningKey(privateKey, WORDS));
  encrypted.kdf.N = 1024;
  assert.throws(()=>decryptSigningKey(JSON.stringify(encrypted), WORDS), /UNSUPPORTED_KEY_ENVELOPE/);
  encrypted.kdf.N = 32768;
  encrypted.data = 'AA' + encrypted.data.slice(2);
  assert.throws(()=>decryptSigningKey(JSON.stringify(encrypted), WORDS), /KEY_DECRYPTION_FAILED/);
});

test('valid manifest matches pinned updater JSON schema', () => {
  const f=fixture();
  assert.equal(f.manifest.schema,'yutang.windows-update-manifest.v1');
  assert.equal(f.manifest.repository,'yud78785/yutang-build');
  assert.equal(f.manifest.asset.size,EXE.length);
  assert.equal(f.manifest.asset.sha256,sha256(EXE));
  assert.equal(f.manifest.source.yutangPatchCommit,options.patchCommit);
  assert.equal(f.manifest.candidate.artifactId,options.artifactId);
  assert.equal(verifyManifest({bytes:f.bytes,signature:f.signature,publicKey:f.publicKey,
    exeName:NAME,exeBytes:EXE,tag:'v1.4.8',thumbprint:THUMBPRINT}).version,'1.4.8');
});

test('tampering signature or manifest bytes fails closed', () => {
  const f=fixture();
  const args={bytes:f.bytes,signature:f.signature,publicKey:f.publicKey,
    exeName:NAME,exeBytes:EXE,tag:'v1.4.8',thumbprint:THUMBPRINT};
  const edited=Buffer.from(f.bytes); edited[18]^=1;
  assert.throws(()=>verifyManifest({...args,bytes:edited}),/INVALID_MANIFEST_SIGNATURE/);
  assert.throws(()=>verifyManifest({...args,signature:Buffer.alloc(64,3).toString('base64')}),/INVALID_MANIFEST_SIGNATURE/);
});

test('valid signature cannot hide changed EXE, wrong tag, or publisher', () => {
  const f=fixture();
  const args={bytes:f.bytes,signature:f.signature,publicKey:f.publicKey,
    exeName:NAME,exeBytes:EXE,tag:'v1.4.8',thumbprint:THUMBPRINT};
  assert.throws(()=>verifyManifest({...args,exeBytes:Buffer.concat([EXE,Buffer.from('changed')])}),/SIGNED_EXE_IDENTITY_MISMATCH/);
  assert.throws(()=>verifyManifest({...args,tag:'v1.4.9'}),/MANIFEST_IDENTITY_INVALID/);
  assert.throws(()=>verifyManifest({...args,thumbprint:'B'.repeat(40)}),/MANIFEST_PUBLISHER_INVALID/);
});

test('manifest builder rejects invalid source IDs, publisher and asset name', () => {
  assert.throws(()=>makeManifest({...options,exeName:'other.exe'}),/MANIFEST_ASSET_INVALID/);
  assert.throws(()=>makeManifest({...options,patchCommit:'not-sha'}),/MANIFEST_SOURCE_INVALID/);
  assert.throws(()=>makeManifest({...options,artifactId:0}),/MANIFEST_CANDIDATE_INVALID/);
  assert.throws(()=>makeManifest({...options,thumbprint:'bad'}),/MANIFEST_PUBLISHER_INVALID/);
  assert.throws(()=>makeManifest({...options,version:'1.4.8-test'}),/INVALID_RELEASE_VERSION_OR_BYTES/);
});
