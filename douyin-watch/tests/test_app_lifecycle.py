"""No-GUI tests: closing the window must not kill Playwright before Edge cleanup."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app import App


class FakeRoot:
    def __init__(self):
        self.callbacks=[]
        self.destroyed=0

    def after(self,delay,callback):
        self.callbacks.append(callback)

    def destroy(self):
        self.destroyed+=1


class FakeWorker:
    def __init__(self,running=True):
        self.running=running

    def is_alive(self):
        return self.running


class AppLifecycleTests(unittest.TestCase):
    def make_app(self):
        app=App.__new__(App)
        app.root=FakeRoot()
        app.worker=FakeWorker(True)
        app.close_requested=False
        app.stop_calls=0
        app.stop=lambda: setattr(app,'stop_calls',app.stop_calls+1)
        return app

    def test_close_waits_for_browser_cleanup(self):
        app=self.make_app()
        with patch('app.messagebox.askyesno',return_value=True):
            app.on_close()
        self.assertEqual(app.stop_calls,1)
        self.assertTrue(app.close_requested)
        self.assertEqual(app.root.destroyed,0)
        self.assertEqual(len(app.root.callbacks),1)
        first=app.root.callbacks.pop()
        first()
        self.assertEqual(app.root.destroyed,0)
        app.worker.running=False
        last=app.root.callbacks.pop()
        last()
        self.assertEqual(app.root.destroyed,1)

    def test_repeated_close_cannot_interrupt_cleanup(self):
        app=self.make_app()
        with patch('app.messagebox.askyesno',return_value=True) as dialog:
            app.on_close()
            app.on_close()
        self.assertEqual(dialog.call_count,1)
        self.assertEqual(app.stop_calls,1)
        self.assertEqual(app.root.destroyed,0)

    def test_denied_close_leaves_worker_running(self):
        app=self.make_app()
        with patch('app.messagebox.askyesno',return_value=False):
            app.on_close()
        self.assertFalse(app.close_requested)
        self.assertEqual(app.stop_calls,0)
        self.assertEqual(app.root.destroyed,0)
        self.assertEqual(app.root.callbacks,[])

    def test_idle_close_is_immediate(self):
        app=self.make_app()
        app.worker.running=False
        app.on_close()
        self.assertEqual(app.root.destroyed,1)


class OneClickShareTests(unittest.TestCase):
    def test_copy_only_sanitized_values_and_packaged_exe_sha(self):
        class ClipboardRoot:
            def __init__(self): self.data=''
            def clipboard_clear(self): self.data=''
            def clipboard_append(self,txt): self.data+=txt
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'diag.json'
            path.write_text(json.dumps({'schema':'yutang.douyin.diagnostics.v1',
                'navigation':{'http_status':200,'douyin_origin':True},
                'samples':[{'visible_video':False,'video_elements_total':0,
                            'page_title':'SECRET','video_id':'7512345678901234567'}],
                'outcomes':[]}),encoding='utf-8')
            app=App.__new__(App)
            app.root=ClipboardRoot()
            app.diagnostics_path=path
            events=[]
            app._log=events.append
            with patch('app.executable_sha256',return_value='b'*64):
                app.copy_diagnostics()
            self.assertIn('EXE_SHA256='+'b'*64,app.root.data)
            self.assertIn('VISIBLE_VIDEO=NO',app.root.data)
            self.assertNotIn('SECRET',app.root.data)
            self.assertNotIn('7512345678901234567',app.root.data)
            self.assertTrue(events)

    def test_copy_before_started_does_not_touch_clipboard(self):
        app=App.__new__(App)
        app.diagnostics_path=None
        class ClipboardRoot:
            def clipboard_clear(self):raise AssertionError('clipboard should not be touched')
        app.root=ClipboardRoot()
        with patch('app.messagebox.showinfo') as popup:
            app.copy_diagnostics()
        self.assertEqual(popup.call_count,1)


if __name__=='__main__':
    unittest.main()
