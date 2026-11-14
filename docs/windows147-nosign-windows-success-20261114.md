# YuTang 1.4.7 — Windows no-sign PowerShell retest outcome (2026-11-14)

**Scope: original *unsigned* 1.4.7 EXE, no signing/release.** This note reconciles a failed one-shot run with the later independent successful Windows PowerShell no-sign-only run. It is not a new EXE build and is not signed Windows acceptance.

## Pinned original EXE (unchanged)

- Accepted code SHA: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Original Windows 2025 Artifact: `14092434238`, from Run `43541915930`; same EXE independently cross-tested on Windows 2022 under Artifact `14093021418`.
- ZIP SHA-256: `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- Embedded unsigned EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, 125446071 bytes.

## Failed no-sign preflight — retained as failure

- Run: https://github.com/yud78785/yutang-build/actions/runs/43604551515
- Run SHA: `3adf1d09f87b722efcd5259c27c0ec3767f42ce7`, source checkout `c8cf9be7c175d00774e7e5cc5a763d587b77ec6e`.
- Windows 2025 job `132476268748`: **failure**, Windows 2022 job `132476269096`: **failure**.
- Both downloaded the exact original GitHub artifact, then stopped at `SIGNER_SCRIPT_SHA256_MISMATCH` before executing no-sign negative checks. Not a real signing error or an Edge/lifecycle regression.
- Cause supported by source/hash evidence: original 7476-byte LF file hashes to `2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1`, while CRLF-converted content hashes to `0c68aab2e39220857b1912d84d8726bc5a15ab83cdda27b3e73b7009efd8c1f2`. The failed runner did not print the actual hash, so its exact EOL bytes were not directly measured.

## Actual Windows 2022/2025 success — new independent evidence

- Run: https://github.com/yud78785/yutang-build/actions/runs/43605324285
- Run SHA: `9dd854a5d43e5699db18b47b3aa85ce4a780065d` on `experiment/windows-147-nosign-eol-retest-20261114`.
- **Actual immutable source checkout** in both jobs: `27da129f96a2e7a343933147096cab947b0f2293`.
- The tested fix adds `.gitattributes` with exactly two file patterns: `tools/signing/Sign-YuTangCandidate.ps1 text eol=lf` and `tests/Invoke-Windows147SigningNoSignPreflight.ps1 text eol=lf`. The signing script content stayed at Git Blob SHA `3b2c57d8c6106a158289685ad51f4b25884a29da`.
- Windows 2025 job `132478619894`: **completed/success**.
- Windows 2022 job `132478620160`: **completed/success**.
- Both raw logs print `WINDOWS_SIGNER_ACTUAL_SHA256=2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1`.
- Both re-downloaded Artifact `14092434238`; the GitHub download step printed ZIP digest `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- Both logs printed a `WINDOWS_NOSIGN_ONLY_RECEIPT` with `status=PASS_WINDOWS_POWERSHELL_NOSIGN_ONLY`, exact original EXE SHA/size, and `checks=[accepted-source, wrong-digest-rejected, renamed-version-rejected, altered-contents-rejected, missing-source-rejected, source-unchanged, output-empty]`.
- Both receipts explicitly set `authenticodeSigned=false`, `signedExeAcceptance=false`, `publicationAuthorized=false`.
- That run uploaded **no artifact**; primary test evidence consists of GitHub job results and raw logs, not an invented success ZIP.

## Separate offline alternative — NOT the Windows-tested fix

- Independent branch `experiment/windows-147-nosign-eol-preflight-fix-20261114`, head `02113218f3c38f0657138ddf5e4f9da9fbc5086a`, implements strictly canonicalizing CRLF to LF before checking the same SHA-256.
- Its local Node.js regression tests were reported `9/9` passing; however **there is no Windows Actions result on that branch**, so do not attribute the success of Run `43605324285` to this alternate source.
- For future Windows sign preflight, prefer the **actual Windows-tested `.gitattributes` LF checkout implementation** as the known-good source baseline unless specifically requalified.

## Boundaries and next blockers

1. The original unsigned 1.4.7 EXE security acceptance remains bound to its original SHA and Run `43541915930`. Run `43605324285` adds real Windows *no-sign PowerShell* evidence only; it does not repeat the browser/Edge matrix and does not need to.
2. An eventual real Certum Authenticode signing operation will change the EXE SHA and require independent same-file Windows 2022/2025 acceptance with live process, sandbox, token integrity and forced-exit evidence.
3. The original updater trust pins are empty, so the unsigned 1.4.7 client cannot automatically install a signed release. New pinned bootstrap client requires separate build, sign, acceptance and manual bootstrap plan.
4. SSLmentor Serbia personal qualification, actual VAT-inclusive invoice, public personal identity fields, refund/SimplySign/reissue rules remain unconfirmed in writing. An email draft exists; no purchase or ID submission is made.
5. **No new Windows Action is required for this already-successful no-sign preflight.** Do not rerun just to produce another PASS. No release, merge to main, trust enablement or signing has been authorized.
