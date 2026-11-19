# Guest media frame extraction (one public video)

This is a narrow one-shot cloud experiment using the same browser context
and the exact media URL already returned by the target video's own detail
response and matched to the active player.

Reference: MIT `xiaoke949/douyin-guest-dl@853553ee6cd57b4a5f753a25b440468d5f72e4fb`.
The upstream uses Playwright to open the video, observe its own
`aweme/v1/web/aweme/detail` response, then fetch the media URL through
`context.request.get(..., Referer=...)`. This experiment reuses that
documented guest-session method, without copying the downloader or solving
challenges.

- No account login, no exported cookies, no direct private API calls,
  no WAF/CAPTCHA solving, no comment submission, no likes or follows.
- Only proceeds if the browser page itself has already returned matching
  target media details and the selected player's current source matches one
  of those URLs.
- Maximum media body: 40 MB. The video bytes stay in memory and are never
  written to disk or uploaded.
- FFmpeg extracts at most three JPEG frames at 3, 8 and 13 seconds.
  The artifact contains only those JPEGs and a sanitized receipt.
- If the media request is denied, too large, or cannot be decoded, the run
  records a failure. It does not retry or seek another URL.
- A successful frame extraction is not yet AI analysis; a separate vision
  step must inspect the exact JPEGs and report its own evidence.
