# Unified cloud Douyin session

One fixed public video, one Chrome context and one page; this is the first
attempt to prove playback, visible comments and timestamped frames together.

- Target: `https://www.douyin.com/video/7708352061931622655`
- One browser navigation; observes actual media clock, the matching detail
  response, the standalone comment DOM and any matching comment response
  naturally emitted by the page.
- Retains no comment text or usernames, no cookies, no full page content,
  no media URL, no downloaded video. It does not login, solve challenges,
  call Douyin APIs directly, submit comments or like content.
- At most 3 PNG screenshots of the visible video element around media times
  3, 8 and 13 seconds. Each has a media timestamp and SHA-256 in the receipt.
- Method references: MIT `xiaoke949/douyin-guest-dl` for observing the
  browser's own video-detail response; MIT `RanT711/video-parser` for the
  timestamped frame + analysis-material pattern. This experiment does not
  vendor either project.
- Automated visual AI analysis is not part of the workflow; the images are
  retained only for separate model inspection. Audio transcription is not
  included. Do not call this AI video understanding.
- A successful workflow means the bounded test completed. Only a receipt
  classification `PLAYBACK_COMMENTS_AND_FRAMES_OBSERVED` establishes all
  three cloud observations in this same source/session.


## Bounded page-state diagnostics after a unified-session failure

- A later one-shot run can record only safe flags: document ready state, coarse body-text length bucket, title/login/challenge/unavailable hints, router/OG-video presence, script/media-source counts and aggregate failed-request/console/network error counts.
- No title or body text, HTML, cookie, media URL, screenshot of a challenge, account data or comment text is persisted.
- The browser waits up to 30 seconds on the same URL without navigating, retrying, logging in or solving challenges. This is specifically to distinguish delayed rendering from a challenge or unavailable page.
- If a risk-control/challenge hint is detected, the test stops at that observation; no bypass is attempted.


## Target media identity and login gate

- The page's matching `aweme_detail` response supplies candidate video media URLs in memory. The selected HTML video element is accepted as the target only when its normalized current source host+path matches one candidate. Signed query strings are never written to logs or artifacts.
- Media-clock progress from unrelated animations (including a login QR animation) cannot pass the playback gate.
- Full login panel `[id^="login-full-panel"]`, trust-login save/cancel dialog, and English/Chinese login wording are detected. Screenshots are not captured while a login panel is visible. No login modal is dismissed, no credentials are supplied and no challenge is bypassed.
