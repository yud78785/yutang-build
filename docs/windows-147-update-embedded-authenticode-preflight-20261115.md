# YuTang 1.4.7 — future updater embedded Authenticode verification gate (source-only)

**Review date:** 2026-11-15. **Current release status: BLOCKED.** This is an experiment-branch **future update candidate** source change; the previously accepted unsigned EXE is unchanged and no Windows CI has run for this change.

## The exact production-template weakness

The prior service and launch-time verifiers in:
- `tools/windows147-update-patched/update-service.mjs` (prior Git blob `b00c130f081cbe80bec3200bcfc024a738631784`)
- `tools/windows147-update-patched/update-launcher.mjs` (prior Git blob `807005fe8ef86381e53ffbd19e47379075d91e51`)

accepted `Get-AuthenticodeSignature.Status === "Valid"` plus the expected publisher certificate thumbprint. But `Get-AuthenticodeSignature` can return a Windows Catalog signature for a file instead of its portable embedded Authenticode signature, even preferring a catalog on a file with both. The tool's **release signer** V3 already demanded embedded signatures, but the actual **update consumer** and **upgrade launcher** did not. This mismatch could cause a standalone EXE to be treated as signed without proving that the signature is contained within the distributed EXE.

Microsoft sources:
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/get-authenticodesignature
- https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool

## Precise source changes — both verification stages

1. In the PowerShell response, request `signatureType=[string]$s.SignatureType`.
2. Enforce `result.signatureType === "Authenticode"` **together** with the existing exact `Status === "Valid"` and fixed publisher SHA-1 certificate thumbprint check.
3. Fail closed for `Catalog`, `None`, missing `SignatureType`, wrong publisher or status that is not `Valid`. Existing error code remains `AUTHENTICODE_PUBLISHER_VERIFICATION_FAILED`.
4. Do **not** require Microsoft's Windows SDK SignTool on end-user computers. SignTool's independent `verify /pa /tw` remains required in the *release operator's controlled signing environment*, not the user-side runtime.
5. Do **not** change the still-empty `UPDATE_MANIFEST_PUBLIC_KEY` or `UPDATE_PUBLISHER_THUMBPRINT` constants, don't add secrets, and don't enable an update or release.

**Exact experimental source blobs:**
- `tools/windows147-update-patched/update-service.mjs`: `910a0fd449bd334687cd24c56a8e563a2de026b6`.
- `tools/windows147-update-patched/update-launcher.mjs`: `0d1c5606c151964287edd83cc43431eb68a24d0c`.
- Existing `tests/windows147-update-trust.test.mjs` adds the 16 new positive/negative cases for both validators; Git blob `c2b26fa1556c8b5018b42b29e1f6f36fa92787a3`.

## What was actually tested

- Local Linux Node.js v22.16.0 **isolated verifier fixture** test: **16 passed, 0 failed, 0 skipped**.
- These tests mock Windows PowerShell responses; cases cover `Authenticode` / `Catalog` / absent signature type / unsigned / mismatched pinned publisher / malformed JSON / no configured publisher / non-Windows.
- Local standalone test TAP SHA-256: `f898b32778d832f73d6434ef2a94a8f1713fccfc29e28aeedfc260fcf94390f5`.
- Source-only isolated test ZIP SHA-256: `9edcc451503966516b7d414d80c66ede2dd0278576a2c46eed467f0180093714`. The ZIP contains a **standalone extracted verifier harness**, integration-test source, TAP and README. It is NOT an EXE build artifact.
- The amended *full repository* `tests/windows147-update-trust.test.mjs` has NOT yet been run in an environment with all repository templates. The 16/16 result **does not prove** full repository, Windows native, or packaged EXE acceptance. Do not report it as full 33/33 unless the full test log exists.

## Same fixed unsigned EXE baseline, not changed

- Immutable unsigned EXE `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, `125446071` bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930): same-file Windows 2022/2025 **offline** startup, Edge sandbox and process lifecycle cross-acceptance.
- [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361): one successful Windows 2025 real public-page HTTP 200/readyState complete, Renderer/Network Service sandbox and owned-process cleanup.
- Earlier fourth [Run 43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) **failed** on `PUBLIC_PAGE_NOT_FULLY_LOADED`, and stays recorded as failed.
- The original EXE ZIP and its Windows 2022 exact-SHA cross-acceptance receipts were saved to private Google Drive and independently downloaded/rehashed. [Archive index](https://github.com/yud78785/yutang-build/blob/19f052a19db7398307043ebfe78d59dd270664b1/docs/windows-147-original-candidate-archival-backup-20261115.md).

## Required future acceptance; NOT authorized or done

A real future update-enabled candidate must embed a separately authenticated Ed25519 public key and the actual publisher fingerprint, be signed by a real Code Signing certificate and timestamped, receive a **new SHA-256**, and then pass exact Windows 2022 and Windows 2025 packaged startup, Renderer/Network sandbox, process cleanup, embedded-signature/Windows catalog refusal, manifest signature, download, health, install, and rollback checks. The new EXE **does not inherit** the old EXE's passing acceptance. The current 1.4.7 updater remains fail closed because its trust key and publisher pin are empty. Certum validation and purchase remain uncompleted.

**Administrative boundary:** no certificate purchase/identity submission, no private keys, no personal PC changes, no GitHub Actions run, no `main` merge, no published release, no automatic update activation.


## Supplement: exact production verifier functions exercised

Beyond the local isolated fixture, the two functions at the exact source blobs above were extracted from GitHub, compiled with no original module side effects, and run with injected PowerShell outputs. Old service/launcher accepted a response reporting Valid + exact publisher thumbprint + Catalog; the new service/launcher both rejected that response. They accepted only Valid + Authenticode + matching publisher and failed closed for missing SignatureType, unsigned, wrong signer, malformed response, absent publisher pin and non-Windows. **16 of 16 exact-function simulated checks passed.** This is stronger than a manually duplicated fixture, but still does not prove the full module, packaged updater, native Windows trust, or real download/install behavior.

Drive backup for the independent contract ZIP (verified by downloading and rehashing): https://drive.google.com/file/d/1ccZE_2Zdz6zUi75dJaM3VqNAML78hfDd/view?usp=drivesdk . The local ZIP and re-downloaded Drive ZIP both have SHA-256 9edcc451503966516b7d414d80c66ede2dd0278576a2c46eed467f0180093714.
