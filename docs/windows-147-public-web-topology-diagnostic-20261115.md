# YuTang Windows 1.4.7 public-web identity gate: safe topology follow-up (source only)

**Status: not Windows accepted. No fourth CI run, source commit still experimental.**

## Exact trace and candidate

- Original unsigned EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` (produced by `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`).
- Previous [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930) completed Windows offline sandbox, Edge launch/restart and Job Object forced-exit checks with outbound network blocked. Its `forceWindowsDesktopExit` verifies Electron ancestry **after** browser launch.
- Third [Run 43630798705](https://github.com/yud78785/yutang-build/actions/runs/43630798705), checkout `8a0aee4e9319bd602c36fc1d25c4c05c85bbc3a8`, failed Windows 2025 with fixed reason `INNER_ELECTRON_IDENTITY_NOT_VERIFIED`, surviving API worker PID 9576, CDP listener count 0, and **no public page navigation**.
- The public-web probe verifies internal Electron ownership **before** invoking `/api/browser/open`; old lifecycle verifies it later. The timing difference is confirmed from checked source, but **causality is not established**.
- The guard's production Go source `tools/jobguard/main_windows.go` sets `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; a surviving worker alone does not prove the guard is defective, because the parent may not have exited and guard presence was not logged.

## Safe source-only diagnostic changes

- Keep existing strict process ownership gate, identity error codes, fail-closed cleanup rules, nonrecursive verified `taskkill` and no publication changes.
- Add `summarizeIdentityTopology` to report only six bounded fields: wrapper present, worker present, immediate parent present, exact expected parent name, wrapper ancestry verified, guard count (capped at 10), and guard PID-pair verified. It never logs original PIDs, names, command lines, filesystem paths or credentials.
- Emit the summary only when the early or final ownership check fails; otherwise no extra telemetry.
- Explicitly encode Windows PowerShell subprocess stdout in UTF-8 to avoid dependent-locale Unicode process-name corruption. **No Windows validation of this change has been performed**.
- Source Git blob SHA-1: `7ddcfd23a35dce7df8af3b93263c48463a08ef62`. Test Git blob SHA-1: `5363556a395c2207ac1dfc5e340c7173c506406c`.
- Actual Node 22.16.0 Linux run of the exact changed source and test bytes, with a test-only stub for the unchanged production lifecycle import: **44/44 pass**, 0 fail, 0 skipped; `node --check` both files passed. TAP SHA-256 `df411d85644bf0e26058734abd3331d7b38d447c49e180b46c56f45971b8dc39`. This does **not** validate Windows processes or the production lifecycle module.
- Next real proof would be a new, separately authorized, **single Windows 2025** immutable-EXE diagnostic. Do **not** trigger Windows 2022 if Windows 2025 fails; do not substitute this source-only pass for actual public-web acceptance.
