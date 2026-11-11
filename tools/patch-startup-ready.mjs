#!/usr/bin/env node
// One exact, fail-closed change to the desktop's local renderer-ready IPC budget.
// The UI must still independently return true; no security check is bypassed.
import { readFile, writeFile, lstat, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const ORIGINAL_BLOB = '76330ff6bd4e486d98c0b8705e122cab997c58c1';
export const BEFORE = "const ready = await bounded(checkRenderer, { signal: combined, timeoutMs: 3000, code: 'STARTUP_RENDERER_TIMEOUT', message: '软件页面就绪检查超时。' });";
export const AFTER = "const ready = await bounded(checkRenderer, { signal: combined, timeoutMs: 7000, code: 'STARTUP_RENDERER_TIMEOUT', message: '软件页面就绪检查超时。' });";
export function gitBlobSha(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
export function applyPatch(original, expectedBlob = ORIGINAL_BLOB) {
  const bytes = Buffer.isBuffer(original) ? original : Buffer.from(original, 'utf8');
  if (gitBlobSha(bytes) !== expectedBlob) throw Error('Startup source Git blob identity mismatch; refusing patch.');
  const source = bytes.toString('utf8');
  if (source.split(BEFORE).length !== 2 || source.includes(AFTER)) throw Error('Pinned startup renderer-ready expression is not unique and unpatched.');
  const patched = source.replace(BEFORE, AFTER);
  if (patched.replace(AFTER, BEFORE) !== source) throw Error('Startup patch changed material beyond the reviewed timeout expression.');
  return { patched, sha256: createHash('sha256').update(patched).digest('hex') };
}
async function main() {
  if (process.argv.includes('--self-test')) {
    const fixture = 'async function a(){\n  ' + BEFORE + '\n}\n';
    const hash = gitBlobSha(fixture);
    if (applyPatch(fixture, hash).patched !== fixture.replace(BEFORE, AFTER)) throw Error('Startup patch fixture mismatch.');
    for (const bad of [fixture + BEFORE, fixture.replace(BEFORE, 'not-the-expected-expression'), fixture.replace(BEFORE, AFTER)]) {
      let rejected = false;
      try { applyPatch(bad, gitBlobSha(bad)); } catch { rejected = true; }
      if (!rejected) throw Error('Startup patch failed to reject an unsafe fixture.');
    }
    console.log('PASS: four renderer startup patch positive/negative tests');
    return;
  }
  const filename = process.argv[2];
  if (!filename || !path.isAbsolute(path.resolve(filename))) throw Error('Expected pinned startup source path.');
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Refusing startup source link or non-file.');
  const { patched, sha256 } = applyPatch(await readFile(filename));
  const temp = filename + '.yutang-' + process.pid + '.tmp';
  try { await writeFile(temp, patched, { flag: 'wx' }); await rename(temp, filename); }
  finally { await rm(temp, { force: true }).catch(() => {}); }
  console.log('PASS renderer readiness IPC budget 3000 -> 7000 ms; patched SHA256=' + sha256);
  console.log('LIMIT: this change preserves the renderer-ready truth check and does not prove cold-start reliability.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch(error => { console.error('STARTUP_PATCH_FAIL_CLOSED: ' + String(error.message)); process.exitCode = 1; });
