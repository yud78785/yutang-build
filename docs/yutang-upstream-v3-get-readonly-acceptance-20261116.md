# YuTang — Latest upstream Douyin Bridge v3, read-only comment probe

**Status: source-only experimental implementation.** Node v22.16.0 isolated
Linux test: **18/18 passing** (0 failed, 0 skipped). No Windows Edge or
live Douyin comment session was accessed. This is **not** production or
live-site acceptance.

## What is actually new

`tools/run-upstream-douyin-get-readonly.cjs` uses the **unmodified**
MIT-licensed `BridgeClient` from
`third_party/Yht20927-douyin-cli-20261113/lib/client/bridge-client.js`
(pinned upstream [Yht20927/douyin-cli](https://github.com/Yht20927/douyin-cli)
commit `f9b73666ed1b24fcbbf208ed81b24acc3ff47688`).

The latest upstream `lib/commands/get.js` was **intentionally not imported**:
it calls `persistEntities`, which writes users/comments to SQLite through
`db.transaction`, plus `videos.markGet`. Its `better-sqlite3` native
dependency and all account, profile, publish, DM and campaign tools are
not needed or used by the new read-only entry.

The original BridgeClient performs a real `GET /api/status`, followed by
at most **one** `POST /api/call` carrying only the expression that invokes
existing page `window.__bridge.getComments(videoId, 0, count)`.
This performs one public-comment **GET** through the existing authorized
session; no browser is started, no login is automated, no audit/SQLite files
are written and no comments are posted.

The `POST /api/call` transport is **not** a social write: the request's
`opType:'read'` is pinned, the JavaScript expression calls only
`getComments`, and `noThrottle:false`. The program performs only one
page of up to 20 comments and has no generic eval, post or DM command input.

## Connection and account checks

- The new server's status schema must contain both `connections` and
  `accounts`; the target connection must be alive and userscript
  `clientVersion=3`.
- Without `--account`, **exactly one alive Douyin connection** is allowed.
  With `--account`, the specified numeric UID must identify one unique
  registered target; unknown/multiple connections are rejected instead of
  rotating to another account.
- The target's channel, connection ID, account and registered exact
  `https://www.douyin.com/video/{id}` route are cross-checked. Inside the
  browser the current `location.href` is checked **both before and after**
  the awaited getter, so SPA navigation to a different video discards the
  comments. `response.account` must match the selected UID.
- Raw API fields such as `user`, `nickname`, `uid`, avatars, cookies and
  headers remain in the browser; only bounded `commentId` and public
  comment `text` are returned. The program rejects invalid or cross-video
  data and never echoes account/token details in output.

## Verified offline evidence

One locally bound mock HTTP server received the actual unchanged
`BridgeClient` requests and verified explicit account, read-only
operation type, first-page limit and the secret being restricted to
the HTTP Authorization header. A JavaScript VM executed the generated
browser expression with fake page context and confirmed its refusal of
a switched video, mismatched modal ID, non-Douyin origin and cross-video
comments. No live Douyin content was accessed.

```text
node --test tests/upstream-douyin-get-readonly.test.cjs
18 tests / 18 passing / 0 failing / 0 skipped
```

Exact code/test byte audit:

| File | Git blob SHA-1 |
| --- | --- |
| New read-only runner | `ed93ac5ec4b2783d56c0aa6cf7cfd695f59d5266` |
| Its 18 tests | `bc45980c20e76ad68b2e6d0ccc4ad74094871e65` |
| Unmodified MIT upstream BridgeClient | `5c7fd38f25c27f198a2ea5021343ed3c9376fd3e` |

The older fork's independent 14 test results and separate 94 mocked
browser checks are historical baselines, not included in this 13-test
run. Do not add their counts as if they ran together.

## Windows example — only after isolated host approval

On a separate authorized host with the matching upstream Bridge v3
server/userscript already configured and one authorized `/video/{id}`
page connected, a local process can set its Bridge token *privately* in
`YUTANG_DOUYIN_BRIDGE_TOKEN` and invoke:

```text
node tools/run-upstream-douyin-get-readonly.cjs 7433523124836060416 --count 10
```

For multiple connected Douyin accounts, also specify
`--account <numeric-UID>` to prevent server read rotation. Tokens must
not be pasted into ChatGPT, committed to GitHub or included in logs.
Optional `YUTANG_DOUYIN_BRIDGE_PORT` is strictly a local loopback port.
A blocked receipt exits 2 with a fixed reason code.

**Do not install the original Tampermonkey userscript on the user's
everyday browser, launch the full server, create a login, merge main,
change the approved EXE, or trigger paid Windows CI as part of this source
drop.** Upstream Bridge contains broad eval/posting capabilities; this
narrow runner alone does not remove privileges from a separately
installed full upstream server and userscript.

**Remaining proof gap:** real Windows Bridge v3, a currently opened public
video, first-party comment GET response, official AI summary content and
actual endpoint behavior have not been independently verified in this
session. No current shared Douyin browser tab was available.

## 2026-11-16 — critical read dedup fix, reproduced before repair

The pinned upstream v3 server `lib/server/router.js` dispatches eval through
WebSocket first. If its pending response exceeds the configured timeout, the
router falls back to HTTP polling. A **late first response** can therefore
cause the same eval to execute twice. A single `POST /api/call` from the
runner does *not* by itself guarantee one request to the Douyin site.

One additional test used the exact *same browser eval string twice*
(concurrent WS / HTTP dispatch). Before the fix, the fake
`window.__bridge.getComments` was actually invoked **twice**, and the test
failed (2 !== 1). The fixed read-only runner now:

- Generates an unpredictable `crypto.randomUUID()` for **each invocation**,
  embeds the same ID in the one expression submitted to the Bridge, and
  rejects any malformed task ID before generating eval text.
- Uses an ephemeral `Symbol.for('yutang.public_comment_readonly_once.v1')`
  map on the existing page. A second evaluation of the **same** expression
  reuses the first pending/completed promise instead of invoking
  `getComments` again.
- Rechecks the exact current video route **after** awaiting either the
  original or shared promise. If navigation changed the video, the cached
  result is rejected. A different fresh task ID is never treated as a
  duplicate.
- Limits cache size to 32 entries, keeps them at most 120 seconds, and uses
  a page-local cleanup timer when available. This creates **transient
  in-page memory state**, but no persistent account/DB/browser-profile writes.
  It does not install or activate a userscript.

After the fix, all **18/18** isolated Node v22.16.0 tests pass, including
the red-to-green retry regression, late retry, different ID isolation,
untrusted task ID refusal and video switching. Exact Git blob SHA-1:
runner `ed93ac5ec4b2783d56c0aa6cf7cfd695f59d5266`;
tests `bc45980c20e76ad68b2e6d0ccc4ad74094871e65`.

**Limit:** This protects only repeated dispatch of the identical expression
inside one still-running page. It cannot deduplicate across page reloads,
different browser profiles or separate fresh task IDs, and has **not** been
tested on a live Douyin page. Do not claim globally exactly-once API calls.

### Previously hidden upstream credential hazard

The pinned original `scripts/douyin.user.js` contains a **nonempty
literal bearer token** in its `CONFIG.token` field. It is committed to
public upstream source, so it must be treated as exposed, not a trusted secret.
Separately, the upstream `server.js` generates a random local token when
config is unset. Installing these files unchanged can lead to mismatched
authentication and exposure of the credential.

The vendor snapshot is retained byte-for-byte for review only. **Do not
install the original script or reuse its embedded value.** A future isolated
deployment must remove the embedded value, provision a distinct local token
privately and review the broad `unsafeWindow.eval`, public `/api/status`
and account-data access surfaces before enabling the full Bridge. Do not ask
the user to paste any credentials into the chat.

**Original upstream v3 requires an authenticated Douyin account connection.**
It is not a proven login-free public video/comment/AI-summary solution;
if a login-free workflow is required, the separately developed existing
Edge/CDP passive reader remains the candidate, pending real Windows access.
