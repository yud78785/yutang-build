#!/usr/bin/env node
// Pre-release, offline manifest tool. Not an Authenticode validator or a publisher.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createPrivateKey, createPublicKey, sign, verify, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'yutang.windows-update-manifest.v1';
const REPO = 'yud78785/yutang-build';
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[A-F0-9]{40}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const NAMES = { manifest: 'yutang-update-manifest.json', signature: 'yutang-update-manifest.sig' };

function requireCondition(ok, code) { if (!ok) throw new Error(code); }
function normalizeThumbprint(text) { return String(text ?? '').replace(/\s/g, '').toUpperCase(); }
function isPlainObject(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function own(o, name) { return Object.prototype.hasOwnProperty.call(o, name); }

function parseOptions(args) {
  requireCondition(['build', 'verify'].includes(args[0]), 'USAGE: build|verify [--option value]');
  const command = args[0];
  const options = {};
  const allowed = command === 'build'
    ? ['exe', 'receipt', 'metadata', 'private-key', 'public-key', 'out-dir']
    : ['exe', 'manifest', 'signature', 'public-key', 'publisher-thumbprint'];
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.startsWith('--') ? args[i].slice(2) : '';
    requireCondition(allowed.includes(key) && !own(options, key) && i + 1 < args.length, 'ARGUMENT_INVALID');
    options[key] = args[i + 1];
    requireCondition(typeof options[key] === 'string' && options[key].length > 0, 'ARGUMENT_EMPTY');
  }
  for (const key of allowed) requireCondition(own(options, key), 'ARGUMENT_MISSING_' + key);
  return { command, options };
}

async function regularFile(file, maxBytes) {
  requireCondition(path.isAbsolute(file), 'ABSOLUTE_PATH_REQUIRED');
  const stat = await fs.lstat(file);
  requireCondition(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= maxBytes, 'FILE_INVALID');
  return stat;
}

async function readJson(file) {
  await regularFile(file, 64 * 1024);
  const value = JSON.parse(await fs.readFile(file, 'utf8'));
  requireCondition(isPlainObject(value), 'JSON_OBJECT_REQUIRED');
  return value;
}

async function hashExe(file) {
  // Production EXE is under 500 MiB. Read-only, no web requests, no path rewriting.
  const stat = await regularFile(file, 500 * 1024 * 1024);
  requireCondition(stat.size >= 1024, 'EXE_TOO_SMALL');
  const handle = await fs.open(file, 'r');
  try {
    const first = Buffer.alloc(2);
    await handle.read(first, 0, 2, 0);
    requireCondition(first.toString('ascii') === 'MZ', 'EXE_MZ_REQUIRED');
  } finally { await handle.close(); }
  const bytes = await fs.readFile(file);
  return { size: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function validatedManifest(manifest, publisher) {
  requireCondition(isPlainObject(manifest), 'MANIFEST_INVALID');
  const version = String(manifest.version ?? '');
  requireCondition(VERSION.test(version) && manifest.schema === SCHEMA && manifest.repository === REPO &&
    manifest.tag === 'v' + version, 'MANIFEST_IDENTITY_INVALID');
  requireCondition(isPlainObject(manifest.asset) && manifest.asset.name === 'Dafeiyu-Douyin-API-' + version + '-win-x64.exe' &&
    Number.isSafeInteger(manifest.asset.size) && manifest.asset.size >= 1024 && manifest.asset.size <= 500 * 1024 * 1024 &&
    SHA256.test(String(manifest.asset.sha256)), 'MANIFEST_ASSET_INVALID');
  requireCondition(isPlainObject(manifest.source) && COMMIT.test(String(manifest.source.upstreamCommit)) &&
    COMMIT.test(String(manifest.source.yutangPatchCommit)), 'MANIFEST_SOURCE_INVALID');
  requireCondition(isPlainObject(manifest.candidate) && Number.isSafeInteger(manifest.candidate.workflowRunId) &&
    manifest.candidate.workflowRunId > 0 && Number.isSafeInteger(manifest.candidate.artifactId) &&
    manifest.candidate.artifactId > 0, 'MANIFEST_CANDIDATE_INVALID');
  requireCondition(isPlainObject(manifest.authenticode) && SHA1.test(normalizeThumbprint(publisher)) &&
    normalizeThumbprint(manifest.authenticode.thumbprint) === normalizeThumbprint(publisher) &&
    typeof manifest.authenticode.subject === 'string' && manifest.authenticode.subject.trim().length > 0,
  'MANIFEST_PUBLISHER_INVALID');
  return true;
}

async function publicKeyObject(file) {
  await regularFile(file, 16 * 1024);
  const key = createPublicKey(await fs.readFile(file));
  requireCondition(key.asymmetricKeyType === 'ed25519', 'ED25519_PUBLIC_KEY_REQUIRED');
  return key;
}

async function build(options) {
  const exe = path.resolve(options.exe);
  const receipt = await readJson(path.resolve(options.receipt));
  const meta = await readJson(path.resolve(options.metadata));
  const binary = await hashExe(exe);
  const thumb = normalizeThumbprint(receipt.authenticode?.thumbprint);
  requireCondition(receipt.schema === 'yutang.windows-local-signing-receipt.v1' &&
    receipt.authenticode?.status === 'Valid' && SHA1.test(thumb) &&
    typeof receipt.authenticode.subject === 'string' && receipt.authenticode.subject.trim() !== '' &&
    receipt.file === exe && receipt.sha256 === binary.sha256 && receipt.size === binary.size &&
    SHA256.test(String(receipt.originalUnsignedSha256)) && receipt.originalUnsignedSha256 !== binary.sha256,
  'SIGNED_RECEIPT_OR_BINARY_MISMATCH');
  requireCondition(meta.repository === REPO && VERSION.test(meta.version) && meta.tag === 'v' + meta.version &&
    meta.authenticodeThumbprint === thumb, 'METADATA_IDENTITY_MISMATCH');
  const manifest = {
    schema: SCHEMA,
    repository: REPO,
    tag: meta.tag,
    version: meta.version,
    asset: { name: path.basename(exe), size: binary.size, sha256: binary.sha256 },
    source: { upstreamCommit: meta.source?.upstreamCommit, yutangPatchCommit: meta.source?.yutangPatchCommit },
    candidate: { workflowRunId: meta.candidate?.workflowRunId, artifactId: meta.candidate?.artifactId },
    authenticode: { thumbprint: thumb, subject: receipt.authenticode.subject.trim() }
  };
  validatedManifest(manifest, thumb);
  const pub = await publicKeyObject(path.resolve(options['public-key']));
  await regularFile(path.resolve(options['private-key']), 16 * 1024);
  const privateKey = createPrivateKey(await fs.readFile(path.resolve(options['private-key'])));
  requireCondition(privateKey.asymmetricKeyType === 'ed25519', 'ED25519_PRIVATE_KEY_REQUIRED');
  const fromPrivate = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const expected = pub.export({ type: 'spki', format: 'der' });
  requireCondition(fromPrivate.length === expected.length && timingSafeEqual(fromPrivate, expected), 'SIGNING_KEY_NOT_PINNED');
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const signature = sign(null, bytes, privateKey);
  requireCondition(signature.length === 64 && verify(null, bytes, pub, signature), 'SIGNING_SELF_CHECK_FAILED');
  const outDir = path.resolve(options['out-dir']);
  requireCondition(outDir !== path.dirname(exe), 'OUTPUT_DIRECTORY_MUST_DIFFER_FROM_EXE_DIRECTORY');
  const outStat = await fs.lstat(outDir);
  requireCondition(outStat.isDirectory() && !outStat.isSymbolicLink(), 'OUTPUT_DIRECTORY_INVALID');
  // Both files are created exclusively; collisions cannot replace prior releases.
  const manifestPath = path.join(outDir, NAMES.manifest);
  const signaturePath = path.join(outDir, NAMES.signature);
  requireCondition(!(await fs.stat(manifestPath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))) &&
    !(await fs.stat(signaturePath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))),
  'OUTPUT_ALREADY_EXISTS');
  await fs.writeFile(manifestPath, bytes, { flag: 'wx', mode: 0o600 });
  try {
    await fs.writeFile(signaturePath, signature.toString('base64') + '\n', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await fs.unlink(manifestPath).catch(() => {});
    throw error;
  }
  return { status: 'LOCAL_MANIFEST_PREPARED_NOT_RELEASED', exeSha256: binary.sha256, manifestSha256: createHash('sha256').update(bytes).digest('hex') };
}

async function verifyOnly(options) {
  const manifestPath = path.resolve(options.manifest);
  const signaturePath = path.resolve(options.signature);
  await regularFile(manifestPath, 64 * 1024);
  await regularFile(signaturePath, 4096);
  const bytes = await fs.readFile(manifestPath);
  const text = (await fs.readFile(signaturePath, 'utf8')).trim();
  requireCondition(/^[A-Za-z0-9+/]{86}==$/.test(text), 'SIGNATURE_BASE64_FORMAT_INVALID');
  const sig = Buffer.from(text, 'base64');
  const pub = await publicKeyObject(path.resolve(options['public-key']));
  requireCondition(sig.length === 64 && verify(null, bytes, pub, sig), 'MANIFEST_SIGNATURE_INVALID');
  const manifest = JSON.parse(bytes.toString('utf8'));
  validatedManifest(manifest, options['publisher-thumbprint']);
  const exe = path.resolve(options.exe);
  const binary = await hashExe(exe);
  requireCondition(path.basename(exe) === manifest.asset.name && binary.size === manifest.asset.size &&
    binary.sha256 === manifest.asset.sha256, 'MANIFEST_BINARY_MISMATCH');
  return { status: 'OFFLINE_MANIFEST_AND_HASH_VALID_AUTHENTICODE_NOT_CHECKED', exeSha256: binary.sha256 };
}

export { build, verifyOnly, validatedManifest };
const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  try {
    const { command, options } = parseOptions(process.argv.slice(2));
    const result = await (command === 'build' ? build(options) : verifyOnly(options));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('YUTANG_SIGNING_PREP_FAILED: ' + String(error?.message || error));
    process.exitCode = 1;
  }
}
