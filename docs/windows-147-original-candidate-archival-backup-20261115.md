# YuTang 1.4.7 — exact unsigned EXE and same-file Windows cross-acceptance archival backup

**Evidence status:** Archived and downloaded back from owner-only Google Drive, byte/hash verified. Original candidate and all its accepted EXE bytes are UNCHANGED. This is NOT code signing, publishing, or a new Windows acceptance.

## 1. Immutable original Windows 2025 candidate

- Source repository: `yud78785/yutang-build`.
- Original candidate source commit: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Original successful offline Windows 2022/2025 CI: [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- Windows 2025 candidate GitHub Artifact: `14092434238`, name `YuTang-OpenRouter-Desktop-1.4.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE`; GitHub metadata expiry **2026-11-21 01:50:44 UTC**.
- Artifact ZIP: `YuTang-1.4.7-Windows2025-EXACT-UNSIGNED-EXE-Artifact-14092434238-NOT-RELEASE.zip`.
- **Exact ZIP size** `125575315` bytes; **ZIP SHA-256** `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- Original ZIP contains exact member `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe`.
- **EXE size** `125446071` bytes; **EXE SHA-256** `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- ZIP also contains original candidate, source-patch, normal lifecycle and three forced-exit receipts. This is not a new EXE build.

## 2. Private Drive backup and recovery

Original ZIP bytes were split **without recompressing, altering, or repacking** the original ZIP because the Drive transfer tool rejects a single file above 100 MiB. Parts are in private `YuTang-Cloud-Build` folder with metadata `shared=false`, owner-only; preserve these exact names.

| Part | Size (bytes) | SHA-256 | Google Drive |
| --- | ---: | --- | --- |
| 01/02 | `67108864` | `9af1b00da699ecb060ee72bb69365c52eb78b9ae108a8a157b0e31cd1df2f93a` | [Part 1](https://drive.google.com/file/d/1JBg7EkMHII6E5Niqnc82eEbERUFAvUid/view?usp=drivesdk) |
| 02/02 | `58466451` | `43b7d3360ee3ddb87babaf81da1c1060eff713a6195219c61f96093f9b5241c6` | [Part 2](https://drive.google.com/file/d/1QsJ3HmqjzIoeTxQkMoPhMnJKJnWAafQC/view?usp=drivesdk) |

Recovery kit: [YuTang 1.4.7 original candidate restore kit](https://drive.google.com/file/d/13ThJlojnOH53uFTz1nauF_SghglQ0H_O/view?usp=drivesdk), contains `Restore-YuTang-OriginalCandidate.ps1`, `ORIGINAL-CANDIDATE-RECOVERY-MANIFEST.json` and `README-RESTORE-FIRST.txt` (ZIP 4026 bytes, SHA-256 `b38567310a250021b1080b936caef472329e1b4ba0766981821211ac288f62a5`). Restore script SHA-256 `c5b542cf88f11e72b53b4ac5ace38249826ac1b4853ac1af36d58ed876549289`.

**Verification actually performed in current session:**

1. Download GitHub Artifact `14092434238` and independently SHA-256 hash both the original ZIP and its EXE member (both matched).
2. Stream exact original ZIP bytes into two part files and calculate independent per-part SHA-256.
3. Locally reassemble these two files, hash reconstructed ZIP (exact match), reopen ZIP and hash embedded EXE (exact match).
4. Upload the two parts into Google Drive, then **download each part back from Google Drive**. Downloaded sizes and SHA-256 both matched the locally produced parts; SHA-256 of the bytes concatenated in order also matched the original GitHub ZIP. **Drive backup readback integrity: PASS.**
5. Restore script itself has **not** been executed on Windows; that PowerShell implementation has not received a native Windows acceptance. It is designed only to check part hashes, concatenate, verify ZIP and embedded EXE SHA-256; it must not be claimed as passed merely because equivalent local Python reconstruction passed.

The backup is resilient to **GitHub Artifact expiration**. Do not redistribute it publicly: it is an unsigned `NOT-RELEASE` acceptance candidate.

## 3. Same original EXE — Windows 2022 cross-platform evidence backup

- Original cross-test Artifact `14093021418` from Run `43541915930`, name `YuTang-1.4.7-Same-Windows-2025-Candidate-Windows-2022-Cross-Test-NOT-RELEASE`.
- Original cross-acceptance ZIP: **169507 bytes**, SHA-256 `931181279e3b736c47f17c128dcb912b24f99fb05120a401bf4f060c5171642f`.
- Owner-only Drive backup: [Windows 2022 exact-same-EXE cross-acceptance ZIP](https://drive.google.com/file/d/1e79c_aJgXIgwCAsCj90wIZefXxCZosMi/view?usp=drivesdk).
- **Downloaded from Drive and rehashed:** exact ZIP SHA-256 matched.
- Actual `windows-2022-same-candidate-cross-receipt.json` in this ZIP has `status=PASS_SAME_WINDOWS_2025_CANDIDATE_WINDOWS_2022_CROSS_TEST`, `sha256=3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, `sourceCandidateReceiptVerified=true`, `sameBinaryAsWindows2025=true`, `cleanupVerified=true`; renderer/network service sandbox flags and forced-exit cleanup results also present.
- This is offline sandbox/process lifecycle cross-acceptance, **not** a new Windows 2022 real-public-web acceptance.

## 4. Other acceptance boundaries and release status

- Separate public-web Windows 2025 Run [43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361) independently passed public homepage 200/complete-render, Renderer/Network sandbox and tracked-process cleanup for **the same EXE SHA** (one run only). Earlier fourth public run `43634463515` failed; do not rewrite that history.
- Source-only signing preparation V4: `tools/windows147-release-manifest-kit.mjs`, Git blob `9ac069666a6fc8dc6513acf38bd9e5d49ca9d3bc`, 27/27 **offline mocked** tests. No genuine Certum certificate or signed EXE exists.
- After real Authenticode signing, EXE bytes and SHA-256 will differ. Do **not** apply these unsigned EXE acceptance results to the signed file or to a rebuilt update-enabled client.
- Remaining: CA validation / authentic Windows signature and timestamp, separately proven client Ed25519 trust key + publisher pin, Windows 2022/2025 packaged EXE retesting for every new SHA, real update trust/rejection/upgrade/rollback, and explicit release approval.
- **No new CI**, no `main` change, no EXE rebuild, no signing or release during this backup. The expected unchanged `main` was `4745ed23cbb748cb4b070ed70390703d1261aea0` immediately prior to saving this record.
