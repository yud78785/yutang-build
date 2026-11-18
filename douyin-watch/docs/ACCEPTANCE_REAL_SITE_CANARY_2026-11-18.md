# YuTang Douyin | Windows packaged EXE public-site smoke | 2026-11-18

**Verdict: LIVE_PUBLIC_PLAYBACK_UNVERIFIED, NOT RELEASEABLE.**

## Fixed identity and artifacts

- Repo: `yud78785/yutang-build`; branch: `experiment/douyin-real-site-probe-20261118`
- Tested exact workflow source SHA: `6f3662c02bf099ac73b04d9e63d7d5b620132cd0`
- Windows Actions run: https://github.com/yud78785/yutang-build/actions/runs/44210748884
- Job ID: `134488149109`; Windows 2022; attempt 1; conclusion success (workflow mechanics)
- **Tested EXE SHA-256:** `0952fd4ee723065b51f55aba2cba84d15a314b2bbfcb5ed1499dc64b536a4eb2`
- Artifact ID: `14385697191`; ZIP digest `sha256:123f08a39218f956fb11fc9ec53efc3a4f590d34dbe1548e8ed230cdd256935d`
- Artifact: https://github.com/yud78785/yutang-build/actions/runs/44210748884/artifacts/14385697191
- ZIP size: 48,574,009 bytes; expires 2026-12-02 00:49:30 UTC (per GitHub metadata)
- Does not modify `main`, sign, merge or release.

## Actual verified evidence

| Observation | Result | Evidence |
|---|---|---|
| Exact-source offline regression suite | 40/40 PASS | Windows raw job log lines 246-249 |
| Packaged EXE self test + local Edge DOM smoke | PASS | Windows job steps before live probe |
| Packaged EXE ran one real public-site probe | EXECUTED | Windows job step, raw log lines 400-405 |
| Douyin initial HTTP response | 200 | `REAL_DOUYIN_HTTP_STATUS=200` |
| Visible real video found | NO | `PAGE_RESPONDED_NO_VISIBLE_VIDEO` |
| Verified video media progression | **NO** | `REAL_DOUYIN_PLAYBACK_CONFIRMED=False`; observed seconds empty |
| Real comment read on Douyin | **UNVERIFIED** | No confirmed playable video |
| Real user desktop Edge + GUI | **UNVERIFIED** | GitHub-hosted **headless** Windows environment only |
| Windows 2025 for this SHA | **UNVERIFIED** | No Windows 2025 run |
| AI interpretation of visual frames/audio | **NOT IMPLEMENTED** | Current read-only controller only |

The `success` conclusion applies to build, offline checks, and completion of the probe with a valid JSON evidence receipt, **not** to success of real Douyin video playback.

## Limits and next blocker

The HTTP response 200 does not establish that the site rendered a usable video. No evidence supports blaming geo restrictions, login, site antibot, or player CSS selector as the sole root cause. This first live probe was deliberately short and did not use credentials, solve challenges or bypass controls. Its profile and temporary records are isolated.

**Next required evidence:** On the user's real Windows desktop, run the exact candidate EXE in a visible, ordinary Edge session; choose one video, check media progress and whether comments can be opened. The `DouyinWatch-...-diagnostics.json` generated locally can help discriminate between video missing, stalled, paused and buffered states. Ask for only that receipt or screenshot, not passwords/cookies. The program must be closed using its Stop control and residual processes checked before a user-desktop acceptance PASS.

Do not repeat the prior 40 offline tests until code changes or a candidate SHA change make retesting necessary. Do not count older v4 PASS for this EXE. Do not run further cloud-site retries without a specific new hypothesis.
