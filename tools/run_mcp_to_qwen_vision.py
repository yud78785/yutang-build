#!/usr/bin/env python3
"""End-to-end: original Windows JPEG -> actual MCP ImageContent -> local Qwen CPU.

No direct source-file-to-model shortcut is allowed. Qwen only receives the
JPEG bytes returned by the restricted MCP peek_frame tool.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import subprocess
from pathlib import Path

from tools.readonly_video_mcp import VideoEvidence, build_mcp, EXPECTED_TOOL_NAMES

VIDEO_ID = "7577614489533680959"
ARTIFACT_SHA256 = "5b2f2432a25ef6e2581be64eb58c352652d39b245d1a0036682e39e7acac3849"
PROBE_SHA256 = "a2027c0c3f58c6ca04ff0a8a8b626e999e7d6b2bc40bbc9dd005e2214dd8bc2a"
EXE_SHA256_HISTORICAL = "51ac3c9e842aae7a44524d59da30d81269a3ad93785ad2071e0c2d461d9d9575"
FRAME_HASHES = {
    1: "c6b3493339f0e93c133ea429353715945417d00feef3fc30f193a0abde6ec1c3",
    2: "2dbf955f09556718613eae3abf342d524a62d436c1eaa323e9c51b1a0166d595",
    3: "17fbadb356f2f28879f22f93868cd96567e9068ec07692b30ee4bc135269b5b9",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def retrieve_frame_via_mcp() -> tuple[bytes, dict]:
    root = Path("work/mcp-evidence").resolve()
    source = Path("work/source")
    probe_bytes = (source / "probe-result.json").read_bytes()
    assert sha(probe_bytes) == PROBE_SHA256
    probe = json.loads(probe_bytes)
    assert probe["requestedVideoId"] == VIDEO_ID == probe["actualVideoId"]
    assert probe["pageOrigin"] == "https://www.douyin.com"
    assert probe["proofValid"] is True and probe["modelInferencePerformed"] is False
    assert probe["frameHashes"] == [FRAME_HASHES[i] for i in (1, 2, 3)]
    assert probe["frames"] == 3 and len(probe["frameTimes"]) == 3
    assert probe["frameTimes"] == sorted(probe["frameTimes"])
    root.mkdir(parents=True, exist_ok=True)
    frames_dir = root / "extracted" / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for i in (1, 2, 3):
        data = (source / f"frame-{i}.jpg").read_bytes()
        assert sha(data) == FRAME_HASHES[i]
        (frames_dir / f"frame-{i}.jpg").write_bytes(data)

    manifest = {
        "schema": "yutang.browser-video-capture-samples.v1",
        "capture_artifact_sha256": ARTIFACT_SHA256,
        "browser_video_id": VIDEO_ID,
        "video_url": f"https://www.douyin.com/video/{VIDEO_ID}",
        "page_origin": "https://www.douyin.com",
        "probe_result_sha256": PROBE_SHA256,
        "candidate_exe_tested": False,
        "autonomous_browser_actions": False,
        "cloud_model_calls": False,
        "video_duration_seconds": probe["durationSeconds"],
        "scene_count": 0,
        "transcript_source": "none",
        "frames": [
            {"path": f"frames/frame-{i}.jpg", "t_seconds": probe["frameTimes"][i-1],
             "sha256": FRAME_HASHES[i], "scene_id": None,
             "reason": "original-Windows-browser-canvas"}
            for i in (1, 2, 3)
        ],
        "transcript_segments": [],
    }
    (root / "pilot-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    evidence = VideoEvidence(root, ARTIFACT_SHA256)
    from fastmcp import Client
    async with Client(build_mcp(evidence)) as client:
        names = {t.name for t in await client.list_tools()}
        assert names == EXPECTED_TOOL_NAMES
        timeline = await client.call_tool("get_video_timeline", {
            "start": 0.0, "end": float(probe["durationSeconds"]), "limit": 10
        })
        assert not timeline.is_error and timeline.data["total_matching"] == 3
        assert timeline.data["sampled_only"] is True
        # Frame 3 was selected because the independent earlier review found
        # a changed composition and visible Chinese subtitle at this time.
        second = float(probe["frameTimes"][2])
        result = await client.call_tool_mcp("peek_frame", {
            "second": second, "max_distance": 0.1
        })
        assert not result.isError
        blocks = [b for b in result.content if b.type == "image"]
        assert len(blocks) == 1 and blocks[0].mimeType == "image/jpeg"
        image_bytes = base64.b64decode(blocks[0].data, validate=True)
        assert sha(image_bytes) == FRAME_HASHES[3], "MCP changed original image bytes"
        assert image_bytes[:2] == b"\xff\xd8" and image_bytes[-2:] == b"\xff\xd9"
        out = Path("work/mcp-image")
        out.mkdir(parents=True, exist_ok=True)
        target = out / "frame-3.jpg"
        target.write_bytes(image_bytes)
        return image_bytes, {
            "registered_tools": len(names),
            "timeline_frames": timeline.data["total_matching"],
            "selected_timestamp_seconds": second,
            "mcp_image_sha256": sha(image_bytes),
            "mcp_image_bytes": len(image_bytes),
            "source_frame_sha256": FRAME_HASHES[3],
        }


def main() -> None:
    raw, mcp = asyncio.run(retrieve_frame_via_mcp())
    assert sha(raw) == FRAME_HASHES[3]
    exe = next(Path("tools/llama").rglob("llama-mtmd-cli"), None)
    assert exe and exe.is_file()
    exe.chmod(0o755)
    model = Path("work/model/Qwen3VL-2B-Instruct-Q4_K_M.gguf")
    mmproj = Path("work/model/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf")
    assert model.is_file() and mmproj.is_file()
    prompt = (
        "请只根据这一张图片回答："
        "1. 画面里能直接看到哪些物品，它们分别位于哪里？"
        "2. 画面底部是否有中文字幕？如果有，请逐字抄录。"
        "不要推断视频前后发生的动作，不要猜测看不清的文字。"
        "只说图像中能确认的事实，简洁回答。"
    )
    cmd = [
        str(exe), "-m", str(model), "--mmproj", str(mmproj),
        "--image", "work/mcp-image/frame-3.jpg",
        "-p", prompt, "--no-mmproj-offload", "-t", "4", "-c", "4096",
        "--temp", "0", "-n", "180",
    ]
    with Path("work/qwen-frame-3.log").open("wb") as output:
        proc = subprocess.run(
            cmd, stdout=output, stderr=subprocess.STDOUT, timeout=180, check=False
        )
    log = Path("work/qwen-frame-3.log").read_bytes()
    assert proc.returncode == 0, f"Qwen inference exited {proc.returncode}"
    assert len(log) > 100 and len(log) < 250_000
    manifest = {
        "verdict": "PASS_MCP_TO_QWEN_REAL_IMAGE_INFERENCE_PROCESS",
        "semantic_review": "PENDING_HUMAN_REVIEW_OF_RAW_MODEL_OUTPUT",
        "actual_mcp_image_content_consumed_by_qwen": True,
        "source_artifact_id": 13951609541,
        "source_run_id": 43233257378,
        "source_capture_artifact_sha256": ARTIFACT_SHA256,
        "historical_candidate_exe_sha256": EXE_SHA256_HISTORICAL,
        "video_id": VIDEO_ID,
        "frame_number": 3,
        "original_frame_sha256": FRAME_HASHES[3],
        "mcp_receipt": mcp,
        "model": "Qwen3-VL-2B-Instruct-Q4_K_M",
        "model_revision": "52d6c8ffea26cc873ac5ad116f8631268d7eb503",
        "model_file_sha256": "089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae",
        "vision_projector_sha256": "f9a68fabba69c3b81e153367b2c7521030b0fa8bb0de400c9599c8e6725f9c82",
        "llama_cpp_release": "b12248",
        "llama_cpp_archive_sha256": "6b3a530b44f6b0a4ae4872d3b3c8d1edc2ac6bba7d8bd211329a4ba644c0dc65",
        "qwen_process_exit_code": proc.returncode,
        "qwen_log_sha256": sha(log),
        "full_video_semantics_verified": False,
        "audio_transcription_performed": False,
        "continuous_video_watching_verified": False,
        "deepseek_equivalence_claimed": False,
        "fresh_windows_exe_tested": False,
        "account_or_personal_pc_used": False,
        "provider_api_keys_or_paid_calls_used": False,
    }
    Path("work/mcp-to-qwen-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("MCP_TO_QWEN_REAL_IMAGE_INFERENCE:", json.dumps({
        "verdict": manifest["verdict"],
        "semantic_review": manifest["semantic_review"],
        "mcp_image_sha256": mcp["mcp_image_sha256"],
        "model": manifest["model"],
        "log_sha256": manifest["qwen_log_sha256"],
        "exit_code": proc.returncode,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
