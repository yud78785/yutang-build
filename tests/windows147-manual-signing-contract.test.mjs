import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.resolve(here, '../tools/signing/Sign-YuTangCandidate.ps1'), 'utf8');
const before = (a,b) => { const x=script.indexOf(a), y=script.indexOf(b);
  assert.ok(x >= 0 && y >= 0 && x < y, 'ORDER_OR_GUARD_MISSING: ' + a + ' / ' + b); };

test('manual signer is pinned to the accepted unsigned 1.4.7 EXE SHA', () => {
  assert.match(script, /pinnedUnsignedSha256\s*=\s*'3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34'/);
  assert.match(script, /UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE/);
  before('UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE', '& $signTool sign ');
});

test('manual signer refuses renamed 1.4.7 baseline masquerading as another version', () => {
  assert.match(script, /pinnedUnsignedFileName\s*=\s*'Dafeiyu-Douyin-API-1\.4\.7-win-x64\.exe'/);
  assert.match(script, /if \(\$name -cne \$pinnedUnsignedFileName\) \{ Fail 'UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE' \}/);
  before('UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE', 'Get-FileHash -LiteralPath $source -Algorithm SHA256');
  before('UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE', '& $signTool sign ');
});

test('default invocation exits before any signing operation', () => {
  assert.match(script, /if \(-not \$Sign\)\s*\{[\s\S]*?PREFLIGHT_OK_NO_SIGNING[\s\S]*?return/);
  before('PREFLIGHT_OK_NO_SIGNING', '& $signTool sign ');
});

test('unsigned source must match SHA and remain unmodified', () => {
  assert.match(script, /UNSIGNED_CANDIDATE_SHA256_MISMATCH/);
  assert.match(script, /SOURCE_MUST_BE_UNSIGNED_VERIFIED_CANDIDATE/);
  assert.match(script, /ORIGINAL_UNSIGNED_EXE_CHANGED_DURING_SIGNING/);
  before('SOURCE_MUST_BE_UNSIGNED_VERIFIED_CANDIDATE', '& $signTool sign ');
});

test('source, approved SignTool and output folder reject reparse-point surfaces', () => {
  assert.match(script, /SOURCE_REPARSE_POINT_FORBIDDEN/);
  assert.match(script, /SIGNTOOL_REPARSE_POINT_FORBIDDEN/);
  assert.match(script, /OUTPUT_DIRECTORY_REPARSE_POINT_FORBIDDEN/);
  before('OUTPUT_DIRECTORY_REPARSE_POINT_FORBIDDEN', '& $signTool sign ');
});

test('output copies atomically fail on existing destinations', () => {
  assert.match(script, /\[System\.IO\.FileMode\]::CreateNew/);
  assert.match(script, /SIGNED_OUTPUT_ALREADY_EXISTS/);
  assert.match(script, /SIGNING_RECEIPT_ALREADY_EXISTS/);
  assert.doesNotMatch(script, /Copy-Item\s+-LiteralPath\s+\$source\s+-Destination\s+\$dest/);
  before('COPIED_CANDIDATE_CHANGED_BEFORE_SIGNING', '& $signTool sign ');
});

test('SignTool must have trusted Microsoft code signature and code-signing cert must be eligible', () => {
  assert.match(script, /SIGNTOOL_NOT_MICROSOFT_SIGNED/);
  assert.match(script, /Get-AuthenticodeSignature -LiteralPath \$signTool/);
  assert.match(script, /SIMPLYSIGN_CERT_NOT_AVAILABLE_IN_CURRENT_USER_STORE/);
  assert.match(script, /CERTIFICATE_NOT_CODE_SIGNING/);
});

test('post-sign verifies publisher, timestamp and changed signed SHA', () => {
  assert.match(script, /& \$signTool sign \/v \/s My \/sha1 \$thumb \/fd SHA256 \/tr/);
  assert.match(script, /& \$signTool verify \/pa \/all \/v \/tw/);
  assert.match(script, /AUTHENTICODE_VERIFICATION_OR_PUBLISHER_MISMATCH/);
  assert.match(script, /TRUSTED_TIMESTAMP_NOT_PRESENT/);
  assert.match(script, /SIGNED_EXE_HASH_DID_NOT_CHANGE/);
  before('& $signTool verify ', 'Get-AuthenticodeSignature -LiteralPath $dest');
});

test('only redacted non-release receipts are written; secrets never exported by script', () => {
  assert.match(script, /schema = 'yutang\.windows-local-signing-receipt\.v1'/);
  assert.match(script, /release = \$false/);
  assert.match(script, /windowsRetestRequired = \$true/);
  assert.doesNotMatch(script, /Export-PfxCertificate|Set-GitHubSecret|GITHUB_TOKEN|Invoke-WebRequest/);
});
