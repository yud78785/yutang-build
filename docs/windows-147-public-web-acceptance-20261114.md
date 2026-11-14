# YuTang 1.4.7 exact unsigned EXE - real public web navigation acceptance (NOT RUN, NOT RELEASE)

Date: 2026-11-14. Scope: Windows startup/security project only. No SSLmentor, certificates, purchase, identity records or signed release work.

## Immutable identity and already-proven work

- Accepted unsigned candidate source SHA: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Windows 2025-built EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Original full Windows 2022/2025 and cross-test [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930) PASSED. Windows 2025 Artifact `14092434238`, downloaded ZIP digest `sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`. Different Windows 2022-built EXE is a different SHA, NOT the cross-platform identical binary.
- No-sign script-only PowerShell Windows run `43605324285` PASSED but does not run EXE or visit the internet.
- Prior Windows runtime security test explicitly blocked outbound Edge egress: `externalEdgeNetworkBlocked:true`, `videoPlaybackTested:false`. It cannot be reused as a real public internet navigation PASS.

## New executable test code (inert until separately approved)

- Source: `tools/windows147-online-public-probe.mjs` (a new test harness only; application/packaged EXE bytes unchanged).
- Negative test cases: `tests/windows147-online-public-probe.test.mjs`.
- Reuses the original accepted lifecycle harness's `createCandidateEnvironment`, `verifyProcessSnapshot` and `inspectRendererSandbox` to avoid duplicating security criteria.
- Local syntax check and 18 pure/static cases passed on Node 22 with a test-only stub of the lifecycle module; this does NOT imply Windows or networking PASS. Future GitHub runners must execute the tests against the REAL original lifecycle module.
- The script hard-rejects non-Windows/non-GitHub CI and requires `YUTANG_PUBLIC_WEB_TEST_AUTHORIZED=yes`. No active Actions workflow is being added by this source commit.

## What a future authorized Windows 2022/2025 run would actually verify

1. Fetch exactly original Artifact 14092434238 from successful run 43541915930, verify EXE filename, byte count and SHA-256 before running.
2. Use a disposable GitHub Windows runner only. Preserve native Windows profile environment, redirect only YuTang data and memory to an isolated candidate directory; remove CI tokens and model keys from the EXE environment. Refuse an existing occupied CDP port or pre-existing candidate data directory.
3. Launch exactly this EXE with its `DOUYIN_DESKTOP_SMOKE` mode; verify Electron desktop ready, local API bootstrap, and `configured:false` with no model API key.
4. Invoke the product's actual `/api/browser/open` API. IMPORTANT: that production endpoint navigates the public `https://www.douyin.com/` homepage. The test cannot honestly substitute `example.com` without changing the app. It performs NO login, search, click, CAPTCHA bypass, private order lookup or model inference.
5. Over the verified dedicated loopback CDP, reload only the existing public homepage and require a real HTTP 200 top-level document response, correct page origin, a non-empty DOM and a PNG paint result (checked in memory, not uploaded). Reject login/challenge signals and failures; host geoblocking/CDN denial is a BLOCKER rather than an EXE security PASS.
6. Recheck renderer AppContainer and Network Service Windows token AppContainer/Low Integrity, dedicated Edge profile lineage, CDP listener bound solely to loopback and owned by Edge child.
7. Close the dedicated browser and stop only the exact spawned EXE process; verify zero owned Edge/host/API worker/Job Guard processes and zero 9227 listeners. Leave failure evidence rather than killing unrelated user processes.

Possible only success marker: `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` WITH exact EXE SHA on BOTH runners and actual raw job logs. The script never claims actual video playback, full normal user-desktop UI visibility, arbitrary-site browsing, person-PC safety, a signed EXE or release eligibility.

## Explicit limitations and next action

- No online run has yet occurred, and no published GitHub Release or change to `main` was made.
- A public site may reject GitHub-hosted IPs, present CAPTCHA, require login or redirect. This must be reported as BLOCKED/FAIL with raw evidence, not bypassed or suppressed.
- The test inspects the homepage's initial browser render and a public-page screenshot held only in RAM; it does not store or expose screenshot pixels or page content. It does not prove the Windows app's visible window was interacted with by a human.
- Its caller must not treat static unit test success, a queued CI job, or a skipped CI job as acceptance.
- Before any real Actions run, the workflow must be reviewed for read-only rights, pinned action SHAs, artifact identity, both standard Windows runner labels, no signing and no release. A NEW explicit run authorization is required; no background polling is configured.

Current focus remains functional Windows startup/security acceptance. Certificate purchase and vendor communications are suspended.

## 2026-11-14 latest test-harness audit

- Exact reviewed probe code commit `59e1e0cba6804eb0c2498166d3e137189a689fc1`; no change to the original EXE or bundled product runtime.
- Online success marker is emitted **only after** the spawned EXE/worker/host/Edge and CDP socket disappear, and disposable state directories are removed. Both cleanup phases fail closed rather than hiding exceptions.
- HTTP status must equal exactly 200; 201, 204, redirects, challenge pages, wrong origin, missing sandbox or incomplete cleanup are rejected.
- Local Node 22 offline tests using a test-only lifecycle stub: **23/23 passed**, with local TAP SHA-256 `a3dfe4b495ef005586b6f21d907bdf24d35274ff0e2f7c0d5e36375d89ac2ec6`.
- **Not run in Windows/online yet**. The dormant workflow pin is now aligned with the corrected source commit `59e1e0cba6804eb0c2498166d3e137189a689fc1`.
