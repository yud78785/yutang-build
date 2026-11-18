# One-shot cloud Douyin public video canary

This is a **bounded observation** of one indexed public video, not a browser
automation product or video analysis result.

- Fixed target: `https://www.douyin.com/video/7708352061931622655`
  (publicly indexed on 2026-11-19, posted on 2026-11-15).
- Uses standard Chrome headless on a temporary GitHub Ubuntu runner; no user
  laptop, password, account session, browser profile persistence, API key or proxy.
- Method reference: MIT `xiaoke949/douyin-guest-dl` commit
  `853553ee6cd57b4a5f753a25b440468d5f72e4fb`.
  Reuses the simple **observe page's own video-detail response** approach but
  does not run the upstream downloader or save any response payload/media URLs.
- Also checks whether a visible HTML video progresses naturally. No artificial
  seek, WAF challenge solving, retries, comments, media download or hidden API calls.
- Output JSON only contains fixed video ID, HTTP status, evidence counts,
  bounded media seconds, and explicit PASS/UNVERIFIED status.
- Exact source tests first; one on-demand GitHub Actions event; branch only;
  no EXE build, account modification, merging, publishing or release.
- A successful CI job means only that the bounded observation completed.
  `real_public_playback_observed=true` is the separate content criterion,
  and cannot prove user desktop or audio/visual model understanding.

No production dependency on the small reference project. Its README cautions
that non-mainland egress addresses may fail; a failure here should not trigger
repeated anonymous attempts without new evidence.
