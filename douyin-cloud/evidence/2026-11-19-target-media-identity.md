# Target-media identity acceptance — 2026-11-19

**Result: TARGET_VIDEO_MEDIA_AND_COMMENTS_OBSERVED; VISUAL_AI_BLOCKED_BY_LOGIN_PANEL.**

## Exact tested artifact
- Branch: `experiment/douyin-target-media-identity-20261119`
- Exact workflow HEAD: `6009036900c5751a5b14aa2ebffd5c9385904957` (code parent `2748e430d735ea17dc05d4598ac2f9800ad79917` plus one-shot marker)
- GitHub Actions: https://github.com/yud78785/yutang-build/actions/runs/44439140259
- Job ID: `135275344369`; Ubuntu 24.04, Chrome 157.0.8103.50; attempt 1.
- 17 targeted offline contract tests: PASS.
- Workflow conclusion: SUCCESS means bounded probe completed; product classification below remains partial.
- Artifact ID `14490800676`: https://github.com/yud78785/yutang-build/actions/runs/44439140259/artifacts/14490800676
- ZIP SHA-256: `d7bf677affd2e79f89291ae6a4def0ad0129e77a6c38c5fc7a08f0327dbfc0c8`
- ZIP contains only `unified-session-receipt.json` (1,030 bytes), no frame files.

## Actual same-session evidence

| Item | Value | Acceptance |
|---|---:|---|
| Direct target URL | correct | PASS |
| HTTP status | 200 | observed |
| Matching `aweme_detail` response | yes | PASS |
| Candidate media URLs in detail response | 33 | observed in memory only |
| Selected visible player's normalized `currentSrc` matched one target media URL | yes | **PASS** |
| Target media duration from detail | 15.0 s | observed |
| Samples with source-matched target player | 13 | observed |
| Valid advancing target-player samples | 12 | observed |
| Target media clock advancement | **12.07 s** | **PASS** |
| Standalone comments panel visible | yes | PASS |
| Visible comment text nodes | 5 | PASS |
| Matching comment response text count | 5 | PASS |
| Full login panel `[id^="login-full-panel"]` | **present** | **BLOCKER** |
| Login required / credentials supplied | no / none | not attempted |
| Frame capture | 0 | deliberately disabled while login panel present |
| AI visual interpretation / audio transcription | not run | NOT VERIFIED |

The previous run selected an unrelated advancing video element (likely login QR animation); target identity was not verified. This run corrects that by matching the player's normalized host+path against media URLs from the matching target video's `aweme_detail` response. Signed query strings remain in memory only and are never written to logs/artifacts.

## Current correct conclusion

- We have real cloud evidence that the **target video media stream is playing** for about 12.07 seconds, and that the same page exposes five visible comments.
- The full login panel is present. The upstream `hycarbon-b/crawl-douyin` implementation explicitly detects `[id^="login-full-panel"]` and stops with a login-required error; the separate `trust-login-dialog` is a different "save login information" dialog.
- Because the login panel obscures the visual content, we did not capture frames or claim visual AI understanding. No attempt was made to dismiss the login panel, sign in, solve a CAPTCHA or bypass access controls.
- Comments were observed from visible DOM/response, but comment text and usernames were not persisted.

## Next decision

1. Inspect whether the login panel has a documented, explicit close control without clicking it. If no safe user-dismissible control exists, stop the anonymous-browser route for visual analysis.
2. If the page truly requires sign-in to reveal video frames, do not bypass it. Use a permitted, separately documented media-access route only if the content is genuinely public and the platform permits it; otherwise ask the user for a public source they are authorized to analyze or stop.
3. Continue to distinguish `TARGET_MEDIA_PLAYBACK_VERIFIED`, `COMMENTS_READ`, `VIDEO_FRAMES_CAPTURED`, and `AI_ANALYZED`. No one stage implies the next.

No Windows EXE build, main merge, signature, production cloud deployment, account login, likes, follows, comments or messages occurred.
