# YuTang 1.4.7 original EXE real-public-web Windows run: FAILED on both platforms

Date 2026-11-14 UTC. Scope: Windows executable startup, public web rendering, Edge sandbox, process ownership and lifecycle.

## Exact candidate and run identity
- Original accepted UNSIGNED EXE source: `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Original EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, length `125446071`, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Previously accepted OFFLINE Edge/Job Object Windows run [43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930): completed success. Network was blocked for Edge; it is NOT real-public-web acceptance.
- Explicitly authorized online one-shot workflow activation commit `ea1850f331ba44ae00289f5d2345b109305db286`, checked-out test-code commit `de28dd978f6ded50753e3dd720a434a0d76918fb`.
- Real [Run 43616296326](https://github.com/yud78785/yutang-build/actions/runs/43616296326): **completed failure**.
- Windows 2022 [job 132511981255](https://github.com/yud78785/yutang-build/actions/runs/43616296326/job/132511981255): **failure**.
- Windows 2025 [job 132511981049](https://github.com/yud78785/yutang-build/actions/runs/43616296326/job/132511981049): **failure**.

## Evidence directly visible in each original Windows job log
- Exact source checkout and identical EXE downloaded from successful original Run 43541915930, Artifact 14092434238, ZIP digest `sha256:718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- On EACH runner, `ACCEPTED_EXE_SHA256=3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` and source-checkout succeeded.
- On EACH runner, probe negative tests: **25/25 passed**, no failed/skipped cases. This is not EXE acceptance.
- Windows 2022: `WINDOWS_PUBLIC_WEB_STAGE_FAILED CANDIDATE_PROCESSES_OR_CDP_REMAIN` (16:35:30 UTC); after a further 20-second verification, `WINDOWS_PUBLIC_WEB_EXE_NOT_ACCEPTED CANDIDATE_PROCESS_CLEANUP_UNVERIFIED` (16:35:50 UTC).
- Windows 2025: same two error codes, at 16:35:39 and 16:36:00 UTC respectively.
- Neither job contains `WINDOWS_PUBLIC_WEB_EXE_RECEIPT` or `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`.
- A GitHub runner terminating orphan processes after the job is not proof that the application passed its own cleanup checks. The original logs do not identify which process was still present and did not separately log the verified page HTTP/DOM gate.

## Source-backed leading failure hypothesis, not yet confirmed
Original accepted lifecycle harness `tools/windows_147_isolated_edge_lifecycle.mjs` at source `9cc16d7...` contains a real proven forced Electron exit path: identify the outer EXE wrapper, inspect API-worker parent, verify its executable image is the inner Electron desktop named by that harness, verify a desktop-owned Job Object guard targeting the API worker, then run `taskkill.exe /PID <verified-inner-desktop-PID> /F` **without `/T`**. The approved old Windows run exercised and accepted this method.

The failed online harness instead used Node `child.kill()` on the outer portable EXE wrapper, then awaited complete API worker and subprocess termination. Terminating the wrapper is not equivalent to terminating the inner Electron main PID. This is a **supported mechanism mismatch** consistent with both runners' cleanup failure, but the raw logs did not include a process ownership snapshot. Do NOT claim it as proven root cause or claim that the public page actually rendered correctly.

## Prepared repair, not a second Windows acceptance
- Replace the online harness's outer-wrapper-only exit with an explicitly identity-verified, nonrecursive inner Electron stop matching the previously successful harness. Still stop its own wrapper and require zero tracked descendants, host, Edge, API worker, guard and CDP listeners.
- Verify the expected EXE image path, API `api-worker.mjs`, desktop parent lineage and exact Job Object owner/target pair before any process-termination command. Refuse if identity is not proven.
- Gather the full Windows process snapshot **in memory** for parent-lineage verification; do not print raw command lines, file paths, environment variables, user content or credentials.
- If cleanup fails, log only capped process PIDs and role categories (packaged-wrapper/inner-electron/api-worker/browser-host/edge-descendant/jobguard/owned-descendant) and the CDP listener count. Never claim success on cleanup failure.
- Validate real top-level page HTTP 200, loaded DOM, PNG paint and sandbox/loopback requirements **before shutdown**, logging `WINDOWS_PUBLIC_PAGE_GATE_OK` only for that intermediate page gate; the final `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` remains forbidden unless all process and directory cleanup checks pass.
- Node 22 local pure/static tests against a test-only stub: **29/29 passed, 0 skipped**. Locally audited Git blobs: corrected probe `e34b8ff9e51b1becf46509ca59d027b4e0255456`; tests `22d986e269779f3533585098f30ed6f665239d0e`; TAP SHA-256 `01487a9b75c24414f53c83eab1aefe7b06e44137f0557714fd44a9d3050103b4`.
- These corrections are only a **test-harness revision**, not a change to the accepted EXE bytes or its production behavior. The old one-shot activation is consumed. No new active workflow or new Windows Actions run has been authorized or started.

## Next gate
Only after separately approving another bounded Windows 2022/2025 public-web run should a fresh isolated one-shot workflow be prepared, pinning the corrected test source SHA and the ORIGINAL EXE SHA. Both new raw job logs must show a page gate success marker and a final cleanup-backed PASS receipt; otherwise report explicit BLOCKED/FAILED with role/PID diagnostics. Do not rerun already accepted sandbox/Job Object suites merely to repeat results.

Do not merge `main`, purchase certificates, sign, publish, use personal accounts, bypass CAPTCHA or operate user devices.
