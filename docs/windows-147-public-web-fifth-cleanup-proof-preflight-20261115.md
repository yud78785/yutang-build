# YuTang 1.4.7: fifth public-web acceptance preflight — independent cleanup proof

**2026-11-14 UTC. SOURCE-ONLY. Not a new Windows result. Fifth Windows CI NOT triggered.**

## Candidate and prior evidence

- Original unsigned packaged EXE `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`, first built and offline-accepted under source candidate `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- [Windows 2022/2025 offline Edge isolation, restart and Job Object Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930) passed for that immutable EXE, but outbound Edge network was blocked. Those offline passes do NOT replace live public-web acceptance.
- [Fourth public-web Run 43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515), Windows 2025 only, EXE hash verified, 48/48 unit tests passed, **live page gate failed**: `PUBLIC_PAGE_NOT_FULLY_LOADED`, observed `interactive` instead of required `complete`. No accepted live-page receipt. Windows 2022 was not started.
- Previous source-only 45-second readiness and CDP loader-correlated lifecycle instrument `88c7bd34f7304058c5160609b14d4bb9fffd41ae` had 62/62 Node Linux stub-backed tests pass. Not a Windows EXE run.

## Newly confirmed test-tool hazards and bounded fixes

1. The previous asynchronous CDP `command()` used `Promise.race` for a timeout but **did not remove its WebSocket response listener** when that timeout fired. Likewise a socket close could leave a pending response listener until the timeout. It now owns a bounded timeout and removes **message, close, and error handlers** on every exit (matched success, protocol error, timeout, socket close/error or failed send). Error codes are fixed and redact raw socket errors or URLs.
2. On a public-page failure the old `finally` block could finish its cleanup checks without emitting a positive independent cleanup receipt; the absence of an error is weaker evidence. The new `WINDOWS_PUBLIC_WEB_CLEANUP_OK` marker is emitted **only after** all tracked candidate processes and CDP listeners are confirmed absent, both isolated directories have been removed, the desktop PID was verified and the owned PID set was populated. Its payload contains only the immutable EXE SHA, a bounded tracked-process count, zero remaining-process/listener counts, and a directory-removed boolean. There are no raw process IDs, paths or credentials.
3. The `complete` readyState gate, approved main Document HTTP 200 and origin, no login/challenge, substantive DOM/screenshot, Renderer sandbox, Network Service AppContainer/Low Integrity, CDP loopback ownership, exact inner Electron and Job guard checks and fail-closed cleanup are all unchanged. No new process termination privilege, recursive kill or EXE modification.

## Exact-byte local verification and limits

- Source Git blob SHA-1 `4ec13e1bc697d42477f6298a57b56b73f732df82`.
- Test Git blob SHA-1 `be79b6ff73d8aaf7eb4286abbb4a0c5404bdf0f3`.
- Actual Node.js 22.16.0 Linux `node --check` both files + `node --test tests/windows147-online-public-probe.test.mjs`: **68/68 passed**, 0 failed, 0 skipped. TAP file SHA-256 `11714eaf94d1889d794bc639835a61d5983f24b195f0f87bbe3c945131d8be6e`.
- The 68 tests used an explicitly marked test-only stub for the unchanged production Windows lifecycle helper. Synthetic CDP WebSocket tests do not prove a real Windows browser, sandbox, public-page rendering or process cleanup.
- The next permitted test would require **separate fifth-run authorization**, use only one Windows 2025 runner with this exact new source commit and the unchanged original EXE SHA. Do not launch Windows 2022 if Windows 2025 fails. No fifth run, main change, signing, merging, rebuild or publication was authorized here.
