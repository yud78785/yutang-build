import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file=path.join(root,'docs/templates/windows-147-nosign-preflight.branch-one-shot.yml');
const text=fs.readFileSync(file,'utf8');

test('template is inert in docs and restricts push to single isolated branch and file',()=>{
  assert.ok(!file.includes(path.join('.github','workflows')));
  assert.match(text,/^on:\n  push:\n    branches:\n      - experiment\/windows-147-nosign-run-20261114\n    paths:\n      - \.github\/workflows\/windows-147-nosign-one-shot\.yml/m);
  assert.match(text,/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/experiment\/windows-147-nosign-run-20261114'/);
  assert.doesNotMatch(text,/workflow_dispatch|schedule:|pull_request:|repository_dispatch:/);
});

test('source code, unsigned artifact and digest remain immutable',()=>{
  assert.match(text,/ref: c8cf9be7c175d00774e7e5cc5a763d587b77ec6e/);
  assert.match(text,/run-id: 43541915930/);
  assert.match(text,/name: YuTang-OpenRouter-Desktop-1\.4\.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE/);
  assert.match(text,/Dafeiyu-Douyin-API-1\.4\.7-win-x64\.exe/);
  assert.match(text,/3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34/);
  assert.match(text,/125446071/);
});

test('job is read-only and makes no release or signing changes',()=>{
  assert.match(text,/permissions:\n  contents: read\n  actions: read/);
  assert.match(text,/persist-credentials: false/);
  assert.match(text,/os: \[windows-2022, windows-2025\]/);
  assert.match(text,/NoProfile -NonInteractive -File \$harness/);
  assert.match(text,/\$LASTEXITCODE -ne 0/);
  assert.match(text,/PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY/);
  assert.doesNotMatch(text,/(?:^|\s)-Sign(?:\s|$)|signtool\.exe|Start-Process|upload-artifact|create-release|publish release/im);
});


test('one-shot job uses supported push.before rather than unavailable commit.added metadata',()=>{
  assert.match(text,/github\.event\.before == 'ee411c1a9c2684d6fdc82cfa8c2542de83fd776f'/);
  assert.match(text,/github\.event\.created == false/);
  assert.match(text,/github\.event\.forced == false/);
  assert.doesNotMatch(text,/head_commit\.added/);
});
