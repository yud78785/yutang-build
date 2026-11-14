# YuTang 1.4.7 — offline signing test verification (NOT RELEASE)

Date: 2026-11-14. Tested source branch: `experiment/windows-147-signing-tools-20261114`, SHA `af598097b4fd949a366586f8324a93df222886c1`.
No Windows Actions, release, merge, signing certificate, private publisher key, main modification, or runtime EXE rebuild was used.

## Accepted unsigned EXE baseline (unchanged)

- Product source patch: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Windows 2025 source build: Run `43541915930`, Artifact `14092434238`.
- Same-file Windows 2022 cross-test: Artifact `14093021418`.
- Accepted unsigned EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Separate Windows 2022 build SHA: `19cbafd88291f98b40757b8af99883e32881e59a3a3aa04f980b5d875f1a584c` — **not the same file**.
- Signed candidate has no SHA-256 yet; historical unsigned acceptance must never be reused for future signed EXE.

## Reproduced offline test execution

- Isolated local Linux container; Node.js `v22.16.0`, using Node built-in `node:test` and crypto. No network or production model credentials.
- Files fetched from GitHub at the exact version above, copied byte-for-byte and checked against their Git blob SHA-1 using `git hash-object` **before execution**.
- Test command:
  ```sh
  node --test tests/windows147-signing.test.mjs tests/yutang-signing-manifest.test.mjs tests/windows147-manual-signing-contract.test.mjs tests/yutang-signing-cli.test.mjs
  ```
- Result: **27 passed / 0 failed / 0 skipped**; TAP summary confirmed. The captured local log SHA-256 was `293004d6de7e63c9ef27de7f6a265c808f7b6a3357d1a3709e63791f411ec96b`.
- Breakdown: 6 core signing/key-envelope tests, 9 offline manifest tests, 8 PowerShell **static-contract** assertions, and 4 real Node CLI invocation tests.
- All test EXE content was synthetic 2048-byte `MZ` fixtures. The tests generated only disposable Ed25519 keys. A mocked receipt with `Valid` status is *not real Authenticode validation*.

### Exact tested Git blobs

| File | Blob SHA-1 |
|---|---|
| `tools/windows147-signing/core.mjs` | `4c8d1006102bc0d39a72b802cff140a72cd4f3f5` |
| `tools/signing/yutang-manifest.mjs` | `a1aa05207ea5eafaae48726879c85a7baf7adc90` |
| `tools/signing/Sign-YuTangCandidate.ps1` | `27437453eeda27845cccac30e60e270f7d62774b` |
| `tests/windows147-signing.test.mjs` | `8eb5aab83a0de7e4355365d3b07cdb673a341a97` |
| `tests/yutang-signing-manifest.test.mjs` | `ee6d6d4057fd1758a3d33f40c5cfad76ef151b92` |
| `tests/windows147-manual-signing-contract.test.mjs` | `6c86b67e783a6adcf14f382fff9a925f24d6b33d` |
| `tests/yutang-signing-cli.test.mjs` | `a5f2ddc831e792b4659254d6ae61f7634beb4999` |

## Verified boundaries — not a Windows executable acceptance

1. The PowerShell script was inspected and passed static-contract assertions only. No PowerShell interpreter, SimplySign Desktop, Windows SignTool, real publisher cert or Windows OS was used to execute it.
2. The CLI can sign synthetic JSON with test keys and reject tampering/wrong publisher/unsigned history ID reuse. It cannot cryptographically establish real Windows code signing from an editable local JSON receipt; independent Windows Authenticode checks remain mandatory.
3. Signed EXE candidate IDs used for publication must belong to a **new actual signed-file acceptance**. The script explicitly blocks the three known historical unsigned artifact IDs and source Run; this hardcoded block is an additional guard, not verification that any arbitrary newer run passed.
4. The Ed25519 PEM private-key input is intended for an adequately protected offline environment. A raw PEM on an ordinary workstation is not hardware-backed key isolation. Do not place keys or passphrases in code repository, hosted Actions, chat or build artifacts.
5. Client trust constants `UPDATE_MANIFEST_PUBLIC_KEY` and `UPDATE_PUBLISHER_THUMBPRINT` remain empty in the accepted EXE; updater remains fail closed.
6. Real signing changes the EXE SHA, so **same signed SHA** must be re-accepted on Windows 2022 and 2025. Real download, upgrade, signature rejection, healthy startup and rollback must be tested separately.
7. No new Windows Actions were initiated by this test. The signing branch is outside the workflow's configured push branch allowlist.

## SSLmentor preliminary vendor findings (not an issued quote)

Product: Certum Individual Cloud Code Signing, manual SimplySign Desktop + SignTool. The seller's displayed prices are EUR 117 / 218 / 291 for one/two/three years **before VAT**. Its general FAQ says eligible applicants may apply from any country subject to identity verification and restrictions; this is not written approval for any particular Serbian ID or residence proof. Serbia personal B2C VAT invoice is not specified on the current VAT page. Final price, country-specific eligible documents, renewal terms and refund amount require written confirmation **before** ordering.

The supplier's refund page mentions a 30-day cancellation regime for CODE certificates but also fee deductions, special terms for failed/terminated validation and payment processing. Do not assume unconditional full refund. Certum officially specifies a **459-day** maximum for new Code Signing cert issuance beginning February 27, 2026, while SSLmentor product copy says 460 days. Seek confirmation for multi-year reissues and possible identity revalidation.

References:
- https://www.sslmentor.rs/certum/certumcodecloudindividual
- https://www.sslmentor.rs/ssl/tc-vat
- https://www.sslmentor.rs/ssl/tc-mbg
- https://www.certum.eu/en/news/shortening-code-signing-certificate-validity/
- https://www.sslmentor.rs/contact

Supplier contact published by seller: info@sslmentor.rs. No email was sent or personal data disclosed.


## Certificate reissue and publisher-thumbprint rotation — newly identified compatibility gate

The shipped update-service currently expects a **single** `UPDATE_PUBLISHER_THUMBPRINT` (40 hex characters). Its `validateManifest` and `verifyAuthenticodeSignature` require that same thumbprint. This safely rejects unexpected signers, but creates a future update continuity problem: a Certum certificate reissue or renewal may change the certificate thumbprint even when the individual publisher's name is unchanged.

**Never** silently switch the pinned thumbprint or weaken verification to 'any valid certificate'. A new certificate must be introduced via an explicitly validated client trust transition while the old signing identity is still usable.

Before the first release, decide and test a rotation mechanism with:
- A signed, update-authorized bridge release using the currently trusted publisher certificate and existing Ed25519 manifest key; the bridge client recognizes the next approved publisher certificate (with exact fingerprint(s) and validity rules), *or* a rigorously versioned dual-pin transition shipped in advance.
- Both Windows versions verifying the same exact bridge EXE SHA, then the same new-cert EXE SHA, with wrong-publisher, revoked/invalid cert and tampered manifest rejection tests.
- Delayed client/skip-a-version scenarios: older clients that miss a one-release bridge must have an explicit supported recovery/install path; they cannot be claimed to auto-update after old-pin removal.
- Separate lifecycle for the Ed25519 update manifest public key. Rotate by pinning and testing the new public key in a previously trusted client **before** signing manifests solely with the new key.
- Explicit approval of certificate reissue fees, signer public identity and renewal validation rules. A multi-year purchase is not proof of one unchanged X.509 cert/thumbprint for all years.

This is a **design/policy finding, not an implemented or Windows-tested rotation feature**. No current EXE was changed; automatic updates remain disabled. It should be resolved before turning on a public update channel, not postponed until certificate expiration.

## Remaining gates

- Obtain supplier's written Serbia individual eligibility, identity/address document types, final VAT-inclusive quotation, proper commercial Code Signing issuance and refund/reissue conditions.
- Independently exercise and verify the PowerShell signing script on a controlled Windows signing workstation with an authorized real publisher certificate.
- Confirm authentic Authenticode signer, RFC3161 timestamp, new SHA-256, and signed-file provenance. Configure only the corresponding public trust pins; no private key in CI.
- Perform same-signed-file Windows 2022 / Windows 2025 security acceptance, then real update/download/reject/upgrade/rollback/user-data E2E acceptance.
- Explicit Release approval remains a separate gate.
