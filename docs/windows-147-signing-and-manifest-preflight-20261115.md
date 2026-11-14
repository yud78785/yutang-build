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
