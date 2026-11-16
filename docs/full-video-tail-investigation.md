# YuTang | last-seven-seconds natural-ending root-cause diagnostic

## Authoritative failed full-playback evidence (do not reclassify)

The original Draft PR #8 full-run source `1c50c1ef06e1b162ff1dae65e19dc650156a9362` had a **real** Windows Actions run `43318516477` / job `131532817332` that **failed**. GitHub's exact artifact ID `13991131199` ZIP SHA-256 `aa5fbdd52fe6d14251d5787f29c3c273054a0cb5174402eddba16fc91024d25c` was downloaded and independently validated, including the actual `full-coverage-ledger.jsonl` (55 lines, 1 BEGIN + **54 SEGMENT** entries). A local Node verifier recomputed all 55 SHA-256 chain links and checked every boundary and decode count:

- Original public video `7577614489533680959`, expected duration **1082.518 seconds**.
- Initial verified video time **0.016886 seconds**; last verified sampled segment ends **1081.366499 seconds** (missing **1.151501 seconds** to expected end).
- **162** authentic video-canvas JPEG sample hashes in 54 segments (intermediate raw JPEGs are deliberately not uploaded).
- **54** audio chunk captures, combined tagged audio time span ≈ **1079.837931 seconds**, **not transcribed** and raw audio not stored.
- Maximum segment-boundary gap **0.225310 seconds**, combined known gaps **6.590862 seconds**; hash chain, segment numbering, monotonic decoded frame counters and sampled video IDs passed independent integrity checks.
- No `END` ledger entry, no `full-playback-result.json`, no saved original `HTMLVideoElement.ended` snapshot. The fallback probe error was `PUBLIC_VIDEO_EVIDENCE_INCONCLUSIVE`, generic `Error`; **the precise root cause was not recorded**. The source checks video identity before every final tail status read. Automatic next-video navigation or DOM replacement is a plausible *hypothesis*, NOT established fact. The original isolated EXE cleanup PASSED.

The exact original production Windows candidate remains `yud78785/yutang-build` PR #7 SHA `00f5ac8d560f8459f333cadeb9e9cb227cfaeca6`, EXE SHA-256 `51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575`; its previous Job Object/sandbox tests remain candidate-specific and should NOT be rerun needlessly.

## Narrow corrective experiment — tail only, NOT full playback

The new `.github/workflows/windows-video-tail-diagnostic.yml` uses a disposable GitHub-hosted Windows runner, original **already-built hash-verified EXE** and original isolated Edge/security/cleanup harness. It is deliberately separate from the full-length workflow and **does not trigger another 18-minute playback**:

- `tools/run_video_tail_diagnostic.mjs`: after confirming the authentic public video URL and video identity, performs **one explicit local seek to duration minus 7 seconds**, registers an `ended` event listener on the *original* HTMLVideoElement **before play**, and captures the original end-event snapshot (video time, `ended`, `seeking`, `loop`, element connection and decoded-frame progression).
- A **15-second event deadline** and strict expected duration, time, decoder and wall-clock requirements. The diagnostic detects element detachment, automatic rewind/switch, play rejection or missing end event. It writes a private, bounded `tail-diagnostic.json` even on failure; no raw media, logged-in profile or account writes.
- `tests/test-video-tail-diagnostic.mjs`: **6/6 passed locally** on Node 22.16, including refusal of fake or missing end-event signals, loop/reseek, wrong duration, implausibly fast/late completion and stagnant decoder counter. Git blob hashes of exact locally-tested source are `5afd235843a20a289cc1c397094a07e650418843` (helper) and `2c32b4a17c5544f2f74fb6780b2fd7eff081a557` (tests).
- `tools/windows_full_video_tail_probe.mjs`: derived from previous exact safe production-execution harness with **tail-only scope**. The only permitted green assertion is `PASS_PUBLIC_VIDEO_TAIL_ONLY_NOT_FULL_VIDEO`. It reports `videoPlaybackTested:false` and the explicit missing full-video acceptance, even if near-end succeeds.

**Important limitation:** A local seek to the final 7 seconds intentionally skips the first 17+ minutes. A GREEN tail-only job only proves an actual end-event capture mechanism is viable on the isolated candidate in this narrow context. It is *not* an actual full-length watch, not an AI viewing all frames, not an audio transcription and not DeepSeek-level autonomous intelligence. Any future full-duration retest must be a separate source-hash-specific run, warranted by the tail diagnostics.

## Reuse strategy after playback root cause is resolved

`stevederico/video-understanding@8161249c2d05e5d08d77a03f31a916543afd7450` (MIT) offers an existing timestamped frame + full speech transcript + video understanding manifest workflow, but needs a legitimately accessible video **file or direct media URL**, not a Douyin social page. `Breakthrough/PySceneDetect` (BSD-3-Clause) finds dynamic scenes/keyframes; `m-bain/whisperX` (BSD-2-Clause) aligns ASR and speaker timing. Integrate them in disposable cloud processing **only after lawful full AV bytes become available** and their pinned source/dependency/license audits pass; SHA hashes alone cannot be transcribed. No personal Windows inference, personal DeepSeek KYC, paid model credential, security bypass, unauthorized downloader, PR merge or release.

**At authoring time the tail-only GitHub CI has not yet run, so no tail or full-video pass may be claimed.**

## Actual first tail-only Windows CI: PASSED (exact version proof)

This section supersedes the preceding “pending at authoring” line for a later exact commit. Cloud Windows Actions run `43325231486`, job `131555900018`, **completed/success**, attempt 1, trial head `e0ae6e4b0da2f916d0bff1cd1cc4e1a019dff881`. Verified original EXE SHA-256 `51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575`, signed Edge sandbox and process cleanup. Actual artifact `13992726290`, ZIP SHA-256 `da83bc9575c1dd9b015915c168703861ed763d9d192a370b46a60f9448a7cfce` was fetched back and the original `tail-diagnostic.json` inspected:
- Original public video `7577614489533680959`, duration of this playback **1082.517006 s**, previous reference 1082.5 s within .018 s.
- One explicitly declared seek: video time **1075.518390 → 1082.517006 s**, 7084.8 ms actual wait.
- Original video's native `ended` event: **eventSeen=true**, `ended=true`, `loop=false`, `seeking=false`, and same original element still connected. Video decode counters **229 → 435**. The full result explicitly states `wholeVideoPlaybackVerified:false`, `fullAudioTranscriptionVerified:false`, `fullVideoSemanticUnderstandingVerified:false`.
- https://github.com/yud78785/yutang-build/actions/runs/43325231486

This proves the original player can produce a trustworthy natural-end signal when the listener is armed *before* reaching the endpoint. The original 18-minute failure remains **unattributed at an exact error-code level** because it suppressed the last exception; a race between strict polling and next-video navigation is a plausible diagnosis, **not a proven mechanism**.

## Specific new full-playback repair and reason to rerun

The new `tools/run_full_video_coverage.mjs` uses **the same** original `currentVideo()` locator from the start, stops asking `controller.state()` to identify a possibly auto-advanced page once fewer than 2 s remain, and directly arms an `ended` event listener on the original HTMLVideoElement. It saves a bounded hash-linked `TAIL_SNAPSHOT` ledger entry **before** evaluating PASS/FAIL, then requires `verifyFullVideoNaturalEndEvent()` to check eventSeen, same element connected, stable duration, valid end time, stopped looping/seeking and decoder counters. Unknown/detached/missing event still FAIL closed with a saved diagnostic category; no bypass or guessed timeline.

The new pure validator's **5/5 offline Node 22 tests passed** and its Git blob SHA is `8bfebdd6c625b8f5442c35fb88b0cb8f1d093fbf`; the negative-test source blob is `4373b85704a0f6b60a6f25ff4271ec5861676be7`. This is a *real, source-specific fix*, so **one** new from-start ~1082-second Windows run on the same exact original candidate EXE is warranted; older full-run failure and 7-second tail success cannot substitute for it.

Again, new successful playback would prove only **playback to end with sampled screenshots and audio capture hashes**, NOT complete visual/audio semantic comprehension, automatic video summarization, model reasoning or production readiness. No new EXE build, PR merge or released product.
