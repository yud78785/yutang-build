"""Negative-path tests for the one-shot pinned upstream public sample wrapper."""
import importlib.util
from pathlib import Path
import unittest

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

    def test_no_network_for_invalid_video_id(self):
        calls = []
        result = module.run_once("https://www.douyin.com/video/" + ID, load_sampler=lambda: calls.append(1))
        self.assertEqual(result["reason"], "INVALID_ARGS")
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
