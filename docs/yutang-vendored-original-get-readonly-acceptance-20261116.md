# Original Douyin Comment CLI — verified get-only acceptance adapter

**Status:** offline tested with the exact vendored MIT code, **not tested against live Douyin or the user's Windows computer**. This is a separately opt-in command. Nothing in this directory is started or installed automatically.

## What is actually reused without modification

The following vendor files are imported directly from
`third_party/qinuoyun-douyin-cli-v2/` in the 40-file upstream snapshot:

| Upstream file | Git blob SHA-1 |
| --- | --- |
| `lib/commands/get.js` | `0d39a1e2a52ab09ef1b0d9593db0ebfff5772a5d` |
| `lib/commands/helpers.js` | `1ffc2838a69c50ffec76b2c77182296e574e589e` |
| `lib/client/bridge-client.js` | `c69757008661e13f37707002f1a4bc3a8d666044` |

Upstream: [qinuoyun/douyin](https://github.com/qinuoyun/douyin) commit
`7b0a7ec2792600cff3616191866c4d82309a1e47` (MIT).
Original license: `third_party/qinuoyun-douyin-cli-v2/LICENSE`.
These files are **byte-for-byte identical** to upstream and are not patched.

## New, narrow wrapper

`tools/run-vendored-douyin-get-readonly.cjs` invokes the original
`get.js` with just one page, maximum 20 top-level comments, `--depth 0`
(no nested replies), no raw output, and a no-op audit logger (no disk log).

It rejects malformed IDs before making a network call, including injection
strings that would otherwise be interpolated into the upstream JavaScript
expression. It accepts only exact 10–30 digit video IDs and validates that
the original `get.js` builds exactly
`window.__bridge.getComments('<digits>', 0, <count>)`. The wrapper now
confirms that expression, and only then encloses it in a fixed, no-post
current-page URL guard before `BridgeClient.call()`. An already-connected
Douyin tab MUST be unique and the registered target must match the exact
`https://www.douyin.com/video/<digits>` route. Local host is fixed
to `127.0.0.1`. A nonempty authenticated Bridge token is required; no
tokens, cookies, user names, user IDs, avatars, headers or raw server errors
appear in the output. If a response belongs to another video, fails API
checks, contains malformed data, or has no comments, it reports `blocked`
rather than claiming a successful comment read.

**Important:** this is a **read-only GET request** made through an existing
authorized browser bridge; it is not the earlier passive `page.on('response')`
listener. It does not publish comments, follow users, send messages, log in,
launch Edge, start the Bridge server, or install Tampermonkey.

## Verified offline evidence (not live Douyin)

A separate Linux/Node v22.16.0 sandbox assembled the **exact three upstream
Git blobs** and tested this new wrapper end to end:

```text
node --test tests/vendored-douyin-get-readonly.test.cjs
# tests 14
# pass 14
# fail 0
# skipped 0
```

An actual in-process loopback HTTP test server received **one**
`GET /api/status` preflight followed by **one** `POST /api/call` via the
**unmodified BridgeClient**. The submitted expression is the original
`window.__bridge.getComments('7433523124836060416', 0, 10)` enclosed in a
fail-closed browser-context URL guard. The mock returned a synthetic comment payload; the original
`get.js` parsed it; the wrapper returned only its comment ID and text.
Other tests reject cross-video data, malformed IDs, wrong API status,
missing credentials, unexpected commands, over-limit rows and sensitive
fields. New tests reject zero/multiple Bridge tabs, incorrect registered
video URLs and same-tab SPA navigation; a sandboxed JavaScript VM verifies
that the current-page guard refuses to call `getComments` when the visible
video changes. **No Douyin login or public website was accessed in this test.**
The locally tested source/test files match their committed Git blob SHA-1.

## Requirements for a later real run

A separate execution environment must already have:

- Node.js and a manually provisioned instance of the original MIT Bridge
  server listening locally on `127.0.0.1:19422`;
- The original upstream Tampermonkey userscript installed in an **isolated**
  browser profile; an authorized Douyin session if required by Douyin;
- A matching access token configured on the original server, userscript
  and supplied privately as the **local process environment** variable
  `YUTANG_DOUYIN_BRIDGE_TOKEN`. Never send that token in ChatGPT.

Example only, **do not run until that isolated environment is approved**:

```text
node tools/run-vendored-douyin-get-readonly.cjs 7433523124836060416 --count 10
```

This command does not prompt for credentials and exits with code 2 on
`blocked`. `YUTANG_DOUYIN_BRIDGE_PORT` can point to another local port
for dedicated testing; remote hosts are not accepted.

### Why not automatically turn the copied original on?

The upstream userscript has `unsafeWindow.eval`, broad page access, and
an unmodified original CLI with `post` and `suggest --auto` publishing
commands. Its server can generate a token and write it into runtime
`config.json` at startup, while the userscript has a separate
`CONFIG.token` setting. The vendored source deliberately omitted
upstream's tracked runtime `config.json` and retained the template.

Installing this on the user's daily browser could unintentionally widen
privileges. **This narrow wrapper imports only the original get command and
Bridge HTTP client, not the original main CLI command registry or posting
tools.** Still, the underlying server/userscript remain powerful and require
dedicated environment review before activation.

## Evidence boundary

The user's accepted YuTang 1.4.7 EXE remains unchanged. This is source-only
work on an experimental branch. No new paid CI, main merge, signing, release,
real Windows Edge activity, user login or original Douyin comments have been
verified. Earlier experimental 94 mocked-page tests are separate from the
14 newly executed original-command HTTP tests; they were not all rerun in
one combined test session.

## 2026-11-16 — real connection identity gate and fixed diagnostics

On repeat execution, the original MIT getter, helpers and BridgeClient remained
unchanged and byte-identical to upstream. The opt-in `get` wrapper now:

1. Uses the original client's `GET /api/status` first to require **exactly
   one** alive Douyin site connection whose last registered URL is the
   expected `/video/{id}`; all other outcomes exit with a fixed BLOCKED code.
2. Refuses multi-tab ambiguity rather than blindly using the first registered
   connection (`connIndex=0`). The original userscript only records its URL
   at connect time: this **may be stale** after SPA navigation.
3. Wraps the original getter expression in a fixed `location.href` guard
   inside the browser's page context immediately before the original
   `window.__bridge.getComments` call. This rejects a tab that navigated to
   a different video since registration; it does not send a publish or
   account-management command.
4. Distinguishes `BRIDGE_SERVER_NOT_RUNNING`,
   `BRIDGE_STATUS_UNAVAILABLE`, `TARGET_TAB_NOT_UNIQUE`,
   `TARGET_TAB_NOT_READY`, `TARGET_TAB_ROUTE_MISMATCH`,
   `BRIDGE_TOKEN_REJECTED`, `COMMENT_API_NOT_SUCCESS` and
   `COMMENT_API_BAD_PAYLOAD`. Output contains no token, profile data,
   registered URLs or untrusted server error strings.

**Reproduced validation:** 14/14 actual isolated Node.js tests pass with
unmodified vendored get/HTTP client, including one real local HTTP
status+call sequence and a JavaScript VM test that confirms the in-page
guard blocks stale/incorrect URLs before invoking the getter.
Exact Git blob IDs:
- `tools/run-vendored-douyin-get-readonly.cjs`:
  `602e5581acf239ffd9e041440a1eec237c17fa32`.
- `tests/vendored-douyin-get-readonly.test.cjs`:
  `fbb0fe1b825a1ca659a18381a8c6cd96bba425ec`.

**Outstanding actual site blocker:** the original userscript ships with a
blank `CONFIG.token`, while the original Bridge server can generate a new
token into its local `config.json` during startup. A non-matching token will
produce `BRIDGE_TOKEN_REJECTED` or no registered tab. On an approved
isolated host, the same **privately managed** token must be configured in
server, userscript and runner environment; never copy it into GitHub or chat.
This experimental repo branch has not installed, enabled, or authenticated
that setup on the user's Windows device. No live Douyin comments were read.
