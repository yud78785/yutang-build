"""No-GUI tests: closing the window must not kill Playwright before Edge cleanup."""
import unittest
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


if __name__=='__main__':
    unittest.main()
