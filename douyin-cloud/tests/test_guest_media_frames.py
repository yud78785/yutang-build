import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from guest_media_frames import collect_media,url_key,extract_frame,safe_media_length,MAX_MEDIA_BYTES

class GuestMediaFrameTests(unittest.TestCase):
    def test_choose_highest_bitrate_from_matching_detail(self):
        detail={"video":{"duration":15000,"play_addr":{"url_list":["https://v1.douyinvod.com/base.mp4?token=SECRET"]},
          "bit_rate":[{"bit_rate":100,"play_addr":{"url_list":["https://v1.douyinvod.com/low.mp4?token=SECRET"]}},
                      {"bit_rate":900,"play_addr":{"url_list":["https://v1.douyinvod.com/high.mp4?token=SECRET"]}}]}}
        urls,duration=collect_media(detail)
        self.assertEqual(urls[0],"https://v1.douyinvod.com/high.mp4?token=SECRET")
        self.assertEqual(duration,15.0)
        self.assertEqual(url_key(urls[0]),"v1.douyinvod.com/high.mp4")
    def test_reject_untrusted_media_urls(self):
        self.assertEqual(collect_media({"video":{"play_addr":{"url_list":["http://evil.test/a"]}}}),([],None))
        self.assertEqual(url_key("file:///tmp/a"),"")
        self.assertEqual(url_key("https://"),"")
    def test_media_size_ceiling(self):
        self.assertEqual(MAX_MEDIA_BYTES,40_000_000)
        self.assertEqual(safe_media_length("1000"),1000)
        with self.assertRaises(ValueError):safe_media_length(None)
        with self.assertRaises(ValueError):safe_media_length("unknown")
        with self.assertRaises(ValueError):safe_media_length(str(MAX_MEDIA_BYTES+1))
    def test_frame_extractor_rejects_empty_or_oversized_input(self):
        with self.assertRaises(ValueError):extract_frame(b"",3.0)
        with self.assertRaises(ValueError):extract_frame(b"x"*(MAX_MEDIA_BYTES+1),3.0)
    def test_manifest_never_contains_media_url_or_comment_text(self):
        receipt={"media_file_persisted":False,"media_uploaded":False,
                 "frame_count":0,"comments_submitted":False}
        encoded=json.dumps(receipt)
        self.assertNotIn("SECRET",encoded)
        self.assertNotIn("https://",encoded)

if __name__=="__main__":unittest.main()
