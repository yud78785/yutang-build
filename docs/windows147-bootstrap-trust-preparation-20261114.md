# YuTang first updatable Windows bootstrap: offline public trust-source preparation (NOT RELEASE)

Date: 2026-11-14. Scope: **future new build only**, on experiment branch. Neither the accepted Windows 1.4.7 EXE nor main is modified. No certificate purchased, Windows Actions triggered, SignTool run, executable signed, public release created, or automatic update enabled.

## Why this isolated tool exists

The accepted Windows 1.4.7 binary was built from source commit `9cc16d7e64d59dc141e9c6687b8dd461934fcc35` and has unsigned EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. It passed Windows 2025 + same-file Windows 2022 acceptance in run `43541915930`. The separate Windows no-sign PowerShell preflight passed in run `43605324285`, with exact signer source Git blob `3b2c57d8c6106a158289685ad51f4b25884a29da`. These passes apply **only to their exact version and files**.

The 1.4.7 update-service template intentionally keeps `UPDATE_MANIFEST_PUBLIC_KEY=''` and `UPDATE_PUBLISHER_THUMBPRINT=''`, so update checks fail closed. `tools/apply_windows147_update_trust_patch.mjs` expressly enforces these empty pins. This is correct for 1.4.7, but a *new updatable bootstrap version* must embed real public trust material **before building a new EXE**. Signing the old EXE without rebuilding cannot fill its compiled trust pins; publishing another version 1.4.7 also cannot trigger a strict higher-version update.

## New source-copy preparer (does not sign or build)

- `tools/signing/prepare-bootstrap-trust.mjs`, exact Git blob `747cc0e3495cf8e0fd3e973e6ef1c6e2537288f7`.
- Input **must** be the exact fail-closed `tools/windows147-update-patched/update-service.mjs` template Git blob `b00c130f081cbe80bec3200bcfc024a738631784` (not an arbitrary script).
- Other inputs: a **public-only** Ed25519 SPKI PEM; a **public-only** leaf X.509 Code Signing cert with EKU `1.3.6.1.5.5.7.3.3`; the independently obtained expected 40-hex leaf thumbprint; a target version strictly higher than 1.4.7; and an existing separate output folder.
- Validates the certificate SHA-1 thumbprint matches the independently supplied pin, the Code Signing EKU, certificate dates and non-CA leaf designation. Validates Ed25519 public key type; rejects private keys and invalid versions. A local self-signed certificate may satisfy these structural checks: **no CA trust-chain or issuer proof is claimed**.
- Writes only a separate `update-service.mjs` source copy and `bootstrap-trust-preparation.json` receipt using exclusive file creation (no overwrites); both existing source and any pre-existing output are left untouched.
- Prepared ESM contains the public Ed25519 key and public certificate thumbprint. It contains no private Ed25519 signing key, token PIN, PFX file or identity scan. The receipt reports `SOURCE_COPY_PREPARED_NOT_BUILT_NOT_SIGNED`, `releaseReady=false`, `exeBuilt=false`, `windows2022Accepted=false`, `windows2025Accepted=false`.
- `--target-version` is planning metadata only; this script does **not** edit the product version, install itself into upstream source, create a GitHub workflow, sign a certificate or build a new executable.

Example **for the future, after receiving and independently confirming the genuine public issuer certificate**:

```sh
node tools/signing/prepare-bootstrap-trust.mjs \
  --template /absolute/checkout/tools/windows147-update-patched/update-service.mjs \
  --manifest-public-key /absolute/secure-offline/public-ed25519.pem \
  --publisher-cert /absolute/controlled-signing/public-leaf-codesigning.cer \
  --expected-thumbprint 0123456789ABCDEF0123456789ABCDEF01234567 \
  --output-dir /absolute/separate-preparation-directory \
  --target-version 1.4.8
```

**The thumbprint above is explicitly illustrative and MUST be replaced with the actual approved Certum signing leaf thumbprint.** `1.4.8` is a planning example, not an assigned release number. Do not use a test key or fake certificate for a release. The real issuer chain, intended publisher identity, revocation, timestamp, signature and SignTool verification are Windows-specific checks that remain separate.

## Exact-source offline tests performed

- Tests: `tests/windows147-bootstrap-trust-preparation.test.mjs`, exact Git blob `9dd36a26c15a952be7716f7266e68ebbcbb26614`.
- Test execution on isolated Linux Node.js `v22.16.0` with OpenSSL: `node --test tests/windows147-bootstrap-trust-preparation.test.mjs`.
- The actual tested `update-service.mjs` template Git blob was `b00c130f081cbe80bec3200bcfc024a738631784`; both newly submitted files were checked against the same exact Git blob identities after upload.
- **10 passed, 0 failed, 0 skipped**. Local raw test log SHA-256 `a01747b6ef8c4503642559706a8afae89d78d08f062120af21ad63e71b0e1acb`.
- Tests generate temporary Ed25519 keys and short-lived **self-signed mock RSA certificates** labeled TEST ONLY, including a non-code-signing EKU variant; the temporary RSA private certificate keys are deleted. This tests correct parsing, pin replacement, mismatch denial, EKU/date failure, version constraints, source Git blob pin, exclusive output creation, ESM imports and CLI behavior.
- **None of these synthetic tests proves Certum qualification, publicly trusted X.509 chain, SimplySign authorization, actual Authenticode signing, Windows acceptance or real update/rollback functionality.**

## Next real gates

1. SSLmentor case-specific written confirmation for a Serbia-resident natural person (including foreign citizenship if applicable) and the exact one-year B2C final charge. Supplier answered a generic VAT question, but has not confirmed this distinction. A short follow-up draft is awaiting review; it has not been sent.
2. Explicit user consent before buying any certificate, submitting identity/address proofs, or accepting a publicly visible individual publisher identity. Never put private keys, QR activation codes, PFXs or PINs into GitHub/ChatGPT/CI.
3. After genuine issuer verification, prepare the separate trust-pinned source copy, inspect its exact output SHA, and **explicitly integrate it into a separately versioned, reviewed build**; the current 1.4.7 patcher still enforces empty pins.
4. Produce new unsigned candidate with its own version, source commit, build run and SHA; require separately approved manual SignTool signing and real timestamp validation on a controlled Windows workstation.
5. Compute the **new post-sign SHA** and test the exact same signed file on Windows 2022 and 2025: browser sandboxes, Network Service Low Integrity, CDP loopback, restarts, forced-exit process cleanup, job/receipt authenticity and rollback. Old unsigned 1.4.7 acceptance cannot be reused.
6. Only after success, sign and test a real update manifest with the **actual** Ed25519 key, staged release download, wrong signer rejection, healthy startup, rollback and user data preservation. Public release stays explicitly gated.
