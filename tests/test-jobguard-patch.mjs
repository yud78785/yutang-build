import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { patchBrowserHost, patchCore } from '../tools/jobguard/patch-jobguard.mjs';

const host=[
  "import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';",
  "import path from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  "import { execFile } from 'node:child_process';",
  "import { promisify } from 'node:util';",
  "import { chromium } from './playwright-runtime.mjs';",
  "",
  "const execute = promisify(execFile);",
  "export async function runBrowserHost({ profile, controlDir, port, chromiumImpl = chromium, probeInstallation = probeEdgeInstallation, logger = console, processImpl = process } = {}) {",
  "  mkdirSync(controlDir, { recursive: true });",
  "  const stateFile = path.join(controlDir, 'browser.json'); let context, installation, focusFailed = false;",
  "  const writeState = (ready, extra = {}) => {",
  "    const temporary = `${stateFile}.${processImpl.pid}.tmp`;",
  "    writeFileSync(temporary, JSON.stringify({ pid: processImpl.pid, profile, port, ready, startedAt: Date.now(), ...extra }));",
  "    renameSync(temporary, stateFile);",
  "  };",
  "  try {",
  "    writeState(false);",
  "    try { installation = await probeInstallation(); } catch {}",
  "    context = await chromiumImpl.launchPersistentContext(profile, {});",
  "  }",
  "}"
].join('\n');
const core=[
  "    if (!owned) {",
  "      const output = openSync(path.join(CONTROL, 'browser-host.log'), 'a');",
  "      try {",
  "        const child = spawn(resolveNodeExecutable(), [path.join(ROOT, 'browser-host.mjs'), PROFILE, CONTROL, String(PORT)], {",
  "          detached: true, windowsHide: true, stdio: ['ignore', output, output],",
  "        });",
  "        hostPid = child.pid;",
  "        child.unref();",
  "      } finally { closeSync(output); }",
  "    }"
].join('\n');
const patchedHost=patchBrowserHost(host);
assert.match(patchedHost,/import \{ execFile, spawn \} from 'node:child_process';/);
assert.match(patchedHost,/async function attachWindowsJobGuard/);
assert.match(patchedHost,/YUTANG_REQUIRE_JOB_GUARD/);
assert.match(patchedHost,/jobguard\.exe/);
assert.ok(patchedHost.indexOf('attachWindowsJobGuard({ processImpl, logger })')<patchedHost.indexOf('chromiumImpl.launchPersistentContext'));
assert.match(patchCore(core),/YUTANG_REQUIRE_JOB_GUARD: '1'/);
assert.throws(()=>patchBrowserHost(host.replace("const execute = promisify(execFile);","const execute = promisify(other);")),/helper insertion anchor mismatch/);
assert.throws(()=>patchCore(core.replace("detached: true","detached: false")),/spawn anchor mismatch/);

assert.match(patchedHost,/randomUUID\(\)\}\.tmp/);
assert.match(patchedHost,/\{ flag: 'wx' \}/);
assert.match(patchedHost,/attempt < 20/);
assert.match(patchedHost,/Atomics\.wait/);
assert.match(patchedHost,/unlinkSync\(temporary\)/);
assert.throws(()=>patchBrowserHost(host.replace('renameSync(temporary, stateFile);','renameSync(temporary, otherFile);')),/state writer anchor mismatch/);
// Execute the exact generated writer in a mocked Windows filesystem. No real disk writes.
const writerStart=patchedHost.indexOf('  const writeState = (ready, extra = {}) => {');
const writerEnd=patchedHost.indexOf('\n  try {\n    writeState(false);',writerStart);
assert.ok(writerStart>0 && writerEnd>writerStart,'Cannot locate generated writer in patched host');
const writerSource=patchedHost.slice(writerStart,writerEnd);
const makeWriter=({ platform='win32', failCode='EPERM', transientFailures=0 }={})=>{
  let calls=0,sleeps=0,seq=0;
  const staged=[],renamed=[],cleaned=[];
  const ctx={
    stateFile:'C:\\isolated\\browser.json',processImpl:{pid:42,platform},
    profile:'C:\\isolated\\profile',port:9227,Date,
    randomUUID:()=>String(++seq).padStart(8,'0'),
    writeFileSync:(name,content,options)=>staged.push({name,content,options}),
    renameSync:(source,destination)=>{
      calls++;
      if(calls<=transientFailures)throw Object.assign(new Error('injected Windows file lock'),{code:failCode});
      renamed.push({source,destination});
    },
    unlinkSync:name=>cleaned.push(name),
    Atomics:{wait:()=>{sleeps++;return 'timed-out';}},
    Int32Array,SharedArrayBuffer
  };
  runInNewContext(writerSource+'\nglobalThis.__writeState=writeState;',ctx);
  return {write:ctx.__writeState,staged,renamed,cleaned,get calls(){return calls},get sleeps(){return sleeps}};
};
const recovered=makeWriter({transientFailures:2});
recovered.write(false);
recovered.write(true);
assert.equal(recovered.calls,4,'two transient locks require two retries followed by two successful renames');
assert.equal(recovered.sleeps,2);
assert.equal(recovered.staged.length,2);
assert.notEqual(recovered.staged[0].name,recovered.staged[1].name,'each state write needs a unique staging file');
assert.equal(recovered.staged[0].options.flag,'wx','must never overwrite an existing temp file');
assert.equal(recovered.renamed.length,2);
assert.ok(recovered.renamed.every(x=>x.destination==='C:\\isolated\\browser.json'));
assert.equal(recovered.cleaned.length,2,'temporary files are cleaned after a rename');
const exhausted=makeWriter({transientFailures:99});
assert.throws(()=>exhausted.write(false),error=>error.code==='EPERM');
assert.equal(exhausted.calls,20);
assert.equal(exhausted.sleeps,19);
assert.equal(exhausted.renamed.length,0,'never delete or replace the destination on exhausted retries');
assert.equal(exhausted.cleaned.length,1);
const nonTransient=makeWriter({transientFailures:1,failCode:'EIO'});
assert.throws(()=>nonTransient.write(false),error=>error.code==='EIO');
assert.equal(nonTransient.calls,1);
assert.equal(nonTransient.sleeps,0);
const nonWindows=makeWriter({platform:'linux',transientFailures:1});
assert.throws(()=>nonWindows.write(false),error=>error.code==='EPERM');
assert.equal(nonWindows.calls,1);
assert.equal(nonWindows.sleeps,0);
console.log('PASS browser state atomic replacement: unique temp, bounded Windows retry, non-transient failure, cleanup and fail-closed');

console.log('PASS Job Object patch tests: exact anchors, guard required before Edge launch, Core passes the required flag, drift fails closed.');
