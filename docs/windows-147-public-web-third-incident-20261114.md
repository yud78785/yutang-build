# YuTang Windows 2025 third public-web check: FAILED, not an acceptance

Date 2026-11-14 UTC. Single explicitly authorized Windows 2025 GitHub Actions run; Windows 2022 was not executed.

## Immutable identity and evidence

- Workflow trigger commit: `f32d651c8f08e5427b1cc71ee13c494d82077ac1` on `experiment/windows-147-public-web-third-20261115`.
- Checkout/test-code commit: `8a0aee4e9319bd602c36fc1d25c4c05c85bbc3a8`; no new candidate EXE built.
- Original accepted **unsigned** Windows 2025 EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- [Run 43630798705](https://github.com/yud78785/yutang-build/actions/runs/43630798705), [Windows 2025 job 132556713404](https://github.com/yud78785/yutang-build/actions/runs/43630798705/job/132556713404): **completed failure**.
- Source SHA and original EXE identity steps: success. Actual Windows Node 22 tests: **36/36 pass**, 0 fail, 0 skipped; they prove the test code checks, **not** real EXE acceptance.

## Raw job-log evidence (Windows 2025 only)

- 2026-11-14 19:13:00 UTC: `WINDOWS_PUBLIC_WEB_IDENTITY_GATE INNER_ELECTRON_IDENTITY_NOT_VERIFIED`.
- Same second: `WINDOWS_PUBLIC_WEB_STAGE_FAILED INNER_DESKTOP_IDENTITY_NOT_READY` **before** the `/api/browser/open` invocation.
- 2026-11-14 19:13:01 UTC: `WINDOWS_PUBLIC_WEB_FINAL_IDENTITY_GATE INNER_ELECTRON_IDENTITY_NOT_VERIFIED`.
- 2026-11-14 19:13:22 UTC: `WINDOWS_PUBLIC_WEB_CLEANUP_DIAGNOSTIC {"remaining":[{"pid":9576,"role":"api-worker"}],"remainingCount":1,"cdpListenerCount":0}`.
- Final: `WINDOWS_PUBLIC_WEB_EXE_NOT_ACCEPTED CANDIDATE_PROCESS_CLEANUP_UNVERIFIED`.
- **No** `WINDOWS_PUBLIC_PAGE_GATE_OK` or `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` receipt. No real web navigation, HTTP 200, DOM, paint, connectivity, or final process cleanup may be claimed. GitHub runner's post-job orphan termination is not proof of application-managed cleanup.

## What is known vs unknown

- PID 0 false positive was fixed by the third-run source: only a real API worker remains in the failure diagnostic.
- The old combined error `INNER_ELECTRON_IDENTITY_NOT_VERIFIED` means at least one of: (1) the process named by the API worker's ParentProcessId was not in the WMI snapshot, (2) the parent's process name was not the exact expected Electron filename, or (3) its ancestry back to the verified portable wrapper could not be established.
- The actual subcase **cannot be distinguished from the original logs**. Do not assert a production process-tree bug or blame browser networking. The API worker remaining after fail-closed refusal to terminate an unverified inner PID does not prove the normal application close path fails.
- Previous offline Windows 2022/2025 sandbox / Job Object acceptance Run `43541915930` used the same EXE, **but Edge outbound network was blocked**. It cannot be substituted for live-web acceptance.

## Follow-up diagnosis (source only; not Windows-accepted)

- In the separate cleanup-repair branch, split that single error into the fixed codes `INNER_ELECTRON_PARENT_NOT_FOUND`, `INNER_ELECTRON_NAME_MISMATCH`, and `INNER_ELECTRON_ANCESTRY_NOT_VERIFIED`. Keep all three **fail closed**, retain exact image-path and Job Object owner/target protections, and never force-kill an unverified inner PID. Do not log arbitrary process names, command lines, absolute paths, environment variables, or credentials.
- Exact revised probe Git blob SHA-1: `4fc056510c6066f6614fa67ce50f1042294e3812`; test blob: `0cffe6d4259358a7fa6e4b6d4bd541778a744c0d`.
- Actual offline Node.js 22.16.0 test run on the **exact bytes** above with a test-only lifecycle dependency stub: **39/39 passed**, 0 failed, 0 skipped; syntax checks passed. TAP SHA-256 `45a536f17b3af5603aae110a751bd51688e1b1f84cc32522e2868ffb680e8315`.
- This is not a fourth Windows run or an EXE pass. The third-run branch and `main` are not modified, no publication or signing occurred. Another Windows Actions run would require a distinct authorization; do not run Windows 2022 as a consequence of this failure.
