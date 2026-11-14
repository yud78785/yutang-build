import {
  createHash, createPrivateKey, createPublicKey, createCipheriv, createDecipheriv,
  generateKeyPairSync, randomBytes, scryptSync, sign, verify
} from 'node:crypto';

const REPO = 'yud78785/yutang-build';
const ENVELOPE_SCHEMA = 'yutang.local-ed25519-key.v1';
const ENVELOPE_AAD = Buffer.from(ENVELOPE_SCHEMA, 'ascii');
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 1, keyLength: 32 });
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FINGERPRINT = /^[A-F0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const MANIFEST_NAME = 'yutang-update-manifest.json';
export const SIGNATURE_NAME = 'yutang-update-manifest.sig';
export const ENCRYPTED_KEY_NAME = 'manifest-ed25519.private.enc.json';
export const PUBLIC_KEY_NAME = 'manifest-ed25519.public.pem';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function normalizedThumbprint(text) {
  return String(text ?? '').replace(/\s+/g, '').toUpperCase();
}

function checkPassphrase(text) {
  if (typeof text !== 'string' || text.length < 16 || text.length > 1024 || /[\r\n\x00]/.test(text)) {
    throw new Error('INVALID_LOCAL_KEY_PASSPHRASE');
  }
  return text;
}

function deriveKey(passphrase, salt) {
  return scryptSync(checkPassphrase(passphrase), salt, 32, {
    N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024
  });
}

export function generateSigningKeys() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

export function publicKeyOf(privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('ED25519_KEY_REQUIRED');
  return createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
}

export function encryptSigningKey(privateKeyPem, passphrase) {
  checkPassphrase(passphrase);
  const publicKey = publicKeyOf(privateKeyPem);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(ENVELOPE_AAD);
    const data = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      schema: ENVELOPE_SCHEMA, kdf: KDF, cipher: 'aes-256-gcm',
      salt: salt.toString('base64'), iv: iv.toString('base64'),
      tag: tag.toString('base64'), data: data.toString('base64'),
      publicKeySha256: sha256(Buffer.from(publicKey, 'utf8'))
    }, null, 2) + '\n';
  } finally { key.fill(0); }
}

function decodeBase64(value, byteLength) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('KEY_ENVELOPE_BASE64_INVALID');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== byteLength || decoded.toString('base64') !== value) throw new Error('KEY_ENVELOPE_BASE64_INVALID');
  return decoded;
}

export function decryptSigningKey(text, passphrase) {
  checkPassphrase(passphrase);
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw new Error('INVALID_KEY_ENVELOPE'); }
  if (!envelope || envelope.schema !== ENVELOPE_SCHEMA || envelope.cipher !== 'aes-256-gcm' ||
      JSON.stringify(envelope.kdf) !== JSON.stringify(KDF) ||
      !SHA256.test(envelope.publicKeySha256 ?? '')) {
    throw new Error('UNSUPPORTED_KEY_ENVELOPE');
  }
  const salt = decodeBase64(envelope.salt, 16);
  const iv = decodeBase64(envelope.iv, 12);
  const tag = decodeBase64(envelope.tag, 16);
  if (typeof envelope.data !== 'string' || envelope.data.length > 8192) throw new Error('INVALID_KEY_ENVELOPE');
  const encrypted = Buffer.from(envelope.data, 'base64');
  if (encrypted.length < 64 || encrypted.length > 4096 || encrypted.toString('base64') !== envelope.data) throw new Error('INVALID_KEY_ENVELOPE');
  const key = deriveKey(passphrase, salt);
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(ENVELOPE_AAD);
    cipher.setAuthTag(tag);
    const plain = Buffer.concat([cipher.update(encrypted), cipher.final()]);
    const privateKeyPem = plain.toString('utf8');
    plain.fill(0);
    if (sha256(Buffer.from(publicKeyOf(privateKeyPem), 'utf8')) !== envelope.publicKeySha256) {
      throw new Error('PRIVATE_PUBLIC_KEY_MISMATCH');
    }
    return privateKeyPem;
  } catch { throw new Error('KEY_DECRYPTION_FAILED'); }
  finally { key.fill(0); }
}

export function validateManifest(value, tag, expectedThumbprint) {
  const v = value;
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      v.schema !== 'yutang.windows-update-manifest.v1' ||
      v.repository !== REPO || typeof tag !== 'string' ||
      !/^v\d+\.\d+\.\d+$/.test(tag) ||
      v.tag !== tag || v.version !== tag.slice(1) || !VERSION.test(v.version) ||
      !v.version.split('.').every(x => Number.isSafeInteger(Number(x)))) {
    throw new Error('MANIFEST_IDENTITY_INVALID');
  }
  const expectedName = 'Dafeiyu-Douyin-API-' + v.version + '-win-x64.exe';
  if (!v.asset || v.asset.name !== expectedName || !Number.isSafeInteger(v.asset.size) ||
      v.asset.size < 1024 || v.asset.size > 500 * 1024 * 1024 ||
      !SHA256.test(v.asset.sha256 ?? '')) throw new Error('MANIFEST_ASSET_INVALID');
  if (!v.source || !SHA.test(v.source.upstreamCommit ?? '') ||
      !SHA.test(v.source.yutangPatchCommit ?? '')) throw new Error('MANIFEST_SOURCE_INVALID');
  if (!v.candidate || !Number.isSafeInteger(v.candidate.workflowRunId) ||
      v.candidate.workflowRunId < 1 || !Number.isSafeInteger(v.candidate.artifactId) ||
      v.candidate.artifactId < 1) throw new Error('MANIFEST_CANDIDATE_INVALID');
  const expected = normalizedThumbprint(expectedThumbprint);
  if (!FINGERPRINT.test(expected) ||
      normalizedThumbprint(v.authenticode?.thumbprint) !== expected ||
      typeof v.authenticode?.subject !== 'string' || !v.authenticode.subject.trim()) {
    throw new Error('MANIFEST_PUBLISHER_INVALID');
  }
  return v;
}

export function makeManifest({ version, exeName, exeBytes, upstreamCommit, patchCommit,
  workflowRunId, artifactId, thumbprint, subject }) {
  if (!VERSION.test(version ?? '') || !version.split('.').every(x => Number.isSafeInteger(Number(x))) ||
      !Buffer.isBuffer(exeBytes)) throw new Error('INVALID_RELEASE_VERSION_OR_BYTES');
  const manifest = {
    schema: 'yutang.windows-update-manifest.v1',
    repository: REPO, tag: 'v' + version, version,
    asset: { name: exeName, size: exeBytes.length, sha256: sha256(exeBytes) },
    source: { upstreamCommit, yutangPatchCommit: patchCommit },
    candidate: { workflowRunId, artifactId },
    authenticode: { thumbprint: normalizedThumbprint(thumbprint), subject }
  };
  return validateManifest(manifest, manifest.tag, thumbprint);
}

export function manifestBytes(manifest) {
  return Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

export function signManifest(bytes, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('ED25519_KEY_REQUIRED');
  return sign(null, Buffer.from(bytes), key).toString('base64') + '\n';
}

export function verifyManifest({ bytes, signature, publicKey, exeName, exeBytes, tag, thumbprint }) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.trim())) {
    throw new Error('INVALID_MANIFEST_SIGNATURE_FORMAT');
  }
  const signatureBytes = Buffer.from(signature.trim(), 'base64');
  const pub = createPublicKey(publicKey);
  if (pub.asymmetricKeyType !== 'ed25519' ||
      !verify(null, Buffer.from(bytes), pub, signatureBytes)) {
    throw new Error('INVALID_MANIFEST_SIGNATURE');
  }
  let manifest;
  try { manifest = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw new Error('INVALID_MANIFEST_JSON'); }
  validateManifest(manifest, tag, thumbprint);
  if (exeName !== manifest.asset.name || !Buffer.isBuffer(exeBytes) ||
      exeBytes.length !== manifest.asset.size || sha256(exeBytes) !== manifest.asset.sha256) {
    throw new Error('SIGNED_EXE_IDENTITY_MISMATCH');
  }
  return manifest;
}
