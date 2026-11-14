# YuTang 1.4.7 public-web CDP diagnostic preflight — SOURCE ONLY

## Candidate identity and existing Windows results

- Original immutable **unsigned** Windows EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes; SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. Original source candidate `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930) passed isolated Windows 2022 and 2025 sandbox, Edge restart and forced-exit verification; **external Edge network was deliberately blocked**. That does not prove actual Internet website rendering.
- [Fourth public-web Run 43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) was **Windows 2025 FAIL**, workflow SHA `4bdf9250e6406b22f9fb8c187461b47440cd4ccb`, test checkout `1c786c735e9e9086c3ec5e846c8528de7c1594a7`, original EXE hash matched, Windows Node unit suite 48/48 passed.
- In the actual fourth-run logs, `PUBLIC_PAGE_NOT_FULLY_LOADED` reported `document.readyState === 'interactive'` rather than `'complete'`. The previous Electron identity gate did not block; the browser/CDP main-frame Document HTTP 200 and origin validation had been reached. **No full rendering/public-web success receipt was emitted.**
- The subsequent source-only commit `d29d65b6f5e8d1ea52d7160c19a7e948cb829ece` extended a strict `complete` wait to 45 seconds and passed 51/51 offline tests, **not Windows-accepted**.

## Latest source-only CDP diagnostic work

The new changes are confined to `tools/windows147-online-public-probe.mjs` and `tests/windows147-online-public-probe.test.mjs`:

1. Observe allowlisted CDP events from the same attached session and approved main frame, after the approved **reloaded** Document response. Distinguish DOMContentLoaded, load event, main-document response/loadingFinished/loadingFailed, and subresource loading failures (count capped at 99); ignore prior-page events.
2. On a failed page evidence gate, print only booleans, a fixed allowlisted readiness string, and bounded counts. **Never** print page text, screenshot, URLs, request identifiers, process command lines, paths or credentials.
3. Replace the orphanable document response promise with a cancellable bounded watcher. If `Page.reload` throws, remove the watcher and clear its timer; if a Document never arrives, fail closed with `PUBLIC_DOCUMENT_STATUS_TIMEOUT`.
4. Keep all prior acceptance gates unchanged: exact origin, main Document HTTP 200, `document.readyState==='complete'`, challenge exclusion, rendered DOM/screenshot, Renderer sandbox, Network Service AppContainer/Low Integrity and ownership, loopback-only CDP, exact process ownership and full cleanup.

**Evidence and limitations:** the new source Git blob SHA-1 is `6dcff99ec508ac44a729e8952856406b74137ef5`, test blob SHA-1 `e2e527b1019cce33f05884cb6649a3e278ad89cf`. Running the **exact file bytes** on Node.js 22.16.0 in Linux with the clearly marked **test-only dependency stub** for the unchanged 80K Windows lifecycle helper yielded **58/58** tests passed, 0 fail, 0 skipped, plus syntax checks. TAP file SHA-256 `fc2b3585dc8aa2ce2b870d301686f34ebcfcf51367bbedc04a0ba14cbe9eddb9`. This is not a production Windows integration test and is not a new EXE acceptance.

## Open risks and next allowed action

- The fourth Windows EXE **failed**. It is not known whether the public page would reach `complete` within the new 45-second window. The forthcoming CDP event counters can help distinguish a delayed load event, a main-document failure and subresource failures; they do not assert root cause in advance.
- No fifth Windows 2025 Action is authorized by a generic "继续". Do not trigger a workflow, Windows 2022, rebuild, sign, merge, publish or mutate `main`. Keep the original EXE SHA unchanged.
- A later **separately authorized**, one-shot Windows 2025 run may reuse this tested source only after verifying its commit SHA; on failure, do not automatically spend Windows 2022. A full success requires positive real-page and candidate cleanup receipts from the **same** EXE SHA.
