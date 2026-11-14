import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'tools/Check-YuTangWindowsReadiness.ps1'),'utf8');

test('exact source candidate identity pinned, not the 2022 independent binary',()=>{
 assert.match(source,/Dafeiyu-Douyin-API-1\.4\.7-win-x64\.exe/);
 assert.match(source,/3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34/);
 assert.match(source,/125446071/);
});
test('no side-effect or network commands in inspect-only script',()=>{
 assert.doesNotMatch(source,/\b(?:Start-Process|Invoke-WebRequest|Invoke-RestMethod|Set-Item|New-Item|Remove-Item|Set-NetFirewallRule|New-NetFirewallRule|Invoke-Expression|Start-Job|Copy-Item|Move-Item)\b/i);
 assert.match(source,/exeStarted = \$false/);
 assert.match(source,/browserStarted = \$false/);
 assert.match(source,/networkRequested = \$false/);
 assert.match(source,/filesystemModified = \$false/);
 assert.match(source,/releaseAuthorized = \$false/);
});
test('static-only status is never conflated with general user acceptance',()=>{
 assert.match(source,/PASS_STATIC_PREREQUISITES_ONLY/);
 assert.match(source,/ENVIRONMENT_ONLY_NOT_EXE_ACCEPTANCE/);
 assert.match(source,/generalUserPcAcceptance = \$false/);
});
test('the read-only checker guards missing Edge, CDP conflict, and file redirection',()=>{
 assert.match(source,/WINDOWS_REQUIRED/);
 assert.match(source,/MICROSOFT_EDGE_NOT_FOUND/);
 assert.match(source,/DEDICATED_CDP_PORT_9227_OCCUPIED/);
 assert.match(source,/CANDIDATE_REPARSE_POINT_FORBIDDEN/);
});
