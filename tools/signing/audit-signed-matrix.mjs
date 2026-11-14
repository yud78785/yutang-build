#!/usr/bin/env node
// Pre-release evidence consistency audit. Local JSON receipts are not cryptographic attestations.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const REPO = 'yud78785/yutang-build';
const OLD_RUN = 43541915930;
const OLD_ARTIFACTS = new Set([14092434238, 14092741259, 14093021418]);
const OLD_SHA = '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34';
const SHA256 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const THUMB = /^[A-F0-9]{40}$/;
function need(ok, reason) { if(!ok) throw new Error(reason); }
function obj(x) { return !!x && typeof x==='object' && !Array.isArray(x); }
function positive(x) { return Number.isSafeInteger(x) && x>0; }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function thumb(x) { return String(x??'').replace(/\s/g,'').toUpperCase(); }
function verifiedSteps(job, expectedNames) {
  need(obj(job) && job.status==='completed' && job.conclusion==='success', 'GITHUB_JOB_NOT_SUCCESS');
  for(const name of expectedNames){
    need(Array.isArray(job.steps) && job.steps.some(s=>s.name===name && s.conclusion==='success'),
      'GITHUB_CRITICAL_STEP_MISSING_OR_FAILED');
  }
}

export function auditSignedMatrix({metadata, signingReceipt, windows2025, windows2022,
  run, jobs, artifacts, exeSha256, exeSize, zip2025Sha256, zip2022Sha256}) {
  need([metadata,signingReceipt,windows2025,windows2022,run].every(obj) &&
    Array.isArray(jobs) && Array.isArray(artifacts), 'EVIDENCE_STRUCTURE_INVALID');
  const m=metadata, s=signingReceipt, a=windows2025, b=windows2022;
  need(m.repository===REPO && /^v\d+\.\d+\.\d+$/.test(m.tag) && m.version===m.tag.slice(1) &&
    SHA40.test(m.source?.upstreamCommit??'') && SHA40.test(m.source?.yutangPatchCommit??'') &&
    positive(m.candidate?.workflowRunId) && positive(m.candidate?.artifactId) &&
    THUMB.test(thumb(m.authenticodeThumbprint)), 'RELEASE_METADATA_INVALID');
  need(SHA256.test(exeSha256) && exeSha256!==OLD_SHA && Number.isSafeInteger(exeSize) &&
    exeSize>=1024 && exeSize<=500*1024*1024, 'SIGNED_EXE_NOT_NEW_OR_INVALID');
  need(m.candidate.workflowRunId!==OLD_RUN && !OLD_ARTIFACTS.has(m.candidate.artifactId),
    'UNSIGNED_ACCEPTANCE_ID_REUSE');
  const name='Dafeiyu-Douyin-API-'+m.version+'-win-x64.exe', certThumb=thumb(m.authenticodeThumbprint);
  need(s.schema==='yutang.windows-local-signing-receipt.v1' && s.release===false &&
    s.windowsRetestRequired===true && s.sha256===exeSha256 && s.size===exeSize &&
    SHA256.test(s.originalUnsignedSha256??'') && s.originalUnsignedSha256!==exeSha256 &&
    s.authenticode?.status==='Valid' && thumb(s.authenticode?.thumbprint)===certThumb &&
    typeof s.authenticode?.subject==='string' && s.authenticode.subject.trim(),
    'LOCAL_SIGNING_RECEIPT_INCONSISTENT');
  const core={ version:m.version, sourceCommit:m.source.yutangPatchCommit,
    upstreamCommit:m.source.upstreamCommit,sha256:exeSha256,bytes:exeSize,
    publisherThumbprint:certThumb };
  for(const [v,k,expectedSchema,expectedStatus,expectedRunner] of [
    [a,'WINDOWS_2025','yutang.windows-signed-candidate.v1','PASS_SIGNED_WINDOWS_2025_SECURITY','win25'],
    [b,'WINDOWS_2022','yutang.windows-signed-same-file-cross-test.v1','PASS_SAME_SIGNED_BINARY_WINDOWS_2022_SECURITY','win22']
  ]){
    need(v.schema===expectedSchema && v.status===expectedStatus && v.runnerImage?.startsWith(expectedRunner) &&
      v.executable===name && v.productVersion===core.version && v.yutangPatchCommit===core.sourceCommit &&
      v.upstreamCommit===core.upstreamCommit && v.sha256===core.sha256 && v.bytes===core.bytes &&
      v.signatureStatus==='Valid' && thumb(v.publisherThumbprint)===core.publisherThumbprint &&
      v.trustedTimestampVerified===true && v.release===false && positive(v.jobId) &&
      positive(v.artifactId) && v.workflowRunId===m.candidate.workflowRunId,
      k+'_RECEIPT_INVALID');
    const safety=v.security;
    need(obj(safety) && safety.rendererAppContainer===true &&
      safety.networkServiceAppContainer===true && safety.networkServiceLowIntegrity===true &&
      safety.cdpLoopbackOnly===true && Number.isSafeInteger(safety.edgeRestartCount) && safety.edgeRestartCount>=2 &&
      obj(safety.forcedExitClean) && ['host','guard','desktop'].every(t=>safety.forcedExitClean[t]===true),
      k+'_SAFETY_INCOMPLETE');
  }
  need(a.artifactId===m.candidate.artifactId && a.artifactId!==b.artifactId &&
    !OLD_ARTIFACTS.has(b.artifactId) && a.jobId!==b.jobId &&
    b.sameBinaryAsWindows2025===true && b.sourceCandidateArtifactId===a.artifactId &&
    b.sourceCandidateJobId===a.jobId, 'CROSS_PLATFORM_ARTIFACT_IDENTITY_MISMATCH');
  need(run.id===m.candidate.workflowRunId && run.status==='completed' && run.conclusion==='success' &&
    run.repository?.full_name===REPO && run.head_sha===m.source.yutangPatchCommit &&
    typeof run.head_branch==='string' && run.head_branch.startsWith('experiment/windows-147-signed-') &&
    ['push','workflow_dispatch'].includes(run.event), 'GITHUB_RUN_NOT_VERIFIED');
  const job25=jobs.find(j=>j.id===a.jobId), job22=jobs.find(j=>j.id===b.jobId);
  need(job25?.name==='windows-2025 signed exact-file security acceptance' &&
    job22?.name==='Windows 2022 same-signed-file cross-test', 'GITHUB_SIGNED_JOB_IDENTITY_INVALID');
  verifiedSteps(job25,['Verify signed EXE SHA-256, publisher and RFC3161 timestamp',
    'Test signed EXE Edge sandbox and lifecycle']);
  verifiedSteps(job22,['Verify exact signed Windows 2025 EXE SHA-256 and publisher',
    'Test same signed EXE Edge sandbox and lifecycle']);
  for(const [id,digest,key] of [[a.artifactId,zip2025Sha256,'SIGNED_2025_ARTIFACT_INVALID'],
    [b.artifactId,zip2022Sha256,'SIGNED_2022_ARTIFACT_INVALID']]){
    const ar=artifacts.find(q=>q.id===id);
    need(SHA256.test(digest??'') && obj(ar) && ar.expired===false &&
      ar.workflow_run?.id===run.id && ar.workflow_run?.head_sha===run.head_sha &&
      typeof ar.name==='string' && ar.name.includes('SIGNED') && ar.name.includes(m.version) &&
      ar.digest==='sha256:'+digest, key);
  }
  return {
    status:'UNTRUSTED_GITHUB_SNAPSHOT_AND_LOCAL_EVIDENCE_CONSISTENT_NOT_RELEASE_APPROVED',
    signedExeSha256:exeSha256,version:m.version,runId:run.id,
    windows2025ArtifactId:a.artifactId,windows2022ArtifactId:b.artifactId,
    releaseReady:false,
    stillRequired:['INDEPENDENTLY_FETCH_AND_VERIFY_GITHUB_RUN_JOB_ARTIFACT_METADATA',
      'AUTHENTICATE_SOURCE_RECEIPTS_INSIDE_VERIFIED_ARTIFACT_ZIPS',
      'INDEPENDENT_WINDOWS_AUTHENTICODE_AND_TIMESTAMP_VERIFICATION',
      'REAL_UPDATER_DOWNLOAD_INSTALL_AND_ROLLBACK_ACCEPTANCE','EXPLICIT_RELEASE_APPROVAL']
  };
}
async function readSmallJson(file) {
  need(path.isAbsolute(file),'ABSOLUTE_PATH_REQUIRED');
  const st=await fs.lstat(file);
  need(st.isFile() && !st.isSymbolicLink() && st.size>0 && st.size<=1024*1024,'JSON_INPUT_INVALID');
  return JSON.parse(await fs.readFile(file,'utf8'));
}
async function digestFile(file,max) {
  need(path.isAbsolute(file),'ABSOLUTE_PATH_REQUIRED');
  const st=await fs.lstat(file);
  need(st.isFile() && !st.isSymbolicLink() && st.size>0 && st.size<=max,'BINARY_INPUT_INVALID');
  const h=createHash('sha256'),head=Buffer.alloc(2);
  let bytes=0, copied=0;
  for await(const chunk of createReadStream(file,{highWaterMark:1024*1024})) {
    need(bytes+chunk.length<=max,'BINARY_INPUT_TOO_LARGE');
    if(copied<2){const take=Math.min(2-copied,chunk.length);chunk.copy(head,copied,0,take);copied+=take;}
    h.update(chunk);bytes+=chunk.length;
  }
  need(bytes===st.size,'FILE_CHANGED_DURING_READ');
  return {bytes,sha256:h.digest('hex'),head:head.toString('ascii')};
}
async function runCLI(args) {
  const keys=['--exe','--metadata','--signing-receipt','--windows-2025-receipt','--windows-2022-receipt',
    '--github-run','--github-jobs','--github-artifacts','--windows-2025-zip','--windows-2022-zip'];
  need(args.length===keys.length*2 && keys.every((k,i)=>args[i*2]===k && args[i*2+1]),
    'USAGE: '+keys.join(' <absolute-path> ')+' <absolute-path>');
  const paths=Object.fromEntries(keys.map((k,i)=>[k,args[i*2+1]]));
  const [exe,z25,z22,metadata,signingReceipt,windows2025,windows2022,run,jobs,artifacts]=await Promise.all([
    digestFile(paths['--exe'],500*1024*1024),
    digestFile(paths['--windows-2025-zip'],600*1024*1024),
    digestFile(paths['--windows-2022-zip'],10*1024*1024),
    readSmallJson(paths['--metadata']),readSmallJson(paths['--signing-receipt']),
    readSmallJson(paths['--windows-2025-receipt']),readSmallJson(paths['--windows-2022-receipt']),
    readSmallJson(paths['--github-run']),readSmallJson(paths['--github-jobs']),
    readSmallJson(paths['--github-artifacts'])
  ]);
  need(exe.head==='MZ','EXE_MZ_INVALID');
  return auditSignedMatrix({metadata,signingReceipt,windows2025,windows2022,run,
    jobs:jobs.jobs,artifacts:artifacts.artifacts,exeSha256:exe.sha256,exeSize:exe.bytes,
    zip2025Sha256:z25.sha256,zip2022Sha256:z22.sha256});
}
const direct=process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(direct) runCLI(process.argv.slice(2)).then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{
  console.error('SIGNED_MATRIX_AUDIT_REJECTED: '+String(e.message??e));process.exitCode=1;
});
