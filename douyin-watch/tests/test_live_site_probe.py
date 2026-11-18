"""Offline contract tests for the *real-site probe report*, not actual Douyin."""
import json
import tempfile
import unittest
from pathlib import Path
from live_site_probe import report_from_events, SCHEMA

class LiveSiteProbeTests(unittest.TestCase):
    def test_genuine_playback_classification_requires_progress(self):
        events=[
          ('navigation',{'http_status':200,'douyin_origin':True,
                         'cookie':'SECRET_AUTH'}),
          ('record',{'status':'PREVIEW_VERIFIED','observed_playback_s':4.25,
                     'comments':3,'title':'SECRET_TITLE','url':'https://www.douyin.com/?token=SECRET'})]
        result=report_from_events(events)
        self.assertEqual(result['classification'],'PUBLIC_VIDEO_PLAYBACK_OBSERVED')
        self.assertTrue(result['real_public_playback_observed'])
        self.assertEqual(result['observed_playback_s'],4.25)
        self.assertEqual(result['visible_comment_count'],3)
        self.assertNotIn('SECRET',json.dumps(result))
        self.assertEqual(result['schema'],SCHEMA)

    def test_http_block_or_login_screen_does_not_count_as_playback(self):
        a=report_from_events([('navigation',{'http_status':403,'douyin_origin':True}),
                              ('error',{'message':'SECRET_BOT_CHALLENGE'})])
        self.assertFalse(a['real_public_playback_observed'])
        self.assertEqual(a['classification'],'HTTP_RESTRICTED_OR_ERROR')
        self.assertNotIn('SECRET',json.dumps(a))
        b=report_from_events([('navigation',{'http_status':200,'douyin_origin':True})])
        self.assertEqual(b['classification'],'PAGE_RESPONDED_NO_VISIBLE_VIDEO')
        self.assertFalse(b['real_public_playback_observed'])

    def test_stall_unverified_and_invalid_raw_values_scrubbed(self):
        result=report_from_events([('navigation',{'http_status':200,'douyin_origin':True}),
              ('record',{'status':'PLAYBACK_STALLED','observed_playback_s':float('nan'),
                         'comments':'SECRET','full_url':'SECRET','page_html':'SECRET'})])
        self.assertEqual(result['classification'],'VISIBLE_VIDEO_BUT_PLAYBACK_NOT_VERIFIED')
        self.assertIsNone(result['observed_playback_s'])
        self.assertIsNone(result['visible_comment_count'])
        self.assertNotIn('SECRET',json.dumps(result))

    def test_forged_success_without_time_or_trusted_result_is_unverified(self):
        f=report_from_events([('record',{'status':'PREVIEW_VERIFIED','observed_playback_s':0.2})])
        self.assertFalse(f['real_public_playback_observed'])
        m=report_from_events([('record',{'status':'PASS_SECRET','observed_playback_s':9})])
        self.assertFalse(m['real_public_playback_observed'])
        self.assertEqual(m['player_result'],'UNVERIFIED')
