# YuTang — first ACTUAL indexed Douyin comment evidence task (2026-11-16)

## User goal and cost boundary

User wants YuTang to **learn existing mature methods and finish a useful task**, not keep building/testing duplicates. No Work mode, no paid Windows CI, no user-side installation, no third-party paid API, no login, and no public `@豆包` comment were used in this task.

**Task genuinely completed at PUBLIC SEARCH-INDEX grade:** identify concrete failure patterns in public discussion about a video-summary tool, and select an existing, reusable tool strategy. **Not completed at ACTUAL VIDEO WATCH grade:** no frame/audio, direct live comment panel, complete comments inventory, or real AI iframe captured.

## Exact stable work, real source and counted sample

**Source:** `https://www.douyin.com/video/7445301722639060233`, stable Douyin work ID `7445301722639060233`, title “全网没人告诉你的AI视频总结方法！1分钟看完3小时视频...”, published 2024-12-06. Public search-index source returned **10 comment snippets**; this is not the live thread or a random representative sample. At least **7/10** snippets explicitly discuss parsing failure or a tool/UI not working:

1. YouTube video unsupported/unparseable;
2. `parsevideo` no longer parses;
3. Mind map sidebar fails to appear;
4. General reports that current parsing no longer works;
5. Tongyi says Douyin URLs not supported;
6. `parsevideo` recurrent parsing failure;
7. Bilibili no longer parses.

Other 3 snippets: other tool suggestion, thanks, and “显示这个” with missing screenshot, thus **not classified as a known issue**. The `7/10` rate applies only to the *10 visible indexed snippets*, **NOT a tool failure rate, all viewer comments, or a user study**. Comments appear to be about one year old in the returned index; do not mistake them for Nov 2026 current live status.

Evidence URL: https://www.douyin.com/video/7445301722639060233
Index evidence collected via public search result, not via browser/Playwright.

**Independent source with machine-produced indexed script, different video:** `https://www.douyin.com/video/7341593485717343542` (“AI评论分析：提升业绩30%的实操方法”, 2024-03-02). Its public “智能文稿” discusses importing comments and grouping frequent user requests. The asserted 30% sales increase is creator/tool copy, NOT independently verified. Neither the video frames nor the full original words were read.

**@豆包 observation, separate video:** `https://www.douyin.com/video/7651937975173326248`. A search-indexed public comment contains `@豆包 请总结一下视频中的skills`. No evidenced reply or generated analysis was visible. Posting publicly is not part of the read-only task.

**Another discovered public AI manuscript:** `https://www.douyin.com/shipin/7627312266891020323` aggregates a “问问AI” demonstration, but this is a changing SEARCH/AGGREGATION route, not an exact work ID. Do not attribute it to a unique video or claim it was observed via playback.

## Useful decisions (working result, not a performance test)

- **Directly useful from comments:** for the eventual private YuTang video-link workflow, missing support for Douyin/YouTube/Bilibili, broken website parsing and summary-panel rendering are meaningful error categories. The user should get an explicit `unsupported_source`, `access_restricted`, `no_captions_or_audio`, `summary_panel_unavailable`, or `source_unavailable`, not an invented summary.
- **Mature upstream priority:** first public index when available; then `risingjerry/social-media-toolkit@96502f35b0a643a578d3841d83d11228224c3dca` (Apache-2.0; author calls it ALPHA; bounded public comment samples, no-login public metadata); optional `mige-studio/douyin-digest@a601400f1e77b7a3799d87e101438e7abbb44efb4` (MIT, extension and possible ASR costs). Do not install without a concrete accessible runtime. No source was copied, and no model/API was called.
- Do not use paid hosted `zen-studio-labs/douyin-mcp` / Apify or `TinyFish` by default; they may charge per run even if they do not consume ChatGPT Work usage.
- Preserve raw source type per field: `indexed_description`, `indexed_ai_manuscript`, `indexed_public_comment_sample` are **not** `actual_video_frame`, `actual_audio`, `live_public_comment`, `official_ai_summary_text`, `generated_doubao_reply`.
- Avoid extrapolation: 7/10 from a search-index surface is a constrained observation only. Do not claim reliable current failure rate, complete comment capture, or cross-work evidence.

## Reproducible minimal no-Work public research workflow

1. Obtain a stable `www.douyin.com/video/<18-20-digit-id>` link; never trust `/shipin/` aggregation as a unique video.
2. Search the exact work ID and collect index text with provenance (video title, time, description, any visible `智能文稿`, a bounded comment subset).
3. Write an evidence-tagged summary that states exactly **what was observed** and the bounded sample counts; don't say the video was watched.
4. If actual video frames/audio or live comments are essential and these are not available, report **NOT VERIFIED**. Only route to an already available, licensed public extractor; do not reimplement parsers or automatically pay/login.
5. Next real milestone remains exact Windows/private AI runtime: the accepted candidate `Dafeiyu-Douyin-API-1.4.7-win-x64.exe` SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` has cross-Windows offline startup/sandbox/cleanup evidence `43541915930` and one public homepage success `43643545361`; those runs **do not** include the new source-only first-task branch and prove nothing about live video/comment capture.

## Project version and actual effect

- Prior task branch SHA: `9b7cc700752cffd00c8821a42ba0296b78ac47d1`.
- `main@4745ed23cbb748cb4b070ed70390703d1261aea0` was unchanged at beginning of this task.
- **Only this evidence report changed**. No Windows runner, EXE, local browser, user login, vendor API, paid CI, or release action. No source or package test reruns; this was a real PUBLIC INDEX EVIDENCE review, not EXE acceptance.

**Current blocker:** this chat has read-only tab inspection and public search-index tools but no actual Douyin playback in a connected browser, and the isolated local container cannot resolve DNS; a direct public download from the site failed. Never claim full video, live comments, official AI generation or user PC acceptance until corresponding evidence exists.
