"""Only offline classification/privacy tests; never connects to Douyin."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from public_video_canary import finite, safe_sample, summarize


def sample(t, paused=False, ready=4, visible=1):
    return {"total": 1, "visible": visible, "media_time": t,
            "paused": paused, "ready": ready, "cookie": "SECRET_COOKIE", "title": "SECRET_TITLE"}


class CloudCanaryTests(unittest.TestCase):
    def test_no_video_on_http_200_is_not_playback(self):
        r = summarize(200, True, False, [sample(None, visible=0)])
        self.assertEqual(r["classification"], "PAGE_RESPONDED_NO_VISIBLE_VIDEO")
        self.assertFalse(r["real_public_playback_observed"])

    def test_browser_detail_is_metadata_only(self):
        r = summarize(200, True, True, [sample(0, paused=True)] * 4)
        self.assertEqual(r["classification"], "PUBLIC_VIDEO_METADATA_OBSERVED")
        self.assertFalse(r["real_public_playback_observed"])

    def test_two_real_media_advances_confirm_playback(self):
        r = summarize(200, True, False, [sample(x) for x in (0, 1.1, 2.2, 3.3, 4.4)])
        self.assertEqual(r["classification"], "PUBLIC_VIDEO_PLAYBACK_OBSERVED")
        self.assertTrue(r["real_public_playback_observed"])
        self.assertGreater(r["observed_playback_s"], 3)

    def test_paused_and_seek_jumps_are_not_playback(self):
        r = summarize(200, True, False,
                      [sample(0, paused=True), sample(1), sample(20), sample(20, paused=True)])
        self.assertFalse(r["real_public_playback_observed"])
        self.assertEqual(r["classification"], "VIDEO_ELEMENT_PRESENT_NO_VERIFIED_PLAYBACK")

    def test_http_restriction_is_explicit(self):
        r = summarize(403, True, False, [sample(None, visible=0)])
        self.assertEqual(r["classification"], "HTTP_RESTRICTED_OR_ERROR")

    def test_report_excludes_page_text_secrets_and_media_urls(self):
        r = summarize(200, True, False, [{"total": 1, "visible": 1,
                 "media_time": 0, "ready": 4, "paused": False,
                 "cookie": "SECRET_COOKIE", "title": "SECRET_TITLE",
                 "src": "https://SECRET_HOST/SECRET_MEDIA"}], error_code="SECRET_ERROR")
        encoded = json.dumps(r)
        self.assertNotIn("SECRET", encoded)
        self.assertIsNone(r["error_code"])

    def test_counts_and_time_invalid_not_leaked(self):
        s = safe_sample({"total": "SECRET", "visible": 900,
                         "media_time": float("nan"), "paused": "false", "ready": 999})
        self.assertIsNone(s["total"])
        self.assertIsNone(s["visible"])
        self.assertIsNone(s["media_time"])
        self.assertIsNone(s["paused"])
        self.assertIsNone(s["ready"])
        self.assertIsNone(finite(float("inf"), 100))


if __name__ == "__main__":
    unittest.main()
