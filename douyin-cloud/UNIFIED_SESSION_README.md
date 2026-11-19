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
