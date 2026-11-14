import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditSignedMatrix} from '../tools/signing/audit-signed-matrix.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const EXE=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(4094,91)]);
const ZIP25=Buffer.from('MOCK_WINDOWS2025_ARCHIVE_DO_NOT_RELEASE');
const ZIP22=Buffer.from('MOCK_WINDOWS2022_CROSS_ARCHIVE_DO_NOT_RELEASE');
const sha=hash(EXE), zip25=hash(ZIP25), zip22=hash(ZIP22);
const patch='b'.repeat(40), up='a'.repeat(40), pin='A'.repeat(40);
const acceptedOldSha='3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const baseSafety=()=>({rendererAppContainer:true,networkServiceAppContainer:true,networkServiceLowIntegrity:true,
  cdpLoopbackOnly:true,edgeRestartCount:2,forcedExitClean:{host:true,guard:true,desktop:true}});
function fixture(){
 const runId=60000001001,artifact25=16000001001,artifact22=16000001002;
 const metadata={repository:'yud78785/yutang-build',version:'1.4.8',tag:'v1.4.8',authenticodeThumbprint:pin,
  source:{upstreamCommit:up,yutangPatchCommit:patch},candidate:{workflowRunId:runId,artifactId:artifact25}};
 const signingReceipt={schema:'yutang.windows-local-signing-receipt.v1',release:false,windowsRetestRequired:true,
  sha256:sha,size:EXE.length,originalUnsignedSha256:acceptedOldSha,
  authenticode:{status:'Valid',thumbprint:pin,subject:'CN=MOCK NOT A REAL SIGNER'}};
 const base={executable:'Dafeiyu-Douyin-API-1.4.8-win-x64.exe',productVersion:'1.4.8',
  yutangPatchCommit:patch,upstreamCommit:up,sha256:sha,bytes:EXE.length,signatureStatus:'Valid',
  publisherThumbprint:pin,trustedTimestampVerified:true,release:false,workflowRunId:runId,
  security:baseSafety()};
 const windows2025={...base,schema:'yutang.windows-signed-candidate.v1',
  status:'PASS_SIGNED_WINDOWS_2025_SECURITY',runnerImage:'win25-vs2026',jobId:3001,artifactId:artifact25,security:baseSafety()};
 const windows2022={...base,schema:'yutang.windows-signed-same-file-cross-test.v1',
  status:'PASS_SAME_SIGNED_BINARY_WINDOWS_2022_SECURITY',runnerImage:'win22',jobId:3002,artifactId:artifact22,
  sameBinaryAsWindows2025:true,sourceCandidateArtifactId:artifact25,sourceCandidateJobId:3001,security:baseSafety()};
 const run={id:runId,status:'completed',conclusion:'success',repository:{full_name:'yud78785/yutang-build'},
  head_sha:patch,head_branch:'experiment/windows-147-signed-candidate-20261114',event:'workflow_dispatch'};
 const jobs=[
  {id:3001,name:'windows-2025 signed exact-file security acceptance',status:'completed',conclusion:'success',
   steps:[{name:'Verify signed EXE SHA-256, publisher and RFC3161 timestamp',conclusion:'success'},
    {name:'Test signed EXE Edge sandbox and lifecycle',conclusion:'success'}]},
  {id:3002,name:'Windows 2022 same-signed-file cross-test',status:'completed',conclusion:'success',
   steps:[{name:'Verify exact signed Windows 2025 EXE SHA-256 and publisher',conclusion:'success'},
    {name:'Test same signed EXE Edge sandbox and lifecycle',conclusion:'success'}]}
 ];
 const makeArtifact=(id,digest)=>({id,expired:false,name:'YuTang-1.4.8-SIGNED-NOT-RELEASE-'+id,
  digest:'sha256:'+digest,workflow_run:{id:runId,head_sha:patch}});
 const artifacts=[makeArtifact(artifact25,zip25),makeArtifact(artifact22,zip22)];
 return {metadata,signingReceipt,windows2025,windows2022,run,jobs,artifacts,
  exeSha256:sha,exeSize:EXE.length,zip2025Sha256:zip25,zip2022Sha256:zip22};
}
const audit=v=>auditSignedMatrix(v);
test('full consistent synthetic evidence is STILL NOT release approval',()=>{
 const v=audit(fixture());
 assert.match(v.status,/NOT_RELEASE_APPROVED/);assert.equal(v.releaseReady,false);
 assert.ok(v.stillRequired.includes('INDEPENDENT_WINDOWS_AUTHENTICODE_AND_TIMESTAMP_VERIFICATION'));
});
test('historical unsigned SHA and unsigned run/artifact IDs are always rejected',()=>{
 const v=fixture();v.exeSha256=acceptedOldSha;
 assert.throws(()=>audit(v),/SIGNED_EXE_NOT_NEW_OR_INVALID/);
 const b=fixture();b.metadata.candidate.workflowRunId=43541915930;
 assert.throws(()=>audit(b),/UNSIGNED_ACCEPTANCE_ID_REUSE/);
 const c=fixture();c.metadata.candidate.artifactId=14092434238;
 assert.throws(()=>audit(c),/UNSIGNED_ACCEPTANCE_ID_REUSE/);
});
test('same-file cross test cannot use different binary SHA or wrong source artifact',()=>{
 const v=fixture();v.windows2022.sha256='c'.repeat(64);
 assert.throws(()=>audit(v),/WINDOWS_2022_RECEIPT_INVALID/);
 const w=fixture();w.windows2022.sourceCandidateArtifactId=9;
 assert.throws(()=>audit(w),/CROSS_PLATFORM_ARTIFACT_IDENTITY_MISMATCH/);
});
test('missing sandbox, low integrity, CDP, restarts or forced-exit checks fails closed',()=>{
 for(const field of ['rendererAppContainer','networkServiceAppContainer','networkServiceLowIntegrity','cdpLoopbackOnly']){
  const v=fixture();v.windows2022.security[field]=false;
  assert.throws(()=>audit(v),/WINDOWS_2022_SAFETY_INCOMPLETE/);
 }
 for(const k of ['host','guard','desktop']){
  const v=fixture();v.windows2025.security.forcedExitClean[k]=false;
  assert.throws(()=>audit(v),/WINDOWS_2025_SAFETY_INCOMPLETE/);
 }
 const v=fixture();v.windows2025.security.edgeRestartCount=1;
 assert.throws(()=>audit(v),/WINDOWS_2025_SAFETY_INCOMPLETE/);
});
test('wrong publisher, invalid timestamp or signature status rejects',()=>{
 const v=fixture();v.signingReceipt.authenticode.thumbprint='C'.repeat(40);
 assert.throws(()=>audit(v),/LOCAL_SIGNING_RECEIPT_INCONSISTENT/);
 const w=fixture();w.windows2025.trustedTimestampVerified=false;
 assert.throws(()=>audit(w),/WINDOWS_2025_RECEIPT_INVALID/);
 const z=fixture();z.windows2022.signatureStatus='NotSigned';
 assert.throws(()=>audit(z),/WINDOWS_2022_RECEIPT_INVALID/);
});
test('GitHub run must be successful, exact source and constrained signing branch',()=>{
 for(const [prop,val] of [['conclusion','failure'],['head_sha','d'.repeat(40)],
  ['head_branch','experiment/windows-147-shortcut-pin-20261114'],['event','pull_request']]){
  const v=fixture();v.run[prop]=val;
  assert.throws(()=>audit(v),/GITHUB_RUN_NOT_VERIFIED/);
 }
});
test('one failed job, missing critical step or cross-job ID fails closed',()=>{
 const v=fixture();v.jobs[1].conclusion='failure';
 assert.throws(()=>audit(v),/GITHUB_JOB_NOT_SUCCESS/);
 const w=fixture();w.jobs[0].steps[1].conclusion='skipped';
 assert.throws(()=>audit(w),/GITHUB_CRITICAL_STEP_MISSING_OR_FAILED/);
 const z=fixture();z.windows2022.jobId=z.windows2025.jobId;
 assert.throws(()=>audit(z),/CROSS_PLATFORM_ARTIFACT_IDENTITY_MISMATCH/);
});
test('actual artifact digests must match both GH artifact records',()=>{
 const v=fixture();v.zip2025Sha256='f'.repeat(64);
 assert.throws(()=>audit(v),/SIGNED_2025_ARTIFACT_INVALID/);
 const w=fixture();w.artifacts[1].expired=true;
 assert.throws(()=>audit(w),/SIGNED_2022_ARTIFACT_INVALID/);
});
test('CLI checks files without changing them; still refuses release',async t=>{
 const f=fixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'yutang-matrix-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const filepath=(n)=>path.join(dir,n);
 const sources={'exe':EXE,'windows-2025-zip':ZIP25,'windows-2022-zip':ZIP22,
  'metadata':f.metadata,'signing-receipt':f.signingReceipt,'windows-2025-receipt':f.windows2025,
  'windows-2022-receipt':f.windows2022,'github-run':f.run,'github-jobs':{jobs:f.jobs},
  'github-artifacts':{artifacts:f.artifacts}};
 for(const [k,data] of Object.entries(sources)){
  await fs.writeFile(filepath(k),Buffer.isBuffer(data)?data:JSON.stringify(data));
 }
 const keys=['exe','metadata','signing-receipt','windows-2025-receipt','windows-2022-receipt',
  'github-run','github-jobs','github-artifacts','windows-2025-zip','windows-2022-zip'];
 const args=keys.flatMap(k=>['--'+k,filepath(k)]);
 const script=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tools/signing/audit-signed-matrix.mjs');
 const run=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:12000});
 assert.equal(run.status,0,run.stderr);
 const output=JSON.parse(run.stdout);
 assert.equal(output.releaseReady,false);
 assert.match(output.status,/NOT_RELEASE_APPROVED/);
 const edited=JSON.parse(await fs.readFile(filepath('windows-2022-receipt')));
 assert.equal(edited.sha256,sha);
});
