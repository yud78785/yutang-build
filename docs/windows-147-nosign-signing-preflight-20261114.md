# YuTang 1.4.7 Windows no-sign PowerShell preflight (NOT RELEASE)

Date: 2026-11-14. Experimental branch only. Parent code commit:
cb563dad8b6d43d4f412799b30a1f678165b732d.

## Evidence-bound unsigned EXE

- Candidate run: 43541915930; Windows 2025 Artifact: 14092434238.
- Windows 2022 cross-test receipts: 14093021418, for the SAME Windows 2025 EXE.
- Exact ZIP entry: desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe.
- EXE bytes: 125446071.
- EXE SHA-256: 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.
- Local independent ZIP and PE inspection reconfirmed this hash and found PE certificate directory address=0, size=0 (no embedded Authenticode signature). This is NOT a substitute for actual Windows Get-AuthenticodeSignature.

## New tool

File: tests/Invoke-Windows147SigningNoSignPreflight.ps1

This is a manual, read-only signing preflight for an authorized **isolated Windows 2022 or 2025 test machine**. It NEVER passes the -Sign switch, calls SignTool, downloads updates, launches the EXE or submits any identity details. It creates only small disposable fake files in a temporary directory and removes that directory afterward. The original EXE is only read.

The script pins:
- exact accepted filename, byte length and SHA-256;
- exact SHA-256 of tools/signing/Sign-YuTangCandidate.ps1: 2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1.

Checks performed on real Windows when explicitly invoked:
1. Correct unsigned EXE gives PREFLIGHT_OK_NO_SIGNING.
2. Wrong expected SHA is rejected.
3. Renamed v1.4.8 fake EXE is rejected.
4. Modified v1.4.7 fake EXE is rejected.
5. Missing EXE is rejected.
6. Original EXE SHA does not change.
7. Temporary output directory stays empty.

To execute MANUALLY on a pre-approved Windows isolation runner, first extract only the known unsigned candidate Artifact, then run from the checked-out experimental branch:

    powershell.exe -NoProfile -File tests\Invoke-Windows147SigningNoSignPreflight.ps1 -UnsignedExe "C:\isolation\Dafeiyu-Douyin-API-1.4.7-win-x64.exe"

Retain the emitted JSON receipt as Windows evidence only if the script actually runs successfully. Its status value is PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY. All fields explicitly deny real signing or release authorization.

No Windows execution was performed when this script was introduced. Windows PowerShell syntax, Get-AuthenticodeSignature, actual bad-input responses and real-path behavior remain **UNVERIFIED** until a genuine Windows receipt is available. No GitHub Windows Actions were triggered.

## Current offline-only testing

The new Node.js static contract tests: tests/windows147-nosign-harness-contract.test.mjs.
Executed on isolated Linux, Node.js v22.16.0, together with existing offline tests:

    node --test tests/signed-acceptance-registry.test.mjs tests/yutang-signing-manifest.test.mjs tests/windows147-signing.test.mjs tests/windows147-manual-signing-contract.test.mjs tests/windows147-nosign-harness-contract.test.mjs

40 tests passed; 0 failures, 0 skips. Local TAP log:
yutang-signing-preflight-harness-contract-20261114.log
SHA-256 (log): 99112a338c12180e5c181b3e382c7267fa1ec909e088164bedeb38b9e0bb0167.

Git blob identity of exact newly tested files:
- tests/Invoke-Windows147SigningNoSignPreflight.ps1:
  cae13e68d7805218e86011ed29da21559940c232
- tests/windows147-nosign-harness-contract.test.mjs:
  6fa91884a7fb79d30a9d714b1a85bfb6d594b837

Node.js static contract testing DOES NOT execute PowerShell. This is an advance in readiness, not a new Windows acceptance of a signed EXE. The previously verified unsigned EXE SHA-256 remains the baseline; a future signed EXE must have a new hash and new Windows 2022 + 2025 acceptance.

## Stop rules / pending

- No Certum certificate was bought; SSLmentor Serbia personal eligibility, VAT-inclusive total and SimplySign reissue/renewal terms still require written confirmation.
- No secrets, PFX, certificate private keys, mobile authorization tokens or identity papers in GitHub or chat.
- Signed-candidate acceptance registry remains empty and update trusted public key/publisher thumbprint remain empty.
- No publish, automatic update, merge to main, source EXE rebuild, or GitHub Actions Windows run authorized by this document.
- Do not execute this harness on the user's personal Windows machine when an isolated runner is required.
