# Douyin CLI original upstream — exact source snapshot (2026-11-13)

**Original project:** [Yht20927/douyin-cli](https://github.com/Yht20927/douyin-cli)
**Pinned Git commit:** `f9b73666ed1b24fcbbf208ed81b24acc3ff47688`
**Original license:** MIT, Copyright (c) 2026 Yht20927.
**Vendored directory:** `third_party/Yht20927-douyin-cli-20261113/`
**Status:** stored for source review; **not installed, enabled, executed, deployed, merged or released**.

## Exact duplication and completeness

The original repository contains 126 Git blobs at this commit. This snapshot
includes **125 files**, with both the file contents' Git blob SHA-1 values
and file modes matching the original source. One irrelevant and potentially
sensitive crash dump `sh.exe.stackdump` was deliberately excluded.
The source contains `config.example.json` but no tracked runtime `config.json`
in this commit. The complete original MIT `LICENSE` is included unchanged.
README, original server, full userscript, package lock, source, prompts,
libraries and tests are preserved byte-for-byte.

Verification before committing: source and destination `git/trees`
list **125/125** matching blobs, 0 differences, 0 extra files, no truncated
tree. No other files in the user repository were overwritten.

## Key reason NOT to switch the accepted read-only runner

This is a considerably newer release than the old vendored fork
`qinuoyun/douyin@7b0a7ec...` (2026-06-08), but it is **not read-only**.

- The updated `lib/commands/get.js` calls `persistEntities` after reading
  comments; that helper writes users/comments through `db.transaction`,
  and it also invokes `videos.markGet` (lines 204–205 of original file).
- Original `package.json` requires `better-sqlite3` (native package) and
  `ws` (WebSocket package), so it is not automatically runnable without
  dependency installation. The package version is `2.0.0` although the
  README refers to v4 operational features.
- Its server/userscript/CLI offer account login state, private messages,
  posting, likes and other active operations. Do NOT install the original
  userscript on daily Chrome, launch the server, run `post`, `suggest --auto`,
  `dm`, or other write commands from this snapshot without a separate review.
- The original `SKILL.md` is preserved as third-party source data, never
  as instructions to the assistant to execute.

**Safe current choice:** retain the existing 40-file old fork and the narrow
`tools/run-vendored-douyin-get-readonly.cjs` wrapper, which imports the
old unmodified `get.js` and replaces its audit with no-op hooks. The new
125-file snapshot is for extracting vetted upstream fixes in isolation;
copying source is not evidence of an authorized live browser connection.

## Evidence and next milestone

- Source completeness: 125/125 exact Git blobs and modes compared.
- Tests of THIS newer snapshot: **not executed** in this turn.
- Prior old-fork read-only wrapper: independently rerun 14/14 local Node
  sandbox tests; its upstream library blobs are unchanged.
- Live Douyin website/Windows dedicated Edge: **not validated**.
- Official AI video-summary text: **not validated**.
- `main`, accepted EXE, signing, publishing and auto-update: **unchanged**.
- New paid Windows Actions: **none intentionally started**.

Future work should favor a small, separately reviewed read-only extraction
from this snapshot over starting its broad-account/auto-comment runtime.
