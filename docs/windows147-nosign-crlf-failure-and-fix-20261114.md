# YuTang 1.4.7 Windows no-sign preflight failure — EOL-safe remediation (NOT RELEASE)

Date: 2026-11-14. This document is a scoped postmortem and offline repair for the **failed** one-shot Windows 2022/2025 preflight. No new Windows Actions were triggered, no original EXE or real signing material was modified, and no new Windows success is claimed.

## Failed run, not a passed acceptance

- Actual workflow: https://github.com/yud78785/yutang-build/actions/runs/43604551515
- Trigger branch: `experiment/windows-147-nosign-run-20261114`, commit `3adf1d09f87b722efcd5259c27c0ec3767f42ce7`.
- Workflow's pinned immutable source checkout: `c8cf9be7c175d00774e7e5cc5a763d587b77ec6e`.
- Both job IDs failed: Windows 2025 `132476268748` and Windows 2022 `132476269096`, at the same step: `Verify unsigned EXE digest and run PowerShell no-sign checks`.
- In both logs, the original Windows 2025 candidate Artifact `14092434238` downloaded successfully, and GitHub's archive digest matched `sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- The no-sign harness aborted before testing the actual signer dry-run. The exact error was `YUTANG_NOSIGN_PREFLIGHT_FAILED: SIGNER_SCRIPT_SHA256_MISMATCH`. Neither job produced a success receipt.
- This is **not** a failure of the already accepted unsigned EXE's Edge sandbox or lifecycle. The independent successful original EXE acceptance remains tied to source `9cc16d7e64d59dc141e9c6687b8dd461934fcc35` and EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.

## Root-cause evidence and limitation

The static harness pinned raw `Get-FileHash` of `tools/signing/Sign-YuTangCandidate.ps1` to a value calculated from the **LF** version of the Git blob.

The exact immutable script (`git hash-object` / Git blob `3b2c57d8c6106a158289685ad51f4b25884a29da`) has 7,476 ASCII bytes and 121 LF line endings. Independent SHA-256 calculations show:

| Representation | SHA-256 |
|---|---|
| Original LF Git source bytes | `2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1` |
| Same source converted to CRLF only | `0c68aab2e39220857b1912d84d8726bc5a15ab83cdda27b3e73b7009efd8c1f2` |

The first equals the harness's pinned SHA. The second does not, and the audited source had no `.gitattributes` file forcing LF on Windows. This strongly supports **Windows Git checkout CRLF conversion** as the failure mechanism; however the runner log did **not** print its actual observed signer hash, so a precise byte-for-byte runner reproduction is still pending. Do not describe this hypothesis as fully Windows-confirmed.

## Isolated source repair

Independent repair branch: `experiment/windows-147-nosign-eol-preflight-fix-20261114`, created from the exact immutable test-source commit `c8cf9be7c175d00774e7e5cc5a763d587b77ec6e`.

The only behavioral change is in `tests/Invoke-Windows147SigningNoSignPreflight.ps1`:
1. Decode signing script using strict UTF-8 (invalid UTF-8 fails).
2. Convert only CRLF (`\r\n`) to LF (`\n`); reject remaining lone CR.
3. SHA-256 hash the resulting canonical bytes and compare to the *same original pinned trusted hash*. The expected hash is not replaced with a wildcard or an attacker-controlled input.
4. Continue existing no-`-Sign` negative checks. No copy/sign/launch/install/CI secret/PII operations were added.

- Exact corrected harness Git blob: `035530a5efcc97f91234ea17a5dd2e577846d37f`.
- Original signer Git blob remains `3b2c57d8c6106a158289685ad51f4b25884a29da` (**unchanged**).
- New regression `tests/windows147-nosign-line-endings.test.mjs`, Git blob `1eda7d53ef3fb18604b26bb01beec4963afa7b63`.
- Existing 5 static contract tests remain in `tests/windows147-nosign-harness-contract.test.mjs`, blob `6fa91884a7fb79d30a9d714b1a85bfb6d594b837`.

## Offline test evidence

Exact Git blob checks were performed on the 4 local file copies before execution. Node.js 22.16.0 executed:

```sh
node --test tests/windows147-nosign-line-endings.test.mjs tests/windows147-nosign-harness-contract.test.mjs
```

Result: **9 passed / 0 failed / 0 skipped**. Local TAP log SHA-256 `a4e1f6335758da40b4d47e21964d36fed643a5008901acc6f4fc054dc7b82a70`.

This verifies EOL canonicalization, rejection of invalid bytes and safety contracts on Linux. It does **not** execute PowerShell 5.1, Get-AuthenticodeSignature, or the true unsigned EXE on Windows. The original `43604551515` run remains FAILED until a separate Windows run of **this exact corrected source** actually succeeds.

## Remaining required acceptance

- Inspect/read-only compare corrected harness against old failing one-shot workflow; do not silently change the archived run's meaning.
- If a **new** isolated Windows 2022/2025 no-sign preflight is explicitly authorized, use a separately pinned source commit / manually approved one-shot invocation. Check the same original EXE SHA before and after, all no-sign negative tests and empty output, and record new run IDs/receipts.
- Do not rerun or re-arm the spent one-shot workflow automatically. Do not merge, release, sign, download an update, use personal PC or spend Windows Actions without separate authorization.
- Certum eligibility/VAT/renewal and true Windows Authenticode signing remain external blockers. Signed EXE acceptance and real update/rollback testing still require a future new SHA and independent Windows 2022/2025 results.
