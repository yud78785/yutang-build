# YuTang — read-only attachment to an already running dedicated Edge
**Date:** 2026-11-15. **Status:** source-only, not real Windows/Douyin acceptance, NOT RELEASE.

## What changed

New host-only integration:
- `tools/douyin-existing-browser-readonly.mjs`
- `tests/douyin-existing-browser-readonly.test.mjs`

These compose the previously committed `observePublicCommentsReadOnly` and `inspectDouyinAiSummaryEntryReadOnly` adapters, using the pinned upstream `BrowserController.connectExistingBrowser({signal})` and existing `readPageState` / `readCommentDom` exports. They do NOT call `connect()`, `openBrowser()`, `execute()`, navigate, open tabs, click, scroll, send messages, close the user's Edge, write files, retrieve login credentials, or call a model.

The browser must ALREADY exist, with exactly one context and exactly one owned public video page. The only accepted tab owner labels are `deepseek-douyin-api` / `deepseek-douyin-dsh`, verified by reading `window.name`. Video URLs must belong to `https://www.douyin.com/video/{expectedId}` with no conflicting `modal_id` or `aweme_id`. Duplicate owned pages, inaccessible browser, page switches, missing comments, invalid source receipts, or failed AI iframe evidence are handled explicitly. The wrapper never pretends the AI summary body was generated: `aiSummaryGenerated=false`, `aiSummaryText=null`.

**Integration sketch for a separately reviewed upstream source runtime** (not yet installed in any EXE):

```js
import { BrowserController, readPageState } from './core.mjs';
import { readCommentDom } from './comment-browser.mjs';
import { inspectExistingDedicatedDouyinVideoReadOnly } from './tools/douyin-existing-browser-readonly.mjs';
import { observePublicCommentsReadOnly } from './tools/douyin-public-comment-readonly.mjs';
import { inspectDouyinAiSummaryEntryReadOnly } from './tools/douyin-ai-summary-entry-readonly.mjs';

const receipt = await inspectExistingDedicatedDouyinVideoReadOnly({
  controller: new BrowserController({ source:'api' }),
  readPageState,
  readCommentDom,
  observeComments: observePublicCommentsReadOnly,
  inspectSummary: inspectDouyinAiSummaryEntryReadOnly,
  expectedVideoId: 'A_REAL_10_TO_30_DIGIT_VIDEO_ID'
});
```

Do not paste this source sketch into the user's CMD: the user has a packaged EXE and these new modules are not shipped with it. Upstream `connectExistingBrowser` checks existing profile, PID/port, readiness and liveness but is **not a substitute** for actual Windows process sandbox acceptance.

## Evidence and limits

- **New existing-browser adapter:** 15/15 locally run Node 22.16.0/Linux deterministic mocked-browser tests passed.
- **Prior source-only comment and AI-entry readers:** 39/39 local offline tests passed.
- **Combined 54/54 offline tests**; this is NOT live Douyin, CDP, Windows, actual comment reading or official AI-summary generation acceptance.
- Byte-exact Git blob SHA-1 of new source: `c6cb78af8e91f24b4af5af0d18d8496a196e33a7`.
- Byte-exact Git blob SHA-1 of new tests: `21a8c85709eb3fcf009386a7832c3c0dd93f3865`.
- Existing verified unsigned EXE remains SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- [Windows 2025 genuine public homepage test](https://github.com/yud78785/yutang-build/actions/runs/43643545361) passed earlier; it was **not** a video/comment test.

**Real-world blocker:** the accessible ChatGPT browser tab list has no Douyin page and does not expose the user's standalone dedicated YuTang Edge/CDP session. A public search index contains some Douyin comments, but direct-page fetching returned cache miss and cannot serve as live browser evidence.

**Next real acceptance:** when a verified, already running dedicated Edge tab contains one public `/video/{id}` page, invoke the adapter once from the source host and inspect fixed, redacted receipts. It must not login, open/scroll, click `总结下`, post comments, spend Windows CI quotas or publish without separate authorization. No production EXE, main, signing or release changes were made in this branch.

## Same-URL navigation race fixed (offline)

The original host wrapper checked only that the video URL remained unchanged. A reload of that same URL could invalidate comment and iframe observations while preserving the URL. The wrapper now captures a document identity tuple (the owning window label, `performance.timeOrigin`, and `location.href`) before reading and rechecks it at the end. The tuple is not placed in the output or logs. Any change blocks the entire receipt with `DOCUMENT_CHANGED_DURING_INSPECTION`. A dedicated no-side-effect test simulates a same-URL reload. New integration suite: 15/15 tests pass in local Node; source and test Git blobs above matched the tested bytes.
