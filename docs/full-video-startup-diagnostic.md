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

## Separate full run now in progress
- Full-length run 43344429062 was triggered on the earlier helper-fix commit 807756... before the explicit full-run marker guard was added.
- It uses the original EXE SHA above and the new same-element startup helper; it is allowed to continue as the first full-duration attempt after the startup fix.
- Do not treat it as passed until the original video ended event, complete ledger, duration coverage, and final process cleanup are independently verified.

## Acceptance
A startup diagnostic PASS proves only the first segment is captured by the original EXE with a verified timestamp and source. It does NOT prove whole-video playback, audio transcription, visual understanding, or release readiness. Only after the separate full run completes and its raw logs/artifact are checked can full playback be considered.
