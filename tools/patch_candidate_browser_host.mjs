#!/usr/bin/env node
import { readFile, writeFile, lstat, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIGINAL_BLOB = 'a1c8522365f4e02d9ef83a6f6700ebe93acba2f6';
const EXPECTED_PATCHED_SHA256 = '29e77cca0cb3c0bdf3750de3727ffde9e2e761a70d90f992eb24cd7bcbbb1a9d';
const BEFORE = "channel: 'msedge', headless: false, viewport: null, ignoreDefaultArgs: ['--mute-audio'],";
const AFTER = "channel: 'msedge', headless: false, viewport: null, chromiumSandbox: true, ignoreDefaultArgs: ['--mute-audio'],";
const BEFORE_ARGS = "args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required'],";
const AFTER_ARGS = "args: [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--autoplay-policy=no-user-gesture-required', '--enable-features=NetworkServiceSandbox'],";
function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
export function applyCandidateSandboxPatch(bytes) {
  const original = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (gitBlobSha(original) !== ORIGINAL_BLOB) throw new Error('Pinned browser-host source blob mismatch; refusing patch.');
  const source = original.toString('utf8');
  if (source.split(BEFORE).length !== 2 || source.split(BEFORE_ARGS).length !== 2 ||
      source.includes('chromiumSandbox: true') || source.includes('--enable-features=NetworkServiceSandbox')) {
    throw new Error('Expected one exact unpatched Edge launch block and argument list.');
  }
  const start = source.indexOf('chromiumImpl.launchPersistentContext(profile, {');
  const location = source.indexOf(BEFORE);
  const argsLocation = source.indexOf(BEFORE_ARGS);
  if (start < 0 || location < start || location > start + 300) throw new Error('Renderer sandbox option is not in the dedicated Edge launch block.');
  if (argsLocation <= location || argsLocation > start + 800) throw new Error('Network Service sandbox argument is not in the dedicated Edge launch block.');
  const patched = source.replace(BEFORE, AFTER).replace(BEFORE_ARGS, AFTER_ARGS);
  const launch = patched.slice(start, start + 900);
  if (!launch.includes('chromiumSandbox: true') || !launch.includes('--enable-features=NetworkServiceSandbox') ||
      launch.includes('--no-sandbox') || launch.includes('--disable-setuid-sandbox')) {
    throw new Error('Renderer or Network Service sandbox patch did not pass the local guard.');
  }
  if (createHash('sha256').update(patched).digest('hex') !== EXPECTED_PATCHED_SHA256) throw new Error('Patched browser-host SHA256 differs from the verified renderer/network sandbox patch.');
  if (patched.replace(AFTER_ARGS, BEFORE_ARGS).replace(AFTER, BEFORE) !== source) throw new Error('Patch changed more than the two verified launch options.');
  return patched;
}
async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('Usage: node tools/patch_candidate_browser_host.mjs upstream/browser-host.mjs');
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Browser host must be a regular file.');
  const patched = applyCandidateSandboxPatch(await readFile(target));
  const temporary = target + '.candidate-patch-' + process.pid + '.tmp';
  try { await writeFile(temporary, patched, { flag: 'wx' }); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
  process.stdout.write('PASS exact renderer + Network Service sandbox patch SHA256=' + EXPECTED_PATCHED_SHA256 + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write('PATCH_FAILED: ' + error.message + '\n'); process.exitCode = 1; });
}
