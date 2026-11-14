// Only entries independently checked against GitHub Actions signed-EXE artifacts
// may be added in a reviewed change. No accepted signed EXE exists yet.
export const REVIEWED_SIGNED_CANDIDATES = Object.freeze([]);

export const UNSIGNED_BASELINE = Object.freeze({
  sha256: '3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34',
  workflowRunId: 43541915930,
  artifactIds: Object.freeze([14092434238, 14092741259, 14093021418])
});

const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[A-F0-9]{40}$/;
const SHA = /^[a-f0-9]{40}$/;
const positiveId = n => Number.isSafeInteger(n) && n > 0;
const record = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const thumb = s => String(s ?? '').replace(/\s+/g, '').toUpperCase();

// This is a local release *consistency* gate, not cryptographic verification
// of CI logs. An authorized reviewer must inspect the real jobs/artifact first.
export function requireReviewedSignedCandidate(meta, signedSha256, unsignedSha256,
  reviewedRegistry = REVIEWED_SIGNED_CANDIDATES) {
  if (!SHA256.test(String(signedSha256)) ||
      unsignedSha256 !== UNSIGNED_BASELINE.sha256 ||
      signedSha256 === unsignedSha256) {
    throw new Error('SIGNED_EXE_NOT_DERIVED_FROM_ACCEPTED_UNSIGNED_BASELINE');
  }
  const candidate = meta?.candidate;
  if (!record(candidate) || !positiveId(candidate.workflowRunId) || !positiveId(candidate.artifactId)) {
    throw new Error('SIGNED_CANDIDATE_IDENTIFIERS_INVALID');
  }
  if (candidate.workflowRunId === UNSIGNED_BASELINE.workflowRunId ||
      UNSIGNED_BASELINE.artifactIds.includes(candidate.artifactId)) {
    throw new Error('UNSIGNED_CANDIDATE_IDS_NOT_SIGNED_PROVENANCE');
  }
  if (!Array.isArray(reviewedRegistry) || !reviewedRegistry.length) {
    throw new Error('SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY');
  }
  const matches = reviewedRegistry.filter(item => record(item) &&
    item.candidate?.workflowRunId === candidate.workflowRunId &&
    item.candidate?.artifactId === candidate.artifactId);
  if (matches.length !== 1) throw new Error('SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY');
  const accepted = matches[0];
  const source = meta?.source;
  const validSource = record(source) && SHA.test(source.upstreamCommit ?? '') &&
    SHA.test(source.yutangPatchCommit ?? '') &&
    accepted.source?.upstreamCommit === source.upstreamCommit &&
    accepted.source?.yutangPatchCommit === source.yutangPatchCommit;
  const validPlatform = (entry, runner) => record(entry) &&
    entry.runner === runner && entry.status === 'PASS' &&
    entry.sha256 === signedSha256 &&
    entry.sourceArtifactId === candidate.artifactId &&
    positiveId(entry.workflowRunId) && positiveId(entry.jobId);
  if (accepted.schema !== 'yutang.signed-candidate-acceptance.v1' ||
      accepted.version !== meta?.version ||
      accepted.signedSha256 !== signedSha256 ||
      accepted.unsignedSha256 !== unsignedSha256 ||
      !validSource || !SHA1.test(thumb(meta?.authenticodeThumbprint)) ||
      accepted.authenticodeThumbprint !== thumb(meta.authenticodeThumbprint) ||
      !validPlatform(accepted.windows2022, 'windows-2022') ||
      !validPlatform(accepted.windows2025, 'windows-2025') ||
      (accepted.windows2022.workflowRunId === accepted.windows2025.workflowRunId &&
       accepted.windows2022.jobId === accepted.windows2025.jobId)) {
    throw new Error('SIGNED_DUAL_PLATFORM_REVIEWED_ACCEPTANCE_INVALID');
  }
  return true;
}
