#!/usr/bin/env node
import { readFile, writeFile, lstat, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGINAL_BLOB = 'a1c8522365f4e02d9ef83a6f6700ebe93acba2f6';
const EXPECTED_PATCHED_SHA256 = '5716a705e19663f1f6faed52569508b72cf091d3a31766828a7a5434a6eca1bc';
const BEFORE = "channel: 'msedge', headless: false, viewport: null, ignoreDefaultArgs: ['--mute-audio'],";
const AFTER = "channel: 'msedge', headless: false, viewport: null, chromiumSandbox: true, ignoreDefaultArgs: ['--mute-audio'],";
function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
export function applyCandidateSandboxPatch(bytes) {
  const original = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const originalBlob = gitBlobSha(original);
  if (originalBlob !== ORIGINAL_BLOB) throw new Error('Pinned browser-host source blob mismatch; refusing patch.');
  const source = original.toString('utf8');
  if (source.split(BEFORE).length !== 2 || source.includes('chromiumSandbox: true')) throw new Error('Expected one exact unpatched Edge launch block.');
  const start = source.indexOf('chromiumImpl.launchPersistentContext(profile, {');
  const location = source.indexOf(BEFORE);
  if (start < 0 || location < start || location > start + 300) throw new Error('Sandbox option is not in the dedicated Edge launch block.');
  const patched = source.replace(BEFORE, AFTER);
  if (!patched.slice(start, start + 500).includes('chromiumSandbox: true') || patched.slice(start, start + 650).includes('--no-sandbox')) throw new Error('Sandbox patch did not pass the local guard.');
  if (createHash('sha256').update(patched).digest('hex') !== EXPECTED_PATCHED_SHA256) throw new Error('Patched browser-host SHA256 differs from the verified build patch.');
  if (patched.replace(AFTER, BEFORE) !== source) throw new Error('Patch changed more than the one verified option.');
  return patched;
}
async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node tools/patch_candidate_browser_host.mjs upstream/browser-host.mjs');
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Browser host must be a regular file.');
  const patched = applyCandidateSandboxPatch(await readFile(target));
  const temporary = target + '.node24-probe-' + process.pid + '.tmp';
  try { await writeFile(temporary, patched, { flag: 'wx' }); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
  console.log('PASS exact candidate sandbox patch; SHA256=' + EXPECTED_PATCHED_SHA256);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write('PATCH_FAILED: ' + error.message + '\n'); process.exitCode = 1; });
}
