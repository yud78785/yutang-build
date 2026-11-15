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

## Follow-up: direct no-Work, read-only attempts (2026-11-15 17:50–17:56 UTC)

**Target:** exact video ID `7445301722639060233`, `https://www.douyin.com/video/7445301722639060233`. This was an attempt to improve from search-index snippets to **LIVE direct page/API evidence**.

- Container outbound DNS to both public GitHub raw and `www.douyin.com`: `Could not resolve host`; the installed isolated container cannot run the existing no-cookie CLI to reach Douyin live. No Python/Python-package deployment was performed on the owner's machine.
- Direct webpage extraction with existing web source: zero readable lines. Separate JS-rendered public fetch **2 attempts**, both timeout; retry stopped.
- Identified mature `Evil0ctal/Douyin_TikTok_Download_API` and its public `https://demo.douyin.wtf/` shared read-only demo. First read-only fetch indicated `login_required` (demo account is public, but the API still needs a login).
- A **single non-Work external browser run** used only the website's public demo login; no owner credentials and no Douyin account were used: `https://agent.tinyfish.ai/runs/203bdd45-ce21-46e3-a6e5-db30e63167d4`. Run **completed** after **13 agent steps / ~73 sec**, but returned **`UPSTREAM_RISK_CONTROL`**, with public demo's Douyin identity pool **0 active / 188 cooling**. These pool numbers describe that demo's reported state only, not Douyin globally. No exact video detail, live comments, frame/audio, AI summary or Doubao answer were returned. A later action in the run probed the TikTok pool; that does not count as Douyin success.
- The metered browser **was not ChatGPT Work**, but did consume a third-party balance: `$2.248` -> `$2.008`, approximately **$0.24** for this isolated task. Auto top-up was unconfigured; no new payment or Actions CI was initiated. Do **not repeat** identical cloud-agent attempts without a reasoned change and explicit bounded budget.
- Browser agent's beta-only `max_steps` and `strict` options were unavailable in this account, so the actual run used `max_duration_seconds:65` only; observed reported duration 73 seconds. A future choice must not assume the endpoint provides a strict step-count ceiling.
- **Result: BLOCKED; not accepted.** Existing search-index comments from the prior section remain *search-index evidence*, not current direct comments. No new EXE was created or Windows tests triggered.
- Continue from the immediate blocker; investigate zero-install, no-Work methods capable of returning an **actual stable-video-ID, timestamped public evidence receipt**. Mature open-source `risingjerry/social-media-toolkit` free no-cookie parser could be useful on a functioning network host, but this container's DNS blocker prevents live testing it here. `mige-studio/douyin-digest` requires an extension and may use paid ASR, incompatible with no-install for now. No direct paid service/credential sign-up was initiated. Do not paste owner credentials into a shared demo.

## Follow-up: source-level Social Media Toolkit audit (2026-11-16 UTC)

**Independent audit source:** `risingjerry/social-media-toolkit@96502f35b0a643a578d3841d83d11228224c3dca`; reviewed actual `social_media_toolkit/platforms/core.py` Git blob `9671cbc1b79cba84f5da3d92b586ebedbe29044e`, `social_media_toolkit/service.py` blob `c5d8c281e056ba12dd52a0d173bca6d6449fb1cf`, `tests/test_social_extractor.py`, and Apache-2.0 `LICENSE`. Upstream explicitly identifies itself as **alpha**. The code, documentation, and tests are not proof that Douyin presently permits public unauthenticated extraction.

- Free no-cookie **metadata** uses the mobile/share-page HTTP parser. Bounded **public top-level comments** use one HTTP GET to `https://www.iesdouyin.com/web/api/v2/comment/list/` with `aweme_id`, `cursor=0`, `count=limit`; no browser, Playwright or login. Public sample limit is 1–100, with no pagination/backfill, and may return fewer than requested. It cannot prove video playback, all comment contents, audio or official AI-generated text.
- The upstream comment path sorts only the **returned** sample. Its normalization includes each item's `aweme_id` as `video_id`, but does not reject records whose `aweme_id` conflicts with the requested ID, and returns `status: success` even for an empty JSON `comments` array. For YuTang acceptance, consumers must separately require exact stable work identity, source provenance, nonempty genuine comments, matching per-comment video IDs, and actual read time. Never present an empty or incompatible sample as acceptance.
- Upstream tests for Douyin comments inject `unittest.mock.patch(...requests.get...)` / synthetic `FakeResponse`; they do **not** independently verify the live public endpoint for target `7445301722639060233`. Optional `TIKHUB_API_KEY` is a **potentially paid fallback for Douyin media/metadata**, not a free guarantee for comments. No key was used or configured in this audit.
- One **read-only, free** direct fetch of that public comment endpoint via the available web-reader interface was inaccessible (no JSON and no verified comment content). DNS lookup from the current isolated container for `www.iesdouyin.com` and `raw.githubusercontent.com` returned temporary name-resolution errors. The read-only connected tab list did not contain a Douyin tab. **No further request was made to the failed paid public demo.** No runtime SDK was installed, no account/cookie/login or paid API used.
- Pre-existing YuTang source already contains fail-closed DOM and passive response comment readers (`tools/douyin-public-comment-readonly.mjs`, `tools/douyin-passive-comment-network.mjs`). Avoid duplicating these components. Social Media Toolkit remains an **unverified alternative free transport**, not an integrated or Windows-tested capability. If a legitimate functioning free network host is later available, start with bounded `socialkit inspect` and `socialkit comments` against one exact public video and save a time-stamped, work-ID-verified, redacted response. Reject mismatch or empty content. Do not auto-run Actions, install on the user's machine or enable paid fallbacks.

**Independent Windows baseline cross-check:** Fifth diagnostic [Actions 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361) was inspected at the *raw job-log* level, not solely the green workflow result. Exact original unsigned EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34` verified before running. Receipt `PASS_WINDOWS_EXE_PUBLIC_WEB_ONLY` shows HTTP 200 rendered **public homepage**, Renderer sandbox, Network Service AppContainer + Low Integrity, loopback-only CDP, 24 tracked candidate processes with 0 remaining, 0 residual CDP listeners and isolated directories removed. 68/68 negative-path unit tests passed separately. This evidence is **NOT** direct target-video/comment/audio verification, newer source/EXE acceptance, user-PC testing, Windows 2022 rerun, signed build, merge or release.

**Status: BLOCKED for live comments/video.** This audit appended documentation only to the experiment branch. No new Windows CI run, no EXE replacement, no release, no access-control workaround and no change to `main`.

## Follow-up: pinned one-call public comments adapter (2026-11-16)

**Narrow implementation, no duplicated crawler or browser controller:** added `tools/douyin_public_comments_once.py` to call **only** the upstream `fetch_douyin_public_comments(video_id)` public endpoint function from `risingjerry/social-media-toolkit@96502f35b0a643a578d3841d83d11228224c3dca`, with its `social_media_toolkit/platforms/core.py` **Git blob** required to match `9671cbc1b79cba84f5da3d92b586ebedbe29044e`. The project's standard `socialkit comments` CLI first parses a whole public post, so direct use of the upstream standalone sampler is a distinct and more narrowly bounded **transport experiment**, not a new scraper.

- Exactly **one** free public HTTP sampler invocation, requested limit 1–12. No automatic retry, browser, login, TikHub fallback, GetNote, ASR, paid API, or media download is wired into this script. If metadata or comments fail, print a bounded error JSON and exit 2.
- Fail-closed receipt rejects wrong requested work ID, missing per-comment video ID, cross-video mixed comments, empty source sample, contradictory item counts, duplicate IDs, malformed text, unsupported source/ranking, or unpinned upstream file. Public comment text + comment ID + like count are retained only in immediate stdout; account names, user IDs, IP labels, headers and response URLs are omitted.
- Upstream Python Requests can use ambient `.netrc` or proxy credentials without caller-supplied authentication. The wrapper blocks when user home `.netrc` or `_netrc` files, a `NETRC` environment setting, or username/password-bearing HTTP(S) proxy URLs are detected. Future real execution must still use a clean disposable host and obey platform rules; source pin does not establish end-to-end supply-chain or sandbox safety.
- New `tests/test_douyin_public_comments_once.py`: **10/10 tests passed** with Python `unittest` in the isolated Linux container. These are deterministic fake-result tests **only**, not live network, package installation, official API, real comments, Windows OS or EXE verification.
- Independently checked Git blobs of **committed source** match the tested local bytes:
  - `tools/douyin_public_comments_once.py` Git blob `5580a8a0d1d85ea83de59659ef1edd5f7d50a656`; local SHA-256 `80470eb01062d9c01f303c29464b0dc206dd0c3897cd4bdd21834949303f06cf`.
  - `tests/test_douyin_public_comments_once.py` Git blob `1cb368eca87b1e028c495f8d98ab39440034aeb7`; local SHA-256 `83a22f3be17b81ffeb22c10f9fdee42e53a61bc8d90b2c46e7a0a1ec09e1c9b9`.
- Running the one-shot script on the current isolated host against `7445301722639060233` returned **`PINNED_UPSTREAM_UNAVAILABLE`**, exit 2, because the upstream runtime is not installed here. Independent DNS checks also returned `Temporary failure in name resolution` for `www.iesdouyin.com`, `www.douyin.com`, and `raw.githubusercontent.com`. Do not reinterpret this as proof that Douyin itself blocks public content.
- Official Douyin Open Platform `GET /item/comment/list/` is a **different OAuth-protected API**, requires `item.comment` permission and authorized identity; it is not a free no-login route to arbitrary public comments. Upstream mobile share endpoint remains an unsupported-by-official-contract best-effort public route. No claim of platform-wide comments access.

**Current result:** source-only no-Work, no-cost adapter guard **implemented and locally verified**; target's actual direct public comments, full video/audio/official AI summary **not observed**. No additional GitHub Actions run, EXE rebuild, machine-side installation, main-branch update, signing, release, public upstream issue or account login. The new files are **not** inside original signed/unsigned EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.

**Next single necessary gate:** on an already available lawful network-capable isolated execution host (not the user's PC), install only the exact pinned upstream revision in a credential-free environment and call the one-shot script against stable ID `7445301722639060233`. Accept only a nonempty, timestamped, per-comment-ID-matching receipt. If this host/path remains inaccessible, report `BLOCKED` and stop; do not repeatedly trigger paid browser agents, CI, or login challenges.

## Follow-up: verified-bytes-only loader and reproducible offline tests (2026-11-16)

**Bug fixed in prior one-shot integration:** The original `importlib.util.find_spec("social_media_toolkit.platforms.core")` can import and execute the upstream package's `__init__.py` **before checking** the pinned `core.py` Git blob. The current loader instead locates an installed `social-media-toolkit` distribution file via `importlib.metadata.distribution()` (without importing the package), reads `core.py` once, validates **Git blob SHA-1 `9671cbc1b79cba84f5da3d92b586ebedbe29044e`**, and compiles/executes those same verified bytes under a standalone module name. Its pinned upstream imports are stdlib plus `requests`; separate dependency integrity and end-to-end deployment safety remain **outside** this code-only gate.

**Independent reproduction (isolated Linux container):**
- Python `3.13.5`; no external SDK was installed or internet/network allowed for this test. Core pinned upstream package documents Python 3.10–3.12 support, so this run is **only the narrow wrapper's mock-test result**, not upstream package compatibility or live feature acceptance.
- The exact GitHub source and test files were reconstructed byte-for-byte, compiled using `python -m py_compile`, and compared against Git Blob IDs. Exact source blob **`cbedb7c7749cfa9b2b27bac1a65396c2ff8bb5a7`** (SHA-256 `7eede7d7ccc42da498693a842ac82f33f86fa0c5805773eb6d2358db7f5ada06`). Exact test blob **`394784218ffbabbba73945e7e90cf0baf836989e`** (SHA-256 `e324bf14ed8aa6313f47fc61ec08c980bf63ff99a18f295267252ae2f3c4f6c7`).
- `python -m unittest discover -s tests -p 'test_douyin_public_comments_once.py' -v` → **12 tests, OK; 0 failures**. Tests cover one-call fail-closed control, cross-video/empty/malformed evidence, ambient credential proxy guard, a malicious file rejected without execution, and a synthetic verified core loaded without executing unverified parent `__init__.py`. One initially committed test contained an extra backslash at a Python continuation line; corrected in commit `7da746570f3df4e9240a4928c04191295e030480` and verified via matching Git blob. These synthetic fixtures do **not** assert live network capability.
- Running `python tools/douyin_public_comments_once.py --video-id 7445301722639060233` in the same isolated host returned `{"status":"blocked","reason":"PINNED_UPSTREAM_UNAVAILABLE","video_id":"7445301722639060233","comments":[],"count":0}`, exit **2**. Separate DNS checks for target Douyin domains and GitHub raw host failed; a web-reader's single direct target-page/share-endpoint attempt returned no accessible JSON or readable comments.
- No real Douyin comment payload, verified video frames/audio, official AI response, user-device session or newer Windows EXE result. **Do not call this a video-watching or Douyin-comments pass.**

**Acceptance identity boundary:** Last real Windows homepage and process-cleanup evidence remains [Actions 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361), exact **original** unsigned EXE SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`. These new Python source-only files are **not packaged into that EXE**. No new CI, signature, merge, production release, credential, paid browser agent or user-PC installation was performed.

**Next gate:** A legitimately network-capable, credential-free isolated host with the precise pinned upstream revision. Run once for the exact public work ID; require real response provenance, matching nonempty per-comment work IDs and time. If unavailable or the endpoint refuses, stop at BLOCKED and do not keep submitting repeated requests, paid runs or bypassing challenges.
