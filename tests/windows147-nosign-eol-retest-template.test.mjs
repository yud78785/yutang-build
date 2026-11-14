import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filePath = path.join(root,'docs/templates/windows-147-nosign-preflight.eol-retest.inert.yml');
const source = fs.readFileSync(filePath,'utf8');
const codeSha='27da129f96a2e7a343933147096cab947b0f2293';
const branch='experiment/windows-147-nosign-eol-retest-20261114';
const triggerPath='.github/workflows/windows-147-nosign-eol-retest.yml';
const signerSha='2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1';
const exeSha='3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';

test('retry template is inert and cannot run from docs directory',()=>{
 assert.ok(!filePath.includes(path.join('.github','workflows')));
 assert.match(source,/^on:\n  push:/m);
 assert.ok(source.includes('- '+branch));
 assert.ok(source.includes('- '+triggerPath));
 assert.doesNotMatch(source,/workflow_dispatch:|schedule:|pull_request:/);
});

test('second run needs a new explicit authorization and fresh branch gate',()=>{
 const gate=source.split('\n').find(s=>s.trim().startsWith('if: github.event_name'));
 assert.ok(gate?.includes("github.event.before == '"+codeSha+"'"));
 assert.ok(gate?.includes("github.ref == 'refs/heads/"+branch+"'"));
 assert.ok(gate?.includes('github.event.created == false'));
 assert.ok(gate?.includes('github.event.forced == false'));
 assert.ok(gate?.includes('github.event.deleted == false'));
 assert.doesNotMatch(source,/head_commit\.added/);
});

test('checkout and signer use exact audited code, LF SHA and fixed original EXE',()=>{
 assert.ok(source.includes('ref: '+codeSha));
 assert.ok(source.includes("$actualCommit -cne '"+codeSha+"'"));
 assert.ok(source.includes("$actualSignerSha -cne '"+signerSha+"'"));
 assert.ok(source.includes('WINDOWS_SIGNER_ACTUAL_SHA256='));
 assert.ok(source.indexOf('Check exact signer LF SHA before candidate download') <
           source.indexOf('Download exact accepted unsigned Windows 2025 candidate'));
 assert.ok(source.includes('run-id: 43541915930'));
 assert.ok(source.includes('YuTang-OpenRouter-Desktop-1.4.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE'));
 assert.ok(source.includes(exeSha));
});

test('Windows matrix remains read-only with no EXE launch or signing',()=>{
 assert.match(source,/os: \[windows-2022, windows-2025\]/);
 assert.match(source,/permissions:\n  contents: read\n  actions: read/);
 assert.match(source,/persist-credentials: false/);
 assert.doesNotMatch(source,/(?:^|\s)-Sign(?:\s|$)|signtool\.exe|Start-Process|upload-artifact|gh release create/im);
 assert.match(source,/PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY/);
 assert.match(source,/NONSIGN_RECEIPT_REJECTED/);
});
