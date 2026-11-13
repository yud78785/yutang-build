#!/usr/bin/env python3
"""Narrow Watch Skill experiment: genuine authorized media, real CPU ASR, zero agent actions."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

PIN = "f1317c8fe64744a606c31867b05fbbe3144268c6"
ATTRIBUTION = (
    "Copyright W3C Web Accessibility Initiative, "
    "https://www.w3.org/WAI/test-evaluate/ ; W3C WAI attribution-required use "
    "https://creativecommons.org/licenses/by/4.0/"
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    root = Path("work").resolve()
    video, captions, model = root / "w3c-video.mp4", root / "w3c-reference.vtt", root / "model"
    if os.environ.get("WATCHSKILL_OFFLINE") != "1" or os.environ.get("HF_HUB_OFFLINE") != "1":
        raise RuntimeError("Offline boundary required during actual Watch Skill run")
    if not all(p.is_file() for p in (video, captions, model / "model.bin")):
        raise RuntimeError("Original authorized video, reference or downloaded model missing")

    # Import audited, SHA-checked upstream only after the offline boundary is active.
    from watch_skill.watch import watch

    extracted_root = root / "extracted"
    result = watch(
        str(video),
        max_frames=12,
        frame_width=480,
        run_ocr=False,
        allow_local_whisper=True,
        allow_cloud_stt=False,
        whisper_model=str(model),
        out_dir=extracted_root,
        use_cache=False,
    )
    if result.perception is None:
        raise RuntimeError("Upstream perception did not produce a result")

    frames = []
    for frame in result.perception.frames:
        path = Path(frame.path).resolve()
        try:
            relative = path.relative_to(extracted_root.resolve())
        except ValueError as exc:
            raise RuntimeError("Frame path escaped isolated work directory") from exc
        frames.append({
            "path": str(relative),
            "t_seconds": float(frame.timestamp_seconds),
            "sha256": sha256(path),
            "scene_id": int(frame.scene_id),
            "reason": str(frame.reason),
        })

    transcript = [{
        "start": float(s.start),
        "end": float(s.end),
        "text": str(s.text),
    } for s in result.transcript.segments]

    data = {
        "schema": "yutang.watch-skill-real-av-pilot.v1",
        "watch_skill_source_git_sha": PIN,
        "candidate_exe_tested": False,
        "autonomous_browser_actions": False,
        "cloud_model_calls": False,
        "w3c_source_url": "https://media.w3.org/wai/evaluation-intros/conformance-evaluation.mp4",
        "media_license_attribution": ATTRIBUTION,
        "source_video_sha256": sha256(video),
        "independent_reference_vtt_sha256": sha256(captions),
        "model_repository": "Systran/faster-whisper-tiny.en",
        "model_revision": (root / "model-revision.txt").read_text(encoding="utf-8").strip(),
        "model_weight_sha256": sha256(model / "model.bin"),
        "video_duration_seconds": float(result.metadata.duration_seconds),
        "has_audio": bool(result.metadata.has_audio),
        "scene_count": int(result.perception.scene_count),
        "selection_engine": str(result.perception.engine),
        "frame_budget": 12,
        "frames": frames,
        "transcript_source": str(result.transcript.source),
        "transcript_segments": transcript,
        "limitations": [
            "No autonomous browser actions, Douyin access, or Windows EXE validation",
            "No video semantic model, no OCR in this pilot",
            "Sparse selected frames are not proof of every video moment",
            "Speech-to-text quality is independently compared to W3C captions",
        ],
    }
    (root / "pilot-manifest.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("REAL_WATCH_SKILL_EXECUTED:", json.dumps({
        "video_sha256": data["source_video_sha256"],
        "duration_seconds": data["video_duration_seconds"],
        "frame_count": len(frames),
        "scenes": data["scene_count"],
        "transcript_source": data["transcript_source"],
        "asr_segments": len(transcript),
        "model_revision": data["model_revision"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
