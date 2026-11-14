# YuTang 1.4.7 | Signing & Ed25519 manifest preflight V4

**SOURCE ONLY · 2026-11-15 · NOT A WINDOWS CERTIFICATE OR RELEASE**

This package contains a local, offline signing-manifest preparation tool and regression tests. It **does not** contain private keys, issue a certificate, sign an EXE with Authenticode, download a release, change a published version, enable automatic updates, or contact a CA. It is not permission to merge, purchase, or publish.

## Exactly accepted unsigned EXE (historical, untouched)

- File: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`
- Size: 125446071 bytes
- SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`
- Windows 2022/2025 sandbox, startup/restart, forced cleanup (blocked external Internet): [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930)
- Windows 2025 online public-page + Renderer/Network Service sandbox + cleanup (single run): [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361)
- The failure in the earlier fourth live run 43634463515 is historical evidence; one later pass does **not** prove long-run flakiness is resolved.

A **signed** EXE will have a different SHA and requires its own Windows 2022/2025 real-package acceptance. The V4 kit's 27/27 source-only tests never execute a real Windows EXE.

## V4: client Ed25519 key pin before creating any manifest

The existing production updater in `tools/windows147-update-patched/update-service.mjs` verifies Ed25519 signatures against its own **embedded** `UPDATE_MANIFEST_PUBLIC_KEY`. That constant is **currently empty**, so the 1.4.7 updater is intentionally disabled. V3 could sign a manifest using any locally valid Ed25519 private key and confirm the result against the corresponding newly exported public key; it did not prove the intended client would trust that key.

**V4 requires** the release JSON to include `expectedManifestPublicKeySpkiSha256`, a **lower-case SHA-256 of the DER SubjectPublicKeyInfo (SPKI) encoding** of the expected, independently verified Ed25519 public key **already pinned in the intended update-enabled client**. The tool derives the public key from the supplied signing private key, hashes its canonical DER SPKI, and rejects missing or mismatched pins **before signing or writing any outputs**. The pin is public information, not a password. Do not generate an arbitrary new pin from the supplied private key and pretend this proves compatibility with an already packaged client.

The source-only kit cannot attest what a future packaged EXE actually embeds. The issuer must independently inspect the **exact new signed and tested update-enabled candidate** to establish this public-key pin. Since the present 1.4.7 EXE has no updater trust key, **it cannot satisfy that requirement yet**. This deliberate fail-closed sequencing is not a bug to work around.

To calculate a pin *from a separately authenticated and trusted **public** Ed25519 PEM*, in a controlled environment:

```powershell
node -e "const fs=require('node:fs'); const crypto=require('node:crypto'); const k=crypto.createPublicKey(fs.readFileSync(process.argv[1])); if(k.asymmetricKeyType!=='ed25519')throw Error('NOT_ED25519'); console.log(crypto.createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex'))" 'C:\absolute\path\to\verified-client-public.pem'
```

The `expectedManifestPublicKeySpkiSha256` property is **only a local trust configuration**: it is not inserted as an unrecognized extra field into the `yutang.windows-update-manifest.v1` signed JSON. That schema remains compatible with the existing updater's `verifySignedManifest` and `validateManifest` functions.

## Previous V3 and V2 controls (retained)

- Requires Windows and a real Authenticode check before production output; PowerShell `SignatureType=Authenticode`, `Status=Valid`, matching signer thumbprint, Code Signing EKU and timestamp certificate.
- Independently invokes a **trusted installed Windows SDK** `signtool.exe verify /pa /tw <EXE>` via a pinned absolute path in `YUTANG_SIGNTOOL_PATH`. Warning/failed exit codes reject. An absolute path alone **does not authenticate** SignTool; the operator must independently verify Microsoft's SDK and timestamp chain.
- Double-hashes the signed EXE around native signature verification and refuses changed bytes, unsigned historical EXE hash, wrong filename and incomplete source/run/artifact provenance.
- Ed25519 private key must be held **outside** the project in restricted storage and not uploaded to ChatGPT, GitHub or Drive. Key bytes are not logged. The tool has no unattended CA signing integration.
- Exclusive output directory (no overwrite), guards against path traversal and symlinked ancestors into project, makes files with private permissions where supported; **not** an atomic guarantee against a malicious concurrent writer. Operate only in a private, controlled signing workspace.
- Does not authorize a deployment, even after a locally valid manifest is produced.

## Future manual workflow (not performed)

1. Obtain an actual trusted publisher certificate after CA verification and informed agreement to public certificate identity disclosure and refund conditions. Current vendor conversation supports Serbian residence in principle but **not** an issuance guarantee or unconditional refund.
2. On a controlled Windows PC, preserve and rehash the *original unsigned* EXE; sign an **independent copy** with the real Certum certificate and RFC3161 timestamp via official Windows SDK SignTool.
3. Verify embedded Authenticode + certificate signer/chain/Code Signing EKU + genuine timestamp + new EXE SHA on Windows. Use that exact signed hash in **new** Windows 2022 and Windows 2025 packaged testing.
4. Prepare a separate, update-enabled candidate with **trusted Ed25519 manifest public key** and **publisher thumbprint** embedded, check its packaged bytes and SHA on both Windows versions; plan secure bootstrap separately for older fail-closed installs.
5. Set a non-secret local config with `tag`, `upstreamCommit`, `yutangPatchCommit`, positive `workflowRunId` and `artifactId`, real `expectedThumbprint`, and the independently verified `expectedManifestPublicKeySpkiSha256`. See `sample-public-config.invalid.json`; every placeholder is deliberately invalid.
6. Once all release gates above are independently satisfied, set `YUTANG_SIGNTOOL_PATH` to the authenticated installed SignTool absolute path and manually run:

```powershell
node tools/windows147-release-manifest-kit.mjs '<public-config-absolute-path>' '<signed-exe-absolute-path>' '<offline-ed25519-private-key-absolute-path>' '<new-output-dir-absolute-path>'
```

7. Verify manifest signature with **the target client's actual embedded key**, use Windows release tests for real signed download and forgery rejection, upgrading, health checks, shortcut switch and crash rollback. Public release requires explicit separate authorization.

## Test evidence and limits

- Node.js v22.16.0 **Linux**, `node --check` both files and `node --test tests/windows147-release-manifest-kit.test.mjs`.
- V3: 23/23 passed; V4: **27/27 passed** with 4 new tests for missing client public-key pin, wrong-but-valid signing key, canonical DER-vs-PEM fingerprint handling, and unchanged manifest v1 schema. **The signature-verification side in these unit tests is mocked**.
- This is not evidence of native Windows/Certum signing, of a signed EXE startup, or of the target installed client's public key. All additional real validations remain blocked until the relevant exact candidate and signing identity exist.

**Safety boundary:** no certificate bought, no personal identity documents sent, no credentials imported, no GitHub Actions launched, no changes to `main`, no release, no automatic updates enabled.
