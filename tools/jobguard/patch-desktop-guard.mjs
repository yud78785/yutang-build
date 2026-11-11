#!/usr/bin/env node
// Exact upstream blob patch: make Windows API worker and descendants belong to
// a desktop-owned Job Object before the worker may start the server/Edge.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const EXPECTED_API_PROCESS_BLOB='387c2fe0bff2b6b081951c6ba544b84471f5c477';
const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
function once(source,before,after,label){
  if(source.split(before).length!==2)throw new Error(label+' pinned anchor mismatch');
  return source.replace(before,after);
}
export function patchApiProcess(source){
  if(source.includes('attachDesktopJobGuard')||source.includes('this.desktopGuard'))
    throw new Error('Desktop worker guard already present: pinned anchor mismatch');
  source=once(source,"import path from 'node:path';","import path from 'node:path';\nimport fs from 'node:fs/promises';",'guard fs import');
  source=once(source,"this.pending = new Map(); this.secrets = new Set(); this.stderr = '';",
    "this.pending = new Map(); this.secrets = new Set(); this.stderr = ''; this.desktopGuard = null;",'desktop guard state');
  const method="\n  async attachDesktopJobGuard() {\n    const guardFile=path.join(this.runtime,'jobguard.exe');\n    const stat=await fs.lstat(guardFile);\n    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Windows API worker guard must be a real packaged file.');\n    const workerPid=Number(this.child?.pid);\n    if(!Number.isSafeInteger(workerPid)||workerPid<=0)throw new Error('Windows API worker PID is not available.');\n    const expected='READY '+String(process.pid)+' '+String(workerPid);\n    const guard=spawn(guardFile,['--owner-pid',String(process.pid),'--target-pid',String(workerPid)],{\n      shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']\n    });\n    this.desktopGuard=guard;\n    await new Promise((resolve,reject)=>{\n      let settled=false,buffer='';\n      const fail=error=>{\n        if(settled)return;settled=true;clearTimeout(timer);\n        try{guard.kill();}catch{}\n        reject(new Error('Windows API worker Job Object containment was not confirmed; backend start refused.',{cause:error}));\n      };\n      const timer=setTimeout(()=>fail(new Error('Desktop Job Object readiness timeout')),5000);\n      guard.once('error',fail);\n      guard.once('exit',(code)=>{if(!settled)fail(new Error('Desktop Job Object guard exited before ready: '+String(code)));});\n      guard.stdout.setEncoding('utf8');\n      guard.stdout.on('data',chunk=>{\n        if(settled)return;\n        buffer+=chunk;\n        if(buffer.length>256)return fail(new Error('Desktop Job Object handshake too large'));\n        const newline=buffer.indexOf('\\n');\n        if(newline<0)return;\n        const line=buffer.slice(0,newline).trim();\n        if(line!==expected)return fail(new Error('Desktop Job Object returned invalid PID handshake'));\n        settled=true;clearTimeout(timer);\n        guard.once('exit',()=>{\n          if(!this.stopping && this.child && this.child.exitCode===null && this.child.signalCode===null)\n            try{this.child.kill('SIGKILL');}catch{}\n        });\n        resolve();\n      });\n    });\n  }\n";
  source=once(source,"  configure(config) { return this.request('configure', { config }); }",
    method+"\n  configure(config) { return this.request('configure', { config }); }",'guard method');
  source=once(source,"    try {\n      const result = await this.request('start',",
    "    if (process.platform === 'win32') {\n      try { await this.attachDesktopJobGuard(); }\n      catch (error) { try { this.child.kill('SIGKILL'); } catch {} throw error; }\n    }\n    try {\n      const result = await this.request('start',",'guard-before-worker-start');
  source=once(source,"    this.secrets.clear();\n  }\n}",
    "    try { if (this.desktopGuard && this.desktopGuard.exitCode===null) this.desktopGuard.kill(); } catch {}\n    this.desktopGuard=null;\n    this.secrets.clear();\n  }\n}", 'guard shutdown');
  if(!source.includes("['--owner-pid',String(process.pid),'--target-pid',String(workerPid)]")||
    source.indexOf('await this.attachDesktopJobGuard()')>source.indexOf("const result = await this.request('start'")||
    !source.includes("this.child.kill('SIGKILL')"))throw new Error('Patched worker containment invariants missing');
  return source;
}
const invoked=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
  const filename=process.argv[2];
  if(!filename||!path.isAbsolute(filename)||path.basename(filename)!=='api-process.mjs')
    throw new Error('Usage: node tools/jobguard/patch-desktop-guard.mjs /absolute/desktop/src/api-process.mjs');
  const stat=await fs.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('API process patch target must be a regular file');
  const bytes=await fs.readFile(filename);
  const actual=gitBlob(bytes);
  if(actual!==EXPECTED_API_PROCESS_BLOB)throw new Error('Pinned API process Git blob mismatch: '+actual);
  const patched=Buffer.from(patchApiProcess(bytes.toString('utf8')),'utf8');
  const tmp=filename+'.desktop-guard-'+process.pid+'.tmp';
  try{await fs.writeFile(tmp,patched,{flag:'wx'});await fs.rename(tmp,filename);}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
  console.log('PATCHED_DESKTOP_WORKER_JOB_GUARD '+createHash('sha256').update(patched).digest('hex'));
}
