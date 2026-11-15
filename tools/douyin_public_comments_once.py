#!/usr/bin/env python3
"""One read-only Douyin public-comment sample using pinned upstream code.

Source-only experiment. Never log credentials, try paid providers, browse,
retry, or claim video/audio playback or complete comment coverage.
"""

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import PackageNotFoundError, distribution
import json
import os
from pathlib import Path
import re
import sys
from types import ModuleType
from urllib.parse import urlsplit

UPSTREAM_COMMIT = "96502f35b0a643a578d3841d83d11228224c3dca"
UPSTREAM_CORE_BLOB = "9671cbc1b79cba84f5da3d92b586ebedbe29044e"
UPSTREAM_MODULE = "social_media_toolkit.platforms.core"
SOURCE = "douyin_public_mobile_share_api"
WORK_ID = re.compile(r"^[0-9]{10,30}$")
COMMENT_ID = re.compile(r"^[0-9]{1,64}$")


def _blocked(video_id, reason):
    return {"status": "blocked", "reason": reason, "video_id": video_id,
            "comments": [], "count": 0}


def _git_blob_sha1(content):
    return hashlib.sha1(b"blob " + str(len(content)).encode("ascii") + b"\0" + content).hexdigest()


def _load_pinned_free_sampler():
    # find_spec('package.child') executes unverified package __init__.py!
    # Locate the distribution's core file via package metadata instead.
    try:
        dist = distribution("social-media-toolkit")
    except PackageNotFoundError as exc:
        raise RuntimeError("UPSTREAM_NOT_INSTALLED") from exc
    core_path = Path(dist.locate_file("social_media_toolkit/platforms/core.py"))
    if not core_path.is_file() or core_path.is_symlink():
        raise RuntimeError("UPSTREAM_FILE_NOT_REGULAR")
    pinned_bytes = core_path.read_bytes()
    if _git_blob_sha1(pinned_bytes) != UPSTREAM_CORE_BLOB:
        raise RuntimeError("UPSTREAM_SOURCE_MISMATCH")

    # The pinned core.py has no relative imports, only stdlib + requests.
    # Execute *the verified bytes*, never package __init__.py or a re-read file.
    module_name = "_yutang_pinned_douyin_core"
    module = ModuleType(module_name)
    module.__file__ = str(core_path)
    if module_name in sys.modules:
        raise RuntimeError("UPSTREAM_MODULE_NAME_OCCUPIED")
    sys.modules[module_name] = module  # required by the pinned dataclasses
    try:
        exec(compile(pinned_bytes, str(core_path), "exec"), module.__dict__)
        sampler = getattr(module, "fetch_douyin_public_comments", None)
        if not callable(sampler):
            raise RuntimeError("UPSTREAM_SAMPLER_MISSING")
    except BaseException:
        sys.modules.pop(module_name, None)
        raise
    return sampler


def classify_response(raw, video_id, limit, observed_at):
    if not isinstance(raw, dict) or raw.get("status") != "success":
        return _blocked(video_id, "UPSTREAM_STATUS_UNVERIFIED")
    if raw.get("video_id") != video_id or raw.get("source") != SOURCE:
        return _blocked(video_id, "SOURCE_OR_VIDEO_ID_MISMATCH")
    if raw.get("ranking_scope") != "retrieved_public_top_level_comments":
        return _blocked(video_id, "COVERAGE_UNVERIFIED")
    if raw.get("sort_by") != "likes" or type(raw.get("requested_limit")) is not int or raw["requested_limit"] != limit:
        return _blocked(video_id, "REQUEST_PARAMETERS_MISMATCH")
    comments = raw.get("comments")
    if not isinstance(comments, list) or not comments:
        return _blocked(video_id, "NO_PUBLIC_COMMENTS_OBSERVED")
    if len(comments) > limit or type(raw.get("returned_count")) is not int or raw["returned_count"] != len(comments):
        return _blocked(video_id, "COUNT_MISMATCH")
    if type(raw.get("fetched_top_level_count")) is not int or raw["fetched_top_level_count"] < len(comments):
        return _blocked(video_id, "FETCH_COUNT_MISMATCH")
    selected = []
    seen = set()
    for comment in comments:
        if not isinstance(comment, dict) or comment.get("video_id") != video_id:
            return _blocked(video_id, "COMMENT_VIDEO_ID_MISMATCH")
        cid = comment.get("comment_id")
        text = comment.get("text")
        if not isinstance(cid, str) or not COMMENT_ID.fullmatch(cid) or cid in seen:
            return _blocked(video_id, "COMMENT_ID_INVALID_OR_DUPLICATE")
        if not isinstance(text, str) or not text.strip() or len(text) > 512:
            return _blocked(video_id, "COMMENT_TEXT_INVALID")
        if type(comment.get("like_count")) is not int or comment["like_count"] < 0:
            return _blocked(video_id, "COMMENT_LIKE_COUNT_INVALID")
        seen.add(cid)
        selected.append({"comment_id": cid, "text": text.strip(), "likes": comment["like_count"]})
    return {
        "status": "public_sample_observed",
        "evidence_scope": "one HTTP response; top-level public comment sample only",
        "video_id": video_id,
        "observed_at_utc": observed_at,
        "source": SOURCE,
        "upstream_commit": UPSTREAM_COMMIT,
        "upstream_core_blob": UPSTREAM_CORE_BLOB,
        "requested_limit": limit,
        "count": len(selected),
        "comments": selected,
        "not_proven": ["video playback", "audio", "all comments", "official AI summary", "Windows EXE acceptance"],
    }


def _ambient_http_credentials_possible():
    # requests.get consults .netrc and environment proxy credentials by default.
    if os.environ.get("NETRC") or any((Path.home() / name).is_file() for name in (".netrc", "_netrc")):
        return True
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        proxy = os.environ.get(name)
        if proxy:
            try:
                parsed = urlsplit(proxy if "://" in proxy else "http://" + proxy)
                if parsed.username is not None or parsed.password is not None:
                    return True
            except ValueError:
                return True
    return False


def run_once(video_id, limit=10, load_sampler=_load_pinned_free_sampler):
    if not isinstance(video_id, str) or not WORK_ID.fullmatch(video_id) or type(limit) is not int or not 1 <= limit <= 12:
        return _blocked(str(video_id), "INVALID_ARGS")
    if _ambient_http_credentials_possible():
        return _blocked(video_id, "AMBIENT_HTTP_CREDENTIALS_UNSAFE")
    try:
        sample = load_sampler()
    except Exception:
        return _blocked(video_id, "PINNED_UPSTREAM_UNAVAILABLE")
    try:
        # Exactly one upstream public-HTTP call; no explicit auth, paid fallback or retry.
        raw = sample(video_id, limit=limit, sort_by="likes")
    except Exception:
        return _blocked(video_id, "PUBLIC_ENDPOINT_UNAVAILABLE")
    observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return classify_response(raw, video_id, limit, observed_at)


def main(argv=None):
    parser = argparse.ArgumentParser(description="One pinned, free public Douyin comment sample. No login, fallback, or retry.")
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args(argv)
    result = run_once(args.video_id, args.limit)
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0 if result["status"] == "public_sample_observed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
