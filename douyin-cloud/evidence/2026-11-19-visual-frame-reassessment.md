# Visual evidence reassessment — 2026-11-19

**Superseding assessment for playback identity and frame usefulness.**

## New evidence
- Unified cloud run: https://github.com/yud78785/yutang-build/actions/runs/44438030793
- Exact tested source HEAD: `b84af06e6f984386da09f85b3c80803f4b0a4a12`
- Job: `135271682056`; Ubuntu 24.04; Chrome 157.0.8103.50.
- Artifact: https://github.com/yud78785/yutang-build/actions/runs/44438030793/artifacts/14489851300
- Artifact ZIP SHA-256: `75b2436b1201ddfa96900ae77f3c5596cc03a6b56a47fb978d0390785dcff29b`
- Three captured PNG SHA-256 values:
  - frame_01 at 3.01s: `fc9a368291c39fa9753f7218d7b13a007da8a5986cd7b614cda86153b8a3cdec`
  - frame_02 at 8.22s: `a5fd8daa2f5f35cc510779ef48299b4316c3992418ed7510e664dad5d5f69db1`
  - frame_03 at 13.36s: `205ec23b2e8fd01e7a2529ef8931ca4e187851d40d5640059ba1491d33380b1d`

## Visual inspection of all three actual screenshots

All three screenshots show a **“Log in to Douyin” QR/phone login dialog** obscuring the central video area. They do not show the actual video scene. The report's `login_hint=false` was a false negative because the detection only matched Chinese login wording; the report also had `challenge_hint=true` and one captcha-related DOM node. The UI itself is direct visual evidence of a login overlay.

The upstream public crawler guide uses `[id^="login-full-panel"]` as a login panel selector and stops when it is present, rather than treating it as a dismissible cosmetic pop-up:
https://github.com/hycarbon-b/crawl-douyin/blob/master/reply_modal.py

The separate `trust-login-dialog` ("save login information?") is a different modal and must not be confused with the full QR login panel.

## Corrected acceptance interpretation

| Previous report field | Correct interpretation |
|---|---|
| 14.46 seconds media clock advance | A visible `<video>` element advanced, but its **identity as the target video was not verified** |
| `detail_response_seen=true` | The page fetched the target video's metadata; it does not prove the selected player element is that media |
| `frame_count=3` | Three screenshots were captured, but they show the QR login overlay, **not useful video frames** |
| 5 visible comments and matching response count 5 | The page exposed five comment text nodes / response entries; no text or usernames were retained |
| `PLAYBACK_COMMENTS_AND_FRAMES_OBSERVED` | **Superseded / INVALID as a full visual-video acceptance label** |

The earlier playback-only result #44362642134 (15.99 seconds) also did not check that `video.currentSrc` matched a media URL in the matching `aweme_detail` response. Its correct status is therefore **MEDIA_CLOCK_ADVANCED_TARGET_MEDIA_IDENTITY_UNVERIFIED**, not accepted target-video playback.

The comments-only run #44364724843 still supports **visible comment text was observed** for this one public page. It does not establish login-free video visibility or AI understanding.

## Next fix

1. Use the exact upstream method already documented in MIT `xiaoke949/douyin-guest-dl`: capture media URL candidates from the matching `aweme/v1/web/aweme/detail` response.
2. In memory only, compare the selected `video.currentSrc` (normalized host/path) with the target video's `play_addr` / bitrate URLs. Never persist the raw signed media URLs.
3. Require the selected player to match the target media before counting playback or capturing a frame.
4. Detect the actual login panel using `[id^="login-full-panel"]` plus English/Chinese login hints. Do not dismiss or bypass it. If present, stop visual capture and report login gate.
5. Only when target media identity matches and the login panel is absent, save up to three frame crops for visual analysis.

No login, cookie import, CAPTCHA solving, WAF bypass, account interaction or local user action is authorized or needed for this diagnosis.
