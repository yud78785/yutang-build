# YuTang Cloud Playback Acceptance — 2026-11-18

**Result: ONE_PUBLIC_VIDEO_CLOUD_PLAYBACK_PASS.** Not a product release.
This is a real indexed Douyin video page observed in a fresh GitHub-hosted Ubuntu 24.04 Chrome session. It is not synthetic HTML or user-desktop Windows.

## Exact tested artifact

- Source branch: `experiment/douyin-public-video-cloud-canary-20261119`
- Exact tested source SHA: `c3691d411f76e958ed776c57364f42312b21cafd`
- One-shot GitHub Actions run: https://github.com/yud78785/yutang-build/actions/runs/44362642134
- Job: `135007869653`; attempt 1; workflow SUCCESS
- Sanitized artifact: https://github.com/yud78785/yutang-build/actions/runs/44362642134/artifacts/14455202081
- Artifact ZIP SHA-256: `f9189ef40a6abda647a5e9276d0380d16b7f3ebe90fa9a90c6ed673047155c98`
- The artifact contains exactly `cloud-public-video-receipt.json` (780 bytes).
- Public source video: https://www.douyin.com/video/7708352061931622655
- Reference upstream implementation approach: MIT `xiaoke949/douyin-guest-dl` at `853553ee6cd57b4a5f753a25b440468d5f72e4fb`
- No user credentials, authentication, cookies exported, WAF bypass, download, or upload of the video's content.

## Independently inspected JSON and raw logs

| Evidence | Actual value |
|---|---|
| Cloud host | Ubuntu 24.04; Chrome 157.0.8103.50 headless |
| HTTP response from public Douyin video page | 200 |
| Web page itself requested the matching video detail | TRUE |
| Total video elements observed | 2 |
| Visible video elements observed | 1 |
| Player observations | 21 |
| Valid advancing media-clock samples | 16 |
| Conservatively observed media progression | **15.99 seconds** |
| Cloud single-video playback evidence | **PASS** (`PUBLIC_VIDEO_PLAYBACK_OBSERVED`) |
| Comment text retrieval | **NOT TESTED** |
| Screenshot / video frame semantic understanding | **NOT TESTED** |
| Audio transcription and understanding | **NOT TESTED** |
| Continuous feed switching | **NOT TESTED** |
| Windows EXE with same method | **NOT BUILT OR TESTED** |

Off-line 7 tests of classification and secret-exclusion also PASS on this SHA.
Raw run logs include `YUTANG_CLOUD_CLASSIFICATION=PUBLIC_VIDEO_PLAYBACK_OBSERVED`,
`YUTANG_CLOUD_REAL_PLAYBACK=True`, and
`YUTANG_CLOUD_DETAIL_RESPONSE=True`.

A cloud browser can play **this one public video under these conditions**; this does not establish arbitrary videos, all network regions, uninterrupted unattended browsing, visual/audio AI analysis, or the user's Windows EXE.

## Product decision and next gate

Proceed **cloud-first**, using a specific public video target and the page's own emitted data rather than defaulting to the Douyin home page.
Follow the proven upstream read-only observation pattern; do not deploy the heavy DTK identity pool or ask for personal account cookies yet.

Next: one **newly scoped**, bounded read-only comment observation on the same video (no comment submission), followed by a model-independent extraction of a small number of time-stamped frames, if permitted. Keep separate evidence types: PLAYBACK_OBSERVED vs COMMENTS_READ vs AI_ANALYZED. Do not rerun this successful single-video playback proof unchanged.
