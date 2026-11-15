# YuTang private AI — reuse-first operating rule and first public-video task (2026-11-16)

## User's non-negotiable goal

**Learn and reuse mature solutions, then actually finish a useful task. Don't rebuild existing tools to manufacture progress.** Avoid wasting user time on repeated installation, tests, certificates, code-signing, or public publishing. Work mode is not allowed for this workflow. Do not automatically spend model/API/Windows Actions quota. No password, cookie, personal account, or private browser profile should be pasted into chat or committed to GitHub.

When handed a task:
1. Define the concrete end-user result and read the latest project evidence; never cite older candidate tests as acceptance of new code.
2. First use an existing official feature/observable public source; next check maintained open-source code and license; only add custom code when a specific uncovered gap is proven.
3. Record factual evidence type (actual video frames, actual audio/subtitles, actual public comments, description, AI manuscript, indexed snippet, simulated test). Don't promote a lower grade to a higher one.
4. Deliver the answer itself, source links and actual blocker; only then decide whether implementation is warranted.
5. No external posting (including @豆包 comments), new paid provider connection, Work session, GitHub Actions run, merged production branch, EXE rebuild, or general browser automation without the proper separate boundary and consent.

## Actual sample task — learn an existing AI-browser method from an exact public video

Target `https://jingxuan.douyin.com/m/video/7642602012969930011` — indexed Douyin Jingxuan public video by **XpertAI**, published **2026-05-22**. Source: public indexed description, not frames/audio from a player. The presenter says they demonstrate a browser-automation agent that:
- Searches and opens pages automatically;
- Clicks, fills forms, takes screenshots;
- Demonstrates two cases: company announcements and an AI survey;
- Chooses actions based on page understanding instead of a fixed sequence.

**Concretely useful method for YuTang:** Make the task engine alternate (1) observation of a verified page, (2) model decides one allowlisted tool action, (3) execution with bounded budget, (4) read-after-write/response verification and a task receipt. For CorePay, keep lookup strictly read-only; for Douyin video, observe page/frames/comments without posting. This is a *design inference* from the demonstrator's public description and the project's current authorized scope, not proof the demonstrator used this exact architecture.

**Evidence gap:** No actual video frame, audio playback or direct comments were obtained. The sample does not pass the full-video-observed criterion. It does complete the lower-grade task of studying a publicly indexed demo and selecting its reusable pattern without logging in or spending quota.

## Mature source selection, exact pinned code (no copied code and no installation)

1. `risingjerry/social-media-toolkit@96502f35b0a643a578d3841d83d11228224c3dca`, `README.md` Git blob `f0018c416fecb13f1a163af3b6415bf79518ef41`, Apache-2.0: source-first, no Douyin account/cookies; public video metadata and bounded top-level public comments. **Explicitly alpha**; returns samples, not complete comment inventories or verified video interpretation. Its fuller transcription may require provider setup and costs. Review its scope and use/extend the upstream only if a concrete task warrants it.
2. `mige-studio/douyin-digest@a601400f1e77b7a3799d87e101438e7abbb44efb4`, `README.md` blob `9356fea4c69300ea39235c3f9c9251db4e49baa4`, MIT: real Chrome-extension approach to Douyin caption display, timestamp search, optional speech recognition and AI overviews. Needs an extension installation and provider credentials for some routes, so **not deployed** under the user's no-hassle requirement.
3. `microsoft/playwright-cli@b21724888b8100b05ef8dee3a92f2bb03bf4dcde`, Microsoft official CLI; browser actions/snapshots for coding agents with lower context overhead than verbose MCP; reuse the *tool patterns*, don't start a second controller or hijack the currently accepted dedicated Edge.
4. `zen-studio-labs/douyin-mcp`: hosted Apify read-only server capable of Douyin video details and comments, but **not free per invocation** (even if an account has free introductory credit), requires separate Apify OAuth and billed actor runs. Do not connect or run without user consent.
5. `yvesory/douyin-info-pipeline`: documented open-source code for Douyin's AI iframe; no explicit repository license found in the checked root, thus only study architecture and public documentation, **do not copy its code**.

## Important reliability correction

`https://www.douyin.com/shipin/7267177511400949820` is a **search aggregation route, not a stable `/video/<id>` permalink**. A search-index snippet associated it with a Codex "1575 comments" demo by 程亮Ai, whereas opening the page returned a different lead video and other suggestions. The claimed 1,575 was *presenter's statement in an indexed AI manuscript*, not an independently counted, verified real comment dataset. Never attribute an entire aggregate page or playback to that specific creator without retrieving the exact stable work ID.

Use exact public `/video/<id>` or `jingxuan.douyin.com/m/video/<id>` URLs for reproducible attribution. A `/shipin/` AI transcript can be evidence about a *search-index item* but not a definitive URL-linked live video receipt.

## Project version / acceptance boundary

- Current reuse-first task branch before this documentation: `experiment/yutang-first-task-20261115@4443253aee043a4b129d0fb414845728b79a51f6`. Its new source commit `391fa4d8eaa2d238f124663d6ffc0ddafc324940` was source-only with 27/27 offline tests and mock network, **not real on-device execution**.
- `main@4745ed23cbb748cb4b070ed70390703d1261aea0` unchanged at check.
- Original Windows 1.4.7 unsigned EXE SHA256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`; same SHA Windows 2022/2025 offline sandbox/lifecycle tests `43541915930` passed. One Windows 2025 public homepage test `43643545361` passed, earlier public-page failures remain failures. This EXE does **not contain** the experimental first-task source.
- In this research task no Windows Actions run, real EXE launch, browser login, third-party metered API, model transcription, real Douyin video playback, or public @豆包 comment was performed.

## Next task trigger (do not obscure as success)

First genuinely complete a **single exact public video** end-to-end: authenticated or anonymous page open if permitted; capture current video ID, actual played coverage and frame evidence plus captions/audio, acquire bounded public comments where accessible; extract existing AI summary only if visibly obtained; produce actionable Chinese analysis and provenance; claim partial if any of those prerequisites are absent. Prefer mature existing interfaces over new custom parser. If current chat/browser cannot execute the website and no non-Work free host has authenticated access, report that blocker honestly; do not rebrand online search snippets as true video watching. 
