"""Negative-path tests for the one-shot pinned upstream public sample wrapper."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "tools" / "douyin_public_comments_once.py"
spec = importlib.util.spec_from_file_location("douyin_public_comments_once", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = "7445301722639060233"


def sample_response():
    return {
        "status": "success", "video_id": ID,
        "source": module.SOURCE,
        "ranking_scope": "retrieved_public_top_level_comments",
        "sort_by": "likes", "requested_limit": 2, "returned_count": 2,
        "fetched_top_level_count": 2,
        "comments": [
            {"video_id": ID, "comment_id": "123", "text": "public sample A", "like_count": 4},
            {"video_id": ID, "comment_id": "124", "text": "public sample B", "like_count": 2},
        ],
    }


class PublicSampleGateTests(unittest.TestCase):
    def test_honest_valid_sample_scope(self):
        result = module.classify_response(sample_response(), ID, 2, "2026-11-16T00:00:00+00:00")
        self.assertEqual(result["status"], "public_sample_observed")
        self.assertEqual(result["count"], 2)
        self.assertIn("Windows EXE acceptance", result["not_proven"])
        self.assertNotIn("author", str(result))

    def test_empty_sample_is_not_success(self):
        data = sample_response()
        data.update(comments=[], returned_count=0, fetched_top_level_count=0)
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "NO_PUBLIC_COMMENTS_OBSERVED")

    def test_cross_video_item_fail_closed(self):
        data = sample_response()
        data["comments"][1]["video_id"] = "7577614489533680959"
        result = module.classify_response(data, ID, 2, "now")
        self.assertEqual(result["reason"], "COMMENT_VIDEO_ID_MISMATCH")
        self.assertEqual(result["comments"], [])

    def test_missing_individual_video_identity_fail_closed(self):
        data = sample_response()
        del data["comments"][1]["video_id"]
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "COMMENT_VIDEO_ID_MISMATCH")

    def test_untrusted_source_and_count_fail_closed(self):
        data = sample_response()
        data["source"] = "unknown"
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "SOURCE_OR_VIDEO_ID_MISMATCH")
        data = sample_response()
        data["returned_count"] = 0
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "COUNT_MISMATCH")

    def test_duplicate_and_malformed_comment_fail_closed(self):
        data = sample_response()
        data["comments"][1]["comment_id"] = "123"
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "COMMENT_ID_INVALID_OR_DUPLICATE")
        data = sample_response()
        data["comments"][1]["text"] = ""
        self.assertEqual(module.classify_response(data, ID, 2, "now")["reason"], "COMMENT_TEXT_INVALID")

    def test_exactly_one_call_no_retry_and_no_paid_fallback(self):
        calls = []
        def fake_fetch(video_id, *, limit, sort_by):
            calls.append((video_id, limit, sort_by))
            raise RuntimeError("403 blocked")
        result = module.run_once(ID, 2, load_sampler=lambda: fake_fetch)
        self.assertEqual(result["reason"], "PUBLIC_ENDPOINT_UNAVAILABLE")
        self.assertEqual(calls, [(ID, 2, "likes")])

    def test_unpinned_dependency_not_executed(self):
        calls = []
        def fail_load():
            calls.append("load")
            raise RuntimeError("wrong git blob")
        result = module.run_once(ID, 2, load_sampler=fail_load)
        self.assertEqual(result["reason"], "PINNED_UPSTREAM_UNAVAILABLE")
        self.assertEqual(calls, ["load"])

    def test_ambient_proxy_credentials_block_before_fetch(self):
        calls = []
        with patch.dict(module.os.environ, {"HTTPS_PROXY": "http://user:secret@proxy.example"}, clear=True):
            result = module.run_once(ID, load_sampler=lambda: calls.append(1))
        self.assertEqual(result["reason"], "AMBIENT_HTTP_CREDENTIALS_UNSAFE")
        self.assertEqual(calls, [])

    def test_unverified_core_bytes_never_execute(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            core = root / "social_media_toolkit" / "platforms" / "core.py"
            core.parent.mkdir(parents=True)
            marker = root / "UNTRUSTED_SOURCE_WAS_RUN"
            core.write_text(f"from pathlib import Path\\nPath({str(marker)!r}).write_text('bad')\\n")
            dist = SimpleNamespace(locate_file=lambda name: core)
            with patch.object(module, "distribution", return_value=dist):
                with self.assertRaisesRegex(RuntimeError, "UPSTREAM_SOURCE_MISMATCH"):
                    module._load_pinned_free_sampler()
            self.assertFalse(marker.exists())

    def test_verified_core_executes_without_loading_parent_init(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            pkg = root / "social_media_toolkit"
            platforms = pkg / "platforms"
            platforms.mkdir(parents=True)
            marker = root / "UNVERIFIED_INIT_WAS_RUN"
            (pkg / "__init__.py").write_text(
                "from pathlib import Path\\nPath(" + repr(str(marker)) + ").write_text('bad')\\n"
            )
            (platforms / "__init__.py").write_text("raise RuntimeError('untrusted package init')\\n")
            core = platforms / "core.py"
            core.write_text(
                "from dataclasses import dataclass\\n"
                "@dataclass\\nclass Item:\\n    video_id: str\\n"
                "def fetch_douyin_public_comments(video_id, *, limit, sort_by):\\n"
                "    return Item(video_id).video_id\\n"
            )
            dist = SimpleNamespace(locate_file=lambda name: core)
            sha = module._git_blob_sha1(core.read_bytes())
            with patch.object(module, "distribution", return_value=dist), \\
                 patch.object(module, "UPSTREAM_CORE_BLOB", sha):
                sampler = module._load_pinned_free_sampler()
            self.assertEqual(sampler(ID, limit=2, sort_by="likes"), ID)
            self.assertFalse(marker.exists())
            self.assertNotIn("social_media_toolkit", __import__("sys").modules)

    def test_no_network_for_invalid_video_id(self):
        calls = []
        result = module.run_once("https://www.douyin.com/video/" + ID, load_sampler=lambda: calls.append(1))
        self.assertEqual(result["reason"], "INVALID_ARGS")
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
