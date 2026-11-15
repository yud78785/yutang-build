# YuTang / Dafeiyu 1.4.7 — actual Windows trial handoff and reuse decision

**Date:** 2026-11-15. **Goal:** PRIVATE useful AI with browser eyes, cloud reasoning and real bounded tasks — not public distribution, certificate buying or cosmetic CI growth.

## Exact, downloadable existing Windows candidate (NOT the new first-task source)

Source project: `yud78785/yutang-build` GitHub Actions run **43541915930**, existing Windows 2025 artifact **14092434238**, candidate source `9cc16d7e64d59dc141e9c6687b8dd461934fcc35`. GitHub artifact expires **2026-11-21T01:50:44Z**; the original ZIP bytes were downloaded in this session and verified locally. A copy was also saved to the owner's private ChatGPT Library (do not publish private file IDs).

- ZIP SHA-256 `718d52af838a4fa0c375ae51f0b1f71aa2dc20d3615b58f79f7355ca1bf3342a`.
- ZIP includes `desktop/release-api/Dafeiyu-Douyin-API-1.4.7-win-x64.exe` exactly **125,446,071 bytes**.
- Extracted exact EXE SHA-256 **`3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`**, independently recomputed from ZIP stream and extracted file, equals embedded `.exe.sha256` and Windows candidate receipt.
- ZIP integrity: `unzip -tq` **no errors**.
- Convenience personal trial ZIP SHA-256 `45c987316b6723190e781fd64bdaf744827eb0eca040f29b1b17b92711c89e1c`; the EXE in it was separately recomputed to same original SHA. Includes a local first-use text guide.
- Earlier same-SHA Windows 2022 / Windows 2025 startup, Edge sandbox, cleanup evidence: [run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930). Same-SHA Windows 2025 public homepage render + cleanup: [run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361).
- **Not claimed:** this PC installed it, a real person logged in, a real video was observed, a real model API responded, reliable multi-hour continuous watching, or any autonomous task completed end-to-end.
- Crucial distinction: new `experiment/yutang-first-task-20261115` source integration from commit `33630602aa38e35d015b3b6f8030efda6575ce86` is **NOT PRESENT in this EXE**. Old EXE's own upstream task-conversation and watch paths are separate and already bundled, but their real full task acceptance is pending. Do not substitute new source tests for EXE acceptance.

## Vendor upstream existing functionality

Pinned upstream `LockyBee/dsh-douyin-agent@9c49833078f4b4d18b9211ef86d024e7f2e15739`, `desktop/README.md` Git blob `8cddcbad0e0309a10ea646f9673add4b3b710524`. It documents a self-contained Windows app without Python/Node user install, native model settings, `打开抖音` (dedicated Edge), `任务对话` (manual search/observe/summarize), `允许自动观看` (requires model/schedule/quota), and `一键自检` with redacted report. Agent tool loop lives in upstream `api-agent.mjs`, source Git blob `e7c3f37ad39b29a461ecef1356c86d4de6822ff1`. Current exact EXE's verification receipt explicitly says **`realModelCalled:false`, `realMessageSent:false`**; do not claim such acceptance from it.

For first personal use, keep automatic watching and friend interaction OFF, disable unsolicited sending, double-click extracted EXE, click Open Douyin (user handles any login/captcha), configure owned cloud image-capable LLM Key **inside the app**, and run a ONE-SHOT read-only task asking for 3 s actual observation and factual summary. Never put key into chat or logs. Upload only a sanitized self-check receipt or screenshots for diagnosis. Personal test might spend real model API tokens after the user chooses to enter key and submit task. Ordinary task has no direct comment/DM/like/purchase tool, but interactive feature settings should be checked first.

## Public demos / open-source investigation, no unsupported playback claims

Discovered indexed public descriptions; full Douyin video playback was not available via the current web fetch (cache miss), so these are **video description evidence only**, not first-hand video frame/audio observations:

1. 2026-05-22: [XpertAI live demo — browser-automation searching, clicking, filling and screenshots](https://jingxuan.douyin.com/m/video/7642602012969930011), from public indexed description.
2. 2026-10-21: [Browser Use agent web operation walk-through](https://www.douyin.com/video/7698951810278526242), description stresses observation/actions/results and API/browser costs.
3. 2026-02-01: [OpenClaw overview and computer-command/tool mechanism](https://www.douyin.com/video/7601871581410082747), searchable text/transcript not proof of our real use.

Actual mature MIT framework candidates independently checked against their public source/docs:
- [browser-use/browser-use-pi](https://github.com/browser-use/browser-use-pi): TypeScript agent, persistent V8 worker+CDP, Node >=22.19; supports cloud or existing Chrome. **Do not plug untrusted model-written JS with filesystem and network access into the existing trusted YuTang Edge without separate process isolation, policy and approval.** Also requires model/provider configuration.
- [browserbase/stagehand](https://github.com/browserbase/stagehand): MIT TypeScript framework with `localBrowser.connect` CDP attach; suitable for specific DOM act/extract operations, but adding a second full browser controller duplicates current Playwright and potentially weakens current ownership/sandbox checks. Do not adopt merely for its popularity.
- [browser-use/browser-harness-js](https://github.com/browser-use/browser-harness-js): MIT typed raw CDP calls, but gives broad control not suitable by default for the one-public-video readonly gate.

**Decision:** reuse the existing BrowserController + existing ApiAgent from pinned YuTang upstream first. Draw on mature projects' *design patterns* (observe → decide → act → verify, explicit allowed tools, budgets, receipts), not unreviewed copy/paste or implicit unrestricted browser takeover. Next expansion only when there is a demonstrated task current tools cannot execute. Keep original authors' license and attribution if copying any source; currently no third-party framework code copied in this handoff.

## Current blockers / next practical acceptance

1. On owner's actual Windows PC, verify exact EXE SHA before claiming same candidate identity, launch UI, then click `一键自检`.
2. Inspect dedicated Edge startup and a single authorized public video (read-only first), and record actual tool + render evidence.
3. With explicitly configured personal paid model key and requested task, check actual vision/frame outputs and user-visible answer. Distinguish true frame sampling from title metadata or visible comments; capture anonymized receipt, count and no unwanted sending.
4. If failure, fix **the first real blocked step** and build a **new SHA** only when necessary; never treat earlier same-SHA Windows evidence as a new candidate's acceptance.

No new GitHub Actions run, Windows 2022 job, main branch mutation, EXE rebuild, signed release, login automation, code signing certificate purchase, or auto model/API charges were incurred in this handoff.
