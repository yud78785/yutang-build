# YuTang first trusted update: bootstrap decision and exact-version gates

**Status: design / source-only. NOT authorized to sign, rebuild, merge, publish, install or enable updates. Date: 2026-11-15.**

## 1. Why the existing 1.4.7 EXE cannot self-bootstrap

The accepted original unsigned 1.4.7 candidate is:
- Dafeiyu-Douyin-API-1.4.7-win-x64.exe, 125446071 bytes.
- SHA-256 3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34.
- [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930): exact same EXE passed Windows 2022+2025 offline startup, Edge sandbox, and process/forced-exit cleanup.
- [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361): the same SHA passed one real Windows 2025 public web homepage, sandbox and cleanup run.

The production updater source (original Git blob b00c130f081cbe80bec3200bcfc024a738631784) sets UPDATE_MANIFEST_PUBLIC_KEY = '' and UPDATE_PUBLISHER_THUMBPRINT = ''. When both are empty, performCheck fails closed without downloading a release. Code signing the unchanged 1.4.7 binary in isolation **cannot add those missing trust pins**.

The updater's newerVersion(next,current) requires a strictly later stable SemVer than the currently installed stable version. Offering a newly signed 1.4.7 EXE to an already installed 1.4.7 client is not a version upgrade. A different file hash under the same stable version does not fix the version gate.

## 2. Two different deliverables; do not conflate

**A. Authenticode-signed copy of unchanged 1.4.7:** useful only for manually distributed first install if publisher identity is accepted. Signing changes its bytes and SHA; complete Windows 2022 and 2025 real EXE tests must be rerun against that signed SHA. Existing updater still stays closed because embedded trust pins are empty.

**B. First actual update-enabled candidate (for example 1.4.8, exact version to be fixed at build time):** must have a separately authenticated Ed25519 manifest public key and a real Authenticode publisher thumbprint embedded in both update-service and update-launcher templates BEFORE packaging and signing. Its own new EXE SHA must pass complete Windows 2022+2025 startup, Edge sandbox, process lifecycle, shortcut transactional tests, source/manifest identity and update trust checks. The modified consumer/launcher source with embedded-only SignatureType gate is at commit 2a62fecd2e14b3279ee9c7566a4eea4021879e95; **these source changes have not been packaged into an accepted EXE**.

The first update-enabled build cannot be delivered via the already-closed 1.4.7 automatic updater: it requires a user-authorized verified **manual first upgrade/installation**. Thereafter, automatic updates may only become available if the installed client trusts the prepublished signer+manifest identity and the server manifest is correctly signed.

## 3. Future release bootstrap acceptance sequence

1. Confirm real issuer eligibility, price and refund exposure; do not submit passports, residential proof or keys to chat or GitHub. Obtain trusted Authenticode certificate in signer-controlled environment.
2. Establish an independently protected Ed25519 manifest signing identity (public key publishable; private key never uploaded). Derive canonical DER SPKI SHA-256 from the authenticated PUBLIC key and record intended rotation/recovery policy. The current source-only manifest signing V4 refuses a mismatched public-key pin.
3. On a dedicated experiment branch, configure the **public** Ed25519 manifest key in update-service, the public Authenticode publisher thumbprint in **both** update-service and update-launcher, and update the build patcher to bind exactly these values, and embed this trust configuration before packaging. Keep main unchanged.
4. Establish explicit candidate version greater than installed 1.4.7 if expecting version-based upgrades; fix release asset naming and source commit/run/artifact provenance. Freeze source SHA before building.
5. Build the candidate once, sign its verified copy using genuine Certum Authenticode + RFC3161 timestamp, compute NEW signed EXE SHA and verify embedded signature/chain on real Windows 2022 and Windows 2025. Old unsigned pass cannot be reused.
6. Inspect actual packaged updater trust key and publisher thumbprint (not just build/source templates). Check both are the intended public identity and that the Ed25519 manifest signing key's derived DER-SPKI fingerprint matches the packaged client's public key.
7. Using signed EXE's new hash and actual artifact/run provenance, generate detached Ed25519 manifest. Verify with the client's actual embedded key and reject substituted, malformed, catalog-only or wrong-publisher cases.
8. With explicit user authorization, test verified manual trust bootstrap, then a second higher-version real online update, health confirmation, shortcut switch, abnormal exit rollback and user-data preservation. Do not mutate old user profile or current machine without authorization.
9. Only after new exact-SHA dual-platform Windows receipts and full update E2E pass should publication/merge be proposed for separately authorized approval.

## 4. Evidence boundary and immediate next step

- Signing preparation V4: 27/27 LOCAL mocked tests; source blob 9ac069666a6fc8dc6513acf38bd9e5d49ca9d3bc. These are not Windows native signatures.
- New production template embedded-only verifier source patch: 16/16 isolated Linux mocked cases plus 16/16 direct exact-function mocked cases, without a full repository or Windows EXE run.
- Original Windows 2025 candidate and Windows 2022 same-binary receipts are independently backed up in owner-only Drive and do not expire when GitHub's source Artifact retention ends. See docs/windows-147-original-candidate-archival-backup-20261115.md.
- Still blocked: CA-issued certificate, actual thumbprint, authenticated Ed25519 key and public key, real signed candidate, future packaged key inspection, actual Windows 2022/2025 verification, and online updater transactions.
- No GitHub Actions triggered by documentation changes; no auto updates, no main merge, no signed EXE, no paid certificate or release.

**Decision:** do not change the trusted original 1.4.7 EXE merely to make progress. Preserve its evidence. Prepare the exact first trust-enabled build only after real public certificate + separate offline manifest signing identity are available. If a signed 1.4.7 is manually distributed, clearly label its updater disabled and independently retest its NEW SHA.
