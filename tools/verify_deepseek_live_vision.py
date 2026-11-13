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
    required = {
        "provider": "DeepSeek API",
        "model": "deepseek-flash",
        "requestCount": 1,
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
        "FAIL_LIVE_DEEPSEEK_VISION_LEXICAL_PRECHECK",
    }:
        raise SystemExit("UNEXPECTED_SEMANTIC_GATE_STATUS")
    storyboard = result.get("storyboard") or {}
    if storyboard.get("inputImages") != 3 or storyboard.get("outputImages") != 1 or storyboard.get("status") != "storyboard":
        raise SystemExit("PRODUCTION_STORYBOARD_CONTRACT_NOT_PROVEN")
    usage = result.get("usage") or {}
    prompt = usage.get("promptTokens")
    completion = usage.get("completionTokens")
    if type(prompt) is not int or type(completion) is not int or prompt < 0 or not 0 < completion <= 1200:
        raise SystemExit("INVALID_OR_UNBOUNDED_TOKEN_USAGE")
    # Conservative current peak-rate estimate; cache-hit discounts are ignored.
    cost = prompt * 0.30 / 1_000_000 + completion * 1.20 / 1_000_000
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
        "pricing_basis": "DeepSeek official peak input $0.30/M, output $1.20/M; cache-hit discounts ignored",
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
        "deepseek_api_key_logged": False,
        "personal_account_or_user_pc_used": False,
    }
    print(json.dumps(receipt, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
