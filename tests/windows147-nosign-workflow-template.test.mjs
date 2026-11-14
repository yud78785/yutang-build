import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'docs/templates/windows-147-nosign-preflight.manual-only.yml');
const yaml = fs.readFileSync(templatePath, 'utf8');

test('workflow is inert: outside .github/workflows and manual trigger only', () => {
  assert.ok(!templatePath.includes(path.join('.github','workflows')));
  assert.match(yaml, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yaml, /^\s+(?:push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m);
  assert.match(yaml, /if: github\.event_name == 'workflow_dispatch'/);
});

test('workflow has readonly permission and no signing or publishing action', () => {
  assert.match(yaml, /permissions:\n  contents: read\n  actions: read/);
  assert.match(yaml, /persist-credentials: false/);
  assert.doesNotMatch(yaml, /^\s*(?:write|packages|id-token):/m);
  assert.doesNotMatch(yaml, /(?:^|\s)-Sign(?:\s|$)|signtool\.exe|Start-Process|upload-artifact|create-release|publish release/im);
});

test('artifact download is pinned to the previously tested UNSIGNED candidate', () => {
  assert.match(yaml, /ref: c8cf9be7c175d00774e7e5cc5a763d587b77ec6e/);
  assert.match(yaml, /run-id: 43541915930/);
  assert.match(yaml, /name: YuTang-OpenRouter-Desktop-1\.4\.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE/);
  assert.match(yaml, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(yaml, /Dafeiyu-Douyin-API-1\.4\.7-win-x64\.exe/);
  assert.match(yaml, /3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34/);
  assert.match(yaml, /125446071/);
});

test('two Windows runner jobs execute PowerShell and reject false release claims', () => {
  assert.match(yaml, /os: \[windows-2022, windows-2025\]/);
  assert.match(yaml, /shell: powershell/);
  assert.match(yaml, /NoProfile -NonInteractive -File \$harness/);
  assert.match(yaml, /\$LASTEXITCODE -ne 0/);
  assert.match(yaml, /PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY/);
  assert.match(yaml, /\$receipt\.publicationAuthorized -ne \$false/);
  assert.match(yaml, /\$after -cne \$expectedSha/);
});
