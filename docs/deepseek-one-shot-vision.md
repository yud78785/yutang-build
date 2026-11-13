# One-shot production vision: DeepSeek primary, OpenRouter backup

## Why this is the right fallback
The same pinned YuTang production `ApiAgent.decideWatch` is reused for both providers. It already handles the real three-frame storyboard, image payload, timeout, response JSON validation and safe-stop decision parsing. The provider switch changes only the HTTPS base URL, model identifier and API key; it does not replace the vision implementation.

## Provider selection
- Automatic selection: use official DeepSeek if `DEEPSEEK_API_KEY` exists; otherwise use OpenRouter if `OPENROUTER_API_KEY` exists; otherwise skip with zero requests.
- If both keys exist, set GitHub repository variable `YUTANG_VISION_PROVIDER=openrouter` to explicitly select the backup. Allowed values are `auto`, `deepseek`, `openrouter`. A selected provider without its matching secret fails closed.
- A failed official request does **not** automatically trigger a second OpenRouter request. This avoids accidental double billing. After reviewing the error, the user may explicitly select OpenRouter and retry one time.
- Only repository secrets are read by CI. No key is printed, written into Git, copied into an artifact, or exposed to this chat.

## Fixed model and endpoint
- Official DeepSeek: `https://api.deepseek.com`, model `deepseek-flash` (DeepSeek V4.1 Flash; image-capable).
- OpenRouter: `https://openrouter.ai/api/v1`, model `deepseek/deepseek-v4.1-flash`.
- OpenRouter is a routing/billing intermediary, not the official DeepSeek endpoint. It routes the same named model across hosting providers; the actual inference host may differ from DeepSeek's own infrastructure.
- Both paths use the original pinned production ApiAgent source `LockyBee/dsh-douyin-agent@912873e2556d16a088d81dcbc6f7c0060614dd58`, API-agent Git blob `8f5187dc9e48f1ca1a91b8c545236233d68268e6`.

## Privacy and cost limits
- Exactly one API request; three previously verified original Windows JPEG samples; the production storyboard packs them into one bounded image; maximum 1200 output tokens; no retry, browser tools, autonomous action, audio, transcription or memory.
- OpenRouter requests require `data_collection: "deny"` and `zdr: true` (zero data retention) and `require_parameters: true`. If no eligible ZDR image-capable provider exists, the request must fail rather than silently relaxing the privacy rule.
- OpenRouter provider routing sets `allow_fallbacks: true` so it can retry another provider only within the same privacy-filtered model route, sorts eligible providers by price, and enforces a hard `max_price` of $0.15/M prompt and $0.60/M completion. This is deliberately higher than the model catalog's cheapest $0.022/$0.40 rate because ZDR can exclude DeepSeek's own endpoint: OpenRouter's own routing article records a ZDR request for this model being served by Decart, while pinning the DeepSeek provider returned no ZDR endpoint. Decart's published listing for this model is $0.123/M input and $0.492/M output, within the chosen cap. `data_collection: deny`, `zdr: true` and `require_parameters: true` remain mandatory; if no image-capable provider supports all request parameters within the ceiling, the request must fail. The official DeepSeek route separately uses a $0.30/M prompt and $1.20/M completion peak-price ceiling. The independent verifier applies the provider-specific ceiling actually sent in the request. A request above the $0.01 estimated upper bound is rejected from acceptance.
- The upstream production ApiAgent adds DeepSeek's `thinking: {type: 'disabled'}` extension. The OpenRouter transport maps this to the documented OpenRouter `reasoning: {effort: 'none'}` parameter, then applies its provider policy; all other production image packing, response parsing and decision validation remains unchanged. The standalone desktop 1.4.7 source has now received a separate exact-source patch covering all five normal production model paths and the settings presets; that patch passed Linux source/IPC/UI compatibility CI, but no Windows EXE has been built or tested.
- No API request occurs unless a configured secret exists. No automatic top-up or payment is enabled.

## Payment fallback facts (checked 2026-11-13)
- DeepSeek's terms say recharge methods and prices are whatever the official platform currently displays; do not assume a particular card or region will work. Check its actual checkout page.
- OpenRouter Standard currently lists credit/debit cards, AliPay and USDC. Its Terms specify $5–$25,000 per credit purchase, while the pricing FAQ says there is no minimum spend/lock-in; treat the actual checkout and current Terms as authoritative before paying. Unused-credit refunds can be requested within 24 hours; platform fees are non-refundable and cryptocurrency purchases are not refundable. Unused credits may expire after one year. Standard credit purchases have a 5.5% platform fee (Business 8%); inference is charged at listed model/provider rates. Keep Auto Recharge OFF. The current model catalog lists a cheapest/base rate of $0.022/M input and $0.40/M output, but a privacy-constrained ZDR provider can cost more; the desktop/one-shot backup hard cap is $0.15/M input and $0.60/M output.
- Use only the official sites: https://platform.deepseek.com/ and https://openrouter.ai/ . Do not use unofficial top-up agents, share API keys, or provide extra personal documents to a third party. USDC is not USDT; crypto is optional and not recommended as the first fallback if unfamiliar.

## Exact source media and strict scope
- Original Windows capture: video ID `7577614489533680959`, artifact `13951609541`, original archive SHA-256 `5b2f2432a25ef6e2581be64eb58c352652d39b245d1a0036682e39e7acac3849`.
- One-shot visual inference is still only a three-frame sample from the public video. It does not prove full 18-minute playback, audio understanding, temporal reasoning across unseen intervals, autonomous actions, or DeepSeek-equivalent overall system capability.
- A received model response is only a technical response record and lexical precheck. Independent visual review remains required. No merge, release or Windows EXE changes.
