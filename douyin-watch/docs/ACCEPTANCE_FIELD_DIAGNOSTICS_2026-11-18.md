# YuTang field diagnostics acceptance | 2026-11-18

**Verdict: WINDOWS_2022_OFFLINE_ACCEPTED; LOCAL_DOUYIN_PLAYBACK_UNVERIFIED.** Not a signed or released application.

## Identity
- Repository: `yud78785/yutang-build`
- Experimental source branch: `experiment/douyin-oneclick-field-diagnostics-20261118`
- **Exact build HEAD SHA**: `179597d1f2c35836e570c097cacef4cb7da12a4e`
- Windows 2022 Actions run #44337671135: https://github.com/yud78785/yutang-build/actions/runs/44337671135
- Run attempt 1, conclusion SUCCESS; job ID 134918676510.
- **Candidate Windows EXE SHA-256** from raw job log line 366: `ac690007d58cc1ac10e09f670f7313e1e3ee3c31ea8640bdc7e3bb33b04ba0d1`
- Artifact ID `14443346139`; file name `YuTangDouyinWatch-FieldDiagnostics-Windows-2022-44337671135`
- Artifact URL: https://github.com/yud78785/yutang-build/actions/runs/44337671135/artifacts/14443346139
- ZIP digest: `sha256:01ed175af152f0b684042858e66db5c5e07cedda381bbd59ca84072533ac49a5`
- Artifact size 48,578,243 bytes; expiry 2026-12-02 15:38:31 UTC per GitHub metadata.
- Unchanged `main` at time of independent verification: `4745ed23cbb748cb4b070ed70390703d1261aea0`.

## New code and corresponding test evidence

| Verification | Result | Exact evidence |
|---|---|---|
| All source regressions | **47/47 PASS** | Raw Actions job log lines 252-255 |
| One-click redacted clipboard export | PASS | `test_copy_only_sanitized_values_and_packaged_exe_sha`, log line 225 |
| Copy disabled before report exists | PASS | `test_copy_before_started_does_not_touch_clipboard`, log line 224 |
| Save missing-video diagnostics while waiting | PASS | `test_waiting_for_missing_video_saves_before_timeout`, log line 233 |
| Save stalled-video diagnostics before failure | PASS | `test_stalled_player_persists_progress_before_failure`, log line 232 |
| Strictly sanitize raw navigation/video counts | PASS | `test_navigation_video_counts_and_login_flag_are_strictly_sanitized`, line 248 |
| Exclude secrets, paths and video IDs from shared summary | PASS | `test_chat_share_excludes_attacker_strings_video_ids_and_paths`, line 246 |
| Reject poisoned file fields on share | PASS | `test_chat_share_with_poisoned_file_fails_closed`, line 247 |
| Packaged EXE --self-test | PASS | Workflow Verify packaged EXE step |
| Packaged EXE --browser-smoke (local Edge DOM) | PASS | Workflow Verify packaged EXE step |
| Windows 2025 for this EXE SHA | **UNVERIFIED** | No new 2025 run |
| Visible Edge on user's own Windows | **UNVERIFIED** | No local evidence |
| Real Douyin video playback, comment reading and switching | **UNVERIFIED** | No new site/live desktop probe for this candidate |
| Process cleanup on user's machine | **UNVERIFIED** | Requires local check |

## Prior live evidence, not a pass for this EXE

2026-11-18 Actions #44210748884 tested a different EXE hash `0952fd4ee723065b51f55aba2cba84d15a314b2bbfcb5ed1499dc64b536a4eb2`. Windows 2022 headless Edge received HTTP 200 from Douyin but did not detect a visible video: `PAGE_RESPONDED_NO_VISIBLE_VIDEO`. Do not import this failure or its older 40/40 regression result as a current-binary live outcome.

## Minimal next acceptance

1. Verify the actual downloaded and extracted EXE SHA-256 equals `ac690007d58cc1ac10e09f670f7313e1e3ee3c31ea8640bdc7e3bb33b04ba0d1`.
2. On the user's own Windows desktop open the candidate **once**. Choose one video, click **打开 Edge 并开始**, and let it attempt real playback.
3. Use **复制脱敏诊断**, paste the text into ChatGPT. This works during waiting/after 6 seconds and does not include web text, cookies or video IDs.
4. Stop via **停止并关闭本次 Edge**. Check no candidate Edge/Playwright processes remain.
5. A diagnostic that reports `VISIBLE_VIDEO=YES` is not alone proof of playback. Require valid increasing `MEDIA_SECONDS`, observed playback and then comment/next-video evidence to claim a live PASS.

Do not rerun cloud Douyin probing without a new concrete hypothesis. Do not claim local PASS based on synthetic tests. Never publish or merge `main` before Windows safety/live acceptance is complete.
