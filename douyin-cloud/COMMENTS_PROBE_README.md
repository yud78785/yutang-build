# Cloud public Douyin comment observation

- New scoped one-shot: obtain a response/visible comment count **only** for
  previously playback-verified public video 7708352061931622655.
- Technical reference: MediaCrawler Douyin client (read-only URI/schema patterns;
  **no noncommercial MediaCrawler source copied**). Existing YuTang selectors
  for opening the visible comment panel are reused. No direct comment API calls,
  login, CAPTCHA bypass, downloads, comment submission, likes or private data.
- Stores only booleans and counts; never retains comment text, usernames,
  account cookies or source JSON.
- A green workflow means the observation finished. Only
  `public_comment_text_observed=true` supports this **one-video** live
  comment gate. The prior 15.99s playback evidence is a different SHA and run.
