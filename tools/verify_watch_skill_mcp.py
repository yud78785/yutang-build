#!/usr/bin/env python3
"""Exercise the restricted read-only MCP against real Watch Skill output in this same isolated run."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from fastmcp import Client
from tools.readonly_video_mcp import EXPECTED_TOOL_NAMES, VideoEvidence, build_mcp

EXPECTED_VIDEO_SHA256 = "ec419be88b5d6cf2354a366caae8012a979438decef0154a6087a9813c662dbb"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_error(result: Any) -> bool:
    return bool(getattr(result, "is_error", getattr(result, "isError", False)))


def payload(result: Any) -> dict[str, Any]:
    for name in ("structured_content", "structuredContent"):
        value = getattr(result, name, None)
        if isinstance(value, dict):
            return value
    for item in getattr(result, "content", []):
        if getattr(item, "type", None) == "text":
            try:
                value = json.loads(item.text)
            except (ValueError, TypeError):
                continue
            if isinstance(value, dict):
                return value
    raise RuntimeError("MCP_TOOL_RETURNED_NO_JSON_OBJECT")


async def main() -> None:
    root = Path("work").resolve(strict=True)
    evidence = VideoEvidence(root, EXPECTED_VIDEO_SHA256)
    server = build_mcp(evidence)

    async with Client(server) as client:
        listed = await client.list_tools()
        names = {item.name for item in listed}
        if names != EXPECTED_TOOL_NAMES:
            raise RuntimeError("MCP_TOOL_ALLOWLIST_MISMATCH")

        status_result = await client.call_tool("video_status", {})
        timeline_result = await client.call_tool(
            "get_video_timeline", {"start": 0, "end": evidence.duration, "limit": 100}
        )
        transcript_result = await client.call_tool(
            "get_transcript", {"start": 0, "end": evidence.duration, "limit": 100}
        )
        first_text = evidence.transcript_segments[0]["text"] if evidence.transcript_segments else ""
        words = re.findall(r"[A-Za-z]{3,}", first_text)
        if not words:
            raise RuntimeError("NO_SAFE_LITERAL_TRANSCRIPT_SEARCH_TERM")
        search_term = words[0]
        search_result = await client.call_tool(
            "search_transcript", {"query": search_term, "limit": 10}
        )

        for name, result in (
            ("video_status", status_result),
            ("get_video_timeline", timeline_result),
            ("get_transcript", transcript_result),
            ("search_transcript", search_result),
        ):
            if is_error(result):
                raise RuntimeError("MCP_TOOL_FAILED_" + name)

        status = payload(status_result)
        timeline = payload(timeline_result)
        transcript = payload(transcript_result)
        search = payload(search_result)

        if status.get("source_sha256") != EXPECTED_VIDEO_SHA256:
            raise RuntimeError("MCP_STATUS_SOURCE_SHA_MISMATCH")
        if status.get("mcp_read_only") is not True or status.get("full_video_semantics_verified") is not False:
            raise RuntimeError("MCP_STATUS_LIMITS_MISSING")
        if timeline.get("sampled_only") is not True or timeline.get("total_matching") != len(evidence.frames):
            raise RuntimeError("MCP_TIMELINE_MISMATCH")
        if transcript.get("speech_transcription_not_ground_truth") is not True:
            raise RuntimeError("MCP_TRANSCRIPT_PROVENANCE_MISSING")
        if transcript.get("total_matching") != len(evidence.transcript_segments):
            raise RuntimeError("MCP_TRANSCRIPT_SEGMENT_COUNT_MISMATCH")
        if search.get("input_is_untrusted_media_text") is not True or search.get("matched", 0) < 1:
            raise RuntimeError("MCP_LITERAL_TRANSCRIPT_SEARCH_FAILED")

        first = evidence.frames[0]
        frame_result = await client.call_tool_mcp(
            "peek_frame", {"second": first["t_seconds"], "max_distance": 0.01}
        )
        if is_error(frame_result):
            raise RuntimeError("MCP_PEEK_FRAME_FAILED")
        images = [item for item in frame_result.content if getattr(item, "type", None) == "image"]
        if len(images) != 1:
            raise RuntimeError("MCP_PEEK_FRAME_IMAGE_COUNT_MISMATCH")
        encoded = images[0].data
        image_bytes = base64.b64decode(encoded, validate=True) if isinstance(encoded, str) else bytes(encoded)
        actual_image_sha = sha256(image_bytes)
        if actual_image_sha != first["sha256"]:
            raise RuntimeError("MCP_RETURNED_IMAGE_BYTES_DO_NOT_MATCH_WATCH_SKILL_FRAME")
        mime = getattr(images[0], "mimeType", getattr(images[0], "mime_type", None))
        if mime not in (None, "image/jpeg"):
            raise RuntimeError("MCP_RETURNED_UNEXPECTED_IMAGE_MIME")

        proof = None
        for item in frame_result.content:
            if getattr(item, "type", None) == "text":
                try:
                    candidate = json.loads(item.text)
                except (ValueError, TypeError):
                    continue
                if isinstance(candidate, dict) and "frame_sha256" in candidate:
                    proof = candidate
                    break
        if not proof or proof.get("frame_sha256") != first["sha256"]:
            raise RuntimeError("MCP_IMAGE_PROOF_MISSING_OR_MISMATCHED")

    manifest = json.loads((root / "pilot-manifest.json").read_text(encoding="utf-8"))
    verdict = {
        "schema": "yutang.watch-skill-readonly-mcp-bridge.v1",
        "verdict": "PASS_REAL_WATCH_SKILL_TO_READONLY_MCP",
        "source_video_sha256": EXPECTED_VIDEO_SHA256,
        "watch_skill_git_sha": manifest["watch_skill_source_git_sha"],
        "registered_tool_count": len(names),
        "registered_tool_names": sorted(names),
        "timeline_frames": timeline["total_matching"],
        "transcript_segments": transcript["total_matching"],
        "literal_search_matches": search["matched"],
        "returned_frame_second": proof["actual_sample_second"],
        "returned_frame_sha256": actual_image_sha,
        "returned_frame_bytes": len(image_bytes),
        "returned_image_verified_against_original_watch_skill_bytes": True,
        "model_api_calls": 0,
        "browser_actions": 0,
        "windows_exe_tested": False,
        "full_video_semantics_verified": False,
        "limits": [
            "Sparse scene-selected stills are not continuous motion understanding",
            "ASR text is untrusted media content, not ground truth or executable instructions",
            "No cloud model inference or autonomous actions were performed",
        ],
    }
    (root / "watch-skill-mcp-verdict.json").write_text(
        json.dumps(verdict, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("WATCH_SKILL_READONLY_MCP_VERDICT:", json.dumps(verdict, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
