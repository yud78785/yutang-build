# YuTang 1.4.7 — fifth Windows 2025 public-web / cleanup acceptance

**RESULT: PASS (specific unsigned EXE, single Windows 2025 run only).**

## Immutable evidence

- Date/time of run: 2026-11-14 21:34:34–21:35:35 UTC.
- [GitHub Actions Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361): `completed / success`, `run_attempt = 1`.
- [Windows 2025 job 132596128747](https://github.com/yud78785/yutang-build/actions/runs/43643545361/job/132596128747): `completed / success`. **One job only, no Windows 2022 job**; no failed steps.
- Workflow activation SHA: `924963f01842c6a98f0e9d8d78281924d9825d48` on experimental branch `experiment/windows-147-public-web-fifth-20261115`.
- Exact test/probe checkout SHA: `d523b38f8eee385fce7587b6fd0a7c639da3c721`; tests Git blob `be79b6ff73d8aaf7eb4286abbb4a0c5404bdf0f3`; probe Git blob `4ec13e1bc697d42477f6298a57b56b73f732df82`.
- Immutable unsigned candidate EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, `125446071` bytes, SHA-256 **`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**. Source candidate `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`; artifact originally produced in [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930). **No new EXE was built.**
- Windows `node --test tests/windows147-online-public-probe.test.mjs`: **68 tests, 68 passed, 0 failed, 0 skipped**.

## Three independent same-SHA success markers from the raw Windows 2025 job log

At 2026-11-14 21:35:28 UTC:

```text
WINDOWS_PUBLIC_PAGE_GATE_OK {"exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","httpStatus":200,"rendered":true,"cleanupPending":true}
```

This gate was reached only after checking the approved public `https://www.douyin.com` main Document HTTP 200, origin, `document.readyState === "complete"`, challenge rejection, substantive DOM and screenshot rendering, Renderer sandbox, Network Service AppContainer/Low Integrity + process ownership, and local CDP ownership.

At 2026-11-14 21:35:33 UTC:

```text
WINDOWS_PUBLIC_WEB_CLEANUP_OK {"exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","verifiedDesktop":true,"trackedCandidateProcessCount":24,"trackedProcessesRemaining":0,"cdpListenersRemaining":0,"isolatedDirectoriesRemoved":true}
```

This marker was emitted after the exact verified internal Electron had exited and candidate-owned processes, local CDP listeners, and isolated user state were confirmed removed. It does not claim ownership of processes outside the tracked candidate.

The final exact unsigned-EXE receipt was:

```text
WINDOWS_PUBLIC_WEB_EXE_RECEIPT {"status":"PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY","exeSha256":"3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34","exeBytes":125446071,"sourceCandidate":"9cc16d7e64d59dc141e9c6687b8dd461934fcc35","documentHttpStatus":200,"renderedPage":true,"rendererSandboxVerified":true,"networkServiceAppContainer":true,"networkServiceLowIntegrity":true,"cdpLoopbackOnly":true,"noResidualCandidateProcesses":true,"trackedEdgeProcessCount":10,"accountUsed":false,"modelKeyUsed":false,"videoPlaybackClaimed":false,"personalComputerAcceptance":false,"releaseAuthorized":false}
```

A receipt parser independently verified **exactly one** of each of these markers, the same EXE SHA-256 in all three, HTTP 200, zero tracked candidate process/CDP listener residue, directories removed, positive sandbox flags, and **no** `WINDOWS_PUBLIC_WEB_EXE_NOT_ACCEPTED` / `WINDOWS_PUBLIC_WEB_STAGE_FAILED` errors. Raw job log is linked above.

## What changed since earlier failures

- Third [Run 43630798705](https://github.com/yud78785/yutang-build/actions/runs/43630798705) failed the early inner Electron identity gate and left an API worker, with no public-page navigation. Later source-only identity checks / UTF-8 WMI diagnostics improved the test gate.
- Fourth [Run 43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) reached the page gate but failed on `document.readyState = "interactive"`. Later source-only changes introduced bounded 45-second readiness wait, loader-correlated CDP events, safer listeners, and an independent cleanup marker.
- Fifth Run **passed** with those newer *diagnostic/test-source changes* using **the same original EXE SHA**. Do not claim that the source-only diagnostics changed the EXE or that a single run conclusively proves the exact cause of earlier intermittent page loading.

## Acceptance boundaries and remaining items

**Passed for this exact unsigned EXE in ephemeral Windows 2025 CI:** public homepage HTTP 200 and rendering, Renderer/Network Service sandbox, AppContainer and Low Integrity, CDP loopback ownership, and complete tracked candidate cleanup; Windows unit tests 68/68.

**Previously passed but not rerun here:** offline Windows 2022 / 2025 Edge startup/restart, sandbox, Job Object forced-exit and cross-platform acceptance in Run 43541915930, pinned to the same unsigned EXE SHA.

**Still NOT proven or NOT authorized:** signed EXE after code signing (new SHA required and must be retested), real updater download / signature rejection / upgrade and crash rollback, personal Windows PC installation, logged-in Douyin or video playback, credentials or AI model calls, production deployment, release/merge, and sustained flakiness-free repeated online runs. Those require their own scoped tests and authorization.

**No changes to `main`**; it remains `4745ed23cbb748cb4b070ed70390703d1261aea0` as verified immediately after the run. This document is evidence-only on the experiment repair branch and does not activate any Actions workflow.
