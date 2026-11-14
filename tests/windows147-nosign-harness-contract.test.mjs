import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = fs.readFileSync(path.join(root, 'tests/Invoke-Windows147SigningNoSignPreflight.ps1'), 'utf8');
const signerBytes = fs.readFileSync(path.join(root, 'tools/signing/Sign-YuTangCandidate.ps1'));
const signerHash = createHash('sha256').update(signerBytes).digest('hex');

test('manual no-sign harness pins the exact accepted source name and SHA', () => {
  assert.match(harness, /\$expectedName = 'Dafeiyu-Douyin-API-1\.4\.7-win-x64\.exe'/);
  assert.match(harness, /\$expectedSha256 = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'/);
  assert.match(harness, /\$beforeSize -eq 125446071/);
});

test('harness pins exact audited signing script bytes, preventing unreviewed edits', () => {
  assert.ok(harness.includes("$expectedSignerSha256 = '" + signerHash + "'"));
  assert.match(harness, /SIGNER_SCRIPT_SHA256_MISMATCH/);
});

test('dry-run harness cannot invoke signing mode or SignTool', () => {
  assert.doesNotMatch(harness, /(?:^|\s)-Sign(?:\s|$)/m);
  assert.doesNotMatch(harness, /&\s*\$signTool\s+sign/);
  assert.doesNotMatch(harness, /Invoke-WebRequest|Start-Process|Export-PfxCertificate/);
  assert.match(harness, /& \$signerScript -SourceExe \$exe -ExpectedUnsignedSha256 \$expectedSha256 -OutputDirectory \$workOutput/);
  assert.match(harness, /PREFLIGHT_OK_NO_SIGNING/);
});

test('harness tests negative paths and confirms original SHA and empty output', () => {
  for (const code of [
    'UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE','UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE',
    'UNSIGNED_CANDIDATE_SHA256_MISMATCH','SOURCE_EXE_MISSING',
    'ORIGINAL_EXE_CHANGED','UNEXPECTED_SIGNED_OUTPUT'
  ]) assert.ok(harness.includes(code), code);
  assert.match(harness, /Get-FileHash -LiteralPath \$exe -Algorithm SHA256/);
  assert.match(harness, /Get-ChildItem -LiteralPath \$workOutput -Force/);
});

test('Windows-only result explicitly denies signed-EXE and release acceptance', () => {
  assert.match(harness, /status = 'PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY'/);
  assert.match(harness, /authenticodeSigned = \$false/);
  assert.match(harness, /signedExeAcceptance = \$false/);
  assert.match(harness, /publicationAuthorized = \$false/);
});
