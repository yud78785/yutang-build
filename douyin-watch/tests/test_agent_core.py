import csv
import tempfile
import unittest
from pathlib import Path
from agent_core import WatchConfig,RecordStore,watching_complete,is_live_or_unknown,video_identity,safe_url,clip

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
 def test_clip_and_url(self):
  self.assertEqual(clip(' a  \n b  '),'a b')
  self.assertEqual(safe_url('javascript:alert(1)'),'')
  self.assertEqual(safe_url('https://www.douyin.com.evil/'),'')

if __name__=='__main__':unittest.main()
