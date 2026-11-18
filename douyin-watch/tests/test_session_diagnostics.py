"""Privacy and boundedness regressions. No real browser or Douyin access."""
import json
import tempfile
import unittest
from pathlib import Path
from session_diagnostics import SessionDiagnostics,safe_share_summary

class SessionDiagnosticsTests(unittest.TestCase):
    def test_only_allowlisted_fields_are_saved(self):
        with tempfile.TemporaryDirectory() as root:
            file=Path(root)/'sample.json'
            d=SessionDiagnostics(file)
            d.observe(1,0,{'found':True,'current_time':0,'duration':2267.9,
                'paused':True,'ready_state':1,'network_state':2,
                'page_visible':True,'video_id':'7512345678901234567',
                'title':'SECRET_TITLE','url':'https://www.douyin.com/?cookie=SECRET',
                'cookie':'SECRET','authorization':'Bearer SECRET',
                'innerText':'SECRET_COMMENT','src_key':'SECRET_SRC'})
            d.finish_video(1,'PLAYBACK_STALLED',14,0)
            d.save()
            source=file.read_text('utf-8')
            self.assertNotIn('SECRET',source)
            self.assertNotIn('cookie',source)
            output=json.loads(source)
            self.assertEqual(output['samples'][0]['duration_s'],2267.9)
            self.assertEqual(output['outcomes'][0]['result'],'PLAYBACK_STALLED')

    def test_bad_values_and_untrusted_outcome_are_sanitized(self):
        with tempfile.TemporaryDirectory() as root:
            d=SessionDiagnostics(Path(root)/'x.json')
            d.observe(1,float('nan'),{'found':'true','duration':float('inf'),
                'current_time':-100,'ready_state':999,
                'network_state':-1,'video_id':'abcSECRET',
                'page_visible':False})
            d.finish_video(1,'status?SECRET',float('nan'),float('inf'))
            d.save()
            x=json.loads(d.path.read_text('utf-8'))
            p=x['samples'][0]
            self.assertIsNone(p['elapsed_s'])
            self.assertIsNone(p['duration_s'])
            self.assertIsNone(p['ready_state'])
            self.assertIsNone(p['video_id'])
            self.assertFalse(p['page_visible'])
            self.assertEqual(x['outcomes'][0]['result'],'UNVERIFIED')

    def test_bounded_samples_and_separate_sessions(self):
        with tempfile.TemporaryDirectory() as root:
            first=SessionDiagnostics(Path(root)/'first.json')
            for n in range(120): first.observe(1,n,{'found':True,'current_time':n})
            first.save()
            self.assertEqual(len(json.loads(first.path.read_text('utf-8'))['samples']),64)
            second=SessionDiagnostics(Path(root)/'second.json')
            second.finish_video(0,'NO_VIDEO',180,0)
            second.save()
            self.assertTrue(first.path.exists())
            self.assertEqual(json.loads(second.path.read_text('utf-8'))['outcomes'][0]['result'],'NO_VIDEO')

    def test_navigation_video_counts_and_login_flag_are_strictly_sanitized(self):
        with tempfile.TemporaryDirectory() as root:
            d=SessionDiagnostics(Path(root)/'evidence.json')
            d.record_navigation(200,True)
            d.observe(0,0,{'found':False,'document_ready':'complete',
                'video_elements_total':0,'video_elements_visible':0,
                'login_hint':True,'url':'https://www.douyin.com/?secret=SECRET',
                'page_title':'SECRET_PAGE'})
            d.save()
            obj=json.loads(d.path.read_text('utf-8'))
            self.assertEqual(obj['navigation'],{'http_status':200,'douyin_origin':True})
            self.assertEqual(obj['samples'][-1]['video_elements_total'],0)
            self.assertEqual(obj['samples'][-1]['login_hint'],True)
            self.assertNotIn('SECRET',d.path.read_text('utf-8'))
            d.record_navigation('SECRET', 'true')
            self.assertEqual(d.navigation_info,{'http_status':None,'douyin_origin':None})

    def test_chat_share_excludes_attacker_strings_video_ids_and_paths(self):
        with tempfile.TemporaryDirectory() as root:
            d=SessionDiagnostics(Path(root)/'secret_folder.json')
            d.record_navigation(200,True)
            d.observe(0,15,{'found':False,'video_id':'7512345678901234567',
                'page_title':'SECRET', 'cookie':'SECRET_COOKIE',
                'video_elements_total':0,'login_hint':False})
            d.finish_video(0,'NO_VIDEO',15,0)
            d.save()
            obj=json.loads(d.path.read_text('utf-8'))
            text=safe_share_summary(obj,'a'*64)
            self.assertIn('EXE_SHA256='+'a'*64,text)
            self.assertIn('HTTP_STATUS=200',text)
            self.assertIn('OUTCOME=NO_VIDEO',text)
            self.assertNotIn('SECRET',text)
            self.assertNotIn('7512345678901234567',text)
            self.assertNotIn('secret_folder',text)

    def test_chat_share_with_poisoned_file_fails_closed(self):
        poisoned={'schema':'yutang.douyin.diagnostics.v1','navigation':{'http_status':'SECRET',
                 'douyin_origin':'SECRET'},
            'samples':[{'visible_video':'SECRET','document_ready':'SECRET',
               'media_s':'SECRET','video_elements_total':9999,
               'video_id':'SECRET','paused':'SECRET'}],
            'outcomes':[{'result':'SECRET','observed_playback_s':'SECRET'}]}
        summary=safe_share_summary(poisoned,'SECRET')
        self.assertNotIn('SECRET',summary)
        self.assertIn('EXE_SHA256=UNVERIFIED',summary)
        self.assertIn('OUTCOME=UNVERIFIED',summary)
        with self.assertRaises(ValueError):
            safe_share_summary({'schema':'unknown','samples':[{'title':'SECRET'}]})

if __name__=='__main__':unittest.main()
