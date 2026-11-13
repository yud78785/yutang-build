# MCP -> open-weight visual model: one genuine end-to-end image inference

This is a narrow integration experiment, not full-video understanding or DeepSeek equivalence.

## Data lineage
- Actual original Windows video capture: run `43233257378`, artifact `13951609541`, public Douyin video ID `7577614489533680959`.
- Original ZIP SHA-256: `5b2f2432a25ef6e2581be64eb58c352652d39b245d1a0036682e39e7acac3849`.
- Original candidate EXE SHA-256: `51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575` (historical producer only; no new EXE run).
- Exact original frame 3 SHA-256: `17fbadb356f2f28879f22f93868cd96567e9068ec07692b30ee4bc135269b5b9`.

## End-to-end chain
1. Isolated Linux runner downloads the exact original artifact and verifies its immutable ZIP hash.
2. A provenance manifest is created using the dedicated browser-capture schema (does not claim that ZIP SHA is the full MP4 hash).
3. FastMCP restricted server exposes exactly five read-only tools.
4. A real FastMCP client calls `peek_frame` at the original frame-3 timestamp.
5. It decodes the actual `image/jpeg` MCP ImageContent, recomputes SHA-256, and saves *those returned bytes* to a separate handoff path.
6. Official pinned llama.cpp CPU runtime loads official Qwen3-VL-2B model/projector at immutable revision; model input path is the MCP-returned image, not the original ZIP extraction path.
7. Raw model response + hashes are kept for independent human semantic review. A successful process exit is only a technical inference pass, never automatic semantic PASS.

## Model/runtime pins
- Qwen3-VL-2B official GGUF revision `52d6c8ffea26cc873ac5ad116f8631268d7eb503`, Q4_K_M SHA-256 `089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae`.
- mmproj Q8_0 SHA-256 `f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82`.
- llama.cpp release `b12248`, archive SHA-256 `6b3a530b44f6b0a4ae4872d3b3c8d1edc2ac6bba7d8bd211329a4ba644c0dc65`.

## Non-claims
No new browser playback, no Windows EXE execution, no audio transcription, no 18-minute video comprehension, no continuous visual coverage, no DeepSeek-level equivalence, no API credentials, no paid inference, no account or user PC use. One selected real still is processed. This does not implement an autonomous action loop.
