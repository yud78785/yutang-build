# YuTang 1.4.7 — align release signing tool with Windows-tested unsigned preflight

Date: 2026-11-14. **NOT A SIGNED RELEASE**. Scoped to `experiment/windows-147-signing-tools-20261114`; no EXE rebuild/signing, no fresh Windows Action, no `main` merge, no identity submission, no certificate purchase, no public release.

## Precisely identified prior difference

- The release signing tools branch previously held `tools/signing/Sign-YuTangCandidate.ps1` Git blob `27437453eeda27845cccac30e60e270f7d62774b`.
- The signer used by the **successful** real Windows 2022/2025 no-sign-only preflight, Run `43605324285`, was checked out at `27da129f96a2e7a343933147096cab947b0f2293` and had Git blob `3b2c57d8c6106a158289685ad51f4b25884a29da`.
- Comparison showed that the only extra lines in the Windows-tested script were three lines binding the input filename exactly to `Dafeiyu-Douyin-API-1.4.7-win-x64.exe` and rejecting `UNSIGNED_FILENAME_NOT_ACCEPTED_BASELINE`. The original accepted unsigned EXE SHA was already pinned in both copies.
- This divergence mattered: a renamed file with unchanged bytes should not be treated as a separately accepted product version, even if the SHA matches.

## Alignment performed (no new Windows run)

1. `tools/signing/Sign-YuTangCandidate.ps1` was replaced **byte-for-byte** with the already Windows-tested `3b2c57d8...` blob; it now also checks the exact filename.
2. Added `.gitattributes`: `tools/signing/Sign-YuTangCandidate.ps1 text eol=lf`. This prevents the old `SIGNER_SCRIPT_SHA256_MISMATCH` on Windows Git checkouts and keeps the original LF hash pin intact.
3. Added `tests/windows147-tested-signer-parity.test.mjs` to bind both the expected SHA-256 and safe filename pin, LF attribute, preflight-before-sign ordering, and post-sign non-release gates.

The Windows-tested signer SHA-256 is `2d4285879872bd2ae26592c0473ad111b11aa77b9a304facd9e3536b23c482b1`, 7476 bytes. New `.gitattributes` Git blob: `e3b08309dcf90acff0930855a9ec77bb91ae3247`. Test file Git blob: `223aba0220fd29cd7d5448a1930ec35b5e63e8d6`.

## Exact-file local test evidence

Environment: isolated Linux, Node.js v22.16.0. The source signer, signer core, manifest CLI and test files were checked against their Git Blob SHA-1 values before use. The checked script and new test were verified as matching the current GitHub signing branch exactly.

Executed command:

```sh
node --test tests/windows147-signing.test.mjs tests/yutang-signing-manifest.test.mjs tests/windows147-manual-signing-contract.test.mjs tests/yutang-signing-cli.test.mjs tests/windows147-tested-signer-parity.test.mjs
```

**32 tests passed / 0 failed / 0 skipped.** Includes 5 new parity checks; existing Ed25519 and CLI mocks still passed. Local TAP log SHA-256: `c882ace4a4caf28d96b677219b25a19ea0d356b369866be42cd79f7289a51dbc`.

These are local Linux functional/synthetic and static-contract tests. Run `43605324285` independently proves the exact signer file's **Windows no-sign path** on both platforms. The new branch itself has not run a new Windows Job and MUST NOT be advertised as a new full Windows signing acceptance.

## Unchanged validated EXE identity

- Product patch SHA `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Original Windows build Run `43541915930`, Windows 2025 Artifact `14092434238`, same binary Windows 2022 cross-test Artifact `14093021418`.
- Exact original **unsigned** EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Windows no-sign retest Run `43605324285`, source checkout `27da129f96a2e7a343933147096cab947b0f2293`, successful on Windows 2022 and 2025. Earlier run `43604551515` remains FAILED due to hash/EOL mismatch. Never substitute either of these no-sign results for signed EXE acceptance.

## Outstanding blockers

1. SSLmentor's *written* Serbia personal application acceptance, VAT-inclusive total, refund and renewal terms remains unavailable. Gmail pre-sale inquiry remains an unsent draft; no personal ID, OTP, phone token or payment submitted.
2. Real Certum SimplySign + Microsoft SignTool signing, RFC3161 timestamp trust and Authenticode verification are **not performed**.
3. Signer currently deliberately allows only the previously accepted unsigned 1.4.7 EXE. A new trust-pinned, updatable bootstrap (e.g. version 1.4.8) will need a **separate candidate-specific signer authorization** and new unsigned source hash, rather than loosening the current pinned script.
4. Signed EXE must have its own new SHA-256, independently verified on both Windows Server 2022 and 2025 with signed-file provenance. The accepted original 1.4.7 client's updater still has empty trust pins.
5. Real GitHub release download, wrong-publisher rejection, upgrade, startup health, crash rollback and data preservation all remain pending; explicit release authorization remains required.

**No additional Windows Actions are justified merely to retest the unchanged 1.4.7 unsigned file.**
