# Unified cloud session attempt 1 — NOT PASSED

**Verdict: UNIFIED_PLAYBACK_COMMENTS_FRAMES_NOT_VERIFIED.** Do not mark the combined workflow accepted.

## Exact run identity
- Branch: `experiment/douyin-unified-cloud-session-20261119`
- Exact tested Actions HEAD: `af0ec03c13dc5332a7eabc1800cf0dd6916a67dd` (code parent `29b1a27cc2e0d292a1994114174114276a3b09f8`, plus one-shot marker)
- GitHub Actions: https://github.com/yud78785/yutang-build/actions/runs/44437479001
- Job ID: `135269858961`; Ubuntu 24.04, Chrome 157.0.8103.50 headless; run attempt 1.
- Job workflow conclusion: SUCCESS means probe completed and receipt was uploaded, **not** that playback worked.
- Artifact ID: `14489278086`; https://github.com/yud78785/yutang-build/actions/runs/44437479001/artifacts/14489278086
- Artifact ZIP SHA-256: `a6789b809c5ed0707f5440d06f248b5e48d6df968cc46f9d5bc7033148cb88f7`
- ZIP contained only `unified-session-receipt.json` (1,250 bytes); no frame images.

## Actual original receipt

| Field | Value |
|---|---|
| HTTP status | 200 |
| Correct direct video URL | true |
| Matching video-detail response | false |
| Player samples | 21 |
| Video elements max / visible max | 0 / 0 |
| Advancing samples / observed seconds | 0 / 0.0 |
| Comment panel present / visible | false / false |
| Visible comment text count | 0 |
| Matching comment response | false |
| Frame captures | 0 |
| Classification | `PAGE_RESPONDED_NO_VERIFIED_PLAYBACK` |

## What remains valid (different runs and source SHAs)

- Playback alone passed for source SHA `c3691d411f76e958ed776c57364f42312b21cafd`, Actions #44362642134: 15.99 seconds observed.
- Visible comments alone passed for source SHA `ad56df3f5489bafe7e328c6c1c6ddcc22c3ee92c`, Actions #44364724843: five visible comment text nodes.
- Neither separate pass can be substituted for this unified run.

## Failure interpretation

The site returned HTTP 200 and retained the direct video path, but this browser session saw **zero video elements**, no matching detail response and no comment panel. The current receipt cannot distinguish a temporary interstitial, a site-side page variant, client-side script failure, or egress/identity differences. It does not prove the video is deleted or that the prior successes were false.

Next justified action: a single diagnostic revision should collect only privacy-safe page-state flags (document ready state, body-text length bucket, challenge/login/error hints, script count, media source count, failed-request count, and Open Graph video metadata presence). Do not save page text, HTML, cookies, usernames, media URLs or screenshots of challenge pages. Wait a bounded additional interval for a visible player. If the diagnostic confirms a challenge or restriction, stop rather than solving or bypassing it.

## AI status

No frames were captured; no visual model or audio transcription ran. No combined AI analysis is claimed.
