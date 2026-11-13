#!/usr/bin/env python3
"""Prove existing real Windows browser JPEGs can be served by narrow read-only MCP.

No Douyin download/replay, Windows EXE, or hosted model inference is performed.
The original immutable 3-frame artifact is downloaded under a read-only GitHub
Actions token, SHA-checked, and deleted when the disposable runner is destroyed.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import zipfile
from pathlib import Path

from tools.readonly_video_mcp import EXPECTED_TOOL_NAMES, VideoEvidence, build_mcp

ORIGINAL_RUN_ID = 43233257378
ORIGINAL_ARTIFACT_ID = 13951609541
ORIGINAL_ARTIFACT_SHA256 = "5b2f2432a25ef6e2581be64eb58c352652d39b245d1a0036682e39e7acac3849"
ORIGINAL_PROBE_SHA256 = "a2027c0c3f58c6ca04ff0a8a8b626e999e7d6b2bc40bbc9dd005e2214dd8bc2a"
ORIGINAL_EXE_SHA256 = "51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575"
VIDEO_ID = "7577614489533680959"
FRAME_SHA256 = [
    "c6b3493339f0e93c133ea429353715945417d00feef3fc30f193a0abde6ec1c3",
    "2dbf955f09556718613eae3abf342d524a62d436c1eaa323e9c51b1a0166d595",
    "17fbadb356f2f28879f22f93868cd96567e9068ec07692b30ee4bc135269b5b9",
]


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def materialize_actual_original(root: Path):
    archive = Path("work/original-Windows-3-JPEG.zip")
    assert sha(archive.read_bytes()) == ORIGINAL_ARTIFACT_SHA256, "Archive SHA mismatch"
    with zipfile.ZipFile(archive) as z:
        assert set(z.namelist()) == {
            "probe-result.json", "frame-1.jpg", "frame-2.jpg", "frame-3.jpg"
        }, "Unexpected or missing original source files"
        probe_bytes = z.read("probe-result.json")
        assert sha(probe_bytes) == ORIGINAL_PROBE_SHA256, "Original native probe changed"
        probe = json.loads(probe_bytes)
        assert probe["requestedVideoId"] == VIDEO_ID == probe["actualVideoId"]
        assert probe["pageOrigin"] == "https://www.douyin.com"
        assert probe["pagePath"] == f"/video/{VIDEO_ID}"
        assert probe["proofValid"] is True
        assert probe["outcome"] == "PASS_PUBLIC_VIDEO_CORE_CAPTURE_AND_MODEL_INPUT_PACKING"
        assert probe["modelInferencePerformed"] is False
        assert probe["modelInputPayloadVerified"] is True
        assert probe["frames"] == 3
        assert probe["captureMethods"] == ["video-canvas-jpeg-v1"] * 3
        assert probe["frameHashes"] == FRAME_SHA256
        times = probe["frameTimes"]
        assert len(times) == 3 and 0 < times[0] < times[1] < times[2]
        assert times[2] - times[0] < 5.0, "Short sample only, not whole video"
        assert abs(probe["durationSeconds"] - 1082.518) < 0.01
        frames_dir = root / "extracted" / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for n, expected in enumerate(FRAME_SHA256, 1):
            raw = z.read(f"frame-{n}.jpg")
            assert 1000 < len(raw) < 200000 and raw[:2] == b"\xff\xd8", "Not genuine bounded JPEG"
            assert sha(raw) == expected, f"Original frame {n} SHA-256 mismatch"
            (frames_dir / f"frame-{n}.jpg").write_bytes(raw)

    manifest = {
        "schema": "yutang.browser-video-capture-samples.v1",
        "capture_artifact_sha256": ORIGINAL_ARTIFACT_SHA256,
        "browser_video_id": VIDEO_ID,
        "video_url": f"https://www.douyin.com/video/{VIDEO_ID}",
        "page_origin": "https://www.douyin.com",
        "probe_result_sha256": ORIGINAL_PROBE_SHA256,
        "candidate_exe_tested": False,
        "autonomous_browser_actions": False,
        "cloud_model_calls": False,
        "video_duration_seconds": probe["durationSeconds"],
        "scene_count": 0,
        "transcript_source": "none",
        "frames": [
            {"path": f"frames/frame-{i}.jpg", "t_seconds": times[i - 1],
             "sha256": FRAME_SHA256[i - 1], "scene_id": None, "reason": "original-Windows-browser-canvas"}
            for i in range(1, 4)
        ],
        "transcript_segments": [],
    }
    (root / "pilot-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return times


async def prove_genuine_image_transport(evidence: VideoEvidence, times: list[float]):
    from fastmcp import Client

    async with Client(build_mcp(evidence)) as client:
        tools = await client.list_tools()
        assert {tool.name for tool in tools} == EXPECTED_TOOL_NAMES, "Unexpected executable tool"
        status = await client.call_tool("video_status", {})
        assert not status.is_error
        assert status.data["original_browser_video_id"] == VIDEO_ID
        assert status.data["browser_capture_samples_only"] is True
        assert status.data["source_identity_kind"] == "ORIGINAL_WINDOWS_VIDEO_CAPTURE_ZIP_SHA256_NOT_VIDEO_BYTES"
        assert status.data["full_video_semantics_verified"] is False
        timeline = await client.call_tool("get_video_timeline", {"start": 0.0, "end": times[-1]})
        assert timeline.data["total_matching"] == 3 and timeline.data["sampled_only"] is True
        transcript = await client.call_tool("get_transcript", {"start": 0.0, "end": times[-1]})
        assert transcript.data["total_matching"] == 0
        verified = []
        for i, second in enumerate(times):
            result = await client.call_tool_mcp("peek_frame", {
                "second": second, "max_distance": 0.1,
            })
            assert not result.isError, "Image MCP transport failed"
            image = [b for b in result.content if b.type == "image"]
            assert len(image) == 1, "Expected exactly one real image block"
            assert image[0].mimeType == "image/jpeg", "Wrong image media type"
            image_bytes = base64.b64decode(image[0].data, validate=True)
            assert sha(image_bytes) == FRAME_SHA256[i], "MCP image transport changed bytes"
            verified.append({
                "timestamp_seconds": second,
                "sha256": sha(image_bytes),
                "image_bytes": len(image_bytes),
            })
        return {"transport_proved_jpeg_count": len(verified),
                "actual_original_jpeg_receipts": verified, "registered_mcp_tools": len(tools)}


def main() -> None:
    root = Path("work/browser-frame-evidence").resolve()
    times = materialize_actual_original(root)
    evidence = VideoEvidence(root, ORIGINAL_ARTIFACT_SHA256)
    result = asyncio.run(prove_genuine_image_transport(evidence, times))
    receipt = {
        "verdict": "PASS_ORIGINAL_WINDOWS_DOUYIN_3_REAL_JPEGS_VIA_READONLY_MCP",
        "original_actions_run": ORIGINAL_RUN_ID,
        "original_actions_artifact": ORIGINAL_ARTIFACT_ID,
        "original_capture_zip_sha256": ORIGINAL_ARTIFACT_SHA256,
        "original_probe_sha256": ORIGINAL_PROBE_SHA256,
        "video_id": VIDEO_ID,
        "original_candidate_exe_sha256_historical_context_only": ORIGINAL_EXE_SHA256,
        "real_model_inference_performed": False,
        "video_transcription_performed": False,
        "continuous_video_watching_verified": False,
        "fresh_windows_exe_tested": False,
        "account_or_personal_pc_used": False,
        "no_raw_jpeg_uploaded_as_result": True,
        **result,
    }
    (root / "mcp-image-verdict.json").write_text(
        json.dumps(receipt, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("ORIGINAL_WINDOWS_JPEG_MCP_VERDICT:", json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
