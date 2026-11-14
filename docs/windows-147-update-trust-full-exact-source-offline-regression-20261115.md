# YuTang 1.4.7 — complete update-trust + transaction source-only regression (2026-11-15)

**Result: PASS, 51/51 tests. Evidence boundary: Linux Node.js source-only; NOT native Windows / newly packaged EXE acceptance.**

## Verified source identity

Exact experimental source commit, before this evidence document: **`10678802d8e5eac2d08cc58e5dd173df5e3a17fd`**, branch `experiment/windows-147-public-web-cleanup-repair-20261114`. Source was obtained through authenticated GitHub file reads and transferred through a temporary private Google Docs text export because the isolated execution environment did not have GitHub DNS access. Every file was reconstructed from the exported base64 bytes and independently verified locally with `git hash-object` against the GitHub blob SHA-1. Temporary transfer Doc was deleted after local and owner-only ZIP archive verification.

| Exact file | Git blob SHA-1 |
| --- | --- |
| `tests/windows147-update-trust.test.mjs` | `c2b26fa1556c8b5018b42b29e1f6f36fa92787a3` |
| `tests/windows147-update-transaction.test.mjs` | `e5ea4185fcc87d66dc4bb3ad82726916f82520dd` |
| `tools/windows147-update-patched/update-service.mjs` | `910a0fd449bd334687cd24c56a8e563a2de026b6` |
| `tools/windows147-update-patched/update-launcher.mjs` | `0d1c5606c151964287edd83cc43431eb68a24d0c` |
| `tools/windows147-update-patched/update-transaction.mjs` | `020fee0f76438316ea783b6803abb5d0ffefcbeb` |
| `tools/apply_windows147_update_trust_patch.mjs` | `d0f90716526f1668ac3e8a5db0fe5a6e6934bff2` |

**Exact file match: 6/6.** No test fixture was manually substituted for a repo source file.

## Actual executed isolated regression

Execution environment: **Linux / amd64, Node.js v22.16.0**.

```sh
node --check tools/windows147-update-patched/update-service.mjs
node --check tools/windows147-update-patched/update-launcher.mjs
node --check tools/windows147-update-patched/update-transaction.mjs
node --check tools/apply_windows147_update_trust_patch.mjs
node --check tests/windows147-update-trust.test.mjs
node --check tests/windows147-update-transaction.test.mjs
node --test tests/windows147-update-trust.test.mjs tests/windows147-update-transaction.test.mjs
```

All six Node syntax checks passed.

**Node TAP totals: 51 tests / 51 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, about 327 ms. Confirmed by separately parsing the saved original TAP and counting all 51 `ok` entries, not just the final summary. Test command reported exit code 0.

- **16** original update-transaction tests: shortcut path discovery, journal/shortcut pinning, concurrent user edits, file swapping, forced exit and recovery, rollback and path ownership guardrails.
- **19** original update-trust tests: semantic versioning, fail-closed disabled updater, Ed25519 signed manifest, publisher identity and SHA verification, malicious redirection, update launch health, shortcut switching and crash rollback.
- **16** newly added embedded-signature refusal cases: downloader and upgrade-launcher independently accept valid `SignatureType=Authenticode` and reject Windows Catalog substitution, missing type, unsigned response, wrong publisher, malformed PowerShell, missing publisher pin and non-Windows execution. Native PowerShell results here are **mocked**.
- The exact source check demonstrates the earlier unpatched verifiers accepted a `Valid + Catalog` mock, while the patched exact production verifiers reject it. This is a source-level security regression closure, not a real Windows certificate test.

**Original combined TAP SHA-256:** `99501a5c5a075b1fe3f99b6c9f724abd47862b002b736b39241e2afb635617af`.

## Fully recoverable evidence bundle

- ZIP filename: `YuTang-147-updater-51of51-exact-source-regression-20261115.zip`.
- ZIP SHA-256: **`477ca062f6ac786488ccfd6a0c6907cf7bf97fefb19c6f1dcfe9c5f2b920cb9d`**.
- Contains the six exact-source files, snapshot-manifest.json, README.md and original TAP text. ZIP tested with `unzip -t`.
- Owner-only private Drive: [Read/download exact-source 51/51 regression archive](https://drive.google.com/file/d/1HnwX_Njkg3PvKAm-My-efA4ZHj7jdbDp/view?usp=drivesdk). Drive returned `shared=false`, size 35731 bytes, correct folder `YuTang-Cloud-Build`. Archive was fetched again from Drive and compared **byte for byte** with local ZIP; both ZIP SHA-256 match.

## Immutable previous Windows EXE evidence (NOT rerun)

- Original **unsigned** 1.4.7 EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 **`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**.
- Real original cross-platform Windows 2022/2025 offline Edge startup, Renderer/Network Service sandbox and lifecycle: [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- Real Windows 2025 public homepage, Sandbox and candidate process cleanup for same EXE SHA: [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), exactly one successful online run.
- Previous online fourth Run [43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) remains a **failure** and must not be retroactively counted as pass.
- Original candidate and Windows 2022 exact same-file receipts have independent private Drive backups: `docs/windows-147-original-candidate-archival-backup-20261115.md`.

## Remaining release blockers

**Not tested or not authorized:** real signed EXE and genuine Certum Code Signing certificate; native Windows `Get-AuthenticodeSignature` `SignatureType=Authenticode` check; trusted publisher and Ed25519 client trust bootstrap; strict full Windows 2022 and 2025 packaged **new SHA-256** acceptance; actual malicious release rejection, download/install, health confirmation and rollback; owner PC installation; `main` merge/publication.

The original updater still has empty pinned Ed25519 public key and publisher thumbprint and is correctly fail closed. The changes verified in these tests are source changes on experiment branch only. They have **not been built into, nor validated as, a new EXE**.

**Administrative safety:** no new Windows Actions, certificate purchase, user secrets, signed EXE, source build, `main` mutation, merge, update channel activation, or release as part of this offline regression. `main` checked at `4745ed23cbb748cb4b070ed70390703d1261aea0` before writing the evidence record.
