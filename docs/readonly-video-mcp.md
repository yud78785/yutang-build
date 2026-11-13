# YuTang read-only video evidence MCP adapter (isolated experiment)

## Status
A focused read-only adapter proposed after the **separate** real AV component passed on `20cf39d`, run `43340305925`. This new adapter is **NOT** validated by that earlier media run: it has its own synthetic contract/transport CI. PR #9 stays Draft/unmerged.

## Purpose
Do not expose upstream Watch Skill's whole 39-tool MCP service: two upstream looping tools can execute shell commands. Only five tools can ever be registered by this separately implemented adapter: `video_status`, `get_video_timeline`, `get_transcript`, `search_transcript`, `peek_frame`.

The upstream Watch Skill processing output is indexed once in a trusted, *ephemeral* cloud workspace. The evidence directory and expected original video SHA-256 are supplied by the **operator at server launch**, not the model. The model cannot request any arbitrary path, URL, shell command, account change, or file modification.

## Setup (in a trusted isolated environment)
Install exactly `fastmcp==3.4.5` in a disposable Python virtual environment (never run on the user's constrained daily Windows PC). Then place the original pilot manifest and extracted frame bytes under `/trusted/video-evidence`:

```bash
python tools/readonly_video_mcp.py \
  --evidence-root /trusted/video-evidence \
  --expected-video-sha256 ec419be88b5d6cf2354a366caae8012a979438decef0154a6087a9813c662dbb
```

The transport is stdio only; no HTTP listener, credentials, or user session. A client can use the five tools to query only the fixed indexed media. A caller must arrange for the actual extracted JPEG bytes at `extracted/<relative-frame-path>` to enable `peek_frame`. PR #9's original media CI deliberately uploaded manifest/verdict only, not raw frames: **using its artifact alone will make frame retrieval fail closed**. No fake image can be substituted for that claim.

## Security and evidence
- Manifest schema, exact operator-provided source SHA, flags and timestamp ordering are validated at startup.
- A bounded read checks frame presence, its canonical path stays under the approved root, byte cap, JPEG magic and SHA-256 against the manifest before sending the image.
- Only timestamped sparse frames and ASR text are available; every tool returns explicit limits, never full motion understanding.
- Untrusted subtitle/OCR/model text is never treated as executable instructions.
- No network/download, shell, subprocess, modifying data, login, provider calls, Windows EXE or browser-control endpoint is implemented.
- Every tool is listed in an exact-name allowlist and tested through an in-memory MCP client.
- Synthetic-only transport and boundary tests are separate from the real media processing run and **do not** validate end-to-end YuTang brain usage.

## Still missing
Real-media MCP acceptance with the exact historical frame bytes; second independent consumer/code review; proper artifact distribution for authorized media; Chinese video/audio, OCR, semantically grounded strong vision model, autonomous browser execution, and release safety. Do not merge or release.
