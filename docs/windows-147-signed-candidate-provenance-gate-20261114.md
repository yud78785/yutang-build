# YuTang 1.4.7 signed-candidate provenance gate (NOT RELEASE)

Scope: release-signing tools only. This experiment does not modify the accepted EXE, the updater trust constants, main, or any official Release. It must not trigger paid Windows Actions.

## Previously accepted unsigned baseline

- Source patch commit: 9cc16d7e64d59dc141e9c6687b8dd461934fcc35
- Workflow Run: 43541915930 (success)
- Windows 2025 unsigned Artifact: 14092434238
- Windows 2022 independently built unsigned Artifact: 14092741259
- Windows 2022 cross-test receipts for the same Windows 2025 EXE: 14093021418
- Accepted cross-platform unsigned EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34
- That old pass is NOT acceptance of any post-signing SHA.

## Safety gate

tools/signing/signed-acceptance-registry.mjs has a deliberately EMPTY production registry.
tools/signing/yutang-manifest.mjs calls requireReviewedSignedCandidate BEFORE
opening the manifest signing private key or writing a manifest or signature.

The check rejects:
- A signed EXE with the old unsigned SHA (signature must change the file).
- A signing receipt whose originalUnsignedSha256 does not match the accepted baseline.
- Reusing Run 43541915930 or any of the three known unsigned Artifact IDs, EVEN WITH A DIFFERENT version.
- Arbitrary fresh IDs not separately registered after reviewing actual signed Windows CI evidence.
- A registry entry with missing or mismatched signed EXE SHA, version, source SHA, publisher thumbprint, artifact identity, or distinct Windows 2022/2025 job/runner evidence.
- An entry whose platform status is not PASS (queued, running, skipped or failed is never PASS).

A hand-authored JSON file with PASS fields is not independent evidence.
A local JSON signing receipt is not proof of Authenticode trust.
The registry is code-reviewed bookkeeping, not a cryptographic GitHub attestation.
A reviewer MUST independently query GitHub Actions run metadata, raw Windows job logs,
exact signed EXE Artifact SHA-256, and the signature certificate before adding an entry.
Do not register any candidate until both Windows 2022 and Windows 2025 genuinely
executed the SAME signed EXE SHA, including Edge sandbox, lifecycle, forced exits
and updater trust/recovery checks as required.

## Tests and current release state

- tests/signed-acceptance-registry.test.mjs exercises the standalone fail-closed gate with synthetic data.
- tests/yutang-signing-manifest.test.mjs injects a synthetic reviewed-registry fixture ONLY when invoked as a module in offline tests. The production CLI does NOT accept this injection.
- With the production registry empty, the production CLI manifest build intentionally fails with SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY.
- The dry-run tests are not real Windows EXE, SimplySign, Authenticode or download/rollback tests.
- User has not purchased or submitted a certificate/identity. Automatic update remains fail-closed.
- No merge, release, or publishing action is authorized by this document.

Once a real signed candidate has independently passed both platforms, pin its exact
new SHA, actual signed Artifact ID, complete run/job IDs, original unsigned hash,
publisher thumbprint and source commits in a new reviewed registry commit.
Rerun the local tests and separately verify actual signed Windows runs.
Only then may the offline manifest tool prepare release metadata, still NOT publish.


## 2026-11-14 independent local offline regression evidence

Tested code identity: `e661b664bb10c518ceb65f2a8e3356f9fcff7dfb` (the commit containing the signing guard). The exact 8 source/test files used in the local run were verified with `git hash-object` against GitHub file blob SHAs.

Runtime: Node.js v22.16.0, isolated Linux container, offline only. This was NOT Windows PowerShell execution, NOT SimplySign/SignTool execution, NOT a signed Windows EXE, and NOT a new Windows Actions run.

One combined Node.js test command ran the four relevant suites:
- `node --test tests/signed-acceptance-registry.test.mjs tests/yutang-signing-manifest.test.mjs tests/windows147-signing.test.mjs tests/windows147-manual-signing-contract.test.mjs`
- Results: **34 tests, 34 pass, 0 fail, 0 skipped**.
- Local TAP log SHA-256: `d1ea63458176641b7b77d16fefb3e3e85c4b3f7f45a40e4dcc0c726500d10c67`.
- Exact source/blob hash checklist SHA-256: `3d8ecb40986c5dddcb209c122d64f4ca982210bb2d709c40694c5692cb373b57`.

Separately ran the **production CLI entry point** with a disposable fake MZ file and synthetic receipt/metadata containing invented Windows 2022/2025 `PASS` flags and unused fresh IDs, plus nonexistent private/public key paths:
- Exit status 1, `YUTANG_SIGNING_PREP_FAILED: SIGNED_CANDIDATE_NOT_IN_REVIEWED_REGISTRY`.
- Output directory remained empty; fake source file SHA was unchanged; no key was created.
- Local CLI smoke log SHA-256: `16835bbafa382301fdc1ea750d9546ab0082d603716f3b8644a9e6e1552dec7e`.

The above logs were generated in the local container; the hashes are audit references, NOT proof of an external GitHub CI run. This documentation change does not modify the tested signing-tool bytes, the accepted unsigned EXE or the updater trust constants.

**Still not tested:** Windows PowerShell script syntax/runtime on a real Windows host, Microsoft SignTool with actual Certum SimplySign identity, actual signed EXE SHA, signed EXE two-Windows acceptance, real update download/rollback, and a reseller's formal eligibility/VAT confirmation. Until those are independently evidenced, no signing candidate is release-ready and the reviewed production registry stays empty.
