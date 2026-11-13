#!/usr/bin/env python3
"""Independent, fail-closed verifier for one real video/audio Watch Skill pilot."""
from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

PIN = "f1317c8fe64744a606c31867b05fbbe3144268c6"
MIN_FRAMES = 3
MIN_DISTINCT_FRAME_HASHES = 3
MIN_NONTRIVIAL_WORDS = 12
MIN_REFERENCE_WORD_RECALL = 0.25
STOPWORDS = set("the a an and of to in on for is are be as it this that you your we our their with from at by can".split())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def caption_words(path: Path) -> set[str]:
    lines = []
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith(("WEBVTT", "NOTE", "STYLE")) or "-->" in line:
            continue
        if line.isdigit() or line.startswith(("Kind:", "Language:")):
            continue
        lines.append(re.sub(r"<[^>]+>", " ", line))
    return words(" ".join(lines))


def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]{3,}", text.lower()) if w not in STOPWORDS}


def verify() -> dict:
    root = Path("work").resolve()
    m = json.loads((root / "pilot-manifest.json").read_text(encoding="utf-8"))
    problems = []
    def require(condition: bool, reason: str) -> None:
        if not condition:
            problems.append(reason)

    checkout = subprocess.run(
        ["git", "-C", "third_party/watch-skill", "rev-parse", "HEAD"],
        capture_output=True, text=True, timeout=15, check=True
    ).stdout.strip()
    require(checkout == PIN, "UNPINNED_UPSTREAM_SOURCE")
    require(m.get("watch_skill_source_git_sha") == PIN, "MANIFEST_SOURCE_PIN_MISMATCH")
    require(m.get("candidate_exe_tested") is False, "FALSE_WINDOWS_EXE_CLAIM")
    require(m.get("autonomous_browser_actions") is False, "UNAUTHORIZED_AUTONOMY_CLAIM")
    require(m.get("cloud_model_calls") is False, "UNAUTHORIZED_CLOUD_MODEL_CLAIM")
    for path, field in (
        (root / "w3c-video.mp4", "source_video_sha256"),
        (root / "w3c-reference.vtt", "independent_reference_vtt_sha256"),
        (root / "model" / "model.bin", "model_weight_sha256"),
    ):
        require(path.is_file() and sha256(path) == m.get(field), "MISSING_OR_CHANGED_" + field)

    duration = float(m.get("video_duration_seconds", 0))
    require(math.isfinite(duration) and 20 <= duration <= 240, "INVALID_MEDIA_DURATION")
    require(m.get("has_audio") is True, "ORIGINAL_MEDIA_AUDIO_MISSING")
    frames = m.get("frames", [])
    require(MIN_FRAMES <= len(frames) <= m.get("frame_budget", 0), "FRAME_COUNT_OR_BUDGET")
    previous_t = -1.0
    unique_frame_hashes = set()
    for row in frames:
        relative = Path(row["path"])
        path = (root / "extracted" / relative).resolve()
        require(path.is_relative_to(root / "extracted") and not relative.is_absolute(),
                "FRAME_OUTSIDE_APPROVED_ROOT")
        require(path.is_file() and sha256(path) == row.get("sha256"),
                "FRAME_BYTES_NOT_VERIFIED")
        t = float(row["t_seconds"])
        require(math.isfinite(t) and 0 <= t <= duration + 1 and t >= previous_t,
                "FRAME_TIMESTAMP_INVALID")
        previous_t = t
        unique_frame_hashes.add(row.get("sha256"))
    require(len(unique_frame_hashes) >= MIN_DISTINCT_FRAME_HASHES, "NON_DISTINCT_VISUAL_SAMPLE")

    transcript = m.get("transcript_segments", [])
    source = m.get("transcript_source", "")
    require(source.startswith("whisper-local ("), "NOT_ACTUAL_LOCAL_ASR")
    require(len(transcript) > 0, "NO_RECOGNIZED_SPEECH")
    previous_start = -1.0
    for seg in transcript:
        start, end = float(seg["start"]), float(seg["end"])
        require(math.isfinite(start) and math.isfinite(end)
                and 0 <= start <= end <= duration + 2 and start >= previous_start,
                "TRANSCRIPT_TIMESTAMP_INVALID")
        previous_start = start
    actual_words = words(" ".join(s["text"] for s in transcript))
    reference_words = caption_words(root / "w3c-reference.vtt")
    require(len(actual_words) >= MIN_NONTRIVIAL_WORDS, "ASR_TOO_SPARSE")
    require(len(reference_words) >= 20, "REFERENCE_CAPTIONS_INVALID")
    recall = len(actual_words & reference_words) / max(1, len(reference_words))
    require(recall >= MIN_REFERENCE_WORD_RECALL, "ASR_NOT_GROUNDED_IN_REFERENCE_CAPTIONS")

    verdict = {
        "verdict": "PASS_REAL_AV_COMPONENT_ONLY" if not problems else "FAIL_COMPONENT_PILOT",
        "failures": problems,
        "watch_skill_git_sha": PIN,
        "video_sha256": m.get("source_video_sha256"),
        "model_revision": m.get("model_revision"),
        "frame_count": len(frames),
        "distinct_frames": len(unique_frame_hashes),
        "transcript_segments": len(transcript),
        "reference_unique_word_recall": round(recall, 4),
        "ocr_tested": False,
        "windows_exe_tested": False,
        "douyin_tested": False,
        "autonomous_watch_tested": False,
        "whole_video_semantics_tested": False,
    }
    (root / "pilot-verdict.json").write_text(
        json.dumps(verdict, indent=2) + "\n", encoding="utf-8"
    )
    return verdict


if __name__ == "__main__":
    outcome = verify()
    print("INDEPENDENT_PILOT_VERDICT:", json.dumps(outcome, sort_keys=True))
    if outcome["verdict"] != "PASS_REAL_AV_COMPONENT_ONLY":
        raise SystemExit(1)
