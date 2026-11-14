# YuTang Windows 1.4.7 / future signed bootstrap — Serbia individual certificate purchase gate

**Research checked 2026-11-14. Status: HOLD / NOT PURCHASED / NOT RELEASE.** This is a source-backed decision record, not a quote, legal/tax opinion, CA approval, signed EXE test or a purchase instruction. No code/signing keys/Windows Actions/identity documents are involved.

## Pinned software baseline (do not silently replace)
- Product patch commit: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Unsigned Windows 2025 EXE artifact `14092434238` from successful run `43541915930`, independently cross-tested as the same SHA on Windows 2022 (receipt artifact `14093021418`).
- Original unsigned EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Separate Windows 2022 no-sign preflight SUCCESS: run `43605324285`, actual pinned source `27da129f96a2e7a343933147096cab947b0f2293`, only confirms read-only PowerShell no-sign checks; it **does not** authorize signing or release. Earlier run `43604551515` remains FAILED due to script hash mismatch.
- Current accepted 1.4.7 updater public key and publisher thumbprint are both blank; it **cannot** automatically upgrade to a new signed release. Any first updatable signed bootstrap requires a newly built trust-pinned client and a new SHA-256, with Windows 2022/2025 same-binary tests.

## Product and vendor findings
Source: https://www.sslmentor.rs/certum/certumcodecloudindividual

- Certum Individual Cloud Code Signing is advertised for **natural persons**, not company orders. Storefront price: 1 year **EUR 117**, 2 years **EUR 218**, 3 years **EUR 291**, **VAT excluded**. Do not treat EUR 117 as the final amount.
- Vendor says applications are country-neutral subject to successful ID/address validation and applicable legal restrictions. That suggests Serbian individual applicants are not categorically excluded; **it is not case-specific written acceptance**. No personal documents sent or assessed.
- Expected verification: valid government photo ID, face scan and residence address proof (e.g. utilities/fixed broadband). Mobile phone bills are **not** accepted as physical-address proof; alternatives may be discretionary. Identity processing time estimates are not guarantees.
- Public X.509 certificate fields for an individual include name as CN and O, city L, region ST and country C; seller says full street address is not publicly embedded. Anonymity/pseudonymity of the publisher is **not available** under this product.
- Code signing is manually authorized with the SimplySign mobile app and desktop software on a controlled Windows workstation. Seller explicitly states exported PFX, Azure/Google cloud-HSM transfer and GitHub Actions unattended signing are **not supported**. Therefore do not upload Certum private keys/OTP/activation QR/device sessions to GitHub, logs or ChatGPT.
- Advertised RFC3161 timestamp URL: `http://time.certum.pl`. Before release, validate actual Windows SignTool /tr and /td SHA256 behavior, X.509 chain, timestamp and pinned signer thumbprint on the exact signed EXE (not a fake receipt).
- Multi-year offerings entail certificate reissues. Certum's official guidance says maximum individual certificate validity **459 days** beginning 2026-02-27 and identity verification reuse window **398 days** starting 2026-03-15. Reseller uses rounded “460 days”; treat the issuer's exact 459-day rule as authoritative. Renewed/reissued leaf certificate thumbprint **may change**, requiring a pre-authorized trust migration in pinned clients.
- SSLmentor VAT policy explicitly describes *Serbian businesses/entrepreneurs with business identifiers*, not a Serbian B2C individual's final invoice; do **not** extrapolate that exemption. Request a written inclusive quote and currency.
- SSLmentor refund terms for CODE have conditions: 30-day cancellation in specific circumstances, card/PayPal processing deduction around 2–5%, a possible fee of at least 25% if validation is terminated/cancelled under specified circumstances, and at least EUR 10 administrative fee for some non-completion cases. **No unconditional full refund assumption**.
- Microsoft's 2026 guidance says even valid OV/EV signed binaries can show SmartScreen warnings initially while reputation is built; an EV upsell does not guarantee instant bypass.
- Microsoft Artifact Signing (formerly Trusted Signing) individual eligibility is currently USA/Canada only according to Microsoft Learn; thus it is not an established substitute for a Serbia natural-person case.

References:
1. https://www.sslmentor.rs/certum/certumcodecloudindividual
2. https://www.sslmentor.rs/ssl/tc-vat
3. https://www.sslmentor.rs/ssl/tc-mbg
4. https://www.sslmentor.rs/help/code-faq
5. https://www.certum.eu/en/news/shortening-code-signing-certificate-validity/
6. https://www.certum.eu/en/news/how-to-choose-the-right-code-signing-certificate/
7. https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
8. https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

## Decision: choose 1 year IF written qualification and consent are obtained

For the **first public release**, prefer *Certum Individual Cloud, 1 year* as the provisional option. It minimizes initial spend and avoids forced within-contract reissue for an unproven update channel. Do not pay for EV solely to avoid SmartScreen. A 2/3-year term should be reconsidered only after code-signing, publisher pin rotation, real update/recovery and subsequent version lifecycles have been tested.

### Pre-purchase questions requiring written supplier answers

1. Will Certum issue this specific **commercial/publicly trusted individual** code-signing certificate to a natural person residing in Serbia (not a Serbian registered business), and what specific Serbian IDs/alternative residence proofs can be used? Is residence/address proof required to be in the applicant's own name?
2. What is the **final VAT-inclusive one-year price** and invoice currency for a Serbia B2C buyer with no company tax ID, including any unavoidable charge?
3. If the applicant fails identity or address validation, exactly what is refundable, net of the seller's 25%/10-EUR/processing fee conditions? Under which condition is the 30-day cancellation policy valid?
4. Are commercial Windows desktop EXE distributions fully covered (not open-source-only or personal noncommercial use)? Which certificate policy/issuing chain applies?
5. Do SimplySign Desktop and standard Microsoft SignTool with RFC3161 timestamp work by human authorization without PFX export, and is CI/CD unattended signing indeed not supported?
6. Confirm reissue/renewal fees, whether personal identity must be revalidated, and how the leaf certificate thumbprint may change across future reissues.
7. Confirm public certificate identity fields and that a personal street address is **not** public.

Existing support inquiry draft addressed to `info@sslmentor.rs` is **still not sent** in the project handoff. Do not send without a deliberate user mail authorization, do not include ID scans or personal data in support inquiry, and do not treat a sent message as a supplier answer.

## Strict release gates after qualification

A) Obtain written qualification + VAT-inclusive quote + explicit publisher identity disclosure consent. B) Purchase/ID validation **only after explicit payment/identity approval**. C) Generate and store the separate Ed25519 publisher manifest secret in a protected offline environment; keep only its public key and Certum signer fingerprint in new bootstrap client. D) Build new trust-pinned EXE and record source SHA + artifact + new binary SHA. E) Authorized manual SimplySign + SignTool signing; record **post-sign** SHA, verified Authenticode identity and trusted timestamp. F) Test the same signed SHA on Windows Server 2022 and 2025, including Edge AppContainer/Low Integrity, loopback CDP, two restarts, and three forced exits. G) Independently verify linked GitHub job/artifact receipts; a locally editable JSON snapshot is not a GitHub attestation. H) Only then build manifest with a separate Ed25519 key and test real GitHub download/upgrade/corruption refusal/rollback/user-data preservation. I) Explicit release approval remains mandatory.

**NO changes to main, accepted EXE, update trust flags, publication, identity submission, purchases or Windows Actions resulted from this gate.**
