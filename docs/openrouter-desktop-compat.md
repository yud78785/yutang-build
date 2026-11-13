# OpenRouter fallback for the standalone desktop app — exact upstream 1.4.7 source patch

## Upstream baseline
- Repository: LockyBee/dsh-douyin-agent
- Exact source commit: 9c49833078f4b4d18b9211ef86d024e7f2e15739 (1.4.7)
- The Windows playback acceptance in PR #8 remains tied to the separate 1.4.6 candidate EXE SHA-256 51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575. This source patch does not rebuild or retest that EXE.

## What the patch changes
The desktop app already stores a user-supplied API Key through its private Electron IPC and supports a custom HTTPS API base URL and model identifier. The source patch adds one shared request-body adapter and routes every standalone-app chat-completions path through it:
- ApiAgent.decideWatch — autonomous visual decision with image input.
- ApiAgent.runTask — task agent with constrained tool calls.
- ChatAgent.reply — private chat reply.
- SparkAgent.greet — daily greeting.
- PublicCommentAgent.generate — public comment generation.

Official DeepSeek requests retain their existing request body unchanged. When the exact OpenRouter endpoint is selected, the adapter requires the exact model slug deepseek/deepseek-v4.1-flash, removes DeepSeek-only thinking, maps it to OpenRouter reasoning effort none, and enforces:
- provider.sort = price
- provider.max_price = prompt $0.30/M and completion $1.20/M
- provider.data_collection = deny
- provider.zdr = true
- provider.require_parameters = true

The ceiling is an upper limit, not a fixed price. If no image-capable provider satisfies the request parameters, data policy and price ceiling, the request must fail rather than silently relaxing the restrictions. OpenRouter remains a third-party intermediary; ZDR constrains the actual inference provider and is not a promise that the intermediary processes no request or billing metadata.

## Desktop usability
The model settings panel adds two presets:
- Official DeepSeek: https://api.deepseek.com + deepseek-flash
- OpenRouter backup: https://openrouter.ai/api/v1 + deepseek/deepseek-v4.1-flash

The API Key still goes only through the existing desktop IPC and encrypted local storage option. The preset changes only the endpoint/model and never creates a key, account or payment.

## Verification
The workflow checks exact original upstream file blob hashes before applying the patch, verifies that all patched modules are staged into the desktop runtime, then tests all five production request paths with mocked fetch responses. It also exercises the actual desktop worker IPC configuration path and parses the modified JSX. No live API key, model request, browser login, user PC, Windows EXE build, merge or release is involved.
