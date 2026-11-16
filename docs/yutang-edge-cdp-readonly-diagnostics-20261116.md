# YuTang — standalone existing Edge diagnostics (no installation)

**State:** source and tests complete; actual Windows host / Douyin website **not yet checked**.

This optional Node.js 22.13+ tool runs in one process and has no npm
dependencies. It does not import the broad Douyin upstream runtime, open a
browser, navigate, click, call a Douyin API, inspect page DOM, write a
credential or alter any host state.

## Exact pinned upstream constants

Checked against MIT `LockyBee/dsh-douyin-agent` at
`9c49833078f4b4d18b9211ef86d024e7f2e15739`:

- `core.mjs`: `PORT = 9227`; `connectExistingBrowser` requires an
  owned ready `browser.json`, a live process and responsive
  `http://127.0.0.1:9227/json/version`.
- `runtime-paths.mjs`: default browser control directory is
  `%USERPROFILE%\.dsh\douyin-browser\control`; dedicated profile is
  `%USERPROFILE%\.dsh\douyin-browser\cli-profile`.
- `browser-host.mjs`: browser owner state includes `pid`, `profile`,
  `port`, `ready`, `startedAt`, `instanceId`. Unlike a bare TCP
  connection, this allows a host-ownership check.

## Code

- `tools/diagnose-existing-douyin-edge.mjs`
- `tests/diagnose-existing-douyin-edge.test.mjs`

To run a read-only owner/connection check **on an already configured Windows
host** from the repository root:

```powershell
node tools/diagnose-existing-douyin-edge.mjs
```

To also inspect **target-tab metadata** for a public video ID:

```powershell
node tools/diagnose-existing-douyin-edge.mjs --video-id 7512345678901234567
```

The ID shown above is a **format example**, not a claim that this video is
public or accessible. Use the actual intended work ID. Do not run an
installation/update script or start a browser for this diagnostic.

The diagnostic reads only its dedicated host's `browser.json`, confirms
its profile and port, checks the process PID and Windows process start time,
and then queries only the local CDP `/json/version`. With an ID, it reads
`/json/list` and filters for a matching public-video route. It never
returns other tab URLs, PID, Windows paths, tokens, account names or cookies.

When the owner record does not exist, the tool makes at most a short TCP
connection attempt to localhost port 9227 to distinguish a free port from
one occupied by an **unverified** process; it never fetches a foreign
browser's CDP endpoints. Process birth time is read using the built-in
Windows PowerShell process API. No elevation is required.

## Read-only receipt levels

| status | Meaning |
| --- | --- |
| `blocked` | Host, owner, port, process, version or target metadata not verified; see `reasonCode` |
| `edge_host_ready` | Dedicated process identity and CDP version verified; **no video contents read** |
| `target_video_metadata_seen` | One matching `/json/list` target URL; **`window.name`, visible comments, AI entry and session are NOT verified** |

Common block codes:
`DEDICATED_BROWSER_NOT_RUNNING`,
`PORT_OCCUPIED_OWNER_UNVERIFIED`,
`DEDICATED_OWNER_RECORD_UNVERIFIED`,
`DEDICATED_HOST_PROCESS_NOT_RUNNING`,
`HOST_PROCESS_BIRTH_UNVERIFIED`,
`HOST_PROCESS_IDENTITY_MISMATCH`,
`DEDICATED_CDP_ENDPOINT_UNREACHABLE`,
`DEDICATED_CDP_VERSION_UNVERIFIED`,
`TARGET_VIDEO_TAB_NOT_FOUND`,
`TARGET_VIDEO_TAB_AMBIGUOUS`,
`CDP_TARGET_LIST_UNVERIFIED`.

A positive readiness result **never** means the work's comments or official
AI video-summary text are available. The existing source-only
`tools/run-douyin-existing-browser-readonly.mjs` remains the deeper
one-shot, owned-page DOM/AI-entry reader once the real Windows host and
upstream checkout are ready and independently authorized.

## Exact source verification and tests

Offline isolated Node.js 22.16.0 / Linux, against the same UTF-8 bytes
that were committed:

```text
node --test tests/diagnose-existing-douyin-edge.test.mjs
# tests 16
# pass 16
# fail 0
# skipped 0
```

Tests include **real loopback HTTP and TCP connections** to an in-process
fixture server, a CLI subprocess, wrong owner/profile/port/PID, process
birth mismatches, first-party video route matching, duplicate tabs and
private-tab metadata redaction. The injected Windows records and version
responses in tests are simulated; they are **not an actual Windows Edge**.

Git blob SHA-1:
- Source `003c0950bd66930feb60f886116f2306e7fceadc`.
- Tests `8de065fde6dc12dc7687f83ad7b99772dfd83a90`.

No modifications to `main`, approved EXE, userscripts, cookies, data,
real Douyin website or Windows Actions were requested or performed.
No paid CI and no background automation.
