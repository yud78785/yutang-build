import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from unified_public_video_session import (
    safe_player_sample,safe_comment_snapshot,playback_summary,
    comment_response_count,safe_frame_record,classify
)
from unified_public_video_session import PUBLIC_VIDEO_ID

def sample(t,paused=False,ready=4,visible=1,index=0):
    return {"total":1,"visible":visible,"index":index,"media_time":t,
            "paused":paused,"ready":ready,"cookie":"SECRET","title":"SECRET"}

class UnifiedSessionTests(unittest.TestCase):
    def test_playback_requires_multiple_real_advances(self):
        result=playback_summary([sample(x) for x in (0,1.1,2.2,3.3,4.4)])
        self.assertTrue(result["playback_observed"])
        self.assertEqual(result["advancing_samples"],4)
    def test_paused_or_seek_jump_not_playback(self):
        result=playback_summary([sample(0,paused=True),sample(1),sample(20),sample(20,paused=True)])
        self.assertFalse(result["playback_observed"])
    def test_comment_snapshot_keeps_counts_only(self):
        raw={"panel_present":True,"panel_visible":True,"item_nodes":7,
             "visible_text_count":5,"login_hint":False,"comment":"SECRET","username":"SECRET"}
        result=safe_comment_snapshot(raw)
        self.assertEqual(result["visible_text_count"],5)
        self.assertNotIn("SECRET",json.dumps(result))
    def test_comment_response_must_match_target_video(self):
        url=f"https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id={PUBLIC_VIDEO_ID}&cursor=0"
        self.assertEqual(comment_response_count(url,{"comments":[{"text":"one"},{"text":"two"}]}),2)
        self.assertIsNone(comment_response_count(url.replace(PUBLIC_VIDEO_ID,"7708352061931622654"),{"comments":[{"text":"SECRET"}]}))
        self.assertIsNone(comment_response_count(url.replace("www.douyin.com","evil.example"),{"comments":[{"text":"SECRET"}]}))
    def test_frame_receipt_is_bounded_and_hash_checked(self):
        digest="a"*64
        r=safe_frame_record("frame_01.png",3.4,digest,1234)
        self.assertEqual(r["media_time_s"],3.4)
        self.assertIsNone(safe_frame_record("../secret.png",3.4,digest,1234))
        self.assertIsNone(safe_frame_record("frame_01.png",3.4,"bad",1234))
        self.assertIsNone(safe_frame_record("frame_01.png",3.4,digest,9_000_000))
    def test_classification_requires_all_three_for_full_gate(self):
        playback={"playback_observed":True}
        comments={"visible_text_count":5}
        self.assertEqual(classify(200,True,True,playback,comments,0,[{"file":"frame_01.png"}]),
                         "PLAYBACK_COMMENTS_AND_FRAMES_OBSERVED")
        self.assertEqual(classify(200,True,True,playback,comments,0,[]),
                         "PLAYBACK_AND_COMMENTS_OBSERVED")
    def test_no_comments_not_reported_as_success(self):
        self.assertEqual(classify(200,True,True,{"playback_observed":True},
                                  {"visible_text_count":0},0,[]),"PLAYBACK_ONLY")
    def test_report_sample_rejects_hostile_fields(self):
        r=safe_player_sample({"total":"SECRET","visible":999,"index":-1,
                              "media_time":float("nan"),"paused":"false","ready":99})
        self.assertIsNone(r["total"])
        self.assertIsNone(r["visible"])
        self.assertIsNone(r["index"])
        self.assertIsNone(r["media_time"])
        self.assertIsNone(r["paused"])
        self.assertIsNone(r["ready"])
    def test_frame_targets_are_at_most_three(self):
        from unified_public_video_session import MAX_FRAMES,FRAME_TARGETS
        self.assertEqual(MAX_FRAMES,3)
        self.assertEqual(FRAME_TARGETS,(3.0,8.0,13.0))

if __name__=="__main__":unittest.main()
