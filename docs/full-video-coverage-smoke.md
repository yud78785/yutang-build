# YuTang | full public-video playback and coverage acceptance (NOT yet passed)

**Purpose**: Advance from 3 seconds/3 JPEGs to an actual beginning-to-end playback and a verifiable time-indexed picture/audio sampling ledger for the SAME public Douyin video. This is a *single disposable cloud Windows experiment*, not a released product or complete understanding of the 18-minute video.

## Immutable candidate from previously passed Windows acceptance

- Windows PR #7 source `00f5ac8d560f8459f333cadeb9e9cb227cfaeca6` (stays Draft and unchanged).
- Exact original EXE SHA-256 `51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575`.
- Original build Actions run `43233257376`, artifact ID `13952955883`, original artifact ZIP SHA-256 `9a510cb5c0361db8ab27a01aec90664bdbffcfad5c3af94ec7a09c02c6c2e376`.
- Original public-video probe `43233257378`, video `7577614489533680959` and `durationSeconds:1082.518`, only `playbackProgressSeconds:2.215838`, three original JPEGs at 1.585594, 2.667201, 3.772373 s. The old audio test captured 1.5 seconds and deliberately did not preserve/upload its raw audio or transcribe it.
- The new workflow **downloads that exact already-built EXE**, checks original build run and artifact identity, verifies EXE hash and manifest, then runs an **independent test harness** derived byte-for-byte from original `windows_public_douyin_video_probe.mjs` Git blob `40ac76bf16b46f1e46ea65cc8930d4305d8cac9d`, with only the additional full-coverage step and new test gating.

## Real acceptance contract

On disposable GitHub-hosted Windows 2025, using signed Edge and the existing sandbox/isolated-profile/loopback/Job-Object process safety path: open only `https://www.douyin.com/video/7577614489533680959`, fail closed for login/verification/redirect, wait for actual playback and decoded frames. Locally reset playback exactly once to t=0 (record this; no server write or DRM bypass). From initial time no more than 1.25 seconds, repeat production `captureSharedFrames` using 20-second maximum spans, **three actual JPEGs per segment**, checking original `verifySharedVideoFrameProof`, video ID, canonical page URL, stable stream element, no seeking after the reset, loop disabled locally, time progress consistent with decoded-frame counts and elapsed wall time. Persist hash-linked JSONL ledger **after every segment** so a failed job can still report partial progress, without uploading the intermediate raw video images.

Attempt to collect the genuine current video's WebM Opus audio simultaneously per segment, but persist only SHA-256 and byte counts, not raw media; if audio is unavailable, report incomplete audio coverage rather than claiming full comprehension. Require verified natural `HTMLVideoElement.ended` near the original duration to pass *PLAYBACK_TO_END*; close browser and force-clean candidate-owned process tree even on error.

**A Windows job green must NOT be titled "complete video understood."** Separate verdicts:

- `PASS_PLAYBACK_TO_END_WITH_SAMPLED_VIDEO_FRAMES_ONLY`: exact EXE has evidence of continuous time progress from near zero to natural end, at most 1.8-second unobserved gaps at segment boundaries, video identity matching, decoders advancing and hash-linked sampled frames.
- `FULL_AUDIO_TRANSCRIPT_PASS`: not implemented. Audio segment hashes cannot be converted into understanding without lawful audio capture and a real ASR transcript.
- `ALL_FRAMES_VISUAL_SEMANTICS_PASS`: not implemented. Roughly 3 samples / 20 seconds are not every frame or all context.
- `FULL_MULTIMODAL_VIDEO_UNDERSTANDING_PASS`: **must remain unverified** until evidence-aligned audio/visual time coverage and independent semantic spot checks succeed.

## Scope, expense and privacy

Only a single event-driven workflow on experimental PR #8's branch; no scheduled reruns, no release or merge, no Work credits, model API keys, personal DeepSeek account, personal Windows compute, cookie import, likes, follows, comments, shares, private accounts or downloaded full copyrighted video uploaded to CI. GitHub public repo standard hosted Actions CPU/Windows resources are eligible for included GitHub policies; exact account usage is not available to this chat. Runner has a 45-minute hard job cap and the playback observer a 26-minute internal deadline; failure stops, saves partial hashes and never calls a model.

Next real work **after** playback success: authorized hosted native-video or strong audio+vision service and timestamped semantic acceptance. Do not extrapolate results of the prior three-JPEG perception experiment to an entire 1082-second video.
