# YuTang 1.4.7 — 2026-11-15 signing / release preflight (no signing, no release)

**Release decision: BLOCKED.** Evidence-only record; no keys, identity documents, code signing, Windows Actions, main update, merge or release. The signing preparation package was tested and backed up privately; it is not a signed EXE.

## 1. Current immutable unsigned EXE acceptance

- Product: YuTang 1.4.7, file `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, size **125446071 bytes**.
- **SHA-256**: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Original candidate source `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`; original artifact and successful blocked-egress Windows 2022/2025 lifecycle/Job Object acceptance: [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- Real public homepage, HTTP 200, `document.readyState === complete`, Renderer sandbox, Network Service AppContainer + Low Integrity, CDP loopback, and complete tracked candidate cleanup: [Windows 2025 Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), job 132596128747. Source-only probe checkout `d523b38f8eee385fce7587b6fd0a7c639da3c721`; 68/68 Windows negative tests. The three real acceptance markers share the same EXE SHA.
- Previous public-web Run 43634463515 failed `PUBLIC_PAGE_NOT_FULLY_LOADED`; **do not reclassify it as passed**. Fifth-run pass is one successful online run, not proof of repeated-run stability.
- No signing certificate, no signed-EXE SHA, no new Windows 2022 live-web run, no on-device personal installation or online updater E2E; updates stay fail-closed.

## 2. Certum Individual / SSLmentor — new evidence

- SSLmentor individual-cloud product page: https://www.sslmentor.rs/certum/certumcodecloudindividual (1 year €117 **before VAT**, 2 years €218, 3 years €291; billing and refund terms require independent confirmation).
- Vendor's 2026-11-14 16:15 Serbia-local reply **affirmed** that an individual with Serbian residence, even a foreign national, may apply, and answered **no VAT** to the one-year individual buyer example. It accepted possible residential evidence such as bank statements or a lease agreement. The vendor explicitly disclaimed final CA validation authority. Gmail source is the authenticated message ending `1a1daa092536885f`; do not include applicant identity documents in this repository.
- FAQ: https://www.sslmentor.rs/help/code-faq says no extra CA signing charge, private keys are cloud protected and non-exportable (no PFX), SimplySign Desktop sessions are about two hours and require fresh token authorization; this is **not** proof unattended GitHub CI signing works.
- User guide: https://www.sslmentor.rs/help/code-simply-sign — signing is an interactive Windows desktop operation using Certum SimplySign + Microsoft SignTool, with current-user certificate store.
- Certum primary source: https://www.certum.eu/en/news/shortening-code-signing-certificate-validity/ states new code-signing certificates issued from 2026-02-27 have a **459-day cap**; 1-year subscriptions are unaffected, multi-year products require reissues and may require revalidation.
- Provider describes public certificate personal name, city, region, country. Before purchase, the intended owner must accept the public identity disclosure.
- **Still unresolved:** final buyer-specific invoice/payment amount, conditional refund deductions, Certum validation approval, exact automatic signing eligibility, future reissue and publisher-fingerprint changes. No purchase or upload of documents has been done.

## 3. New source-only manifest signing preparation — not Windows accepted

- Package: `YuTang-1.4.7-Signing-Prep-SOURCE-ONLY-20261115.zip`
- SHA-256: `b6bf15575fe327ca930e1de1ed8c1ba244d7311c4297ca2a1a7e6758df42045d`
- Owner-only Google Drive backup (folder `YuTang-Cloud-Build`): https://drive.google.com/file/d/1JCb0J6svbj8LMMxLdw6kZRsEUOPz7LaG/view?usp=drivesdk ; Drive metadata returned `shared=false` with owner-only permission.
- Contains `tools/windows147-release-manifest-kit.mjs`, `tests/windows147-release-manifest-kit.test.mjs`, `README.md`, an **invalid** public config placeholder, and the real local TAP transcript.
- Local environment: Linux Node.js 22.16.0, `node --check` both files and **17/17** isolated unit tests passed. TAP SHA-256 `7b51a5ebcb58277288c0f0703961b41aaadbb836be3894a9a3d5f26ae89c2515`. Source git blob SHA-1 `6241067fc40969692a72fde1831d53afe48172b4`; test git blob SHA-1 `c68c25803c3f2f0c26a9f429f9c2ad9975596a58`.
- Tests used synthetic Ed25519 keys and injected **mock** Windows Authenticode evidence; there was **no** genuine Windows SignTool / Certum certificate / executable signing and **no** new EXE acceptance. These source and test files are in the downloadable, private Drive-backed preparation package, **not yet committed individually to GitHub**.
- Tool is read-only toward signed EXE and uses `Get-AuthenticodeSignature` on Windows to require `Valid` + exact issuer public thumbprint + Code Signing EKU + timestamp certificate presence, verifies hash before/after native check, refuses the known unsigned candidate hash, requires an external-protected Ed25519 PEM key, writes an exclusive new output folder and self-verifies detached signature. No automatic Authenticode signing or Release.
- Signed manifest schema is exactly `yutang.windows-update-manifest.v1` with repo/tag/version, signed EXE name/size/SHA, two source commits, CI run/artifact IDs and verified Authenticode signer thumbprint/subject. Its raw JSON bytes are Ed25519-signed and signature is base64, matching the consumer code in `tools/windows147-update-patched/update-service.mjs`. **Native Windows compatibility remains untested**.

## 4. Signing and update bootstrap requirements

1. Certum must independently approve a real applicant; sign **a separate copy** of the verified candidate using the genuine Certum certificate selected by thumbprint, SHA-256 file digest, RFC3161 timestamp (Certum's page lists `http://time.certum.pl`). Do not sign or overwrite the original accepted artifact. SignTool references: https://learn.microsoft.com/windows/win32/seccrypto/signtool.
2. Validate native Windows `Get-AuthenticodeSignature.Status == Valid`, certificate subject/Code Signing EKU, timestamp and identity, then calculate the **new signed EXE SHA**. The unsigned EXE SHA cannot serve as its acceptance.
3. Build and verify a separate Ed25519 manifest using the exact **signed** bytes and public Authenticode publisher thumbprint. Keep Authenticode and Ed25519 signing keys entirely separate; no secrets or personal verification documents in chats, GitHub or artifacts.
4. **Critical bootstrap:** the current 1.4.7 packaged updater has empty `UPDATE_MANIFEST_PUBLIC_KEY` and `UPDATE_PUBLISHER_THUMBPRINT`, so manually signing the original EXE does **not** enable online updates. An update-enabled candidate must embed the verified public key/thumbprint, be rebuilt and receive its **own** Windows 2022 and Windows 2025 exact-SHA acceptance. Version selection and secure bootstrap from older fail-closed installations must be considered separately.
5. Only after both platform receipts for the signed **new** candidate: real signed update download, malicious manifest/certificate refusal, installation switch, health confirmation, crash rollback, shortcut and user-data preservation, then explicit approval for `main` merge and public release.

## 5. Administrative boundaries

- No new Windows Actions were started by this work.
- No certificates purchased, individual validated, credentials used, real EXE signed, key shared, updater opened, release created or user's PC operated.
- Main last confirmed `4745ed23cbb748cb4b070ed70390703d1261aea0`.
- Release state: **NOT AUTHORIZED, NOT READY**. The unsigned original EXE fifth-run acceptance is preserved and must not be presented as the future signed EXE's acceptance.

## 6. Vendor cancellation terms — verified from SSLmentor code-signing policy

Official policy page: https://www.sslmentor.rs/ssl/tc-mbg (CODE certificate section, checked 2026-11-15).

- The advertised 30-day cancellation window is **not** an unconditional full-refund offer. Cancellation uses the authorized written control-panel form.
- Terms describe full refund for EUR bank transfer under the ordinary cancellation provisions, with roughly **2%–5%** rounded transaction deduction possible for card/PayPal.
- In specified CODE certificate cancellation or interrupted validation cases, seller may charge **at least 25% of the ordered certificate price**. The text uses a generic SSL-certificate wording within the CODE clause; do not resolve this ambiguity without vendor confirmation.
- When validation is not completed within 30 days and the certificate was not issued, seller may cancel/refund after transaction deductions and a credit-note processing fee of **at least €10**.
- Distinguish (a) failed CA identity/address verification, (b) applicant's incomplete verification, and (c) certificate issued then voluntarily canceled. The text does not yield one guaranteed exact refund for every situation.
- This is **not** permission to order or submit a passport, residency document, lease agreement, bank statement or payment credential. Await written final invoice and case-specific refund response if considering payment.

New decision: prefer evaluating **one-year Certum Individual (€117 website price)** rather than committing to 2–3 years until the issuing CA, refund exposure, manual SimplySign operation and public personal certificate subject are acceptable. No orders have been made.

## 7. 2026-11-15 SOURCE-ONLY-V2 follow-up: local output-path guard + actual source in GitHub

The earlier V1 package described in section 3 remains a historical 17-test source-only result. Do not silently replace it or claim it was Windows-accepted.

**V2 fixes:** `tools/windows147-release-manifest-kit.mjs` resolves the actual parent filesystem path using `fs.realpath` before writing a manifest and refuses a destination whose real target is inside the source project. It prevents a symlinked intermediate path from bypassing the prior lexical output-directory restriction. This is a defense against common local mistakes, **not an atomic guarantee against a concurrent malicious writer changing directory entries**.

**New repository contents (experiment branch only):**
- Source file `tools/windows147-release-manifest-kit.mjs`: Git blob SHA-1 `f08ec6aacb685157179737c4ab696cb674e9a00b`.
- Test file `tests/windows147-release-manifest-kit.test.mjs`: Git blob SHA-1 `6dae02ff3dca4684efa3e26f34dfeef7bc6d55f0`.
- Instructions `docs/windows-147-release-manifest-kit-v2.md`.
- Exact-source Git commit: `02740cf1e21ca67af472dbaafb9be45de662822d`.
- Local Linux Node.js v22.16.0 syntax + `node --test`: **19/19 pass**, 0 fail, 0 skipped, including the new symlink redirection negative case and legitimate output success case.
- V2 TAP SHA-256: `2531addb0e773155aaae3b811a4ec1aa8ffe058c0e7dffba9190b484ab53ec47`.
- V2 standalone ZIP SHA-256: `bc99b50daa144e1bf72a634b21a1c3a8d0eca112ad2a04c4315ef298bb21635c`.
- V2 backup in owner-only Drive folder `YuTang-Cloud-Build`: https://drive.google.com/file/d/1wenAF_EXc3h6FUprdkgVPN-ZTVBocaM8/view?usp=drivesdk ; Drive metadata returned `shared=false`.
- No signature secret or identity document is included in the ZIP or repository.

**Release remains BLOCKED:** the test suite invokes a synthetic Authenticode verification callback with fixture keys, not Microsoft's native Windows signature engine. Before any genuine release, the Windows tool must be tested against a real signed EXE with actual Certum certificate validation, signer thumbprint, EKU and RFC3161 timestamp; then the **new signed EXE SHA** must complete Windows 2022/2025 full tests, updater public-key/bootstrap, malicious-signature rejection, upgrade and rollback. No certificate has been purchased, no real EXE signed, no Windows Actions run authorized or executed by V2, and no `main` change.

## 8. V3 embedded-signature preflight — LATEST source-only tooling state

**V3 supersedes V2 for future signers; V1/V2 remain historical offline source/test evidence only.** Detailed immutable report: `docs/windows-147-release-signing-v3-embedded-preflight-20261115.md`.

The Windows `Get-AuthenticodeSignature` API can select a catalog signature; for an independently distributed EXE this is insufficient. V3 requires exact `SignatureType=Authenticode` and independently successful `signtool verify /pa /tw` with zero failures/warnings; missing configured Windows SDK SignTool path is a fail-closed condition. It does not allow catalog verification options `/a`, `/ad`, `/c`. These were **mocked** in Linux local unit tests, not verified on a Windows host with a genuine publisher certificate. No new EXE was created.

- Exact V3 source Git blob: `0f9838b4c0a9cf9d375d3d76b0495a367cc6e856`.
- Exact V3 test Git blob: `c85d59f69417055ff7751807b62332c25c53920e`.
- Source commit: `7ef4080307e4acc9eae5963427c0d1cbf1c4cb98` (experiment branch only).
- Node v22.16.0 Linux: syntax pass and **23/23 mock-backed unit tests pass**, TAP SHA-256 `13abaf771d28e793729339f1b72b76b2c1b8d62c392ccd0ecac620bd515be5f0`.
- V3 ZIP SHA-256 `bad4b323fe7f9a42158efa0c3f4074cf2a97c248ad4ff8ef6fc59ff8ab56c44f`.
- Private Google Drive backup: https://drive.google.com/file/d/1b7H6v8v9ouMa9hDib4Qo_636ZoHqheg4/view?usp=drivesdk (metadata `shared=false`, 16,801 bytes).
- Windows certificate, timestamp, SDK tool authenticity and signer identity must all still be **checked independently in the future real signing environment**.
- Original unsigned EXE SHA `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` remains unchanged. Previously passed fifth Run `43643545361` remains its only real public-web Windows 2025 acceptance. A signed EXE will have a different SHA and must undergo separate Windows 2022/2025 packaged testing.
- No GitHub Actions rerun, credential access, certificate purchase, signing, `main` change, merge, release or auto-update activation.

## 9. V4 canonical Ed25519 client public-key pin — LATEST source-only state

Current signing-manifest source `tools/windows147-release-manifest-kit.mjs` **V4**. The V3 23/23 test and SHA records above are historical and remain accurate for V3; **do not treat them as V4 test receipts**.

The actual update-service `tools/windows147-update-patched/update-service.mjs` has `UPDATE_MANIFEST_PUBLIC_KEY = ''` in Git blob `b00c130f081cbe80bec3200bcfc024a738631784`. V3 only self-verified its newly derived Ed25519 public/private key pair, which is insufficient to prove the future installed client trusts this key. V4 now requires non-secret configuration `expectedManifestPublicKeySpkiSha256` and compares it against SHA-256 of canonical DER SPKI exported from the actual signing key **before creating a detached signature or any output directory**. Missing pin or wrong-but-valid key fail closed. The field is not added to signed manifest v1 schema.

- Source Git commit: `628fd781988c2b88021e43a80ee458b4b5921396` (experiment branch).
- Source file Git blob SHA-1: `9ac069666a6fc8dc6513acf38bd9e5d49ca9d3bc`.
- Test file Git blob SHA-1: `b4ff3efb01b24fb32f997d2ce2066a09fd77bd62`.
- Documentation `docs/windows-147-release-manifest-kit-v4.md`; acceptance record `docs/windows-147-release-signing-v4-client-key-preflight-20261115.md`.
- Linux Node.js v22.16.0 source syntax and **27/27 mock-backed tests pass**, 0 fail, 0 skip. TAP SHA-256 `8240c9bdc97940c6f3012f426e7eb131f8cba35d25c22cb36101a8d6aecc7809`.
- Local ZIP SHA-256 `d4cdd6a4fb2a149c964063777cb974db964528d0487f54324f9bcd18394ad7b6`, size 16563 bytes; private Drive backup https://drive.google.com/file/d/1PlEQyVDOoH_sTkn-Di1KHWXXzvpwIzGQ/view?usp=drivesdk .
- **Still blocked:** the expected public-key pin must be independently derived from the **exact future update-enabled, accepted client**, not copied from whatever local key the signer happens to choose. The currently accepted unsigned original EXE (SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`) intentionally has no trust key; signing it without rebuilding cannot enable the updater.
- This V4 test uses only a synthetic EXE, temporary Ed25519 keys and mock Windows Authenticode/SignTool responses. It has **not** verified native SignTool, the Certum CA, a real signed EXE, the packaged future public key, or real upgrade/rollback. No additional Windows CI was authorized.
- No certificate purchased; no passport, address, passwords or keys uploaded. No `main` change, merge, published Release, or automatic update activation. The Windows 2025 fifth-run success `43643545361` remains tied exclusively to the old unsigned SHA.


## 10. Production updater's embedded-only Authenticode gate — CURRENT NEXT RELEASE SOURCE

- Experimental source commit: 2a62fecd2e14b3279ee9c7566a4eea4021879e95.
- Real service/launcher source blobs: 910a0fd449bd334687cd24c56a8e563a2de026b6 and 0d1c5606c151964287edd83cc43431eb68a24d0c.
- Changed future update consumer check to require Windows PowerShell's SignatureType=Authenticode together with Valid and the pinned publisher thumbprint; catalog signatures must not satisfy acceptance. This does NOT require SignTool on end-user computers.
- Existing update trust test file Git blob: c2b26fa1556c8b5018b42b29e1f6f36fa92787a3 (adds 16 cases; existing tests retained).
- TWO bounded source-only verifications performed: local Linux Node 22.16.0 isolated verifier harness 16/16; and direct execution of each exact GitHub production verifier function for 16 simulated cases 16/16. The exact-function comparison reproduced that both OLD implementations accepted an otherwise Valid Catalog signature, while the patched implementations rejected it.
- Isolated harness ZIP SHA-256: 9edcc451503966516b7d414d80c66ede2dd0278576a2c46eed467f0180093714. Uploaded to owner-only Drive https://drive.google.com/file/d/1ccZE_2Zdz6zUi75dJaM3VqNAML78hfDd/view?usp=drivesdk ; Drive download SHA-256 matches original.
- See docs/windows-147-update-embedded-authenticode-preflight-20261115.md. **Full repository test suite and Windows-native/real signed EXE tests have NOT been executed**, and no new EXE was built. Existing unsigned original EXE acceptance remains bound to SHA-256 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34. No new Windows GitHub Actions launched; no main change, signature, or release.
