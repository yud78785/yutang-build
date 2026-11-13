# One-shot DeepSeek production visual inference (bounded, opt-in secret only)

## Why this next
The prior experiment proved original Windows JPEG -> restricted FastMCP ImageContent -> pinned Qwen local inference. Qwen2B is only a transport/pipeline smoke model. The original YuTang production `ApiAgent.decideWatch` already sends a three-frame storyboard to `https://api.deepseek.com/chat/completions`, accepts a constrained decision, has no tool definitions in this method, and does not execute browser actions.

Official DeepSeek docs (checked 2026-11-13):
- `deepseek-flash` is the current DeepSeek-V4.1-Flash-1017 model and accepts JPEG image input. The retired `deepseek-v4-flash-vision-exp` name routes to the same current Flash model. https://api-docs.deepseek.com/guides/vision/
- Official peak pricing: input $0.30 / million tokens, output $1.20 / million; off-peak half. Images are tokenized at up to 1024 tokens per image. https://api-docs.deepseek.com/quick_start/pricing/

## Guardrails
- The workflow only reads the optional existing GitHub repository secret named `DEEPSEEK_API_KEY`. It never prints or copies the key. If absent, it records SKIPPED and sends zero requests.
- Exactly one production `ApiAgent.decideWatch` request, three previously verified original public-video JPEGs, max 1200 output tokens, no retries, no tools, no browser, no action, no memory, no audio.
- A conservative peak-rate cost upper estimate is calculated from actual token usage, ignoring cache-hit discounts. The receipt rejects an estimate above USD $0.01.
- The exact original `LockyBee/dsh-douyin-agent` commit `912873e2556d16a088d81dcbc6f7c0060614dd58` and `api-agent.mjs` Git blob `8f5187dc9e48f1ca1a91b8c545236233d68268e6` are pinned.
- The original script deliberately exits 1 after printing a response to force independent review. The workflow parser accepts only that expected review-gate exit and does NOT convert it to semantic acceptance.

## Acceptance separation
A received response proves a genuine paid production vision call and actual model output only. The lexical scorer is a precheck; current ChatGPT must independently compare the response to the exact original images. A correct three-frame answer still does not prove 18-minute playback, audio, continuous video understanding, autonomous actions, or DeepSeek-level equivalence of YuTang as a system. No merge/release or Windows EXE changes.
