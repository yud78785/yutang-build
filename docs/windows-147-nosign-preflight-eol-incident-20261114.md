# YuTang 1.4.7 no-sign Windows preflight: LF checkout repair (NOT RELEASE)

Date: 2026-11-14.
Original successful unsigned Windows EXE acceptance run: 43541915930, source patch commit 9cc16d7e64d59dc141e9c6687b8dd461934fcc35.
Exact unsigned EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.

## New Windows execution evidence — failed, do not claim PASS

Authorized single launch run 43604551515, activation commit 3adf1d09f87b722efcd5259c27c0ec3767f42ce7.
- Windows 2025 job 132476268748: failed.
- Windows 2022 job 132476269096: failed.
- Both checked out code commit c8cf9be7c175d00774e7e5cc5a763d587b77ec6e.
- Both downloaded original Artifact 14092434238, ZIP SHA-256 718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a.
- Both reached the PowerShell no-sign check after the EXE file and SHA/length preconditions.
- Both failed YUTANG_NOSIGN_PREFLIGHT_FAILED: SIGNER_SCRIPT_SHA256_MISMATCH.
- No signing, EXE launch, new release, trust-key enablement or merge took place.

## Cause supported by checkout source and hash calculations

Git blob SHA-1 of audited Sign-YuTangCandidate.ps1: 3b2c57d8c6106a158289685ad51f4b25884a29da.
SHA-256 of LF-terminated source bytes: 2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1, exactly the old harness pin.
SHA-256 after replacing each LF with CRLF: 0c68aab2e39220857b1912d84d8726bc5a15ab83cdda27b3e73b7009efd8c1f2, which does not match.
There was no .gitattributes in the original code commit. Windows Git commonly converts text to CRLF when core.autocrlf is enabled.

This explains the symmetric failure, but the failed run did not print the observed Windows script hash. Therefore CRLF conversion is the **leading supported cause**, not yet a directly measured Windows hash.

## Minimal correction

New .gitattributes explicitly forces text eol=lf for only:
- tools/signing/Sign-YuTangCandidate.ps1
- tests/Invoke-Windows147SigningNoSignPreflight.ps1

The signer code and SHA-256 pin remain unchanged. No signing behavior, Electron/Edge source, EXE binary or updater trust settings are changed.
An isolated Git experiment using core.autocrlf=true and text eol=lf confirmed a fixture PowerShell file checked out without CRLF conversion. The exact production source/hash and new attributes have test assertions in tests/windows147-signer-eol.test.mjs.

## Re-run criteria

A second GitHub Actions run would be needed for genuine Windows 2022/2025 PASS after this checkout correction. The user's previous explicit authorization covered one run per Windows platform; the run has happened and failed. Do NOT automatically retry or create active workflow branches without a separate approval.

Before any rerun:
1. Review the corrected code commit and its .gitattributes, ensure its SHA and the script hash are immutable.
2. Create a new inert one-shot workflow template pinned to the corrected code SHA, its own before-SHA seed and a distinct experimental run branch.
3. In the future approved run print the actual checked-out signing script SHA before the harness and verify it equals the LF SHA.
4. Confirm the two raw Windows job logs each show PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY, an unchanged unsigned EXE digest, and an empty output directory.
5. A no-sign PowerShell PASS is never a signed EXE, Authenticode, Edge runtime, update download or crash rollback acceptance.

This document is a failure analysis and a source-only repair record, not a release approval. No certificate was purchased, and no identity or signing credential was used.
