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
- Verify local seek at t≈0 before play, then validate playback start within the same page evaluation. This avoids requiring currentTime to remain below 1.25 seconds while a separate asynchronous state call is being read.
- New --startup-diagnostic mode runs exactly one real 20-second capture segment, returns PASS_VIDEO_STARTUP_ONE_SEGMENT_ONLY_NOT_FULL_VIDEO, and exits before any natural-end claim.
- It reuses the prior same-EXE / same-Edge-version sandbox evidence from run 43326123532, and skips the unrelated Edge + restart cycles. It still launches the original EXE on a disposable Windows GitHub runner, verifies candidate ownership/loopback, and cleans up its own process tree.
- Existing full 18-minute workflow is guarded by an explicit [run-full-video] commit-message marker. A normal code change cannot silently trigger another 18-minute test.

## Acceptance
A startup diagnostic PASS proves only the first segment is captured by the original EXE with a verified timestamp and source. It does NOT prove whole-video playback, audio transcription, visual understanding, or release readiness. Only after this diagnostic passes should a separate explicitly tagged full run be considered.
