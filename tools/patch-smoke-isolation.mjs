#!/usr/bin/env node
// Test-only update to the pinned upstream packaged smoke verifier.
// The new candidate intentionally ignores an environment-provided legacy shared-memory
// location. Do not weaken the production state isolation to satisfy an old test.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const EXPECTED_BLOB='a652e6d821f17e207a9b1b5a545081ebfd733b15';
const gitBlob = bytes => createHash('sha1')
  .update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');

const filename=process.argv[2];
if (!filename || !path.isAbsolute(filename)) throw Error('Absolute test script path required');
const stat=await fs.lstat(filename);
if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Smoke test must be a regular file');
const original=await fs.readFile(filename);
if (gitBlob(original)!==EXPECTED_BLOB) throw Error('Pinned original packaged smoke test blob changed');
const source=original.toString('utf8');
const before='assert.equal(ready.memoryFolder, memory);';
const after=[
  "const isolatedMemory = path.join(home, '.yutang-observer-isolated', 'memory');",
  "assert.equal(ready.memoryFolder, isolatedMemory, 'Candidate must use its own memory folder, never a prior shared database');",
  "assert.notEqual(ready.memoryFolder, memory, 'Caller-provided legacy shared memory root must not be inherited');"
].join(' ');
if(source.split(before).length!==2)throw Error('Exact legacy smoke assertion missing or duplicated');
const patched=source.replace(before,after);
if(patched.replace(after,before)!==source)throw Error('Test-only modification exceeds one reviewed memory assertion');
const temp=filename+'.yutang-isolation-test-'+process.pid+'.tmp';
try {
  await fs.writeFile(temp,patched,{flag:'wx'});
  await fs.rename(temp,filename);
} finally {await fs.rm(temp,{force:true}).catch(()=>{});}
console.log('ISOLATION_SMOKE_EXPECTATION_UPDATED: candidate must use new isolated memory instead of caller-provided old memory');
