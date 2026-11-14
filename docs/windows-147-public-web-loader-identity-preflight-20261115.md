# YuTang 1.4.7 public-web CDP lifecycle correlation: source-only follow-up

**Status: no fifth Windows CI or new EXE acceptance.** 2026-11-14 UTC.

## Immutable acceptance boundary

- Original unsigned candidate EXE: `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`, 125446071 bytes, SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. Source candidate `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`.
- Offline Edge / Job Object / sandbox acceptance Run [43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930) succeeded for that EXE, **with public outbound Edge network blocked**.
- Live public-page Run [43634463515](https://github.com/yud78785/yutang-build/actions/runs/43634463515) used the same original EXE, completed **failure** on Windows 2025: `PUBLIC_PAGE_NOT_FULLY_LOADED`, actual `document.readyState === 'interactive'`, expected `'complete'`. Source checkout `1c786c735e9e9086c3ec5e846c8528de7c1594a7`. No accepted live-page / full cleanup receipt and no Windows 2022 live-page run.
- Earlier source-only follow-up `f3c24b873e3b16afaab94aacf93a98944b1495f6` added CDP event diagnostics and cancellable document watchers (58/58 local stub-backed Node tests). It has **not** received a Windows EXE verdict.

## Verified new defect in diagnostics and source-only repair

The generic CDP `Page.loadEventFired` and `Page.domContentEventFired` notifications **lack** a frame/loader identifier, so attaching them to an arbitrary new navigation can misattribute late events from the old page. That would make diagnostic flags unreliable. This is **not** proven to cause the previous Windows `interactive` failure: the actual pass gate continues to check `document.readyState === 'complete'`.

New isolated probe code:
- Calls `Page.setLifecycleEventsEnabled({enabled:true})` in the approved attached CDP session before the forced approved-page reload.
- Captures the reloaded approved main Document's `loaderId` from `Network.responseReceived`. Uses only `Page.lifecycleEvent` where **sessionId, main frameId and loaderId all match** for `DOMContentLoaded` and `load` status flags; old events from a different loader/frame/session are ignored.
- Maintains fail-closed defaults if `loaderId` is missing. Outputs only fixed booleans and bounded counts; never prints loader IDs, process command lines, page contents, authentication tokens, raw paths or raw browser events.
- Does not relax document HTTP 200, approved origin, `readyState === 'complete'`, challenge rejection, screenshot/DOM, Renderer/AppContainer/Low Integrity, local CDP ownership, exact process identity or cleanup gates.
- CDP protocol references: https://chromedevtools.github.io/devtools-protocol/tot/Page/ (lifecycleEvent includes frameId/loaderId; loadEventFired lacks those) and https://chromedevtools.github.io/devtools-protocol/tot/Network/ (responseReceived includes loaderId and requestId).

## Exact-byte offline evidence and limits

- New probe Git blob SHA-1 `e26cc2131f33637ac4f498550f9d36b9466e48a9`.
- New test Git blob SHA-1 `34c465232a9f280c59fc61f03d3e88528a70ad52`.
- Node.js v22.16.0 in Linux ran `node --check` for both source and test, then the complete committed test file: **62/62 pass**, 0 fail, 0 skipped. Test-suite TAP SHA-256 `a2c58b05b92792df27b3b4c2dc1a802ea7d8558c48de834f8e3736a63558bf77`.
- **Critical limit:** the unmodified production lifecycle helper dependency was replaced with an explicit **test-only stub** for these Linux tests. No Windows process, Electron sandbox, public website, or EXE was run locally. These passing tests are not a Windows integration acceptance.
- The existing 45-second readiness limit and final full-process cleanup requirement remain.
- Fifth Windows 2025 CI is **not authorized by the last generic '继续'** and has not run. On future explicit authorization, activate only a one-shot Windows 2025 workflow pinned to this exact source commit and original EXE SHA, then inspect raw Windows logs. Do not run Windows 2022 if Windows 2025 fails. Do not modify `main`, merge, sign, publish or rebuild the EXE.
