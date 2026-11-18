"""Privacy and boundedness regressions. No real browser or Douyin access."""
import json
import tempfile
import unittest
from pathlib import Path
from session_diagnostics import SessionDiagnostics

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

if __name__=='__main__':unittest.main()
