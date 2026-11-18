import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from public_comments_canary import get_response_comment_count,result

URL='https://www.douyin.com/aweme/v1/web/comment/list/?aweme_id=7708352061931622655&cursor=0'

class CommentCanaryTests(unittest.TestCase):
    def test_matching_request_with_real_comment_text(self):
        self.assertEqual(get_response_comment_count(URL,{'comments':[{'text':'hello world'}, {'text':'ok'}]}),2)
        data=result(True,True,2,0,True)
        self.assertTrue(data['public_comment_text_observed'])
        self.assertEqual(data['classification'],'PUBLIC_COMMENT_TEXT_OBSERVED')
    def test_wrong_video_rejected(self):
        target=URL.replace('7708352061931622655','7708352061931622654')
        self.assertIsNone(get_response_comment_count(target,{'comments':[{'text':'SECRET'}]}))
        data=result(False,True,7,7,True)
        self.assertFalse(data['public_comment_text_observed'])
        self.assertEqual(data['classification'],'VIDEO_IDENTITY_NOT_CONFIRMED')
    def test_offsite_and_wrong_path_rejected(self):
        self.assertIsNone(get_response_comment_count(URL.replace('www.douyin.com','evil.com'),{}))
        self.assertIsNone(get_response_comment_count(URL.replace('/comment/list/','/comment/list/reply/'),{}))
    def test_no_text_cannot_be_success(self):
        self.assertEqual(result(True,True,0,0,True)['classification'],'COMMENT_RESPONSE_EMPTY')
        self.assertEqual(result(True,False,0,0,True)['classification'],'COMMENT_PANEL_OPENED_NO_TEXT')
        self.assertEqual(result(True,False,0,0,False)['classification'],'COMMENTS_UNVERIFIED')
    def test_visible_dom_after_click_is_distinct(self):
        data=result(True,False,0,2,True)
        self.assertTrue(data['public_comment_text_observed'])
        self.assertEqual(data['classification'],'PUBLIC_VISIBLE_DOM_COMMENT_OBSERVED')
    def test_never_persist_comment_text_or_names(self):
        data=result(True,True,1,2,True)
        self.assertNotIn('SECRET',json.dumps(data))
        self.assertFalse(data['comments_submitted'])
        self.assertFalse(data['comment_text_or_usernames_persisted'])

if __name__=='__main__':unittest.main()
