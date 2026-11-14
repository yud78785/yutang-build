# YuTang Windows 2025 fourth public web diagnostic — FAILED (2026-11-14 UTC)

## Run and candidate identities

- [GitHub Actions Run 43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515), Windows 2025 job [132568099195](https://github.com/yud78785/yutang-build/actions/runs/43634463515/job/132568099195), conclusion **failure**.
- Workflow activation commit: `4bdf9250e6406b22f9fb8c187461b47440cd4ccb`.
- Exact checked-out probe source: `1c786c735e9e9086c3ec5e846c8528de7c1594a7`.
- Immutable original unsigned packaged EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, file length 125446071 bytes, obtained from previous successful offline candidate workflow Run `43541915930`. **No new EXE or release was built.**
- Original Windows CI `node --test tests/windows147-online-public-probe.test.mjs`: **48/48 pass**, 0 fail, 0 skipped. This verifies test/probe logic, not real-web acceptance.

## Raw Windows log facts

At 2026-11-14 19:53:46 UTC:
```
WINDOWS_PUBLIC_WEB_STAGE_FAILED PUBLIC_PAGE_NOT_FULLY_LOADED
+ 'interactive'
- 'complete'
```
At 2026-11-14 19:53:47 UTC:
```
WINDOWS_PUBLIC_WEB_EXE_NOT_ACCEPTED PUBLIC_PAGE_NOT_FULLY_LOADED
```

No `WINDOWS_PUBLIC_WEB_IDENTITY_GATE`, `WINDOWS_PUBLIC_WEB_IDENTITY_TOPOLOGY`, `WINDOWS_PUBLIC_WEB_CLEANUP_DIAGNOSTIC`, `WINDOWS_PUBLIC_WEB_PAGE_GATE_OK` or `WINDOWS_PUBLIC_WEB_EXE_RECEIPT` appeared.

Code-path-supported conclusions: the earlier Electron identity verification barrier was passed; the dedicated Edge/Chromium CDP path and main-frame Document response were reached. `validatePublicPageEvidence` tests HTTP 200 and approved origin *before* checking `page.ready`; consequently those earlier checks passed in this run, but `document.readyState === 'complete'` failed with actual `interactive`. A screenshot was requested before that validation. Sandbox/token flags were read, but later assertions were not reached so this run **does not prove** a final sandbox pass or a completely rendered public page.

The final reported error remained `PUBLIC_PAGE_NOT_FULLY_LOADED`, rather than the cleanup failure code. Under the immutable probe's `finally` logic, this indicates the candidate cleanup polling and disposable-directory removal did not throw, but there is no independently emitted cleanup-success receipt. Do not convert this into a full security-acceptance pass. Windows 2022 was not run.

## Offline follow-up — not a fifth Windows test

- Prior probe iterated only `24` readiness checks with a 300ms delay (approximately 7.2s of programmed delays). This may be insufficient for the public site's asynchronous resources; exact root cause of permanent `interactive` is not established.
- **Preserve** strict main-document HTTP 200, exact origin, `ready==='complete'`, challenge refusal, substantive DOM/screenshot, renderer, Network Service Windows token/Low Integrity, CDP listener ownership, cleanup and directory-removal gates. Do not mark `interactive` as success.
- Bounded readiness wait is increased to `PUBLIC_READY_WAIT_MS=45000`, with a 500ms polling interval and early refusal on challenge. Error path prints only fixed allowlisted readiness state and booleans for HTTP/DOM/screenshot/challenge, never page text, URLs, credentials, user IDs, process command lines or paths.
- Exact new probe source Git blob SHA-1 `d23665c98edca9b71afdf9352dc70a278559cfbe`; tests Git blob SHA-1 `25e0095dca103eaa7052497ea3c263ef52b3e184`.
- Actual local Node.js 22.16.0 syntax checks and full **51/51 tests passed**, 0 failed, 0 skipped, with a **test-only substituted lifecycle import**. TAP SHA-256 `31490665946c26e52f105e20dfca0b0c976babae69c573a8b66b17fe045c14a5`. Not a Windows real-web test.
- Fourth-run permission covered **one** Windows 2025 run and has been consumed. Do not automatically trigger a fifth run, run Windows 2022, modify main, sign, merge, or release.
