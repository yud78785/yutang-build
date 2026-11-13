import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const source = path.resolve('upstream', 'desktop', 'scripts', 'acquire-upstream.mjs');
const { normalizePinnedWindowsArchiveFilename } = await import(pathToFileURL(source).href);
const DIR = path.join('snapshots', 'web', 'present', 'workspace.expected');
const WRONG_NAME = 'F»¦µÿÄ.txt';
const RIGHT_NAME = '说明.txt';
const EXACT_BYTES = Buffer.from('DELIVERED_NOTE\n', 'utf8');
const GIT_BLOB = 'e0f8e3262354fe6d5b5fa046c8c180b58653870b';
const blob = data => createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
assert.equal(EXACT_BYTES.length, 15);
assert.equal(blob(EXACT_BYTES), GIT_BLOB);

async function fixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yutang-filename-normalizer-'));
  const directory = path.join(root, DIR);
  await mkdir(directory, {recursive: true});
  try {
    await fn({ root, directory, wrong: path.join(directory, WRONG_NAME), right: path.join(directory, RIGHT_NAME) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function exists(filename) {
  try { await access(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

test('normalizes only the original 15-byte pinned UTF-8 filename', async () => fixture(async ({ root, wrong, right }) => {
  await writeFile(wrong, EXACT_BYTES);
  const result = await normalizePinnedWindowsArchiveFilename(root, 'win32');
  assert.equal(result.status, 'single-git-blob-verified-filename-normalized');
  assert.equal(await exists(wrong), false);
  assert.deepEqual(await readFile(right), EXACT_BYTES);
  const repeat = await normalizePinnedWindowsArchiveFilename(root, 'win32');
  assert.equal(repeat.status, 'no-known-filename-mismatch');
}));

test('no workaround runs on Linux; full verified source tree still required', async () => fixture(async ({ root, wrong, right }) => {
  await writeFile(wrong, EXACT_BYTES);
  const result = await normalizePinnedWindowsArchiveFilename(root, 'linux');
  assert.equal(result.status, 'not-windows');
  assert.equal(await exists(wrong), true);
  assert.equal(await exists(right), false);
}));

test('wrong bytes are rejected and neither path is modified', async () => fixture(async ({ root, wrong, right }) => {
  await writeFile(wrong, 'DELIVERED_WRONG\n');
  await assert.rejects(() => normalizePinnedWindowsArchiveFilename(root, 'win32'), /WINDOWS_TAR_FILENAME_BLOB_MISMATCH/);
  assert.equal(await exists(wrong), true);
  assert.equal(await exists(right), false);
}));

test('source content larger or smaller than 15 bytes is rejected', async () => fixture(async ({ root, wrong }) => {
  await writeFile(wrong, 'X');
  await assert.rejects(() => normalizePinnedWindowsArchiveFilename(root, 'win32'), /INVALID_WINDOWS_TAR_FILENAME_FIX_SOURCE/);
}));

test('both canonical and misdecoded names present is a hard collision', async () => fixture(async ({ root, wrong, right }) => {
  await writeFile(wrong, EXACT_BYTES);
  await writeFile(right, EXACT_BYTES);
  await assert.rejects(() => normalizePinnedWindowsArchiveFilename(root, 'win32'), /UNCERTAIN_UPSTREAM_FILENAME_COLLISION/);
  assert.deepEqual(await readFile(right), EXACT_BYTES);
  assert.deepEqual(await readFile(wrong), EXACT_BYTES);
}));

test('wrongly decoded directory is never renamed as an ordinary file', async () => fixture(async ({ root, wrong }) => {
  await mkdir(wrong);
  await assert.rejects(() => normalizePinnedWindowsArchiveFilename(root, 'win32'), /INVALID_WINDOWS_TAR_FILENAME_FIX_SOURCE/);
}));

test('arbitrary filenames are not renamed by the compatibility fix', async () => fixture(async ({ root, directory }) => {
  const unknown = path.join(directory, 'other-bad-name.txt');
  await writeFile(unknown, EXACT_BYTES);
  const result = await normalizePinnedWindowsArchiveFilename(root, 'win32');
  assert.equal(result.status, 'no-known-filename-mismatch');
  assert.deepEqual(await readFile(unknown), EXACT_BYTES);
}));
