import test from 'node:test';
import assert from 'node:assert/strict';
import { requireReviewedSignedCandidate, UNSIGNED_BASELINE, REVIEWED_SIGNED_CANDIDATES } from '../tools/signing/signed-acceptance-registry.mjs';

const signedSha = 'd'.repeat(64);
const data = {
  version:'1.4.7',
  candidate:{workflowRunId:60000000000,artifactId:16000000000},
  source:{upstreamCommit:'a'.repeat(40),yutangPatchCommit:'b'.repeat(40)},
  authenticodeThumbprint:'A'.repeat(40)
};
const accepted = {
  schema:'yutang.signed-candidate-acceptance.v1', version:'1.4.7',
  candidate:{...data.candidate}, source:{...data.source},
  signedSha256:signedSha, unsignedSha256:UNSIGNED_BASELINE.sha256,
  authenticodeThumbprint:data.authenticodeThumbprint,
  windows2022:{runner:'windows-2022',status:'PASS',sha256:signedSha,sourceArtifactId:data.candidate.artifactId,workflowRunId:60000000002,jobId:70000000002},
  windows2025:{runner:'windows-2025',status:'PASS',sha256:signedSha,sourceArtifactId:data.candidate.artifactId,workflowRunId:60000000003,jobId:70000000003}
};
const valid=(m=data,s=signedSha,u=UNSIGNED_BASELINE.sha256,arr=[accepted])=>requireReviewedSignedCandidate(m,s,u,arr);

test('release registry is empty: no signed EXE acceptance has been granted',()=>{
  assert.equal(REVIEWED_SIGNED_CANDIDATES.length,0);
  assert.throws(()=>requireReviewedSignedCandidate(data,signedSha,UNSIGNED_BASELINE.sha256),/SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
});
test('reviewed mock dual-platform source and SHA match in unit tests only',()=>assert.equal(valid(),true));
test('old unsigned workflow is blocked even when release version is changed',()=>{
  for(const version of ['1.4.7','1.4.8','9.0.0']){
    assert.throws(()=>valid({...data,version,candidate:{...data.candidate,workflowRunId:UNSIGNED_BASELINE.workflowRunId}}),/UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE/);
  }
});
test('all unsigned artifacts are rejected regardless of version and mock registry',()=>{
  for(const artifactId of UNSIGNED_BASELINE.artifactIds){
    assert.throws(()=>valid({...data,version:'1.4.8',candidate:{...data.candidate,artifactId}}),/UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE/);
  }
});
test('changed signed EXE or wrong original unsigned SHA is rejected',()=>{
  assert.throws(()=>valid(data,'e'.repeat(64)),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
  assert.throws(()=>valid(data,signedSha,'c'.repeat(64)),/SIGNED_EXE_NOT_DERIVED_FROM_ACCEPTED_UNSIGNED_BASELINE/);
  assert.throws(()=>valid(data,UNSIGNED_BASELINE.sha256),/SIGNED_EXE_NOT_DERIVED_FROM_ACCEPTED_UNSIGNED_BASELINE/);
});
test('self-reported PASS metadata does not grant acceptance',()=>{
  const fake={...data,windows2022:{status:'PASS'},windows2025:{status:'PASS'}};
  assert.throws(()=>valid(fake,signedSha,UNSIGNED_BASELINE.sha256,[]),/SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
});
test('queued/failed/stale review or duplicate same job does not pass',()=>{
  for(const status of ['queued','in_progress','FAIL']){
    assert.throws(()=>valid(data,signedSha,UNSIGNED_BASELINE.sha256,[{...accepted,windows2025:{...accepted.windows2025,status}}]),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
  }
  assert.throws(()=>valid(data,signedSha,UNSIGNED_BASELINE.sha256,[{...accepted,windows2025:{...accepted.windows2022,runner:'windows-2025'}}]),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
  assert.throws(()=>valid(data,signedSha,UNSIGNED_BASELINE.sha256,[{...accepted,windows2022:{...accepted.windows2022,sourceArtifactId:123}}]),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
});
test('mismatched publisher, source commit, artifact and duplicate entries are rejected',()=>{
  assert.throws(()=>valid({...data,authenticodeThumbprint:'B'.repeat(40)}),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
  assert.throws(()=>valid({...data,source:{...data.source,yutangPatchCommit:'c'.repeat(40)}}),/SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID/);
  assert.throws(()=>valid({...data,candidate:{...data.candidate,artifactId:121212}}),/SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
  assert.throws(()=>valid(data,signedSha,UNSIGNED_BASELINE.sha256,[accepted,accepted]),/SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY/);
});
