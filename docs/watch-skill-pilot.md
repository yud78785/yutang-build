# YuTang: read-only, remote real-audio/video Watch Skill pilot

Status: experimental source only. No CI result is claimed by creating this document.

## Why a different branch
Windows security/candidate lives in PR #7, video playback tests in PR #8, the autonomous loop has separate evidence in PR #12. This pilot imports an upstream component rather than changing any Windows source or EXE. Source based on main commit 4745ed23cbb748cb4b070ed70390703d1261aea0; no merge or deployment.

## Input and permission
- Original source: W3C Web Accessibility Initiative Evaluation Video, conformance evaluation.
- Video: https://media.w3.org/wai/evaluation-intros/conformance-evaluation.mp4
- Independently published caption oracle: https://media.w3.org/wai/evaluation-intros/conformance-evaluation-cc.vtt
- License: W3C WAI permission to use with attribution; preserve the original complete video including the closing WAI link when using or sharing it. https://www.w3.org/WAI/about/using-wai-material/ . CC BY 4.0 has not been established for this video.
- Attribution: Copyright W3C Web Accessibility Initiative, https://www.w3.org/WAI/test-evaluate/
- The experiment downloads the entire authorized, originally narrated video to a disposable public GitHub standard Linux runner. It does not upload media, raw audio or frames as build artifacts. This is not a Douyin sample.

## Exactly reused
- Upstream oxbshw/watch-skill Git commit f1317c8fe64744a606c31867b05fbbe3144268c6 (MIT). Actual Watch Skill watch() function; PySceneDetect scene selection and frame extraction; offline local faster-whisper ASR.
- Upstream Git checkout is verified before installing any Python dependency. Dependency versions are recorded after installation; they are not yet transitively locked.
- Small public CTranslate2 tiny.en speech model fetched at its immutable Hugging Face commit SHA and that SHA + model.bin SHA-256 are stored in the manifest.
- The model is fetched before the run; the actual watch() operation runs with WATCHSKILL_OFFLINE=1 and HF_HUB_OFFLINE=1.
- Only the processing extras perceive and whisper are installed. The full 39-tool MCP service, loop commands, shell execution, browser control, sign-in, cookies and cloud provider API calls are not enabled.

## Gates
An independent Python verifier recomputes original video/caption/model hashes, exact upstream Git SHA, frame byte hashes and increasing timestamps, requires at least three visually nonidentical actual frames, requires nonempty real whisper-local transcription with sane timestamps, and compares recognized words against separately obtained official captions. Green means only PASS_REAL_AV_COMPONENT_ONLY. No green verdict can establish full-video semantic understanding or ASR correctness at word level.

## Known limitations and stop conditions
- First run discovers (then fixes for that run) the public model revision and records source-media hashes. For reproducible later runs, pin those exact hashes and a dependency lock after a real success.
- No OCR; no language model video interpretation; no Windows EXE build, OS sandbox or persistent Douyin playback here.
- A short authentic W3C clip is only a pipeline test; not proof of 18-minute scene/audio coverage on Douyin.
- Any speech quality, scene, model download, unsupported dependency or media access failure must stay red. CI completed/success without independent verdict is not acceptance.
- W3C captions are comparison evidence only; they are never passed into the Watch Skill transcription input.
- No release, merging into main, personal keys, account access, local PC install, or repeat paid Windows Actions.

Next after this pilot genuinely passes: build a narrow read-only MCP adapter for timeline, transcript range and timestamped frame lookup; do NOT expose Watch Skill's full MCP server because two upstream loop tools can execute shell commands.


## 2026-11-13 correction: real ASR dependency failure and exact-data pin
- Prior exact PR #9 experiment `ae63935abbc6dca53ad641f3224733fe1dc2d5d0`, Actions `43337204258`, failed: `TypeError: open() got an unexpected keyword argument 'metadata_errors'`.
- Proven runtime: `faster-whisper==1.2.1` / `av==19.0.2`, where newer PyAV removed an argument that the released transcription library still uses. The upstream open issue is SYSTRAN/faster-whisper#1589. The experiment now *requests* `av==18.1.0` and checks a real original MP4 decode before actual ASR; this is a corrective candidate and NOT passed until its exact CI run succeeds.
- Source video SHA-256 `ec419be88b5d6cf2354a366caae8012a979438decef0154a6087a9813c662dbb`, W3C reference VTT SHA-256 `13f4260d81fe67debd47d0b0f22870a96650f83e9c83dc0050d9957b9e86ac9f` previously witnessed in runner logs and now pre-pinned, not trusted based on a self-reported manifest.
- Speech model source revision `0d3d19a32d3338f10357c0889762bd8d64bbdeba`, model.bin SHA-256 `1a5afae06a4db91c975c9a9d78be5cc110ee4ea022ad57d55492e4550e936b2a` previously verified and now pre-pinned.
- Removes docs-only push triggers and uses concurrency cancel-in-progress to avoid repeated expensive processing. No rerun of original Windows EXE.
- Upstream Watch Skill source pin `f1317c8fe64744a606c31867b05fbbe3144268c6` and separate independent verifier are unchanged. This version does not yet pin every transitive dependency by wheel hash, which remains a future supply-chain hardening gate.
