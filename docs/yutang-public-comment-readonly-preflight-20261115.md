# YuTang: public video/comment read-only preflight (source-only)

**Evidence status: offline only.** The implementation is isolated on an experimental branch. Do not run Windows CI, modify the accepted EXE, merge, sign, publish or enable browser automation based on this source-only result.

## Existing verified baseline

- Public homepage Windows 2025: [GitHub Actions Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361) emitted `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY`. This is not a video or comment acceptance.
- Original unsigned EXE SHA-256: `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Pinned upstream [LockyBee/dsh-douyin-agent@9c498330](https://github.com/LockyBee/dsh-douyin-agent/tree/9c49833078f4b4d18b9211ef86d024e7f2e15739) already defines `douyin_open_video`, `readPageState` in `core.mjs`, and `readCommentDom` in `comment-browser.mjs`. The latter is primarily a public-comment post-receipt checker; it is not an AI-summary reader.

## New candidate source-only helper

- `tools/douyin-public-comment-readonly.mjs` exports `classifyPublicCommentEvidence` and `observePublicCommentsReadOnly`.
- In the narrow adapter, only three existing `page.evaluate` operations run: `readPageState`, `readCommentDom(expectedVideoId)`, `readPageState`. No navigation, click, scroll, comment submission, login, messages, model API, or persistent storage.
- Fail-closed on login, challenges, private chat, off-origin state, wrong/changed video, unready video, untrusted rows; cap at 20 comments and 512 characters per comment.
- Empty visible rows mean not visible / not loaded, never evidence that the video has zero comments.
- The platform's **AI summary has not been inspected**. The result deliberately reports `aiSummary.verified=false`, even if a comment claims to be an AI summary. It cannot manufacture a platform-provided summary from comment text.

## Exact offline checks

- `node --check tools/douyin-public-comment-readonly.mjs`
- `node --check tests/douyin-public-comment-readonly.test.mjs`
- `node --test tests/douyin-public-comment-readonly.test.mjs`

The initial standalone local source and deterministic mocked-page tests ran with Node 22.16.0 on Linux: **17/17 PASS, 0 failed**. These are not real Windows/browser tests; re-run on the committed exact bytes before integration.

## Next acceptance boundaries

1. Load one authorized, **public** Douyin video using a dedicated browser already attributed to the candidate. Do not sign in or bypass verification.
2. Verify expected video ID, origin and actual state; read currently visible public comment rows only. Never automatically open comments or scroll without a separately reviewed interaction.
3. Detect actual visible AI-summary content through its own source and label, separately from ordinary comments; if it does not appear, return not observed.
4. Verify dedicated Edge/browser-host/API worker/CDP cleanup, retaining the original EXE SHA and fail-closed safeguards.

**No GitHub Actions workflow is added, and the original Windows EXE is unchanged.**
