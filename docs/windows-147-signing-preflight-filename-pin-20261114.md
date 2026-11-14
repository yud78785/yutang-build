# YuTang Windows 1.4.7 manual signing preflight: accepted filename + digest pin

Date: 2026-11-14. **NOT RELEASE.** Branch: experiment/windows-147-signing-preflight-20261114.
Base signing-provenance commit: 1ce8759d3556b7b5f09e5290c4f26b4e6bebc1df.
This patch is for the manual signing tool only; no accepted EXE, updater trust anchor, main branch, or Release was changed.

## Evidence-bound unsigned baseline (not evidence for a signed EXE)

- Windows 2025 candidate from run 43541915930, artifact 14092434238.
- The same exact candidate EXE was cross-tested on Windows 2022 (artifact 14093021418).
- Accepted unsigned EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.
- Artifact ZIP entry actually inspected: desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe.
- Windows 2022 independently built EXE and its differing hash are NOT interchangeable with this file.

## Issue and offline fix

Previously the PowerShell tool required the accepted SHA-256 but accepted a generic X.Y.Z filename. A renamed copy of the byte-identical 1.4.7 EXE could be presented as version 1.4.8 even though no 1.4.8 binary had been accepted.

tools/signing/Sign-YuTangCandidate.ps1 now additionally requires the **exact original filename**:
Dafeiyu-Douyin-API-1.4.7-win-x64.exe.
If it differs, it fails with UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE before reading the EXE hash or invoking SignTool. This deliberately pins the signer to only the previously accepted unsigned 1.4.7 candidate. Future versions must be based on their own separately accepted file hashes and names.

Existing fail-closed behavior was retained: preflight without -Sign does not sign; cannot overwrite originals/destinations (CreateNew); checks source and signer's certificates, publisher thumbprint, signature timestamp, and source SHA again after copying/signing.

The raw schema-only test fixture for version 1.4.8 no longer references the real *unsigned* 1.4.7 workflow/artifact IDs. It now uses obvious synthetic identifiers 1001 and 2002, which are NOT actual CI acceptance evidence.

## Offline test result

Executed on Linux isolated container, Node.js 22.16.0:
node --test tests/signed-acceptance-registry.test.mjs tests/yutang-signing-manifest.test.mjs tests/windows147-signing.test.mjs tests/windows147-manual-signing-contract.test.mjs

**35 tests, 35 passed, 0 failed, 0 skipped.** One new static contract test checks that the filename pin exists and executes before any SignTool command. Existing manifest/Ed25519/registry tests remain green.
Local TAP log: YuTang-signing-preflight-offline-20261114.log
Log SHA-256: beed95e7f102d96a19860d82bbb02a214a56e85d4f849ead48fdbeda9d57cbe4.
Files were compared by Git blob hash against the exact contents tested locally:
- PowerShell signing script: 3b2c57d8c6106a158289685ad51f4b25884a29da
- PowerShell contract test: 623d66311e647dfffaabafa6fa9c1b3a80858950
- Manifest core schema test: a724bbc1fade7d785aa483355e52f29b88a9d78b

No `pwsh` executable is available in this isolated Linux environment. These 35 tests DO NOT validate PowerShell parsing/execution on Windows, Certum SimplySign/SignTool signing, a new signed EXE SHA, or Windows 2022/2025 signed EXE runtime. They are offline code/contract tests only.

## Remaining gates

1. On a properly isolated Windows signing workstation, verify the PowerShell script syntax and dry-run preflight using a known unsigned 1.4.7 EXE with exact pinned filename and SHA. Do not sign or distribute the old EXE during this check.
2. Receive SSLmentor/Certum written confirmation of Serbian individual eligibility, VAT-inclusive cost and SimplySign reissue/renewal details before any purchase or identity submission.
3. Only after a real certificate is available and explicitly authorized, sign a COPY of an independently accepted EXE; record its new SHA-256 and Microsoft Authenticode chain/timestamp evidence.
4. Run the exact signed file on Windows 2022 and 2025, plus real update download/rejection/rollback and data-preservation acceptance. No unsigned test may replace this.
5. The production signed-acceptance registry stays empty, and updater public key + publisher thumbprint remain empty. No automatic update, CI publish, merge, or release.

Never send password, signing token, mobile OTP, private key or personal identity documents to GitHub/ChatGPT.
