# YuTang | Existing Windows Edge → visible Douyin public comments, without npm

**Release scope:** source-only experimental branch and optional 11 KB ZIP.
**Status:** 16/16 offline Node.js tests passed, **real Windows Douyin NOT VERIFIED**.

## Purpose and difference from earlier attempts

This path no longer needs the whole pinned upstream Git checkout, Playwright,
npm install, a Tampermonkey Bridge, a Douyin API request, user login
automation, or a GitHub Actions runner.

It uses Node.js 22.13+ built-in `WebSocket` to make a short-lived CDP
(Chrome DevTools Protocol) read of an **already open** video tab on the
**already running** dedicated Edge browser.

The goal is narrow: **read at most 12 currently visible, already loaded
public comment rows**, nothing else. It does not scroll to load missing
comments. An empty result means comments were not observed, **not** that
the video has no comments. It does not retrieve official AI-summary text.

## Files in the branch

- `tools/diagnose-existing-douyin-edge.mjs` — existing standalone host/port
  ownership check, Git blob `003c0950bd66930feb60f886116f2306e7fceadc`.
- `tools/read-existing-douyin-comments.mjs` — NEW fixed-expression, no-npm
  CDP public comment reader, Git blob `0e08e42c33e443bd7cb44952e17bfe4c2e2c3556`.
- `tests/read-existing-douyin-comments.test.mjs` — 16 executed tests,
  Git blob `7ab1df6521ae0f74d4ee7e27422451892734e36f`.
- `tools/run-readonly-interactive.mjs` — prompts for the numeric video ID
  directly inside Node, without putting it in CMD shell syntax.
- `run-read-only.cmd` — Windows one-click launcher in the repository ROOT.

An optional ZIP contains the two core scripts plus the interactive wrapper,
CMD launcher, README and SHA-256 checksums, with no EXE, binary or secret.

## Run it on Windows

On a Windows machine where the upstream project-owned dedicated Edge browser
has already been started and displays the intended public video:

1. Extract the ZIP into a folder (no installation required).
2. Double-click `run-read-only.cmd`.
3. Enter the **10–30 digit video ID** in the Node prompt.
4. Inspect the JSON receipt in the same CMD window.

The ZIP runner does not download updates, install packages, change browser
settings, launch a browser, or call external services.

For a clean repository checkout, equivalent CLI:

```powershell
node tools/read-existing-douyin-comments.mjs --video-id 7512345678901234567
```

The video ID in this example is a syntax fixture; it is **not evidence of
an accessible live Douyin work**.

## Trust and privacy checks

1. Reuses the previous diagnostic to check dedicated
   `%USERPROFILE%\.dsh\douyin-browser\control\browser.json`,
   live host PID and start time, profile, port `127.0.0.1:9227`,
   browser CDP version, and one matching tab metadata entry.
2. Refuses operation when a previous `tab-api.lock` exists.
3. Checks other candidate upstream tabs (`about:blank`, public Douyin and
   numeric live-room pages) for **only** their `window.name` ownership label.
   Private/offsite tabs are never evaluated for DOM content.
4. Requires exactly one page with pinned upstream ownership label
   `deepseek-douyin-api` or `deepseek-douyin-dsh`; the page URL and the
   target video must match.
5. Restricts CDP WebSocket addresses to loopback port 9227 and exact page IDs.
   Sends a fixed `Runtime.evaluate` DOM-read expression, not arbitrary user JS,
   with no user gesture; never invokes clicking, scrolling, navigation,
   sending, login, post, private messaging or Douyin APIs.
6. In the page, requires one visible ready video, no visible private-chat or
   verification overlay, and discards any comment rows explicitly bound to
   another video. Uses `innerText` of the visible comment-content node rather
   than potentially hidden `textContent`.
7. Returns only public comment ID/text, at most 12 rows, max 120 characters
   per comment. No nicknames, author IDs, cookies, URLs, history or headers.
8. Rechecks tab ownership, browser readiness and lock after reading; rejects
   stale or cross-video results rather than leaking them.

The read uses CDP page WebSockets, so local read privileges are still
sensitive. This is an **opt-in standalone diagnostic for the user's
project-owned Edge profile only**, not a general browser-control plugin.
It does not offer unrestricted code execution or remote inbound access.

## Executed evidence and remaining gap

Isolated Linux Node.js 22.16.0:

```text
node --test tests/read-existing-douyin-comments.test.mjs
# tests 16
# pass 16
# fail 0
# skipped 0
```

One test ran the actual built-in Node `WebSocket` client against a real
local test server with CDP-style WebSocket upgrade and exactly one
`Runtime.evaluate` message. Other tests execute the fixed DOM extractor
in a JavaScript VM, verify source-video guards, forbidden sites, lock
handling, zero comments, cross-video rows, privacy, and page-owner changes.
Invalid shell-like video input was also separately tried in the interactive
launcher, and was rejected before any browser connection.

**NOT tested:** real Windows Edge/host profile, target page CDP WebSocket,
live Douyin comment DOM, official AI-generated summary, or a normal
Windows double-click. The local mock CDP server is **not Douyin**.

No new paid Windows CI, GitHub Actions runs, main merge, EXE change,
updater change, live site login or real account interaction was performed.
Do not mark it as Windows or Douyin LIVE PASS without a real host receipt.
