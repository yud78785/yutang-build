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

- **New existing-browser adapter:** 23/23 locally run Node 22.16.0/Linux deterministic mocked-browser tests passed.
- **Prior source-only comment and AI-entry readers:** 39/39 local offline tests passed.
- **Combined 77/77 offline tests (including 15 CLI tests)**; this is NOT live Douyin, CDP, Windows, actual comment reading or official AI-summary generation acceptance.
- Byte-exact Git blob SHA-1 of new source: `b39372e846fcd1931ecc23d41c04e5b6240329f5`.
- Byte-exact Git blob SHA-1 of new tests: `35bbdcc356c8982fef8cc90b0a6f1551f386d46c`.
- Existing verified unsigned EXE remains SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- [Windows 2025 genuine public homepage test](https://github.com/yud78785/yutang-build/actions/runs/43643545361) passed earlier; it was **not** a video/comment test.

**Real-world blocker:** the accessible ChatGPT browser tab list has no Douyin page and does not expose the user's standalone dedicated YuTang Edge/CDP session. A public search index contains some Douyin comments, but direct-page fetching returned cache miss and cannot serve as live browser evidence.

**Next real acceptance:** when a verified, already running dedicated Edge tab contains one public `/video/{id}` page, invoke the adapter once from the source host and inspect fixed, redacted receipts. It must not login, open/scroll, click `总结下`, post comments, spend Windows CI quotas or publish without separate authorization. No production EXE, main, signing or release changes were made in this branch.

## Same-URL navigation race fixed (offline)

The original host wrapper checked only that the video URL remained unchanged. A reload of that same URL could invalidate comment and iframe observations while preserving the URL. The wrapper now captures a document identity tuple (the owning window label, `performance.timeOrigin`, and `location.href`) before reading and rechecks it at the end. The tuple is not placed in the output or logs. Any change blocks the entire receipt with `DOCUMENT_CHANGED_DURING_INSPECTION`. A dedicated no-side-effect test simulates a same-URL reload. New integration suite: 15/15 tests pass in local Node; source and test Git blobs above matched the tested bytes.

## 2026-11-15 — optional one-shot source CLI (isolated preflight only)

A previously missing executable entry now exists in this experimental source branch:
- `tools/run-douyin-existing-browser-readonly.mjs` (Git blob SHA-1 `928fca3f91430caba790f26d92578789623a7aa9`)
- `tests/douyin-existing-browser-cli.test.mjs` (Git blob SHA-1 `9498763644db6b88809063b59d11bf4acf19c219`)

The entry supports exactly `--video-id` (10–30 decimal digits) and `--upstream-root` (absolute path). It refuses non-Windows hosts, Node below v22.13, missing upstream source, non-matching Git HEAD, dirty tracked files, missing upstream exported functions, disconnected dedicated Edge, or an unowned/unverified public video tab. Pin: upstream `LockyBee/dsh-douyin-agent@9c49833078f4b4d18b9211ef86d024e7f2e15739`.

On a **separately authorized Windows source checkout that already exists**, an executor could run:

```text
node tools/run-douyin-existing-browser-readonly.mjs --video-id <verified-public-video-id> --upstream-root <absolute-clean-upstream-source-checkout>
```

**Not a command for end users to execute now:** this branch is not inside the accepted Windows EXE, and the user's current desktop cannot be operated from this ChatGPT conversation. The command does not install or launch a browser, create tabs, navigate, login or click; it only attempts to connect an existing verified profile and prints one redacted JSON receipt. Any receipt without actually visible comments or an AI-entry observation exits with code 2, without claiming that a live read happened. When the runner exits it drops its own CDP connection without calling `browser.close()`, so it does not intentionally close the existing Edge.

**Exact-byte regression:** Node.js 22.16.0 on isolated Linux; 14/14 additional checks pass, including a real spawned CLI invocation that correctly returned `WINDOWS_REQUIRED`, and explicit refusal of a wrong-Git-commit local checkout. Combined with 39 earlier reader checks and 19 existing-browser tests, **77/77 pass, 0 failed**. This does NOT constitute a live Windows browser test or a real Douyin comment/iframe validation. No EXE changed, no paid Windows CI triggered, no `main` changes, no signing or release.

**Known limitation:** upstream source runtime dependencies must already be present; this branch does not install them. The CLI's Git HEAD/working-tree check is a source-version guard, not an audit of every installed dependency. Real site screenshots, comments and AI summary contents remain unverified.

## 2026-11-15 — second independent audit: false-success and cross-tab race fixes

**Current source-only regression:** Node 22.16.0/Linux, **72/72 pass, 0 fail**, plus direct invocation of the CLI returning a truthful `WINDOWS_REQUIRED` receipt and exit code 2 in this isolated environment. These are mocked browser tests, not actual Windows or Douyin execution.

Two externally significant defects were reproduced and repaired:

1. **Duplicate owner cross-video false acceptance.** The earlier helper counted only tabs already at the expected video. Tests created a second owned public Douyin tab on a different video or homepage: two tests **failed on the pre-fix code**, showing false acceptance. The fixed helper scans only public Douyin tabs for the pinned upstream owner labels before reading, and again after reading. A new owned tab created while reading invalidates the entire receipt. Unrelated private/off-origin pages are not inspected.
2. **Empty evidence reported as success.** The earlier wrapper returned `read_only_evidence` when both visible comments and AI-summary entry were absent. The fixed wrapper returns `no_visible_evidence` with `NO_PUBLIC_COMMENTS_OR_AI_ENTRY_VISIBLE` instead. The standalone CLI now exits 2 for every status other than `read_only_evidence`; it does not elevate an empty page to PASS. Seeing an AI entry only does not imply the AI-generated summary text was read.

**Exact Git blob IDs for the tested updated files:** `tools/douyin-existing-browser-readonly.mjs` = `b39372e846fcd1931ecc23d41c04e5b6240329f5`; corresponding tests = `35bbdcc356c8982fef8cc90b0a6f1551f386d46c`; `tools/run-douyin-existing-browser-readonly.mjs` = `928fca3f91430caba790f26d92578789623a7aa9`; corresponding CLI tests = `9498763644db6b88809063b59d11bf4acf19c219`.

**Important remaining race:** upstream `core.mjs` uses the disk-backed `tab-api` operation lock. This no-write probe deliberately does **not** acquire that lock, because acquiring it would create and delete lock files on the user's machine. Pre/post tab and document identity checks reduce stale-result risk but **do not provide transactional isolation** from concurrent upstream operations. Do not claim full race freedom or production acceptance; do not run against an active autonomous-watch session without separate review.

The Windows user currently has a packaged EXE; the source-only CLI requires an existing clean pinned upstream source checkout and its dependencies, so it is not a one-click update for that EXE. A real Windows Edge / Douyin public-video observation remains the only decisive acceptance milestone. No paid CI, `main` changes, EXE modification, signing or publishing occurred in this experiment.

## 2026-11-15 — upstream cooperative operation lock is now mandatory in the candidate

The earlier source-only wrapper detected page changes and competing tabs but **did not hold upstream's own operation lock**. This was a known gap: a second agent could navigate the same tab between DOM observations while still satisfying some checks. The updated wrapper now requires an injected `acquireReadLock` provider. The one-shot runner verifies that the pinned upstream module exports `acquireBrowserOperationLock` and acquires `tab-api` (the same lock name as `browserPageLock('api')`) before enumerating tabs or extracting comments, with a 4000 ms acquisition deadline. The lock is released even when the observation returns `blocked`; errors in acquisition or release invalidate all evidence. New tests prove the ordering and redaction.

**Important correction to earlier "no filesystem writes" claim:** this candidate **will write and remove a short-lived `tab-api.lock` file in the upstream browser-control directory** when the source runner is actually invoked on Windows. This is coordination state, not a Douyin post or a persistent settings change. `wroteByThisProbe:false` was removed from the public receipt to avoid misleading claims. The result now reports `temporaryOperationLockUsed:true`, successful cleanup evidence only after the release function returns normally, and `persistentDataModifiedByThisProbe:false`. An unsuccessful release produces `UPSTREAM_OPERATION_LOCK_RELEASE_FAILED` with `temporaryOperationLockCleanupVerified:false`. The source branch has not been executed on the user's Windows machine.

**Concurrence is cooperative only.** Locking blocks other upstream actions that use the same `tab-api` mechanism. It does not freeze manual clicks in Edge or third-party actions that bypass the lock. All video, URL, document-epoch and iframe checks remain necessary; this is not a claim of full concurrency race elimination.

Local Node 22.16.0/Linux regression, same candidate file bytes as the four committed source/test Git blobs: **77 tests passed; 0 failed; 0 skipped.** Prior 72 remain unchanged in meaning and five new tests cover missing lock provider, busy/acquire failure, safe release on blocked reads, release failure sanitization, and pinned upstream export absence. No Windows CI invoked; no `main`, EXE, deployment, login, or paid model usage.
