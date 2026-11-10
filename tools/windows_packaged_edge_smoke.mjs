#!/usr/bin/env node
// Candidate-only Windows CI probe. Does not login, run a model, send a message, or modify real profiles.
// A Windows Firewall rule must already block outbound Edge traffic; this probe fails closed without it.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const EXPECTED_EXE = '84321ec6c827de90e95d0d03b76a693444f8ea8c22c9c71c709e2e496bde753a';
const FILE = 'Dafeiyu-Douyin-API-1.4.6-win-x64.exe';
const PORT = 9227;
const allowedEnv = /^(?:path|systemroot|windir|comspec|pathext|programfiles|programfiles\(x86\)|programdata)$/i;

export function hasHostAncestor(pid, hostPid, procs) {
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(hostPid) || pid < 1 || hostPid < 1) return false;
  const byPid = new Map(procs.map(p => [Number(p.ProcessId), p]));
  const visited = new Set();
  for (let i = 0, cursor = pid; i < 40 && cursor > 0; i++) {
    if (cursor === hostPid) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const parent = Number(byPid.get(cursor)?.ParentProcessId);
    if (!Number.isSafeInteger(parent) || parent < 1) return false;
    cursor = parent;
  }
  return false;
}

export function verifyProcessSnapshot({ processes, hostPid, profile, listenerPids, portAddresses }) {
  const list = processes.filter(p => p && typeof p === 'object');
  const edge = list.filter(p => /msedge\.exe$/i.test(String(p.Name)) &&
    typeof p.CommandLine === 'string' && p.CommandLine.toLowerCase().includes(profile.toLowerCase()));
  if (!edge.length) throw new Error('No MS Edge process in the isolated profile was found');
  if (edge.some(p => !hasHostAncestor(Number(p.ProcessId), hostPid, list)))
    throw new Error('Isolated-profile MS Edge process is not a descendant of recorded browser host');
  const family = list.filter(p => /msedge\.exe$/i.test(String(p.Name)) &&
    hasHostAncestor(Number(p.ProcessId), hostPid, list));
  if (family.some(p => typeof p.CommandLine !== 'string' ||
    /(?:^|\s)--(?:no-sandbox|disable-setuid-sandbox)(?:\s|=|$)/i.test(p.CommandLine)))
    throw new Error('Unsafe or unreadable MS Edge child process command line');
  if (!listenerPids.length || listenerPids.some(pid => !family.some(p => Number(p.ProcessId) === pid)))
    throw new Error('CDP port listener PID is not a descendant MS Edge process');
  if (!portAddresses.length || portAddresses.some(a => !['127.0.0.1', '::1'].includes(a)))
    throw new Error('CDP socket does not listen exclusively on loopback');
  return { edgeProcessCount: family.length, listenerCount: listenerPids.length,
    flagsChecked: true, pidLineageChecked: true, listenerMatchesEdge: true, loopbackOnly: true };
}

export function selfTest() {
  const profile = 'C:\\sandbox\\profile';
  const list = [
    {ProcessId: 100, ParentProcessId: 9, Name:'node.exe',CommandLine:'node host.js'},
    {ProcessId: 200, ParentProcessId: 100, Name:'msedge.exe',CommandLine:`msedge.exe --user-data-dir=${profile} --remote-debugging-port=9227`},
    {ProcessId: 201, ParentProcessId: 200, Name:'msedge.exe',CommandLine:`msedge.exe --user-data-dir=${profile} --type=renderer`},
    {ProcessId: 300, ParentProcessId: 4, Name:'msedge.exe',CommandLine:'msedge.exe --remote-debugging-port=9227'}
  ];
  const good={processes:list,hostPid:100,profile,listenerPids:[200],portAddresses:['127.0.0.1']};
  assert.equal(verifyProcessSnapshot(good).listenerMatchesEdge,true);
  assert.equal(hasHostAncestor(201,100,list),true);
  assert.equal(hasHostAncestor(300,100,list),false);
  assert.throws(()=>verifyProcessSnapshot({...good,listenerPids:[300]}),/listener PID/);
  assert.throws(()=>verifyProcessSnapshot({...good,portAddresses:['0.0.0.0']}),/loopback/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===200?{...p,ParentProcessId:300}:p)}),/descendant/);
  assert.throws(()=>verifyProcessSnapshot({...good,processes:list.map(p=>p.ProcessId===201?{...p,CommandLine:p.CommandLine+' --no-sandbox'}:p)}),/Unsafe/);
  assert.throws(()=>verifyProcessSnapshot({...good,profile:'C:\\another'}),/No MS Edge/);
  console.log('PASS 8 synthetic Windows process ownership/port binding regression assertions');
}

async function sha256(file) {
  const h=createHash('sha256');
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
async function until(work, milliseconds, label) {
  const end=Date.now()+milliseconds;
  let last;
  while(Date.now()<end) {
    try {const v=await work();if(v)return v;} catch(e){last=e;}
    await delay(250);
  }
  throw new Error(`${label} unavailable after ${milliseconds}ms: ${last?.message || 'no evidence'}`);
}
async function readJSON(file) {return JSON.parse(await fs.readFile(file,'utf8'));}
const ps = script => {
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:25000,maxBuffer:8*1024*1024});
  const json=out.trim();return json?JSON.parse(json):[];
};
async function run(exeFile) {
  if (process.platform!=='win32' || process.env.GITHUB_ACTIONS!=='true' || process.env.YUTANG_EDGE_FIREWALL_CONFIRMED!=='yes')
    throw new Error('Refusing candidate launch outside pre-guarded ephemeral Windows GitHub runner');
  assert.equal(path.basename(exeFile),FILE);
  assert.equal(await sha256(exeFile),EXPECTED_EXE,'Candidate EXE does not match immutable build');
  const base=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(),'yutang-edge-ci-'));
  const home=path.join(base,'home'),userData=path.join(base,'user-data'),memory=path.join(base,'memory');
  const locationFile=path.join(base,'runtime-location.json');
  const paths={stateDir:path.join(base,'state'),memoryDir:memory,memoryDbPath:path.join(memory,'shared.sqlite'),mediaEnvFile:path.join(base,'media','.env'),mediaSettingsFile:path.join(base,'media','settings.local.json'),mediaRuntimeRoot:path.join(base,'media'),mediaModelsDir:path.join(base,'media','models')};
  for(const d of [home,userData,memory,paths.stateDir,paths.mediaRuntimeRoot,path.join(base,'temp'),path.join(base,'app-data'),path.join(base,'local-app-data')])await fs.mkdir(d,{recursive:true});
  await fs.writeFile(locationFile,JSON.stringify({version:1,...paths}));
  await fs.writeFile(paths.mediaEnvFile,'');
  await fs.writeFile(paths.mediaSettingsFile,JSON.stringify({enabled:false,backend:'local-whisper'}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowedEnv.test(key)));
  Object.assign(env,{HOME:home,USERPROFILE:home,APPDATA:path.join(base,'app-data'),LOCALAPPDATA:path.join(base,'local-app-data'),TEMP:path.join(base,'temp'),TMP:path.join(base,'temp'),DSH_HOME:path.join(home,'.dsh'),DOUYIN_DESKTOP_USER_DATA:userData,DOUYIN_RUNTIME_LOCATION_FILE:locationFile,DOUYIN_DESKTOP_SMOKE:'1'});
  // No GITHUB_TOKEN, CI tokens, personal credentials, API keys or existing profile paths are passed to the EXE.
  const child=spawn(exeFile,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:true,stdio:'ignore',shell:false});
  const control=path.join(home,'.dsh','douyin-browser','control','browser.json');
  const profile=path.join(home,'.dsh','douyin-browser','cli-profile');
  const report={type:'WINDOWS_EDGE_LAUNCH_IN_EPHEMERAL_CI_ONLY',candidateSha256:EXPECTED_EXE,realAccount:false,modelKey:false,externalEdgeNetworkBlocked:true};
  try {
    const ready=await until(async()=>{const x=await readJSON(path.join(userData,'desktop-smoke.json'));return x.ready===true?x:null;},85000,'packaged EXE startup');
    assert.equal(ready.configured,false,'EXE must not be configured with a model key');
    assert.equal(path.resolve(ready.memoryFolder).toLowerCase(),path.resolve(memory).toLowerCase(),'unexpected memory folder');
    assert.match(ready.origin,/^http:\/\/127\.0\.0\.1:\d{4,5}$/);
    report.desktopReady=true;
    const bootstrap=await (await fetch(ready.origin+'/api/bootstrap',{signal:AbortSignal.timeout(5000)})).json();
    assert.equal(typeof bootstrap.token,'string');assert.ok(bootstrap.token.length>10);
    let openStatus=null;
    try {
      const response=await fetch(ready.origin+'/api/browser/open',{
        method:'POST',headers:{'content-type':'application/json','x-session-token':bootstrap.token},body:'{}',signal:AbortSignal.timeout(49000)
      });
      openStatus=response.status;
    } catch(e) {openStatus=e.name==='TimeoutError'?'HTTP_TIMEOUT':`HTTP_${e.name}`;}
    report.browserOpenHttpStatus=openStatus;
    const state=await until(async()=>{const x=await readJSON(control);return x.ready===true?x:null;},20000,'dedicated browser ready state');
    assert.equal(path.resolve(state.profile).toLowerCase(),path.resolve(profile).toLowerCase(),'Dedicated browser profile not isolated');
    assert.equal(state.port,PORT);
    assert.ok(Number.isSafeInteger(state.pid)&&state.pid>0);
    const version=await (await fetch(`http://127.0.0.1:${PORT}/json/version`,{signal:AbortSignal.timeout(5000)})).json();
    assert.match(String(version.Browser),/(?:Edg|Chrome)/);
    const processes=ps(`Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe' OR Name = 'node.exe'" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 4`);
    const items=Array.isArray(processes)?processes:[processes];
    const listeners=ps(`Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object OwningProcess,LocalAddress | ConvertTo-Json -Compress -Depth 4`);
    const sockets=Array.isArray(listeners)?listeners:(!listeners?[]:[listeners]);
    const ownership=verifyProcessSnapshot({processes:items,hostPid:state.pid,profile,listenerPids:sockets.map(p=>Number(p.OwningProcess)),portAddresses:sockets.map(p=>p.LocalAddress)});
    Object.assign(report,ownership,{browserReady:true,cdpResponded:true,notProven:['Effective renderer sandbox integrity','Douyin video playback','Model reasoning','Long-term autonomy','General user PC safety']});
    console.log('PASS_WINDOWS_PACKAGED_EXE_TO_EDGE_OWNERSHIP '+JSON.stringify(report));
    return report;
  } finally {
    // The GitHub-hosted VM is discarded. Never terminate any unrelated Edge or user browser process.
    try {child.kill();}catch{}
    // Keep test files for only this disposable VM; no upload of profiles, tokens, or logs.
  }
}

if(process.argv.includes('--self-test'))selfTest();
else {
  const exe=process.argv[2];
  if(!exe)throw new Error('Specify exact candidate EXE path; only in GitHub Windows CI');
  run(path.resolve(exe)).catch(e=>{console.error('FAIL_CLOSED_WINDOWS_EDGE_SMOKE:',e.message);process.exitCode=1;});
}
