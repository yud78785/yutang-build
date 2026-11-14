# YuTang 1.4.7 — manifest signing preparation V4 (SOURCE ONLY)

Date: 2026-11-15. **No real Authenticode signing, no release, no Windows Actions.**

## Exact incumbent Windows EXE identity — unaffected

- Existing **unsigned** EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, **125446071 bytes**, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Same SHA passed offline Windows 2022/2025 startup, sandbox, two restarts and job/guard/main-process forced exits: [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- Same SHA passed **one** real Windows 2025 public `www.douyin.com` page HTTP 200/readyState complete, renderer/network sandbox and owned-process/CDP cleanup: [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361); test-probe source `d523b38f8eee385fce7587b6fd0a7c639da3c721`.
- Fourth real web Run 43634463515 **failed** `PUBLIC_PAGE_NOT_FULLY_LOADED`; the later one-run pass does not establish zero future intermittent failures.
- All above are the **original unsigned EXE only**; no signed EXE exists or has passed acceptance.

## V4 reason: a local Ed25519 self-check is not client trust

The actual packaged updater template `tools/windows147-update-patched/update-service.mjs` currently contains `UPDATE_MANIFEST_PUBLIC_KEY = ''` (Git blob `b00c130f081cbe80bec3200bcfc024a738631784`). It uses `verifySignedManifest(bytes, signatureText, this.manifestPublicKey)` with a **client-trusted embedded Ed25519 public key**. Auto-updating is deliberately fail-closed until a future update-enabled candidate embeds both its trust key and the valid publisher thumbprint.

V3 generated a detached manifest signature, exported its own public key and checked them against each other; this proves Ed25519 algorithm correctness but **not** that the existing/future installed YuTang client trusts that key. Generating an arbitrary fresh keypair cannot bootstrap the existing disabled updater.

V4 requires a local public **`expectedManifestPublicKeySpkiSha256`** config field before any signing or writing. It hashes the derived Ed25519 public key's canonical **DER SPKI** bytes, **not PEM text**, with SHA-256, then compares against the pinned lower-case 64-character expected digest. Missing/malformed pin => `MANIFEST_PUBLIC_KEY_PIN_MISSING`; different valid key => `MANIFEST_PUBLIC_KEY_PIN_MISMATCH`. Both fail without creating output. The extra config field is **not inserted** into the signed `yutang.windows-update-manifest.v1` payload; consumer schema remains the same.

**CRITICAL TRUST LIMIT:** the expected digest is still provided by the release operator; this tool cannot prove that an unbuilt future client contains the matching key. The digest must be independently obtained from the exact future update-enabled candidate's embedded key and linked to that candidate's signed SHA-256/Windows acceptance. The current 1.4.7 unsigned EXE has no configured key and **cannot legitimately satisfy this pin**. That is an intended release blocker.

Previous V3 controls remain: Windows PowerShell `Get-AuthenticodeSignature` requires `SignatureType=Authenticode`, `Status=Valid`, exact signer thumbprint, Code Signing EKU and timestamp certificate; independent trusted Windows SDK SignTool `verify /pa /tw` must exit 0 (warnings reject); exact EXE bytes hashed before/after; output and private key path containment protections; no secrets committed.

## Exact-source V4 offline acceptance (NOT Windows)

- `tools/windows147-release-manifest-kit.mjs` Git blob SHA-1 **`9ac069666a6fc8dc6513acf38bd9e5d49ca9d3bc`**.
- `tests/windows147-release-manifest-kit.test.mjs` Git blob SHA-1 **`b4ff3efb01b24fb32f997d2ce2066a09fd77bd62`**.
- `docs/windows-147-release-manifest-kit-v4.md` Git blob SHA-1 **`7b86e76a4cac744a20d2d11301d89fbd1b0678cd`**.
- On Linux Node.js **v22.16.0**, `node --check` source and tests and the full 27-case Node test file all passed: **27/27 pass**, 0 fail, 0 skipped. TAP SHA-256 **`8240c9bdc97940c6f3012f426e7eb131f8cba35d25c22cb36101a8d6aecc7809`**.
- V4 adds four tests: missing expected client key pin rejected, wrong-but-valid signing key rejected, canonical DER SPKI rather than PEM-text pin, and backwards-compatible signed v1 manifest shape.
- V4 ZIP: **`yutang-147-signing-prep-source-only-v4.zip`**, SHA-256 **`d4cdd6a4fb2a149c964063777cb974db964528d0487f54324f9bcd18394ad7b6`**, 16563 bytes. It contains only tool, tests, README, invalid public sample config, TAP and hashes; **no real keys or certificates**.
- Owner-only Google Drive ZIP archive: https://drive.google.com/file/d/1PlEQyVDOoH_sTkn-Di1KHWXXzvpwIzGQ/view?usp=drivesdk ; verify live metadata before treating this as owner-only.
- All native Windows Authenticode and SignTool results in tests are **explicit mocks**. Neither genuine Windows signature validation nor updater installation end-to-end has been carried out.

## Required next release work; not an authorization

1. Obtain a genuinely issued trusted code signing certificate and accept its public identity disclosure and actual refund conditions; do not submit identity documents or payment details through GitHub/ChatGPT.
2. Authenticate official Windows SDK SignTool, manually sign a **copy** of original EXE with genuine cert and RFC3161 timestamp; keep original unsigned EXE intact. Verify embedded signer/chain/timestamp and calculate **new signed SHA-256**.
3. Build an update-enabled candidate with verified Ed25519 public key and actual Authenticode publisher thumbprint embedded. This candidate must have its own new SHA-256, exact Windows 2022/2025 packaged EXE acceptance and working update bootstrap; old blank-key clients must not be assumed to auto-update.
4. Only then prepare a manifest with a **genuine target-client-derived** public DER SPKI SHA-256 and actual publisher thumbprint, independently confirm client verification, then validate actual download, malicious manifest rejection, upgrade, rollback and personal-data preservation.
5. Formal release, merge, certificate purchase, identity submission and new Windows CI require their own explicit authorization. **Current `main` remains unchanged and automatic updates stay disabled.**

This report is evidence only on a dedicated experiment branch. It does not run or activate any workflow.
