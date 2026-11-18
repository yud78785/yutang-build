"""One-shot fake-clock tests for early Windows field-diagnostic snapshots.

No internet, no account access, and no desktop interaction.
"""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from agent_core import BrowserWatcher,WatchConfig,PLAY_JS
from session_diagnostics import SessionDiagnostics


class Clock:
    def __init__(self):
        self.now=0.0
    def monotonic(self):
        return self.now
    def wait(self,seconds):
        self.now+=seconds
        return False


class FakePage:
    url='https://www.douyin.com/'
    def __init__(self,visible=False):
        self.visible=visible
        self.calls=0
    def is_closed(self):
        return False
    def evaluate(self,script):
        if script==PLAY_JS:
            return 'GESTURE_REQUIRED'
        self.calls+=1
        if self.visible:
            return {'found':True,'duration':2267.9,'current_time':0.0,
                    'paused':True,'ready_state':4,'network_state':2,
                    'video_elements_total':1,'video_elements_visible':1,
                    'document_ready':'complete'}
        return {'found':False,'video_elements_total':0,'video_elements_visible':0,
                'document_ready':'complete','login_hint':False,
                'page_title':'SECRET_PAGE','cookie':'SECRET_COOKIE'}


class Context:
    def __init__(self,one):
        self.pages=[one]


class LiveDiagnosticTests(unittest.TestCase):
    def test_waiting_for_missing_video_saves_before_timeout(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'diagnostics.json'
            w=BrowserWatcher(WatchConfig(count=1),threading.Event(),lambda *_:None)
            w._diagnostics=SessionDiagnostics(path)
            page=FakePage()
            clock=Clock()
            w._sleep=clock.wait
            with patch('agent_core.time.monotonic',clock.monotonic):
                selected,current=w._find_live_video(Context(page),page,limit=13)
            self.assertIs(selected,page)
            self.assertIsNone(current)
            self.assertTrue(path.exists())
            saved=json.loads(path.read_text('utf-8'))
            self.assertGreaterEqual(len(saved['samples']),2)
            self.assertEqual(saved['samples'][-1]['video_elements_total'],0)
            self.assertEqual(saved['samples'][-1]['visible_video'],False)
            self.assertNotIn('SECRET',path.read_text('utf-8'))

    def test_stalled_player_persists_progress_before_failure(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'diagnostics.json'
            w=BrowserWatcher(WatchConfig(count=1,max_seconds_per_video=20,
                            capture_frames=False,watch_mode='preview'),
                            threading.Event(),lambda *_:None)
            w._diagnostics=SessionDiagnostics(path)
            clock=Clock()
            w._sleep=clock.wait
            page=FakePage(visible=True)
            original=page.evaluate(None)
            with patch('agent_core.time.monotonic',clock.monotonic):
                status,elapsed,final=w._play_to_end(page,original,1)
            self.assertEqual(status,'PLAYBACK_STALLED')
            self.assertTrue(path.exists())
            report=json.loads(path.read_text('utf-8'))
            self.assertTrue(report['samples'])
            self.assertEqual(report['samples'][-1]['media_s'],0)
            self.assertEqual(final['observed_playback_s'],0)
            self.assertGreater(elapsed,12)


if __name__=='__main__':
    unittest.main()
