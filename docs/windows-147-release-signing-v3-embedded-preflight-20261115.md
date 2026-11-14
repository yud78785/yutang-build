# YuTang 1.4.7 — V3 embedded Authenticode signing preflight (SOURCE ONLY)

**Status: 23/23 Linux Node isolated unit tests passed; no Windows/Certum signature acceptance, no signed EXE, no release.**

## Fixed candidate baseline (unchanged)

- Accepted original unsigned 1.4.7 EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Windows 2022/2025 *offline* cross-platform lifecycle and security: Run [43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930), immutable original SHA.
- Windows 2025 *online public homepage* HTTP 200, readyState complete, Renderer sandbox, Network Service AppContainer/Low Integrity, loopback CDP, 24 candidate-owned process cleanup: fifth Run [43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), same original SHA. Not an online Windows 2022 run; not a signed EXE.
- Fourth online Run [43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) failed `PUBLIC_PAGE_NOT_FULLY_LOADED`; its failed status remains historical evidence and was not overridden by editing the original EXE.
- No `main` change, merge, signed EXE, paid Windows Action, code-signing certificate purchase, personal document upload, or release.

## Source-only V3: independent embedded signature validation

### Why

Microsoft PowerShell documents that `Get-AuthenticodeSignature` can prefer a Windows catalog signature over an embedded file signature. YuTang's standalone distributed EXE must prove **its own embedded Authenticode signature**. Microsoft's `SignatureType` enumeration distinguishes `Authenticode` (file-embedded) from `Catalog` (catalog entry): https://learn.microsoft.com/powershell/module/microsoft.powershell.security/get-authenticodesignature ; https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.signaturetype?view=powershellsdk-7.4.0 .

### New fail-closed gates

- PowerShell's actual result must include `SignatureType = Authenticode`, `Status = Valid`, a Code Signing EKU and a timestamp certificate; otherwise no Ed25519 manifest is generated. The expected public publisher thumbprint must match. Catalog-only, missing-type or unsigned EXEs cannot proceed.
- Require `YUTANG_SIGNTOOL_PATH` to point to an **absolute** `signtool.exe` filename chosen by the release operator from a trusted Windows SDK installation. No loose PATH lookup. This path condition **alone does not authenticate Microsoft's binary**; the operator must verify that SDK and its tool separately.
- Run `signtool.exe verify /pa /tw <exact signed EXE>` (without any catalog lookup `/a`, `/ad` or `/c` option). SignTool nonzero exit, including exit 2 for warnings, fails closed; unexpected stdout/stderr never reveals private user paths in the release tool error.
- Keep EXE SHA-256 checks before and after the native signature verifications; preserve output-path symlink guard, non-overwrite behavior and off-project key checks from V2.
- An RFC 3161 SHA-256 timestamp should be produced by `signtool sign /fd SHA256 /tr <TSA URL> /td SHA256` during the future **manual** signing step. The V3 offline fixture cannot prove a genuine RFC 3161 token or real Windows trust chain. Explicitly check timestamp properties during real Windows acceptance before release.
- Official references: https://learn.microsoft.com/windows/win32/seccrypto/signtool ; https://learn.microsoft.com/en-us/windows/win32/seccrypto/using-signtool-to-verify-a-file-signature .

## Exact offline artifact identity

- `tools/windows147-release-manifest-kit.mjs` Git blob SHA-1: `0f9838b4c0a9cf9d375d3d76b0495a367cc6e856`
- `tests/windows147-release-manifest-kit.test.mjs` Git blob SHA-1: `c85d59f69417055ff7751807b62332c25c53920e`
- README in `docs/windows-147-release-manifest-kit-v3.md` Git blob SHA-1: `8fd7cd539045af742c6e7f6c665e5875778f9675`
- V3 Linux Node.js v22.16.0: `node --check` source and tests passed, `node --test tests/windows147-release-manifest-kit.test.mjs`: **23 tests passed, 0 failed, 0 skipped**; TAP SHA-256 `13abaf771d28e793729339f1b72b76b2c1b8d62c392ccd0ecac620bd515be5f0`.
- V3 zip: `YuTang-1.4.7-Signing-Prep-SOURCE-ONLY-V3-20261115.zip`, SHA-256 `bad4b323fe7f9a42158efa0c3f4074cf2a97c248ad4ff8ef6fc59ff8ab56c44f`; backup in owner-only `YuTang-Cloud-Build` Google Drive folder: https://drive.google.com/file/d/1b7H6v8v9ouMa9hDib4Qo_636ZoHqheg4/view?usp=drivesdk .
- The 23 tests inject **mock** PowerShell and SDK SignTool outputs, and use temporary local Ed25519 test keys. They are **not** a Windows runner or real CA signature verification. No production secrets, PFX, Certum certificate, key, or real signed EXE were placed in GitHub or the ZIP.

## Remaining real release blockers

1. Certum/SSLmentor application, issuer validation, final price and refund risks; no purchase has occurred.
2. Manual genuine Authenticode signing on a **copy** of the exact verified EXE with a real publisher certificate and RFC 3161 timestamp. Do not modify the historical accepted unsigned binary. Require native Windows `Get-AuthenticodeSignature` + pinned genuine SDK SignTool evidence.
3. Rehash the **new signed EXE**, then run Windows 2022 and Windows 2025 complete packaged EXE startup/Edge sandbox/process-lifecycle checks bound to its **new SHA**. Old unsigned SHA does not transfer acceptance.
4. Independently protect the Ed25519 manifest private key, embed the public key and actual publisher fingerprint in an update-enabled client, then rebuild and independently test that client's signed candidate. The existing 1.4.7 updater is fail-closed and **cannot automatically update merely because the original EXE is manually signed**.
5. Signed-manifest rejection, real download, health confirmation, shortcut switching, crash rollback, preservation of user data, and separate explicit release approval.

**This document is evidence-only on an experiment branch. No further Windows Actions run has been triggered or authorized.**
