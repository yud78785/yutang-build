# YuTang 1.4.7: public comment + official AI-summary entry preflight (source-only)

**Status: offline code and deterministic mocks PASS 39/39. Not real Douyin, Windows, video-comment or AI-content acceptance. Not a release.**

## Immutable Windows baseline, preserved

- [Windows 2025 Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361) passed original EXE public-homepage render and all owned-process cleanup. This proves a public homepage, not a specific video, comments or the AI panel.
- Accepted original unsigned EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`; this branch does not rebuild, modify, sign or publish that EXE.
- Pinned upstream [LockyBee/dsh-douyin-agent@9c498330](https://github.com/LockyBee/dsh-douyin-agent/tree/9c49833078f4b4d18b9211ef86d024e7f2e15739) already has `douyin_open_video`, exported `readPageState` and `readCommentDom`. The comment reader is primarily for published-comment verification; not a dedicated AI summary reader.

## Read-only public comments

`tools/douyin-public-comment-readonly.mjs` calls only three Playwright page evaluations: pinned `readPageState`, pinned `readCommentDom(expectedVideoId)`, `readPageState`. No navigation, click, scrolling, login, posting, model call, file write or network fetch.

Accepts comments only when both states confirm:
- exactly one visible video candidate, no identity conflict or ambiguity;
- pageKind `video` with exact `/video/{id}` on `https://www.douyin.com`, and canonical video URL;
- video ID unchanged, media ready, no private chat, login requirement, verification or unsupported page;
- bounded row count, text length, ID format and deduplication, never more than 20 visible comments.

Empty comment rows mean not observed/loaded, not proof of no comments. The extracted row's video association is inferred from the uniquely visible video and route; native per-comment video binding is **not independently proven**. Incomplete/conflicting evidence is refused. Errors from page evaluate are replaced with fixed, redacted reason codes.

## Douyin AI-summary entry (NOT generated content)

A separate no-click module `tools/douyin-ai-summary-entry-readonly.mjs` checks only whether an independently reported `so-landing.douyin.com/search_ai_mobile/pc` iframe exists on the verified same public-video page and contains exactly one visible `视频总结` label.

- Requires stable verified video state before and after reading, unique allowlisted iframe, a unique visible summary entry, no login/verification/private chat.
- Returns `entry_visible` or `not_observed`, but **always** `aiSummaryGenerated:false` and `aiSummaryText:null`.
- Never clicks the label, opens a panel, sends a prompt, reads credentials or exports private data.
- A comment containing `AI总结` is NOT equivalent to a platform AI-summary response.

Reference researched: [yvesory/douyin-info-pipeline](https://github.com/yvesory/douyin-info-pipeline), which reports the `so-landing.douyin.com` embedded AI iframe and warns that a separate `总结下` comment-input shortcut is not the same thing. This is a **third-party report**, not a fresh independent real-web acceptance. Its script uses positional clicks, a persistent logged-in browser and optional paid vision API; **none of those actions or code were copied** into this source-only branch. Its repository did not expose a LICENSE file during this review.

## Exact-byte local regression

The following committed Git blobs were matched to independently executed local files:

| Path | Git blob SHA-1 |
| --- | --- |
| `tools/douyin-public-comment-readonly.mjs` | `363600b677bc765c8b58fe27f2196df9c7c85e81` |
| `tests/douyin-public-comment-readonly.test.mjs` | `47e9f833c7077148d2f62c103110922fca75876c` |
| `tools/douyin-ai-summary-entry-readonly.mjs` | `7c0175748df8e9a9242f0c8e02b684dea85b4e32` |
| `tests/douyin-ai-summary-entry-readonly.test.mjs` | `1b4c9c8126eac39f52586d341130928efeba39ee` |

Node.js 22.16.0/Linux local check:
```bash
node --check tools/douyin-public-comment-readonly.mjs
node --check tools/douyin-ai-summary-entry-readonly.mjs
node --check tests/douyin-public-comment-readonly.test.mjs
node --check tests/douyin-ai-summary-entry-readonly.test.mjs
node --test tests/douyin-public-comment-readonly.test.mjs tests/douyin-ai-summary-entry-readonly.test.mjs
```
**Result: 39 passed / 0 failed / 0 skipped**, mocked browser objects only. This is NOT a real browser/Windows acceptance.

## Next verifiable milestone

Run against one authorized publicly accessible Douyin video on a dedicated verified browser. First prove source, video ID and comments are visible without new login or automated scrolling. Then observe, but do not click, the allowlisted AI iframe/entry and report either verified presence or not observed. Actual AI-generated content requires separate real evidence. Do not infer support from a label or an imitation comment.

No GitHub Actions workflow was added/modified. No paid CI invoked by these changes. Do not merge to `main`, deploy, sign, release or change user computer state.

## 2026-11-14 independent read-only audit — 5 additional regression tests

The exact branch source files were independently reproduced in an isolated Node 22.16.0/Linux container, syntax checked, and tested **39/39 pass, 0 fail, 0 skipped**. The committed Git blob SHA-1 hashes above match the independently tested bytes.

Concrete issues fixed without touching the Windows executable:

1. Reject a public `/video/{id}` URL when its `modal_id` or `aweme_id` query conflicts with the expected video, rather than attributing the wrong video's comments.
2. Reject malformed non-boolean `pending`, `failed`, `sent`, or `mine` status fields; these are expected to be booleans in the pinned upstream DOM reader.
3. Re-read the allowlisted AI iframe list after the main page's final identity check. Reject iframe navigation or replacement that happens after seeing the summary label.
4. Validate **every** bounded visible comment row before returning only the first N rows; a late row from another video now invalidates the entire result.
5. Test iframe replacement, navigation, conflicting modal IDs, malformed status flags, and late cross-video rows.

There was no fresh real-Douyin / Edge / Windows execution during this audit. A public video at [Douyin video 7690838060090547919](https://www.douyin.com/video/7690838060090547919) appeared in a web search index with some comment text, but a direct page retrieval failed with a cache miss; that search index is **not** valid real-browser, comment-DOM or AI-summary acceptance. The current linked browser tab list has no Douyin tab. The isolated container has Chromium installed but outbound DNS is unavailable. This test branch contains no active paid CI workflow.

**Outcome:** branch source/mocks pass 39/39; real public-video and AI iframe site evidence remain unverified and must never be reported as PASS.
