# YuTang Windows 1.4.7 no-sign PowerShell preflight: real two-runner acceptance

Date: 2026-11-14 (UTC). Scope: **unsigned 1.4.7 EXE signing-tool preflight only**. NOT a signed-EXE acceptance and NOT a release authorization.

## Identity and original acceptance baseline

- Accepted unsigned source/build commit: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Previously accepted unsigned Windows Run: [43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- The exact Windows 2025 candidate is reused on both Windows 2022 and Windows 2025.
- Original Artifact: `14092434238` (`YuTang-OpenRouter-Desktop-1.4.7-SecurityHardening-windows-2025-CANDIDATE-NOT-RELEASE`).
- Artifact ZIP digest: `sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a` (this is the **archive**, not the EXE).
- Inner file: `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe`.
- Inner EXE byte size: `125446071`.
- Inner unsigned EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Signing harness and checked-out PowerShell source pinned by tested source commit: `27da129f96a2e7a343933147096cab947b0f2293`.
- Signer script checked-out SHA-256: `2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1`.
- The source change pins `text eol=lf` for the two audited PowerShell scripts in `.gitattributes`.

## First authorized run — FAILED, retained as failure

- [Run 43604551515](https://github.com/yud78785/yutang-build/actions/runs/43604551515): completed, **failure**.
- Windows 2025 job `132476268748`: **failure**.
- Windows 2022 job `132476269096`: **failure**.
- Both fetched the correct Artifact and failed `SIGNER_SCRIPT_SHA256_MISMATCH` in PowerShell before the actual no-sign checks.
- LF source bytes matched the pinned SHA while the CRLF calculation differed. This supported a checkout end-of-line issue. The first run did not log the Windows on-disk script hash, so the precise cause was initially a hypothesis.

## Second authorized run — PASS on exact corrected commit

- [Run 43605324285](https://github.com/yud78785/yutang-build/actions/runs/43605324285): completed, **success**.
- One-shot activation commit: `9dd854a5d43e5699db18b47b3aa85ce4a780065d`.
- The workflow checked out fixed source commit `27da129f96a2e7a343933147096cab947b0f2293`, not the activation commit, on both platforms.
- Windows 2025 [job 132478619894](https://github.com/yud78785/yutang-build/actions/runs/43605324285/job/132478619894): **completed success**.
- Windows 2022 [job 132478620160](https://github.com/yud78785/yutang-build/actions/runs/43605324285/job/132478620160): **completed success**.

Both **raw job logs** independently contain:
- `WINDOWS_SIGNER_ACTUAL_SHA256=2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1` (direct Windows on-disk SHA observation).
- Artifact downloaded successfully; ZIP digest `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- `WINDOWS_NOSIGN_ONLY_RECEIPT` with status `PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY`.
- Receipt EXE SHA `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` and size `125446071`.
- Receipt checks `accepted-source`, `wrong-digest-rejected`, `renamed-version-rejected`, `altered-contents-rejected`, `missing-source-rejected`, `source-unchanged`, `output-empty`.
- Receipt explicitly records `authenticodeSigned:false`, `signedExeAcceptance:false`, `publicationAuthorized:false`.

The identical real Windows script hash confirms the `.gitattributes` LF checkout correction has solved the previously observed `SIGNER_SCRIPT_SHA256_MISMATCH` blocker. The initial failed run is **not rewritten as passing**; the fixed code and **new** Run 43605324285 are the actual passing evidence.

## Still pending; do NOT infer acceptance

- No real Certum/SimplySign certificate was bought, issued or used and no identity papers or signing tokens were submitted.
- No signed EXE or signed EXE SHA-256 exists; Authenticode signing/verification and manual authorization are **NOT TESTED**.
- No signed EXE Windows 2022/2025 Edge sandbox, process lifecycle or security acceptance was conducted in this run. The old unsigned EXE acceptance stays separate.
- No real updater download/invalid-signature rejection/upgrade/data preservation/crash rollback end-to-end run was conducted.
- The reviewed signed-candidate registry remains empty. Update trusted manifest public key and publisher thumbprint remain empty; automatic updates fail closed.
- No changes to `main`, no official release, no certificate purchase, no change to EXE bytes. No further Actions runs are authorized by this record.

**Next work:** obtain reseller's written confirmation of Serbia individual eligibility, VAT-inclusive quote and SimplySign renewal/reissue conditions. After a real certificate is independently arranged, sign a COPY of a selected accepted candidate and require brand-new evidence for its post-signing SHA, then proceed through signed-EXE two-platform security acceptance and actual updater rollback tests.