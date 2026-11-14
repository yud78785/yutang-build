import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const harness = fs.readFileSync(path.join(root,'tests/Invoke-Windows147SigningNoSignPreflight.ps1'),'utf8');
const signerBytes = fs.readFileSync(path.join(root,'tools/signing/Sign-YuTangCandidate.ps1'));
const pin = harness.match(/\$expectedSignerSha256 = '([a-f0-9]{64})'/)?.[1];
const hash = b => createHash('sha256').update(b).digest('hex');
function canonicalize(raw) {
  const text = new TextDecoder('utf-8', {fatal:true}).decode(raw);
  const canon = text.replace(/\r\n/g,'\n');
  if(canon.includes('\r')) throw new Error('SIGNER_SCRIPT_UNEXPECTED_LINE_ENDINGS');
  return Buffer.from(canon,'utf8');
}

test('signed-script identity pin matches exact source repository LF bytes', () => {
  assert.ok(pin);
  assert.equal(hash(signerBytes),pin);
});

test('Windows CRLF checkout changes raw SHA but canonical LF matches trusted pin', () => {
  const text = signerBytes.toString('utf8');
  assert.ok(text.includes('\n'));
  const crlf = Buffer.from(text.replace(/\r?\n/g,'\r\n'),'utf8');
  assert.notEqual(hash(crlf),pin);
  assert.equal(hash(canonicalize(crlf)),pin);
  assert.equal(hash(canonicalize(signerBytes)),pin);
});

test('invalid UTF8, lone CR and other byte alterations never bypass pin', () => {
  assert.throws(()=>canonicalize(Buffer.from([0xff,0xfe])),/encoded data|valid/i);
  assert.throws(()=>canonicalize(Buffer.from('one\rtwo')),/SIGNER_SCRIPT_UNEXPECTED_LINE_ENDINGS/);
  const changed=Buffer.from(signerBytes.toString('utf8').replace('Get-AuthenticodeSignature','Get-InvalidSignature'),'utf8');
  assert.notEqual(hash(canonicalize(changed)),pin);
});

test('PowerShell fixes canonicalization without skipping pin and never signs', () => {
  assert.match(harness,/\$utf8Strict = \[System\.Text\.UTF8Encoding\]::new\(\$false, \$true\)/);
  assert.match(harness,/\$signerCanonical = \$signerText\.Replace\("\`r\`n", "\`n"\)/);
  assert.match(harness,/\$signerHashAlgorithm\.ComputeHash/);
  assert.match(harness,/SIGNER_SCRIPT_UNEXPECTED_LINE_ENDINGS/);
  assert.match(harness,/SIGNER_SCRIPT_SHA256_MISMATCH/);
  assert.match(harness,/Assert-True \(\$signerSha -ceq \$expectedSignerSha256\)/);
  assert.doesNotMatch(harness,/(?:^|\s)-Sign(?:\s|$)/m);
  assert.doesNotMatch(harness,/&\s*\$signTool\s+sign/);
});
