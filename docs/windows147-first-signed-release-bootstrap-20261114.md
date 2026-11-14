# YuTang 1.4.7 first signed release bootstrap decision (2026-11-14)

**Status: BLOCKED_FOR_AUTOMATIC_UPDATE_BOOTSTRAP; NOT RELEASE.** This is a read-only source and authentic packaged receipt audit. No signed publisher certificate is available and no product EXE was modified or executed. No Windows Actions, personal identity validation, code-signing, key creation, main merge, auto-update configuration or Release was initiated.

## Proven exact source

- Accepted Windows 2025 EXE build: `43541915930`, source commit `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`, artifact `14092434238`. It was independently cross-tested unchanged on Windows 2022 (artifact `14093021418`).
- Original unsigned 1.4.7 EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`; archive ZIP SHA-256: `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- The archived `desktop/release-api/windows-candidate-receipt.json` (65,429 bytes) reports `signatureStatus=NotSigned`, `productVersion=1.4.7`, `release=false`, `updateTrustPatch.manifestPublicKeyConfigured=false`, `authenticodePublisherThumbprintConfigured=false`, `updatesDisabledUntilTrustConfigured=true`.
- Source `tools/windows147-update-patched/update-service.mjs` in the same accepted product patch branch has literal empty trust constants. `UpdateService.performCheck()` returns `untrusted-release-channel` before making a network request if those values are not configured. `newerVersion('1.4.7','1.4.7') === false`.

## Finding: signing existing 1.4.7 does NOT bootstrap auto-update

Authenticode can be manually added to a separate copy of the accepted unsigned EXE after the genuine publisher cert becomes available. It would create a *new SHA-256* and require fresh Windows 2022 + 2025 signed-file acceptance. **This signature alone cannot enable updates in the compiled 1.4.7 client**, because its trust pins remain empty. It would only produce a candidate for explicit manual installation and acceptance.

A subsequent **updatable bootstrap version** (for example 1.4.8, **not yet chosen or built**) requires:
1. Confirm commercial Certum Individual eligibility, real VAT-inclusive price, identity-disclosure acceptance, issuance/reissue and refund conditions. Do not buy or submit ID papers until approved.
2. Obtain real Authenticode publisher identity on a controlled Windows signing workstation; generate a **separate** protected Ed25519 signing key. Embed only the Ed25519 *public* key and actual publisher certificate thumbprint in the *new* client source. Never transfer secrets to GitHub, ChatGPT or a hosted runner.
3. Build a **new** unsigned trust-pinned bootstrap EXE from reviewed pinned source plus the minimal trust configuration. It must get its own source commit/receipt and pre-sign tests. No prior 1.4.7 binary pass may be transferred to this new EXE.
4. Sign a copied bootstrap EXE with SimplySign/Desktop SignTool, timestamp and independently verify Authenticode. Recalculate the post-sign EXE SHA-256. On Windows 2022 **and** Windows 2025, test that exact same signed SHA, including Edge sandbox/Low Integrity, CDP loopback, restarts and three forced-exit cleanup modes; this work is **not yet performed**.
5. Only after the signed file acceptance, create an Ed25519 manifest whose asset size, signed SHA, source commits, publisher thumbprint and candidate Run/Artifact IDs correspond to the **new** signed candidate. Old unsigned IDs cannot be reused.
6. Test first manual bootstrap, then a separate next-version update (e.g. new signed bootstrap version -> strictly greater release version) with genuine GitHub release downloads, valid/invalid signatures, wrong publisher refusal, interruption, health handshake, rollback and user-data preservation on both Windows versions. Automatic migration from today's disabled 1.4.7 should **not** be promised.
7. Plan future certificate reissue and Ed25519 key rotations using an already-trusted bridge client. Pin changes must not accept any arbitrary valid certificate. Explicit Release permission stays separate.

## Added read-only preflight

- `tools/signing/check-first-release-bootstrap.mjs` (Git blob SHA-1 `a41c5b20867fe55d5083f7018bafba81012440da`) is bound to the accepted 1.4.7 source SHA and archive receipt fields. It makes no network calls, does not create a manifest, does not sign any file and does not modify any receipt.
- `tests/windows147-first-release-bootstrap.test.mjs` (Git blob SHA-1 `e4c5b2a589038c4f54f23f78b4bb78716eaf1a08`) adds 8 repository unit tests for the read-only gate and updater version comparison. **The full repository test module has been committed but not executed against the complete exact updater source in this pass**; its test file presence is not a pass claim.
- A separate local **7/7 tests pass, 0 failures** was run with the genuine extracted Windows 2025 receipt and the exact preflight source blob, using a narrowly scoped local shim containing inspected trust constants/version functions instead of the entire updater source. This verifies the standalone preflight logic and provenance rejection, **not** the complete updater integration or any Windows runtime.
- Real receipt invocation for proposed `1.4.7`: `BLOCKED_FOR_AUTOMATIC_UPDATE_BOOTSTRAP`, reasons include `TARGET_VERSION_NOT_HIGHER`, `SOURCE_UPDATE_TRUST_DISABLED`.
- Real receipt invocation for proposed `1.4.8`: same blocked status, `proposedVersionIsHigher=true` but current 1.4.7 client still cannot automatically install it because its trust pins are empty.
- Neither invocation establishes that some signed EXE does or does not exist elsewhere; only the **unsigned source receipt** was inspected.

Run locally against a previously verified *extracted* receipt (not the executable):

```sh
node tools/signing/check-first-release-bootstrap.mjs --receipt /absolute/path/windows-candidate-receipt.json --target-version 1.4.8
```

For the verified 1.4.7 receipt this always emits a **blocked planning result**, not a release approval. Do not use this read-only preflight instead of real Authenticode, GitHub provenance and signed binary dual-platform testing.

## Current next step

No further Windows 1.4.7 Edge lifecycle reruns are useful until a new signed/pinned candidate SHA exists. The next external blocker is the reseller's case-specific written response on Serbian natural-person qualification, VAT-inclusive quote and SimplySign/renewal conditions. An inquiry draft exists but is **not sent**. After actual certificate issuance, proceed with the real pinned-client build and signed-file tests under separate authorization. `main` and auto-update remain unchanged.

## 2026-11-14 exact-source follow-up: 14 offline integration tests executed

This is an **append-only test result** beyond the earlier 7/7 local shim-based tests. It does not transfer acceptance to any signed EXE.

- Exact tested GitHub signing branch prior to this documentation update: `68768f9501d5ecb528eb7e3f86ea4c8be23cb8f0`.
- `tools/windows147-update-patched/update-service.mjs`, Git blob SHA-1 `b00c130f081cbe80bec3200bcfc024a738631784` (full unmodified source, **not a shim**).
- `tools/signing/check-first-release-bootstrap.mjs`, blob `a41c5b20867fe55d5083f7018bafba81012440da`.
- `tools/windows147-signing/core.mjs`, blob `4c8d1006102bc0d39a72b802cff140a72cd4f3f5`.
- `tests/windows147-first-release-bootstrap.test.mjs`, blob `e4c5b2a589038c4f54f23f78b4bb78716eaf1a08` (8 tests).
- **New:** `tests/windows147-manifest-updater-compat.test.mjs`, blob `58251a5f04a80fd2f90fe8796d69647c1a396db5` (6 tests).
- An isolated Linux Node.js 22.16.0 environment reconstructed these exact tracked source files and checked each with `git hash-object` before execution. Command: `node --test tests/windows147-first-release-bootstrap.test.mjs tests/windows147-manifest-updater-compat.test.mjs`. **14 pass, 0 fail, 0 skipped**. Raw local TAP log SHA-256: `116217907fc01ac0307cc985e7602bba24a22229527fd0094a7652558bc75127`.
- The compatibility tests generate throwaway Ed25519 signing keys and synthetic 2048-byte `MZ` data. They test signing-core output against the **real updater module** and an in-memory fake GitHub Release response (no network); good manifests become `available`, while invalid keys, edited manifests and wrong publisher identities fail closed. They do **not** test a real GitHub Release, EXE download, Windows Authenticode, SignTool, actual signing, install, rollback or physical Windows runtime.

**Provenance limitation exposed by this test:** `validateManifest()` verifies signature, field types, repository, tag, publisher thumbprint and claimed numeric Run/Artifact IDs. It does **not independently query GitHub or attest that those IDs correspond to the same signed EXE and two passed Windows jobs**. A cryptographically valid manifest can still contain inaccurate build provenance if the authorized signer inputs incorrect metadata. Therefore public signing/publishing must require a separately verified signed-EXE acceptance receipt and an exact file SHA cross-check before manifest signing. Synthetic CLI passes cannot be used as such receipts.

The original accepted unsigned 1.4.7 SHA, Windows 2022/2025 evidence, private Drive backup, publisher qualification blocker, disabled updates, unchanged `main` and no-Release restriction remain in effect. No Windows Actions were started for this test.
