#!/usr/bin/env python3
"""Validate one live DeepSeek ApiAgent result without promoting it to semantic PASS."""
from __future__ import annotations
import json
import sys
from pathlib import Path

def main() -> None:
    path = Path(sys.argv[1])
    exit_code = int(sys.argv[2])
    text = path.read_text(encoding="utf-8", errors="replace")
    marker = "YUTANG_LIVE_VISION_RESULT "
    rows = [line[len(marker):] for line in text.splitlines() if line.startswith(marker)]
    if len(rows) != 1:
        raise SystemExit("EXPECTED_EXACTLY_ONE_REAL_API_RESULT")
    result = json.loads(rows[0])
    if exit_code != 1:
        raise SystemExit("ORIGINAL_REVIEW_GATE_EXIT_CODE_CHANGED")
    profiles = {
        "DeepSeek API": ("deepseek", "deepseek-flash"),
        "OpenRouter": ("openrouter", "deepseek/deepseek-v4.1-flash"),
    }
    provider = result.get("provider")
    if provider not in profiles:
        raise SystemExit("UNSUPPORTED_VISION_PROVIDER")
    provider_id, expected_model = profiles[provider]
    required = {
        "providerId": provider_id,
        "model": expected_model,
        "requestedModel": expected_model,
        "requestCount": 1,
        "requestCountObserved": 1,
        "frameCount": 3,
        "actionExecuted": False,
        "browserToolsExecuted": False,
        "audioSent": False,
        "transcriptionPerformed": False,
        "memoryWritten": False,
        "semanticReviewRequired": True,
        "semanticVerifiedByIndependentReviewer": False,
    }
    for key, expected in required.items():
        if result.get(key) != expected:
            raise SystemExit("UNEXPECTED_RESULT_FIELD_" + key)
    if result.get("status") not in {
        "REVIEW_REQUIRED_LIVE_VISION_LEXICAL_PRECHECK",
        "FAIL_LIVE_VISION_LEXICAL_PRECHECK",
    }:
        raise SystemExit("UNEXPECTED_SEMANTIC_GATE_STATUS")
    route = result.get("routeMetadata") or {}
    served_model = route.get("servedModel")
    if served_model and served_model != expected_model:
        raise SystemExit("ACTUAL_SERVED_MODEL_DOES_NOT_MATCH_PINNED_MODEL")
    if provider_id == "openrouter":
        policy = result.get("providerPolicy") or {}
        if (policy.get("dataCollection") != "deny" or
                policy.get("zeroDataRetentionRequired") is not True or
                policy.get("sort") != "price" or
                policy.get("maxPriceUsdPerMillion") != {"prompt": 0.30, "completion": 1.20} or
                policy.get("requireParameters") is not True):
            raise SystemExit("OPENROUTER_PRIVACY_OR_PRICE_CEILING_MISSING")
    storyboard = result.get("storyboard") or {}
    if storyboard.get("inputImages") != 3 or storyboard.get("outputImages") != 1 or storyboard.get("status") != "storyboard":
        raise SystemExit("PRODUCTION_STORYBOARD_CONTRACT_NOT_PROVEN")
    usage = result.get("usage") or {}
    prompt = usage.get("promptTokens")
    completion = usage.get("completionTokens")
    if type(prompt) is not int or type(completion) is not int or prompt < 0 or not 0 < completion <= 1200:
        raise SystemExit("INVALID_OR_UNBOUNDED_TOKEN_USAGE")
    # Same conservative hard ceiling for both routes: DeepSeek's official peak
    # rate and the OpenRouter per-million-token max_price enforced in the request.
    ceiling = result.get("priceCeilingUsdPerMillion")
    if ceiling != {"prompt": 0.30, "completion": 1.20}:
        raise SystemExit("PRICE_CEILING_MISSING_OR_CHANGED")
    cost = prompt * ceiling["prompt"] / 1_000_000 + completion * ceiling["completion"] / 1_000_000
    if cost > 0.01:
        raise SystemExit("ONE_SHOT_COST_ESTIMATE_EXCEEDS_USD_0_01")
    encoded = json.dumps(result, ensure_ascii=False)
    if "data:image/" in encoded or "Bearer " in encoded or len(encoded) > 100_000:
        raise SystemExit("SENSITIVE_OR_OVERSIZED_RESULT")
    receipt = {
        "status": "ONE_REAL_DEEPSEEK_RESPONSE_RECORDED_REVIEW_REQUIRED",
        "provider": result["provider"],
        "model": result["model"],
        "request_count": 1,
        "source_video_id": result.get("videoId"),
        "frame_times_seconds": result.get("frameTimes"),
        "storyboard": storyboard,
        "usage": usage,
        "peak_rate_upper_estimate_usd": round(cost, 8),
        "actual_route": route,
        "pricing_basis": "Hard ceiling input $0.30/M and output $1.20/M; OpenRouter request enforces max_price and ZDR/data_collection=deny; cache discounts ignored",
        "model_decision": result.get("decision"),
        "lexical_precheck": result.get("semantic"),
        "semantic_review_required": True,
        "semantic_pass": False,
        "action_executed": False,
        "browser_tools_executed": False,
        "audio_sent": False,
        "memory_written": False,
        "script_exit_code": exit_code,
        "source_script_exit_one_is_intentional_human_review_gate": True,
        "api_key_logged": False,
        "personal_account_or_user_pc_used": False,
    }
    print(json.dumps(receipt, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
