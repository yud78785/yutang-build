# Full-video startup diagnostic — 2026-11-13

## Latest failed full-playback evidence
- Exact Windows candidate EXE SHA-256: 51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575.
- Original full run: 43326123532, source commit 30e8b4544c7892fc7ee29e8b83ab5d623e8ec3d4, FAILED.
- Public video ID 7577614489533680959, page identity and duration 1082.5s verified; three real JPEGs captured and 1.5s audio capture succeeded.
- The full-coverage ledger file was empty. Therefore failure occurred before the first coverage segment/BEGIN ledger entry, not at the 18-minute natural-ended event.
- Probe error was redacted as Error / UNCLASSIFIED; old code did not persist a safe stage/code before the initial seek/play preflight.
- Candidate/Edge cleanup verified. Prior sandbox, loopback and restart evidence on the same exact EXE remains separate and is not being repeated for this diagnostic.

## Code correction
- Add preflight stage ledger entries and only allowlisted FULL_VIDEO_* / AUDIT_* error codes. No page text, URL query, cookies or arbitrary exception messages are persisted.
- Bind the original player using a Playwright ElementHandle and retain that same handle for the natural ended event. A Locator re-resolves the element and could silently point to a different video after a Douyin SPA transition; the previous comment promised more than the code guaranteed.
- Verify local seek at t≈0 and validate playback start within the same page evaluation. This avoids requiring currentTime to remain below 1.25 seconds while a separate asynchronous state call is being read.
- New --startup-diagnostic mode runs exactly one real 20-second capture segment, returns PASS_VIDEO_STARTUP_ONE_SEGMENT_ONLY_NOT_FULL_VIDEO, and exits before any natural-end claim.
- It reuses the prior same-EXE / same-Edge-version sandbox evidence from run 43326123532, and skips unrelated Edge + restart cycles. It still launches the original EXE on a disposable Windows GitHub runner, verifies candidate ownership/loopback, and cleans up its own process tree.
- Existing full 18-minute workflow is guarded by an explicit [run-full-video] commit-message marker. A normal code change cannot silently trigger another 18-minute test.
- Startup diagnostic workflow is separately guarded by [run-startup-diagnostic] so workflow edits cannot silently rerun even the bounded test.

## Startup diagnostic result
- Exact code commit: 246360c774eef0e31a4e5078269340c5d1a3c03e.
- Windows Actions run: 43344758953, job 131621294182, completed/success.
- Exact original EXE SHA-256 remained 51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575.
- The startup ledger recorded PREPARE, PRE_START_STATE, ORIGINAL_VIDEO_ELEMENT_BOUND, LOCAL_SEEK_AND_PLAY and BEGIN; the original player was reset to 0.000993s.
- One real segment reached 20.013741s, with 3 verified JPEG frames and 20.025324s of captured audio. Audio failures: 0.
- Result: PASS_VIDEO_STARTUP_ONE_SEGMENT_ONLY_NOT_FULL_VIDEO. Candidate process-tree cleanup and unrelated Edge cleanup verified.
- This is only the first 20-second segment, not a full playback or natural-ended event. The diagnostic workflow artifact upload path was corrected after this run; raw logs are the evidence for this attempt.

## Full 18-minute playback result — PASS, exact scope (2026-11-13 UTC)

- Actions run: `43344429062`, job `131620207486`, completed/success.
- Exact run source commit: `807756b71d63729c58db5312eb2c16c70e6268f3`.
- Exact packaged Windows candidate EXE SHA-256: `51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575`. The workflow downloaded the previously built candidate artifact; it did not rebuild the EXE.
- Original public Douyin video ID: `7577614489533680959`, page identity `https://www.douyin.com/video/7577614489533680959`, duration `1082.5s`.
- Artifact `14002251590`, ZIP SHA-256 `780cd62fb74e24c3f506ca67f08b2b71b93a45ee556c4fd654b86c895a03c2a9`, contains the original redacted probe result, final playback result, full coverage ledger and three initial JPEGs.
- Independent ledger replay verified all **61 chained records**, zero chain mismatches, and final chain SHA-256 `d47b7de5b959f3c4808fdb6e4c89b8205c8690e7f5fc8e8a615b3b8d0efab65d`. Stages: PREPARE, PRE_START_STATE, ORIGINAL_VIDEO_ELEMENT_BOUND, LOCAL_SEEK_AND_PLAY, BEGIN, 54 SEGMENT, TAIL_SNAPSHOT, END.
- 54 contiguous segments (indices 0–53); **162 sampled JPEG frames** (three per segment), all with SHA-256 records and advancing decoder counters. First playback sample `0.001181s`, final sample `1081.346713s`; largest segment boundary gap `0.205976s`, total gap `6.274471s`.
- The exact original HTML video element emitted a real `ended` event: `eventSeen=true`, `originalElementConnected=true`, `ended=true`, `loop=false`, `seeking=false`, terminal time `1082.517006s`, actual duration `1082.517006s`.
- 54 audio capture segments, total captured audio interval `1079.740144s`, zero audio-capture failures. Raw audio was not included in the artifact or sent to a model; the ledger records interval/hash/byte evidence only. **No audio transcription was performed.**
- Final candidate cleanup: no candidate host or Edge process remained; unrelated Edge process/profile was separately closed; lifecycle recorded three launches and three closes, with two restart cycles and final process/listener counts zero.

### What this result proves — and does not prove
It proves the exact packaged EXE SHA above played this one public 18-minute Douyin video from the beginning to the original HTML video element's natural `ended` event, while 54 bounded observation segments recorded 162 sampled images and 54 audio capture intervals. This is a full-playback and sampled-coverage PASS, **not** a full-frame capture of every video frame.

It does NOT prove audio transcription, audio semantics, OCR, that all 162 sampled frames were individually understood, whole-video semantic understanding, autonomous browser actions, or release readiness. The probe explicitly sets `fullAudioTranscriptVerified=false`, `allIndividualVideoFramesReviewed=false`, `videoSemanticsPassed=false`, and `modelInferencePerformed=false`.

### Exact-source separation after this full run
- The full-duration result belongs to run `43344429062` and source commit `807756b71d63729c58db5312eb2c16c70e6268f3`.
- Current PR #8 head is `07f75d4f88bd18b9cd0b277c9cc84cbd1ffd9542`. Its newer startup preflight files `tools/run_full_video_coverage.mjs` blob `ed2258123d535b3093710bdba61ce7f403191647` and `tools/windows_full_video_playback_probe.mjs` blob `56c3fdcc45eb0bb46c6156c23a0c48ee549f7588` match the separately tested startup-only commit `246360c774eef0e31a4e5078269340c5d1a3c03e`, run `43344758953`, which passed one real 20-second segment on the same exact EXE. The coverage audit and original-ended validator blobs are unchanged between the full run and current PR head.
- Therefore: full playback is proven for the exact candidate EXE under the full-run source; the later startup-preflight refactor has its own one-segment validation, but has not itself been replayed for another 18 minutes. Do not silently combine those as a single current-HEAD full-run test.
- Current full-duration workflow is guarded by the explicit `[run-full-video]` commit marker. No repeat is scheduled automatically.

## Overall acceptance
- Windows startup diagnostic: PASS (one real 20-second segment, run `43344758953`).
- Exact candidate EXE full public-video playback to natural end: PASS (run `43344429062`).
- Full audio transcription and multimodal understanding: NOT TESTED / NOT PASSED.
- Release: NOT AUTHORIZED. PR #8 remains Draft and unmerged.
