# YuTang Cloud Douyin Comments — Standalone Video Acceptance

**Result: SINGLE_PUBLIC_VIDEO_VISIBLE_COMMENT_READ_PASS** (read-only). This is a different source SHA and Actions run from the earlier playback evidence.

## Exact tested identity
- Branch: `experiment/douyin-standalone-comments-cloud-20261119`.
- Source SHA: `ad56df3f5489bafe7e328c6c1c6ddcc22c3ee92c`.
- GitHub Actions run: https://github.com/yud78785/yutang-build/actions/runs/44364724843
- Job ID: `135015302123`. Ubuntu 24.04 Chrome headless, attempt 1, workflow SUCCESS.
- Artifact ID `14456638016`: https://github.com/yud78785/yutang-build/actions/runs/44364724843/artifacts/14456638016
- Artifact ZIP SHA-256: `fbc3bca7f9f5360cd71f975add14c24136b32d128883e6eb77fdd496fe4ac158`.
- ZIP contains one `cloud-standalone-comments-receipt.json` of 793 bytes.
- Exact source public video: https://www.douyin.com/video/7708352061931622655

## Actual observed values

| Observation | Evidence |
|---|---|
| Confirmed direct video URL | true |
| Standalone video comment panel exists and visible | true, true |
| Visible comment nodes | **5** |
| Visible nonempty comment text samples | **5** |
| Login hint in page | false |
| Click comment icon needed | false |
| Comment API response intercepted | false (DOM evidence instead) |
| User login/cookies | none provided or exported |
| Comment submitted / interacted with account | false |
| Comment text/usernames retained in artifact | false |
| Model comment understanding | **NOT TESTED** |

Classification in original JSON: `PUBLIC_VISIBLE_DOM_COMMENT_OBSERVED`.
The source runs 8 specific offline tests before the site visit.

**Source lesson:** A standalone Douyin `/video/<id>` page can auto-load `.comment-mainContent`; a modal video page may instead require `[data-e2e="feed-comment-icon"]`. Treating the icon as mandatory caused the prior comment probe #44363831538 to report `COMMENTS_UNVERIFIED`. The fix follows external guidance at https://github.com/hycarbon-b/crawl-douyin/blob/master/AGENTS.md and only observes visible DOM; no source was copied from the noncommercial MediaCrawler project.

## Distinct earlier result, not the same executable/run

Video playback PASS is **separate** Actions #44362642134 for SHA `c3691d411f76e958ed776c57364f42312b21cafd`: one public video's HTML media clock advanced **15.99 s** in **16** valid samples and matching detail response observed. This comments pass on a different SHA **does not mean a single combined end-to-end app has yet passed both simultaneously**.

## Next real blocker

1. Integrate playback and read-only comments in **one single cloud session** with a single source SHA and a combined original receipt. Prefer upstream browser observation over a custom crawler. Keep no user credentials and no interactive account action.
2. Test capture of media frames and independent visual reasoning. Comment counts are not comment interpretation, and player time is not audio/video understanding.
3. Extend from one public video ID to controlled user-supplied public video links, then bounded continuous viewing. Avoid asserting broad platform reliability from this single video.
4. Still no always-on paid cloud hosting, Windows build, main merge, signature or official release.

**The project now has two distinct real cloud successes** and still lacks a unified user-facing deliverable.
