# YuTang 1.4.7: public comment + official AI-summary entry preflight (source-only)

**Status: offline code and deterministic mocks PASS 34/34. Not real Douyin, Windows, video-comment or AI-content acceptance. Not a release.**

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
| `tools/douyin-public-comment-readonly.mjs` | `a4ef305e96a78e0a7778bce6f47dd788a3aff634` |
| `tests/douyin-public-comment-readonly.test.mjs` | `018626c3d2dc73e19532a497b5a33e4fb4b902fe` |
| `tools/douyin-ai-summary-entry-readonly.mjs` | `80a284c28b255a5bf266dafaeacd578bac27260a` |
| `tests/douyin-ai-summary-entry-readonly.test.mjs` | `17c4b9e27f3273c1d76c4109df251729b3939478` |

Node.js 22.16.0/Linux local check:
```bash
node --check tools/douyin-public-comment-readonly.mjs
node --check tools/douyin-ai-summary-entry-readonly.mjs
node --check tests/douyin-public-comment-readonly.test.mjs
node --check tests/douyin-ai-summary-entry-readonly.test.mjs
node --test tests/douyin-public-comment-readonly.test.mjs tests/douyin-ai-summary-entry-readonly.test.mjs
```
**Result: 34 passed / 0 failed / 0 skipped**, mocked browser objects only. This is NOT a real browser/Windows acceptance.

## Next verifiable milestone

Run against one authorized publicly accessible Douyin video on a dedicated verified browser. First prove source, video ID and comments are visible without new login or automated scrolling. Then observe, but do not click, the allowlisted AI iframe/entry and report either verified presence or not observed. Actual AI-generated content requires separate real evidence. Do not infer support from a label or an imitation comment.

No GitHub Actions workflow was added/modified. No paid CI invoked by these changes. Do not merge to `main`, deploy, sign, release or change user computer state.
