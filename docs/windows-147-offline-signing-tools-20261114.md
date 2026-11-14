# YuTang 1.4.7 offline signing tools — NOT RELEASE

Date: 2026-11-14. Branch: experiment/windows-147-signing-tools-20261114. No production EXE code modifications, merges, purchases, identity submissions, releases, or new Windows Actions.

## Verified baseline (unsigned binary only)

- Source patch commit: 9cc16d7e64d59dc141e9c6687b8dd461934fcc35.
- Windows 2025 candidate: Run 43541915930, Artifact 14092434238, exact SHA-256 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.
- Same Windows 2025 EXE cross-tested in Windows 2022: Artifact 14093021418, same SHA-256.
- Independent Windows 2022 build: Artifact 14092741259, different SHA-256 19cbafd88291f98b40757b8af99883e32881e59a3a3aa04f980b5d875f1a584c. Do not substitute it.
- Signing changes EXE bytes: new signed SHA needs separate Windows 2022 and 2025 acceptance.

## Files and behavior

- tools/signing/Sign-YuTangCandidate.ps1: preview-first local PowerShell script. Without -Sign it reads SHA-256, size, naming and existing signature but does not sign. With explicit -Sign, installed code-signing cert thumbprint and locally approved SDK signtool.exe, copies the previously accepted unsigned EXE into a different pre-created output directory, verifies copied SHA, signs via SimplySign + SignTool with SHA-256 and RFC3161 timestamp, verifies Authenticode, cert identity and timestamp, writes redacted receipt. It never modifies original EXE. No certificate secret/password/token is needed in the arguments.
- tools/signing/yutang-manifest.mjs: builds and verifies an exact-byte Ed25519 manifest in the existing yutang.windows-update-manifest.v1 format from a locally signed EXE, trusted signing receipt, separately checked source provenance and offline key pair. It does not verify Authenticode itself; re-run SignTool independently.
- tests/yutang-signing-manifest.test.mjs: tests synthetic fake MZ data and disposable Ed25519 keys only. No real certificate, Windows EXE, network call or update operation.

## Future local manual signing sequence (only after qualification and authorization)

1. On a protected Windows signing workstation, obtain the exact already-tested unsigned EXE from its known artifact and independently confirm the 64-character SHA-256 and source receipts.
2. Install Certum SimplySign Desktop and approved Windows SDK SignTool locally; certificate holder authorizes the mobile OTP themselves; never share OTP, seed, private keys, PFX, identity papers or credentials in chat/GitHub.
3. Run the script without -Sign first: powershell -NoProfile -File tools/signing/Sign-YuTangCandidate.ps1 -SourceExe <ABSOLUTE_EXE_PATH> -ExpectedUnsignedSha256 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34 -OutputDirectory <EXISTING_SEPARATE_OUTPUT_DIRECTORY>.
4. After preflight and certificate details are checked, manually add -Sign -ExpectedThumbprint <ACTUAL_CERT_FINGERPRINT> -SignToolPath <ABSOLUTE_OFFICIAL_SIGNTOOL_EXE>. Check the resulting signer and RFC3161 timestamp again independently.
5. **Do not build release metadata yet.** The current unsigned Run 43541915930 and Artifacts 14092434238 / 14092741259 / 14093021418 can be recorded ONLY as unsigned source provenance. After manual signing, independently verify the signed EXE's NEW SHA-256 in both Windows 2022 and Windows 2025. Only then create release metadata: repository yud78785/yutang-build; tag/version matching the signed filename; real publisher thumbprint; source.upstreamCommit 9c49833078f4b4d18b9211ef86d024e7f2e15739; source.yutangPatchCommit 9cc16d7e64d59dc141e9c6687b8dd461934fcc35; candidate.workflowRunId and candidate.artifactId corresponding to the **new signed EXE** (not an unsigned artifact). Independently inspect the signed candidate logs and exact SHA before using these identifiers. A hand-written PASS flag or signing receipt is not proof of Windows acceptance.
6. Build a manifest from the signed EXE, local signing receipt, metadata, separately stored Ed25519 private/public PEM and empty pre-existing output directory via node tools/signing/yutang-manifest.mjs build --exe <SIGNED_EXE> --receipt <RECEIPT_JSON> --metadata <METADATA_JSON> --private-key <OFFLINE_PRIVATE_PEM> --public-key <PINNED_PUBLIC_PEM> --out-dir <OUTPUT_DIRECTORY>.
7. Verify with node tools/signing/yutang-manifest.mjs verify --exe <SIGNED_EXE> --manifest <MANIFEST_JSON> --signature <MANIFEST_SIG> --public-key <PINNED_PUBLIC_PEM> --publisher-thumbprint <ACTUAL_CERT_FINGERPRINT>. This verifies manifest Ed25519 signature and EXE digest, NOT Authenticode trust.
8. Store private key outside repository, CI, releases and chats. File-based private key support is not equivalent to HSM hardware protection; use a properly controlled offline signer or vetted protected key service for real publication.

## Important safety and status constraints

- No actual publisher certificate or Ed25519 signing key has been created or configured in this branch.
- UPDATE_MANIFEST_PUBLIC_KEY and UPDATE_PUBLISHER_THUMBPRINT in client are both empty; automatic updates remain fail closed. Creating a signed EXE and manifest alone does not activate existing clients.
- The signing-tools experiment branch is NOT in the push-trigger branch allowlist of windows-147-packaged-smoke-fix.yml; do not start the Windows build merely to prove synthetic signing scripts.
- Windows PowerShell/SignTool script remains UNTESTED on a real Windows signing workstation. The isolated Node test pass does not replace that validation.
- A local JSON signing receipt is NOT cryptographic proof by itself; independently check Authenticode trust, chain, signer thumbprint and timestamp.
- Do not publish until the same signed SHA passes two Windows versions, signature mismatch and tampering fail closed, real download/health/rollback and user data preservation E2E checks succeed; explicit release authorization remains required.

## Supplier conditions requiring written confirmation before buying

SSLmentor lists individual Certum cloud code signing 117 EUR/1 year excluding VAT, 218 EUR/2 years, 291 EUR/3 years. Serbia natural-person eligibility is plausible from generic policy but not verified case-specifically. Request written acceptance for Serbian identity/address documents, final VAT-included invoice and refund terms, commercial (non-open-source-only) certificate chain, Certum 459-day per-cert issuance and multi-year reissue/revalidation, SimplySign Desktop manual SignTool workflow, renewal charges and public identity fields.

References:
- https://www.sslmentor.rs/certum/certumcodecloudindividual
- https://shop.certum.eu/standard-code-signing-in-the-cloud.html
- https://support.certum.eu/en/code-signing-required-documents/
- https://support.certum.eu/en/signing-the-code-using-tools-like-signtool-and-jarsigner-instruction/

End of non-release handoff.