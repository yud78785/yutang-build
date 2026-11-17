import csv
import tempfile
import threading
import time
import unittest
from pathlib import Path
from agent_core import WatchConfig,RecordStore,watching_complete,is_live_or_unknown,video_identity,video_transition_confirmed,BrowserWatcher,safe_url,clip

class CoreTest(unittest.TestCase):
 def test_configuration_whitelist(self):
  for u in ('http://www.douyin.com/', 'https://evil.example/', 'https://douyin.com.evil.example/','file:///tmp/x'):
   with self.assertRaises(ValueError): WatchConfig(url=u)
  with self.assertRaises(ValueError): WatchConfig(count=100)
  with self.assertRaises(ValueError): WatchConfig(max_seconds_per_video=4)
 def test_identity_and_completion(self):
  self.assertNotEqual(video_identity({'src_key':'a','title':'x'}),video_identity({'src_key':'b','title':'x'}))
  self.assertTrue(watching_complete({'duration':10,'current_time':9.5},{'duration':10,'current_time':9},9.5))
  self.assertTrue(watching_complete({'duration':10,'current_time':0.4},{'duration':10,'current_time':9.5},9.7))
  self.assertFalse(watching_complete({'duration':10,'current_time':2},{'duration':10,'current_time':1},2))
  self.assertTrue(is_live_or_unknown({'duration':None}))
 def test_record_sanitizes_url(self):
  with tempfile.TemporaryDirectory() as tmp:
   store=RecordStore(Path(tmp))
   store.append({'index':1,'url':'https://www.douyin.com/video/123?token=SECRET','title':'你好\n世界','status':'COMPLETE'})
   raw=store.path.read_text('utf-8-sig')
   self.assertNotIn('SECRET',raw)
   self.assertIn('https://www.douyin.com/video/123',raw)
   self.assertIn('你好 世界',raw)
 def test_video_source_replacement_is_not_new_video(self):
  base={'src_key':'placeholder','title':'抖音首页','page_title':'抖音首页','url':'https://www.douyin.com/'}
  loaded={'src_key':'media1','title':'真实视频','page_title':'抖音首页','url':'https://www.douyin.com/'}
  self.assertFalse(video_transition_confirmed(base,loaded))
  self.assertFalse(video_transition_confirmed(loaded,{**loaded,'src_key':'media2'}))
  self.assertFalse(video_transition_confirmed({**loaded,'url':'https://www.douyin.com/video/7512345678901234567'}, {**loaded,'src_key':'media3','url':'https://www.douyin.com/video/7512345678901234567'}))
  self.assertTrue(video_transition_confirmed({**loaded,'url':'https://www.douyin.com/video/7512345678901234567'}, {**loaded,'src_key':'other','title':'第二条','url':'https://www.douyin.com/video/7512345678901234568'}))
  self.assertTrue(video_transition_confirmed(loaded,{**loaded,'src_key':'media3','title':'第二条'}))

 def test_browser_stays_open_until_explicit_stop(self):
  stop=threading.Event()
  events=[]
  watcher=BrowserWatcher(WatchConfig(count=1),stop,lambda kind,payload:events.append((kind,payload)))
  class FakePage:
   def is_closed(self): return False
  runner=threading.Thread(target=watcher._hold_browser_until_user_stops,args=(FakePage(),))
  runner.start()
  time.sleep(0.1)
  self.assertTrue(runner.is_alive())
  self.assertTrue(any(kind=='status' and 'Edge' in payload.get('message','') for kind,payload in events))
  stop.set()
  runner.join(1)
  self.assertFalse(runner.is_alive())

 def test_clip_and_url(self):
  self.assertEqual(clip(' a  \n b  '),'a b')
  self.assertEqual(safe_url('javascript:alert(1)'),'')
  self.assertEqual(safe_url('https://www.douyin.com.evil/'),'')

if __name__=='__main__':unittest.main()
