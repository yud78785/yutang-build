# Douyin cloud comments — first live attempt (not accepted)

- Exact tested source: `913cf20ef7100bbdc39cd94c0ba6d04591f67b51`
- GitHub run: https://github.com/yud78785/yutang-build/actions/runs/44363831538 (job 135012104012)
- Artifact: https://github.com/yud78785/yutang-build/actions/runs/44363831538/artifacts/14455582735
- ZIP digest `sha256:af24a096ba22493f8d13f6fef1e51e9fa9c9112260f13fbd4315d85de8ea48de`.
- Exact public video URL: https://www.douyin.com/video/7708352061931622655
- Six **offline** targeted tests PASS; real comment-read outcome **UNVERIFIED**.
- Real JSON: correct_video_url true; clicked button false; response seen false;
  response comment text count 0; DOM comment text count 0; no text/usernames stored.
- Do not confuse this with previous real *video playback* PASS
  (15.99 observed seconds in separate Actions #44362642134).
- Next *new hypothesis*: inspect standalone video's `.comment-mainContent`
  automatic load rather than requiring modal-only `[data-e2e="feed-comment-icon"]`.
  See https://github.com/hycarbon-b/crawl-douyin/blob/master/AGENTS.md .
- If the new scoped check also fails, stop; do not repeatedly probe the same
  unauthenticated session or bypass access controls. This commit only saves evidence.
