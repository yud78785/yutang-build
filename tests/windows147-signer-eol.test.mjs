import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const attrs = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
const signer = fs.readFileSync(path.join(root, 'tools/signing/Sign-YuTangCandidate.ps1'));
const harness = fs.readFileSync(path.join(root, 'tests/Invoke-Windows147SigningNoSignPreflight.ps1'), 'utf8');
const SHA_LF = '2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1';
const SHA_CRLF = '0c68aab2e39220857b1912d84d8726bc5a15ab83cdda27b3e73b7009efd8c1f2';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('Git forces exact audited signing and harness PowerShell files to LF', () => {
  const expected = new Set([
    'tools/signing/Sign-YuTangCandidate.ps1 text eol=lf',
    'tests/Invoke-Windows147SigningNoSignPreflight.ps1 text eol=lf'
  ]);
  const rules = attrs.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#'));
  assert.deepEqual(new Set(rules), expected);
});

test('audited signer is precisely the LF file pinned in the harness', () => {
  assert.ok(signer.length > 5000);
  assert.equal(signer.includes(13), false, 'no CR bytes allowed');
  assert.equal(digest(signer), SHA_LF);
  assert.match(harness, /expectedSignerSha256 = '2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1'/);
});

test('the Windows-style CRLF conversion changes signer hash and is forbidden by attributes', () => {
  const source = signer.toString('utf8');
  const crlf = Buffer.from(source.replace(/\n/g, '\r\n'), 'utf8');
  assert.equal(digest(crlf), SHA_CRLF);
  assert.notEqual(digest(crlf), SHA_LF);
});

test('no executable or signature operation is added to the fix', () => {
  assert.match(harness, /PREFLIGHT_OK_NO_SIGNING/);
  assert.doesNotMatch(harness, /&\s*\$signTool\s+sign/);
});
