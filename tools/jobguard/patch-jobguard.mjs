#!/usr/bin/env node
// Exact-blob guarded candidate patch: keep the browser-host and all Edge descendants in a Windows Job Object.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const EXPECTED_BROWSER_HOST_BLOB='da7630aa3cc30bd426768f15eccacdb1b5e002c1';
const EXPECTED_CORE_BLOB='f99808d98735ff5a4894bd33baccb2f743fef2b9';
const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');

export function patchBrowserHost(source){
  const importAnchor="import { execFile } from 'node:child_process';\n";
  if(source.split(importAnchor).length!==2)throw new Error('Pinned browser-host child_process import anchor mismatch');
  source=source.replace(importAnchor,"import { execFile, spawn } from 'node:child_process';\n");

  const helperAnchor="const execute = promisify(execFile);\n";
  const helper=[
    "const execute = promisify(execFile);",
    "",
    "async function attachWindowsJobGuard({ processImpl = process, logger = console, timeoutMs = 5000 } = {}) {",
    "  if (processImpl.platform !== 'win32') return null;",
    "  const required = processImpl.env?.YUTANG_REQUIRE_JOB_GUARD === '1';",
    "  const guardPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jobguard.exe');",
    "  if (!existsSync(guardPath)) {",
    "    if (required) throw Object.assign(new Error('Windows Job Object guard is missing; refusing to launch Edge.'), { code: 'EDGE_JOB_GUARD_MISSING' });",
    "    return null;",
    "  }",
    "  const child = spawn(guardPath, ['--owner-pid', String(processImpl.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });",
    "  let settled = false, buffer = '';",
    "  const ready = new Promise((resolve, reject) => {",
    "    const fail = error => {",
    "      if (settled) return;",
    "      settled = true; clearTimeout(timer);",
    "      try { child.kill(); } catch {}",
    "      reject(error);",
    "    };",
    "    const timer = setTimeout(() => fail(new Error('Windows Job Object guard readiness timed out.')), timeoutMs);",
    "    child.once('error', fail);",
    "    child.once('exit', (code, signal) => { if (!settled) fail(new Error('Windows Job Object guard exited before readiness (' + code + '/' + signal + ').')); });",
    "    child.stdout.setEncoding('utf8');",
    "    child.stdout.on('data', chunk => {",
    "      buffer += chunk;",
    "      if (buffer.length > 256) return fail(new Error('Windows Job Object guard handshake exceeded its size limit.'));",
    "      const newline = buffer.indexOf('\\n');",
    "      if (newline < 0) return;",
    "      const line = buffer.slice(0, newline).trim();",
    "      if (line === 'READY ' + String(processImpl.pid)) {",
    "        settled = true; clearTimeout(timer); resolve(child);",
    "      } else {",
    "        fail(new Error(line.startsWith('ERROR ') ? 'Windows Job Object guard rejected containment (' + line.slice(6) + ').' : 'Windows Job Object guard returned an invalid readiness handshake.'));",
    "      }",
    "    });",
    "    child.stderr.setEncoding('utf8');",
    "    child.stderr.on('data', chunk => { try { logger.error(sanitizeBrowserFailure(chunk)); } catch {} });",
    "  });",
    "  try { return await ready; }",
    "  catch (error) { throw Object.assign(new Error('Windows Job Object containment was not confirmed; Edge launch was refused.', { cause: error }), { code: 'EDGE_JOB_GUARD_FAILED' }); }",
    "}",
    ""
  ].join('\n');
  if(source.split(helperAnchor).length!==2)throw new Error('Pinned browser-host helper insertion anchor mismatch');
  source=source.replace(helperAnchor,helper);

  const declaration="const stateFile = path.join(controlDir, 'browser.json'); let context, installation, focusFailed = false;";
  if(source.split(declaration).length!==2)throw new Error('Pinned browser-host state declaration anchor mismatch');
  source=source.replace(declaration,"const stateFile = path.join(controlDir, 'browser.json'); let context, installation, focusFailed = false, jobGuard;");

  const fsAnchor="import { mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';";
  const pathAnchor="import path from 'node:path';";
  if(source.split(fsAnchor).length!==2||source.split(pathAnchor).length!==2)throw new Error('Pinned browser state writer imports mismatch');
  source=source.replace(fsAnchor,"import { mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';");
  source=source.replace(pathAnchor,pathAnchor+"\nimport { randomUUID } from 'node:crypto';");
  const stateWriterBefore=[
    "  const writeState = (ready, extra = {}) => {",
    "    const temporary = `${stateFile}.${processImpl.pid}.tmp`;",
    "    writeFileSync(temporary, JSON.stringify({ pid: processImpl.pid, profile, port, ready, startedAt: Date.now(), ...extra }));",
    "    renameSync(temporary, stateFile);",
    "  };"
  ].join('\n');
  const stateWriterAfter=[
    "  // Synchronous writes are serialized by this host's event loop. Never remove",
    "  // browser.json before replacement, and never reuse a previous host's temp file.",
    "  const writeState = (ready, extra = {}) => {",
    "    const temporary = `${stateFile}.${processImpl.pid}.${randomUUID()}.tmp`;",
    "    try {",
    "      writeFileSync(temporary, JSON.stringify({ pid: processImpl.pid, profile, port, ready, startedAt: Date.now(), ...extra }), { flag: 'wx' });",
    "      // Windows may briefly hold browser.json open during a restart or scan.",
    "      // Retry only transient rename errors, for at most 950ms; all other errors",
    "      // and exhausted retries fail closed without modifying the destination.",
    "      for (let attempt = 0; attempt < 20; attempt++) {",
    "        try { renameSync(temporary, stateFile); return; }",
    "        catch (error) {",
    "          if (processImpl.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt === 19) throw error;",
    "          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);",
    "        }",
    "      }",
    "    } finally {",
    "      try { unlinkSync(temporary); } catch {}",
    "    }",
    "  };"
  ].join('\n');
  if(source.split(stateWriterBefore).length!==2)throw new Error('Pinned original browser state writer anchor mismatch');
  source=source.replace(stateWriterBefore,stateWriterAfter);
  if(!source.includes("flag: 'wx'"))throw new Error('Browser state writer hardening absent');

  const startup="    writeState(false);\n    try { installation = await probeInstallation(); } catch {}\n";
  const startupPatched="    writeState(false);\n    jobGuard = await attachWindowsJobGuard({ processImpl, logger });\n    try { installation = await probeInstallation(); } catch {}\n";
  if(source.split(startup).length!==2)throw new Error('Pinned browser-host pre-Edge guard anchor mismatch');
  source=source.replace(startup,startupPatched);

  if(!source.includes("jobGuard = await attachWindowsJobGuard")||!source.includes("YUTANG_REQUIRE_JOB_GUARD")||!source.includes("jobguard.exe"))throw new Error('Job Object guard was not wired before Edge launch');
  return source;
}

export function patchCore(source){
  const anchor=[
    "        const child = spawn(resolveNodeExecutable(), [path.join(ROOT, 'browser-host.mjs'), PROFILE, CONTROL, String(PORT)], {",
    "          detached: true, windowsHide: true, stdio: ['ignore', output, output],",
    "        });"
  ].join('\n');
  const replacement=[
    "        const child = spawn(resolveNodeExecutable(), [path.join(ROOT, 'browser-host.mjs'), PROFILE, CONTROL, String(PORT)], {",
    "          detached: true, windowsHide: true, stdio: ['ignore', output, output],",
    "          env: { ...process.env, YUTANG_REQUIRE_JOB_GUARD: '1' },",
    "        });"
  ].join('\n');
  if(source.split(anchor).length!==2)throw new Error('Pinned Core browser-host spawn anchor mismatch');
  source=source.replace(anchor,replacement);
  if(!source.includes("YUTANG_REQUIRE_JOB_GUARD: '1'"))throw new Error('Candidate Core does not require the Windows Job Object guard');
  return source;
}

async function applyOne(filename,expected,patch,label){
  if(!filename||!path.isAbsolute(filename))throw new Error('Patch target must be an absolute path: '+label);
  const stat=await fs.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Refusing symlink or non-regular source: '+label);
  const bytes=await fs.readFile(filename);
  const actual=gitBlob(bytes);
  if(actual!==expected)throw new Error(label+' pinned Git blob mismatch; refusing patch (actual '+actual+').');
  const output=Buffer.from(patch(bytes.toString('utf8')),'utf8');
  const temp=filename+'.jobguard-'+process.pid+'.tmp';
  try{await fs.writeFile(temp,output,{flag:'wx'});await fs.rename(temp,filename);}
  finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  return createHash('sha256').update(output).digest('hex');
}

const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
  const [browserHostFile,coreFile]=process.argv.slice(2);
  if(!browserHostFile||!coreFile)throw new Error('Usage: node tools/jobguard/patch-jobguard.mjs /absolute/browser-host.mjs /absolute/core.mjs');
  const browserHostSha=await applyOne(browserHostFile,EXPECTED_BROWSER_HOST_BLOB,patchBrowserHost,'browser-host.mjs');
  const coreSha=await applyOne(coreFile,EXPECTED_CORE_BLOB,patchCore,'core.mjs');
  console.log('PATCHED_WINDOWS_JOB_GUARD '+JSON.stringify({browserHostSha,coreSha}));
}
