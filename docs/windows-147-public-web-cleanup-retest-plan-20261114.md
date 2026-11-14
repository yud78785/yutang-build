# YuTang 1.4.7: inert Windows public-web cleanup retest

**NOT RUN / NOT RELEASE.** This record prepares a future, separately authorized online test; it does not start any GitHub Actions job.

## Accepted baseline and failing new condition
- Original unsigned EXE source SHA: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`; exact EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, 125446071 bytes.
- Baseline offline Windows security Run `43541915930`: success; this does not prove live network browsing.
- Real-online Run `43616296326`: **failed** on Windows 2022 and 2025 after original EXE hash checks. Both logged `CANDIDATE_PROCESSES_OR_CDP_REMAIN` followed by `CANDIDATE_PROCESS_CLEANUP_UNVERIFIED`. No accepted page receipt. See `docs/windows-147-public-web-incident-20261114.md`.
- Isolated test harness repair `f10cacd82bb6f677b1309cf8ccb5b76eeaabdf99` checks identity of the **inner Electron** process and its API Job Object before nonrecursive stop, and logs page-gate and bounded PID/role cleanup diagnostics separately. Production EXE unchanged.
- Earlier `f10cacd` Node 22 offline result was 29/29. The revised source at `05fab3d` has now completed **31/31 local Node 22.16.0 offline tests, zero failures and zero skipped**, using a TEST-ONLY lifecycle-function stub. This is **not an actual Windows integration test** and does not validate the complete real Edge/EXE lifecycle.

## Reserved, NOT activated
- Inert workflow template: `docs/templates/windows-147-public-web-cleanup-retest.inert.yml`.
- It pins revised code SHA `23a8959d38c9f0b72ea7ff894f01c0b0e4bcd77a`, the original EXE SHA, and the successful original Artifact from Run `43541915930`.
- Future **dedicated** execution branch would be `experiment/windows-147-public-web-cleanup-retest-20261114`, seeded at exactly that source SHA.
- Future active workflow path would be `.github/workflows/windows-147-public-web-cleanup-retest.yml`; it has **not** been added. Only a separate explicit approval authorizes creating this branch and pushing the workflow.
- Two standard runners only: `windows-2022`, `windows-2025`; `contents:read` / `actions:read`; only the unmodified EXE's existing public Douyin homepage, no login or CAPTCHA bypass, no signing or publishing.

## Acceptance gate
On **each** runner, require exact EXE SHA, true main-frame HTTP 200/DOM/render/sandbox/CDP evidence `WINDOWS_PUBLIC_PAGE_GATE_OK` and final `WINDOWS_PUBLIC_WEB_EXE_RECEIPT` with `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` **after** zero owned process / CDP listener / isolated-directory leftovers. Queue, skip, unit tests or missing receipt are NOT passes. Compare raw job logs; report any failure as BLOCKED/FAILED with bounded diagnostics. No claims about video playback, signed EXE or real-user PC acceptance.

## Final preflight correction (new source, not Windows-tested)

- New inspected code commit: `23a8959d38c9f0b72ea7ff894f01c0b0e4bcd77a`; keeps original EXE SHA unchanged.
- Verified inner Electron / Job Object ownership is now captured after the desktop readiness marker **before** calling `/api/browser/open`, so early network/browser failure does not bypass the safely owned desktop shutdown.
- If no earlier identity is available, the finalizer may retry the same exact-image / worker-parent / owner-target guard check before killing any inner process; no unverified PID is killed.
- Two additional tests verify the pre-open identity capture and fallback stop contract. The exact **new** source and test files were executed locally: Node 22.16.0 `--check` passed for both files, and `node --test` yielded **31 passed / 0 failed / 0 skipped**. The non-Windows launch gate also refused execution with `REFUSED_OUTSIDE_EXPLICIT_EPHEMERAL_WINDOWS_CI` and exit code 1.
- This template remains under `docs/templates` and is NOT activated. An explicit, fresh Windows Actions execution authorization is still required.

## 2026-11-14 17:38Z independent source/fixture verification (no Actions)

- Local-tested probe Git blob SHA-1: `ae91309fac449ae6db65ee11331de09e336a15e1`; negative-test Git blob SHA-1: `3bd56b4d668aa02ffa43f055d040bc69a4a9f7d6`. Both match files already committed at `23a8959d38c9f0b72ea7ff894f01c0b0e4bcd77a`.
- Local executed Node TAP log: **31/31 PASS, no skip**, SHA-256 `2d9d062176dc6c9538db584c2720ef575f74f4495d022ab5895c4f8fe1597040`. This log uses the test-only stub of the original lifecycle module and is not Windows EXE output.
- Original archived candidate Artifact `14092434238` was read directly without executing the EXE: inner EXE actual size `125446071`, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. This verifies the candidate byte identity only.
- Archived original Windows `windows-edge-lifecycle-force-desktop.json` supports previously accepted nonrecursive inner Electron forced-exit handling with zero leftover tracked processes and zero CDP listeners, **under the older blocked-network conditions**. It is not evidence for the new public-web cleanup fix.
- Online Run `43616296326` remains **failure on both Windows versions**, and the revised `05fab3d` **has not been run on Windows**.
- A separate explicit approval is required before the inactive template is installed into `.github/workflows` and another Windows 2022/2025 Actions run is launched.

## 2026-11-14T17:45Z exact-image verification before taskkill

- A source review identified a test-harness safeguard gap: the previous inner-Electron stop could accept an empty executable image path if both the initial and final WMI snapshots returned an empty string. Process name and PID alone are insufficient to authorize a forced process stop.
- Corrected, inspected source commit: `23a8959d38c9f0b72ea7ff894f01c0b0e4bcd77a`, which requires a **nonempty absolute executable path** with the expected exact Electron executable basename, and rechecks the nonempty absolute path immediately before the nonrecursive `taskkill`. The original candidate EXE remains untouched.
- Actual locally executed Node 22.16.0 tests: **32/32 passed, 0 failed, 0 skipped** using a TEST-ONLY lifecycle module stub; new regression covers missing/relative/mismatched image paths. TAP SHA-256 `ef7a925e74084cfa7d448015a4d16d27566dfed33b726816c699190509811fcc`.
- Exact locally tested source Git blob SHA-1: `9aa8194f59eda800728a8b3e364a3afa73200cab`; test source Git blob SHA-1: `f6f1f90914192f5c47ab6c075340a6a3f77fa32b`.
- The **inert** workflow is updated to check out `23a8959d38c9f0b72ea7ff894f01c0b0e4bcd77a`. No new Actions workflow is installed and no Windows/online execution has occurred. The failed Run `43616296326` remains a failure.
