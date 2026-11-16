#!/usr/bin/env python3
"""Replay immutable previously-accepted genuine W3C Watch Skill metadata through MCP.

THIS DOES NOT re-run video, Whisper, OCR, semantics, or the Windows EXE.
Original artifact deliberately lacks JPEG bytes; image request must refuse.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path

from tools.readonly_video_mcp import (
    EXPECTED_TOOL_NAMES, EvidenceRefused, VideoEvidence, build_mcp,
)

ORIGINAL_AV_RUN = 43340305925
ORIGINAL_AV_SOURCE_COMMIT = "20cf39d45ccf01d76d02f292ec3ab3e7370502a2"
ORIGINAL_AV_ARTIFACT = 13999042019
ORIGINAL_AV_ZIP_SHA256 = "f4709d4d318f4d10218b0895e348ba61c72e2a9430d3defbcf592b2bf827afea"
PINNED_VIDEO_SHA256 = "ec419be88b5d6cf2354a366caae8012a979438decef0154a6087a9813c662dbb"
EXPECTED_WATCH_SHA = "f1317c8fe64744a606c31867b05fbbe3144268c6"
EXPECTED_MODEL_REVISION = "0d3d19a32d3338f10357c0889762bd8d64bbdeba"


def verify_original_manifest(root: Path):
    p = root / "pilot-manifest.json"
    data = p.read_bytes()
    m = json.loads(data)
    assert m["source_video_sha256"] == PINNED_VIDEO_SHA256, "Wrong original video"
    assert m["watch_skill_source_git_sha"] == EXPECTED_WATCH_SHA, "Wrong original Watch Skill"
    assert m["model_revision"] == EXPECTED_MODEL_REVISION, "Wrong voice model"
    assert m["candidate_exe_tested"] is False
    assert m["autonomous_browser_actions"] is False
    assert m["cloud_model_calls"] is False
    assert abs(m["video_duration_seconds"] - 128.64) < 0.01
    assert len(m["frames"]) == 12, "Original AV sample frame count does not match"
    assert len(m["transcript_segments"]) == 32, "Original model transcript size does not match"
    assert m["transcript_source"].startswith("whisper-local ("), "Real ASR required"
    return hashlib.sha256(data).hexdigest(), m


async def verify_mcp(index: VideoEvidence, original: dict):
    from fastmcp import Client

    # This manifest came from successful real-media processing, but the artifact
    # excludes all JPEG bytes. The adapter must never invent a replacement image.
    first_t = original["frames"][0]["t_seconds"]
    refused_correctly = False
    try:
        index.frame(first_t, max_distance=0.05)
    except EvidenceRefused as exc:
        refused_correctly = str(exc) == "FRAME_NOT_AVAILABLE_IN_THIS_RUNTIME"
    assert refused_correctly, "Missing original image bytes must be rejected"
    async with Client(build_mcp(index)) as client:
        tools = await client.list_tools()
        assert {t.name for t in tools} == EXPECTED_TOOL_NAMES, "Unexpected MCP action tool registered"
        result = await client.call_tool("video_status", {})
        assert not result.is_error
        assert result.data["source_sha256"] == PINNED_VIDEO_SHA256
        assert result.data["full_video_semantics_verified"] is False
        timeline = await client.call_tool("get_video_timeline", {"start": 0, "end": 128.64})
        assert not timeline.is_error
        assert timeline.data["total_matching"] == 12, "Real indexed frames not found"
        assert timeline.data["sampled_only"] is True
        subtitles = await client.call_tool("get_transcript", {"start": 0, "end": 128.64})
        assert not subtitles.is_error
        assert subtitles.data["total_matching"] == 32, "Real ASR segments not available"
        # Search a real transcript word selected from the immutable original,
        # without publishing content in the job log or prompt.
        words = [
            word for seg in original["transcript_segments"]
            for word in re.findall(r"[A-Za-z]{4,}", seg["text"])
        ]
        assert words, "No actual speech terms"
        found = await client.call_tool("search_transcript", {"query": words[0], "limit": 10})
        assert not found.is_error
        assert found.data["matched"] >= 1
        return {
            "actual_mcp_tool_count": len(tools),
            "actual_timeline_sampled_frames": timeline.data["total_matching"],
            "actual_transcript_segments": subtitles.data["total_matching"],
            "actual_literal_search_matches": found.data["matched"],
            "missing_image_refused": refused_correctly,
        }


def main() -> None:
    evidence_root = Path("work/verified-evidence").resolve()
    manifest_sha, original = verify_original_manifest(evidence_root)
    index = VideoEvidence(evidence_root, PINNED_VIDEO_SHA256)
    mcp_result = asyncio.run(verify_mcp(index, original))
    verdict = {
        "verdict": "PASS_REAL_PREVIOUS_AV_MANIFEST_VIA_READONLY_MCP",
        "original_source_commit": ORIGINAL_AV_SOURCE_COMMIT,
        "original_completed_av_run": ORIGINAL_AV_RUN,
        "original_artifact": ORIGINAL_AV_ARTIFACT,
        "original_artifact_zip_sha256": ORIGINAL_AV_ZIP_SHA256,
        "original_manifest_sha256": manifest_sha,
        "original_video_sha256": PINNED_VIDEO_SHA256,
        "adapter_touched_windows_exe": False,
        "adapter_did_real_image_inference": False,
        "adapter_did_new_audio_transcription": False,
        "original_image_content_returned": False,
        "full_video_semantics_verified": False,
        "windows_exe_newly_accepted": False,
        **mcp_result,
    }
    (evidence_root / "mcp-query-verdict.json").write_text(
        json.dumps(verdict, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print("REAL_PRIOR_AV_MANIFEST_MCP_VERDICT:", json.dumps(verdict, sort_keys=True))


if __name__ == "__main__":
    main()
