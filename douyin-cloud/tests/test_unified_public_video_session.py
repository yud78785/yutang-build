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

def sample(t,paused=False,ready=4,visible=1,index=0,target=True):
    return {"total":1,"visible":visible,"index":index,"media_time":t,
            "paused":paused,"ready":ready,"is_target_media":target,
            "cookie":"SECRET","title":"SECRET"}

class UnifiedSessionTests(unittest.TestCase):
    def test_playback_requires_multiple_real_advances(self):
        result=playback_summary([sample(x) for x in (0,1.1,2.2,3.3,4.4)])
        self.assertTrue(result["playback_observed"])
        self.assertEqual(result["advancing_samples"],4)
    def test_playback_requires_target_media_identity(self):
        result=playback_summary([sample(x,target=False) for x in (0,1.1,2.2,3.3,4.4)])
        self.assertFalse(result["playback_observed"])
        self.assertEqual(result["target_media_samples"],0)
        self.assertEqual(classify(200,True,True,result,{"visible_text_count":0},0,[]),
                         "TARGET_MEDIA_IDENTITY_NOT_VERIFIED")
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
    def test_extract_target_media_from_matching_aweme_detail(self):
        from unified_public_video_session import extract_target_media,media_url_key
        detail={"video":{"duration":15000,"play_addr":{"url_list":["https://v1.douyinvod.com/path.mp4?token=SECRET"]},
            "bit_rate":[{"play_addr":{"url_list":["https://v2.douyinvod.com/high.mp4?token=SECRET"]}}]}}
        urls,duration=extract_target_media(detail)
        self.assertEqual(len(urls),2)
        self.assertEqual(duration,15.0)
        self.assertEqual(media_url_key(urls[0]),"v1.douyinvod.com/path.mp4")
        self.assertNotIn("SECRET",json.dumps({"count":len(urls),"duration":duration}))
    def test_extract_target_media_rejects_untrusted_and_empty_data(self):
        from unified_public_video_session import extract_target_media
        self.assertEqual(extract_target_media({"video":{"play_addr":{"url_list":["http://evil.test/a"]}}}),([],None))
        self.assertEqual(extract_target_media({}),([],None))
    def test_login_panel_detected_by_safe_flags(self):
        from unified_public_video_session import safe_page_diagnostics
        result=safe_page_diagnostics({"login_hint":True,"login_panel_present":True,
             "login_dialog_present":False,"body_length_bucket":"1000-4999"})
        self.assertTrue(result["login_hint"])
        self.assertTrue(result["login_panel_present"])
    def test_login_overlay_blocks_full_visual_acceptance(self):
        result=classify(200,True,True,{"playback_observed":True},
                        {"visible_text_count":5},0,[{"file":"frame_01.png"}],
                        {"login_hint":True})
        self.assertEqual(result,"PLAYBACK_AND_COMMENTS_LOGIN_OVERLAY_BLOCKED_FRAMES")
    def test_page_diagnostics_allowlist_excludes_raw_text(self):
        from unified_public_video_session import safe_page_diagnostics
        raw={"document_ready":"complete","title_mentions_douyin":True,
             "title_verification_hint":False,"body_length_bucket":"100-999",
             "challenge_hint":True,"login_hint":False,"unavailable_hint":False,
             "router_data_present":False,"og_video_present":False,
             "script_count":20,"video_source_count":0,"captcha_node_count":1,
             "body_text":"SECRET","title":"SECRET","cookie":"SECRET"}
        result=safe_page_diagnostics(raw)
        self.assertTrue(result["challenge_hint"])
        self.assertEqual(result["video_source_count"],0)
        self.assertNotIn("SECRET",json.dumps(result))
    def test_page_diagnostics_reject_untrusted_values(self):
        from unified_public_video_session import safe_page_diagnostics
        result=safe_page_diagnostics({"document_ready":"SECRET","body_length_bucket":"SECRET",
             "script_count":99999,"video_source_count":"SECRET","challenge_hint":"yes"})
        self.assertEqual(result["document_ready"],"UNVERIFIED")
        self.assertEqual(result["body_length_bucket"],"UNVERIFIED")
        self.assertEqual(result["script_count"],500)
        self.assertEqual(result["video_source_count"],0)
        self.assertFalse(result["challenge_hint"])
    def test_challenge_page_classification_is_explicit(self):
        playback={"playback_observed":False}
        comments={"visible_text_count":0}
        self.assertEqual(classify(200,True,False,playback,comments,0,[],
                         {"challenge_hint":True}),"PAGE_CHALLENGE_OR_RISK_CONTROL")
        self.assertEqual(classify(200,True,False,playback,comments,0,[],
                         {"login_hint":True}),"PAGE_LOGIN_GATE")
        self.assertEqual(classify(200,True,False,playback,comments,0,[],
                         {"unavailable_hint":True}),"PUBLIC_VIDEO_UNAVAILABLE")
    def test_frame_targets_are_at_most_three(self):
        from unified_public_video_session import MAX_FRAMES,FRAME_TARGETS
        self.assertEqual(MAX_FRAMES,3)
        self.assertEqual(FRAME_TARGETS,(3.0,8.0,13.0))

if __name__=="__main__":unittest.main()
