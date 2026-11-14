# YuTang 1.4.7: inert Windows public-web cleanup retest

**NOT RUN / NOT RELEASE.** This record prepares a future, separately authorized online test; it does not start any GitHub Actions job.

## Accepted baseline and failing new condition
- Original unsigned EXE source SHA: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`; exact EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, 125446071 bytes.
- Baseline offline Windows security Run `43541915930`: success; this does not prove live network browsing.
- Real-online Run `43616296326`: **failed** on Windows 2022 and 2025 after original EXE hash checks. Both logged `CANDIDATE_PROCESSES_OR_CDP_REMAIN` followed by `CANDIDATE_PROCESS_CLEANUP_UNVERIFIED`. No accepted page receipt. See `docs/windows-147-public-web-incident-20261114.md`.
- Isolated test harness repair `f10cacd82bb6f677b1309cf8ccb5b76eeaabdf99` checks identity of the **inner Electron** process and its API Job Object before nonrecursive stop, and logs page-gate and bounded PID/role cleanup diagnostics separately. Production EXE unchanged.
- Historical `f10cacd` Node 22 offline test-with-stub result was 29/29; it does **not** validate the new cleanup source. **The new source has not completed a fresh Node test run or real Windows test.**

## Reserved, NOT activated
- Inert workflow template: `docs/templates/windows-147-public-web-cleanup-retest.inert.yml`.
- It pins revised code SHA `05fab3d9f6e87649ab3cdf556c2c5ca5462b3a5f`, the original EXE SHA, and the successful original Artifact from Run `43541915930`.
- Future **dedicated** execution branch would be `experiment/windows-147-public-web-cleanup-retest-20261114`, seeded at exactly that source SHA.
- Future active workflow path would be `.github/workflows/windows-147-public-web-cleanup-retest.yml`; it has **not** been added. Only a separate explicit approval authorizes creating this branch and pushing the workflow.
- Two standard runners only: `windows-2022`, `windows-2025`; `contents:read` / `actions:read`; only the unmodified EXE's existing public Douyin homepage, no login or CAPTCHA bypass, no signing or publishing.

## Acceptance gate
On **each** runner, require exact EXE SHA, true main-frame HTTP 200/DOM/render/sandbox/CDP evidence `WINDOWS_PUBLIC_PAGE_GATE_OK` and final `WINDOWS_PUBLIC_WEB_EXE_RECEIPT` with `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` **after** zero owned process / CDP listener / isolated-directory leftovers. Queue, skip, unit tests or missing receipt are NOT passes. Compare raw job logs; report any failure as BLOCKED/FAILED with bounded diagnostics. No claims about video playback, signed EXE or real-user PC acceptance.

## Final preflight correction (new source, not Windows-tested)

- New inspected code commit: `05fab3d9f6e87649ab3cdf556c2c5ca5462b3a5f`; keeps original EXE SHA unchanged.
- Verified inner Electron / Job Object ownership is now captured after the desktop readiness marker **before** calling `/api/browser/open`, so early network/browser failure does not bypass the safely owned desktop shutdown.
- If no earlier identity is available, the finalizer may retry the same exact-image / worker-parent / owner-target guard check before killing any inner process; no unverified PID is killed.
- The test file now defines two additional static tests for this pre-open and fallback path. **No new executed test result is claimed for this updated source.** Prior 29/29 success belongs to the earlier test file only.
- This template remains under `docs/templates` and is NOT activated. An explicit, fresh Windows Actions execution authorization is still required.
