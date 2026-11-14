#!/usr/bin/env node
// Pre-release, offline manifest tool. Not an Authenticode validator or a publisher.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import {
  MANIFEST_NAME, SIGNATURE_NAME, makeManifest, manifestBytes, signManifest,
  verifyManifest, validateManifest, normalizedThumbprint, sha256
} from '../windows147-signing/core.mjs';
import { pathToFileURL } from 'node:url';

function requireCondition(ok, code) { if (!ok) throw new Error(code); }
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
  requireCondition(bytes.length === stat.size, 'EXE_SIZE_CHANGED_DURING_READ');
  return { bytes, size: stat.size, sha256: sha256(bytes) };
}

function validatedManifest(manifest, publisher) {
  return validateManifest(manifest, manifest?.tag, publisher);
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
  const thumb = normalizedThumbprint(receipt.authenticode?.thumbprint);
  requireCondition(receipt.schema === 'yutang.windows-local-signing-receipt.v1' &&
    receipt.authenticode?.status === 'Valid' && /^[A-F0-9]{40}$/.test(thumb) &&
    typeof receipt.authenticode.subject === 'string' && receipt.authenticode.subject.trim() !== '' &&
    receipt.file === exe && receipt.sha256 === binary.sha256 && receipt.size === binary.size &&
    /^[a-f0-9]{64}$/.test(String(receipt.originalUnsignedSha256)) && receipt.originalUnsignedSha256 !== binary.sha256,
  'SIGNED_RECEIPT_OR_BINARY_MISMATCH');
  requireCondition(meta.repository === 'yud78785/yutang-build' &&
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(String(meta.version)) &&
    meta.tag === 'v' + meta.version && normalizedThumbprint(meta.authenticodeThumbprint) === thumb,
    'METADATA_IDENTITY_MISMATCH');
  // One canonical implementation for schema, hashing, serialization and Ed25519.
  const manifest = makeManifest({
    version: meta.version,
    exeName: path.basename(exe),
    exeBytes: binary.bytes,
    upstreamCommit: meta.source?.upstreamCommit,
    patchCommit: meta.source?.yutangPatchCommit,
    workflowRunId: meta.candidate?.workflowRunId,
    artifactId: meta.candidate?.artifactId,
    thumbprint: thumb,
    subject: receipt.authenticode.subject.trim()
  });
  validatedManifest(manifest, thumb);
  const pub = await publicKeyObject(path.resolve(options['public-key']));
  await regularFile(path.resolve(options['private-key']), 16 * 1024);
  const privatePem = await fs.readFile(path.resolve(options['private-key']));
  const privateKey = createPrivateKey(privatePem);
  requireCondition(privateKey.asymmetricKeyType === 'ed25519', 'ED25519_PRIVATE_KEY_REQUIRED');
  const fromPrivate = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const expected = pub.export({ type: 'spki', format: 'der' });
  requireCondition(fromPrivate.length === expected.length && timingSafeEqual(fromPrivate, expected), 'SIGNING_KEY_NOT_PINNED');
  const bytes = manifestBytes(manifest);
  const signatureText = signManifest(bytes, privatePem);
  requireCondition(Buffer.from(signatureText.trim(), 'base64').length === 64, 'SIGNING_SELF_CHECK_FAILED');
  verifyManifest({ bytes, signature: signatureText, publicKey: pub, exeName: path.basename(exe),
    exeBytes: binary.bytes, tag: manifest.tag, thumbprint: thumb });
  const outDir = path.resolve(options['out-dir']);
  requireCondition(outDir !== path.dirname(exe), 'OUTPUT_DIRECTORY_MUST_DIFFER_FROM_EXE_DIRECTORY');
  const outStat = await fs.lstat(outDir);
  requireCondition(outStat.isDirectory() && !outStat.isSymbolicLink(), 'OUTPUT_DIRECTORY_INVALID');
  // Both files are created exclusively; collisions cannot replace prior releases.
  const manifestPath = path.join(outDir, MANIFEST_NAME);
  const signaturePath = path.join(outDir, SIGNATURE_NAME);
  requireCondition(!(await fs.stat(manifestPath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))) &&
    !(await fs.stat(signaturePath).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))),
  'OUTPUT_ALREADY_EXISTS');
  await fs.writeFile(manifestPath, bytes, { flag: 'wx', mode: 0o600 });
  try {
    await fs.writeFile(signaturePath, signatureText, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await fs.unlink(manifestPath).catch(() => {});
    throw error;
  }
  return { status: 'LOCAL_MANIFEST_PREPARED_NOT_RELEASED', exeSha256: binary.sha256, manifestSha256: sha256(bytes) };
}

async function verifyOnly(options) {
  const manifestPath = path.resolve(options.manifest);
  const signaturePath = path.resolve(options.signature);
  await regularFile(manifestPath, 64 * 1024);
  await regularFile(signaturePath, 4096);
  const bytes = await fs.readFile(manifestPath);
  const signature = await fs.readFile(signaturePath, 'utf8');
  const publicKey = await publicKeyObject(path.resolve(options['public-key']));
  const exe = path.resolve(options.exe);
  const binary = await hashExe(exe);
  // The expected publisher thumbprint must be supplied independently; no Authenticode
  // validation is claimed by this offline command.
  let manifest;
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    manifest = verifyManifest({ bytes, signature, publicKey,
      exeName: path.basename(exe), exeBytes: binary.bytes,
      tag: parsed.tag, thumbprint: options['publisher-thumbprint'] });
  } catch (error) {
    if (error?.message === 'INVALID_MANIFEST_SIGNATURE') throw new Error('MANIFEST_SIGNATURE_INVALID');
    if (error?.message === 'SIGNED_EXE_IDENTITY_MISMATCH') throw new Error('MANIFEST_BINARY_MISMATCH');
    throw error;
  }
  validatedManifest(manifest, options['publisher-thumbprint']);
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
