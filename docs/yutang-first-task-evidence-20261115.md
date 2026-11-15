# YuTang — first practical readonly AI task: source-only acceptance (2026-11-15)

**Release status: NOT READY. Actual user Windows private AI end-to-end acceptance: NOT PERFORMED.** No code signing or publishing required for this personal-use work. The first functional goal is one verified public browser observation → the EXISTING upstream ApiAgent tool call → evidence-bounded analysis.

## Pinned baselines

- This task branch `experiment/yutang-first-task-20261115` was created from `84cee6da0bb04f347bd42104da9e41bdd6926c18`, the earlier public-comment-only experimental branch with historical **94/94 Linux source-only tests**. Do not report those as fresh tests here.
- New code/tests commit `391fa4d8eaa2d238f124663d6ffc0ddafc324940`. Only two new tools, two tests and a README were added. No source of the accepted EXE was modified.
- Upstream runtime `LockyBee/dsh-douyin-agent@9c49833078f4b4d18b9211ef86d024e7f2e15739`, exact upstream `api-agent.mjs` Git blob `e7c3f37ad39b29a461ecef1356c86d4de6822ff1`.
- Existing readonly source `tools/run-douyin-existing-browser-readonly.mjs`, `tools/douyin-existing-browser-readonly.mjs` and passive comment reader are inherited from the pinned experiment branch. The private one-shot source reader itself does not launch or change a browser.

## New source proof and exact hashes

| File | Git blob SHA-1 | SHA-256 |
| --- | --- | --- |
| `tools/yutang-first-task.mjs` | `39fa343f5afb85b270b34a5c8fca5d46394ca36b` | `525d1f587d154745637d61817fada1a2c085071caf111e2ce59ea12dab01af4b` |
| `tools/run-yutang-first-task.mjs` | `9aeaa8e4530f59eb8312cd7bcb577db70c3df38b` | `8900de50ea755fa1c2f7668877c2169b9cdcc5904b1414aafed61ce583feadaf` |
| `tests/yutang-first-task.test.mjs` | `dd7ff293c62366808cd49c4486aeb619fc5ed593` | `860852720a7e1c85a6f0643ed5f72ee97b0774b5670c045965cded4b17def7ef` |
| `tests/run-yutang-first-task.test.mjs` | `bd0b75f08488b1ba4c9d51ed763f65207cf0aeff` | `263b068728a1ea0236330c39a426d327be3101cae210c75c7b52c5dddd1dd203` |

## Actual verification, not promises

- Local Linux Node.js **v22.16.0** syntax and **27/27 isolated tests pass** with 0 failures, 0 skipped. Actual TAP SHA-256 `134f70fa9b08c72bde1a466e305964f15c5b4ff4acb7788f04a1f40de77d594e`.
- All 15 files of the earlier pinned upstream+existing-readonly snapshot were restored and verified **15/15 Git Blob SHA-1 exact match**, followed by 3 current readonly updated sources verified against the 84cee branch SHA.
- **Actual upstream ApiAgent class**, with synthetic HTTP response objects, executed **2 model-message cycles, exactly 1 `douyin_status` tool call and one analysis answer**, with a strict read-only controller. This is stronger than a fake AgentClass test but **no live AI provider was called**. Separate result JSON SHA-256 `971d2a2ead6cd227967a82fcc0233373d449a7c975904c4165d238b628c47b4a`.
- One-shot CLI on the real isolated Linux host exited code **2** and emitted `WINDOWS_REQUIRED`, preserving truthfulness. No Windows desktop/browser accessed. Downloaded ZIP was independently unzipped and the included standalone 27 tests re-executed with 27/27 pass.
- **Downloaded source-only evidence ZIP**: `YuTang-First-AI-Task-ReadOnly-SOURCE-ONLY-20261115.zip` size **34147** bytes; SHA-256 **`7bfe54ecbd8e07c0656a44c075116cf3385de0ea11bcf752d4af985a3fc12811`**; bundled 15 paths including source, MIT notice, test logs, source hashes and standalone evidence.
- Owner-only Google Drive backup (metadata `shared=false`, 34,147 bytes), exact archive hash read back: https://drive.google.com/file/d/141553TQMhODxUrwsdAT_ivZ4X0o498DQ/view?usp=drivesdk
- Code is available through GitHub commit `391fa4d8...`; the Google Drive package is only a convenience archive and not a signed EXE.

## Safety and semantics

- The new AI tasks **reuse the existing upstream `ApiAgent.runTask`**, not a second AI model or local heavyweight inference engine.
- The executable source runner calls the existing verified dedicated-Edge reader only. It cannot open, navigate, login, click, post, private-chat, like, pay or edit browser data. It allows one real API tool name `douyin_status`; all other tool names fail closed.
- A missing browser read, a different video, a missing upstream `tab-api` lock release, forged data, or zero evidence blocks before any model call. It distinguishes DOM-visible comments from **passively captured first-party API responses**; the latter must not be described as visually observed comments. An AI summary entry is not summary content, and no video frames or audio were observed by this new task.
- The CLI is in PREVIEW-only mode unless `--allow-model` is explicitly supplied **and** `DEEPSEEK_API_KEY` is already locally configured. The current reviewed provider route is only `https://api.deepseek.com` with `deepseek-flash`; 2 model steps, 1 tool call and 512 max output tokens/step. Do not add private credentials to GitHub/chat.
- This is **not** a package inside any already accepted EXE; no automatic updater activation, credential usage, paid Windows Actions, `main` mutation, merging, personal computer operation, or public release.

## Original Windows candidate — separate prior acceptance, unchanged

- Original unsigned `Dafeiyu-Douyin-API-1.4.7-win-x64.exe`: SHA-256 `3201d433df727a5d5fddf8e68a0f69ea1654057e04cfad7833fd3ed7dc241a34`.
- Offline same-file Windows 2022/2025 startup, Edge sandbox and process cleanup: [Run 43541915930](https://github.com/yud78785/yutang-build/actions/runs/43541915930).
- One Windows 2025 real public homepage render and process cleanup: [Run 43643545361](https://github.com/yud78785/yutang-build/actions/runs/43643545361).
- None of those Windows runs contains the new first-task sources. The failure in earlier fourth public-page run `43634463515` is still a failure, not reclassified.

## Next uncompleted useful milestone

**BLOCKED on access to a real, already-running dedicated YuTang Edge + an authorized Cloud AI configuration.** Source alone does not prove live Douyin comments, live model, or full private AI autonomy. A future Windows isolated execution using the exact new sources must produce a redacted real readonly receipt for one public video and demonstrate either preview evidence or (with explicit paid-model opt-in) real provider tool/answer exchange. Test actual packaged candidate and SHA separately before claiming that the EXE contains this function. No repeated old Windows candidate tests are necessary unless a *new* candidate is built.

The project goal is a useful PRIVATE AI that can take and complete a real task. Certificate procurement, code signing and public distribution are out of scope for this milestone.
