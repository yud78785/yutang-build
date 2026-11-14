import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = readFileSync(path.join(root,'tools/signing/Sign-YuTangCandidate.ps1'));
const script = bytes.toString('utf8');
const attrs = readFileSync(path.join(root,'.gitattributes'),'utf8');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const PIN = '2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1';
const EXE_SHA = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';

test('exact PowerShell signer SHA matches independently Windows-tested no-sign source', () => {
  assert.equal(hash(bytes),PIN);
  assert.equal(bytes.length,7476);
});
test('Windows Git checkout must preserve LF, with no CR bytes', () => {
  assert.equal(bytes.includes(13),false);
  assert.ok(attrs.split('\n').includes('tools/signing/Sign-YuTangCandidate.ps1 text eol=lf'));
  assert.notEqual(hash(Buffer.from(script.replace(/\n/g,'\r\n'))),PIN);
});
test('signer restricts both candidate filename and exact accepted unsigned SHA', () => {
  assert.ok(script.includes("$pinnedUnsignedSha256 = '" + EXE_SHA + "'"));
  assert.ok(script.includes("$pinnedUnsignedFileName = 'Dafeiyu-Douyin-API-1.4.7-win-x64.exe'"));
  assert.match(script,/UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE/);
  assert.match(script,/UNSIGNED_SHA256_NOT_ACCEPTED_BASELINE/);
});
test('default preflight returns before any SignTool invocation', () => {
  const early=script.indexOf('if (-not $Sign)');
  const signature=script.indexOf('& $signTool sign ');
  assert.ok(early>0 && signature>early);
  assert.match(script,/PREFLIGHT_OK_NO_SIGNING/);
  assert.match(script,/SOURCE_MUST_BE_UNSIGNED_VERIFIED_CANDIDATE/);
});
test('real signing mode remains an explicit, fail-closed non-release operation', () => {
  assert.match(script,/SIGNTOOL_NOT_MICROSOFT_SIGNED/);
  assert.match(script,/OUTPUT_DIRECTORY_REPARSE_POINT_FORBIDDEN/);
  assert.match(script,/\[System\.IO\.FileMode\]::CreateNew/);
  assert.match(script,/AUTHENTICODE_VERIFICATION_OR_PUBLISHER_MISMATCH/);
  assert.match(script,/TRUSTED_TIMESTAMP_NOT_PRESENT/);
  assert.match(script,/windowsRetestRequired = \$true/);
  assert.match(script,/release = \$false/);
});
