import csv
import tempfile
import unittest
import threading
from unittest.mock import patch
from pathlib import Path
from agent_core import WatchConfig,RecordStore,watching_complete,verified_full_watch,is_live_or_unknown,video_identity,safe_url,clip,BrowserWatcher,PLAY_JS

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
 def test_verified_full_watch_refuses_near_end_start(self):
  near={'duration':10,'current_time':9.6,'ended':False}
  before={'duration':10,'current_time':8.8}
  self.assertTrue(verified_full_watch(near,before,9.6,True,9))
  self.assertFalse(verified_full_watch(near,before,9.6,False,9))
  self.assertFalse(verified_full_watch(near,before,9.6,True,0.25))
  self.assertFalse(verified_full_watch(near,before,8.1,True,9))
  self.assertFalse(verified_full_watch({'duration':None,'current_time':5},before,5,True,5))

 def test_full_playback_sequence_and_fail_closed_seeks(self):
  class FakeClock:
   def __init__(self):
    self.t=0.0
   def monotonic(self):
    return self.t
   def wait(self,n):
    self.t+=n
    return False

  class FakePage:
   def __init__(self,times,paused=False):
    self.times=list(times)
    self.index=0
    self.paused=paused
   def evaluate(self,expr):
    if expr==PLAY_JS:return 'PLAYING'
    idx=min(self.index,len(self.times)-1)
    value=self.times[idx]
    self.index+=1
    return {'found':True,'duration':10,'current_time':value,'paused':self.paused,
     'ended':False,'src_key':'same','title':'视频','url':'https://www.douyin.com/video/1'}

  def simulate(times,paused=False):
   clk=FakeClock()
   watcher=BrowserWatcher(WatchConfig(count=1,max_seconds_per_video=15,
       capture_frames=False),threading.Event(),lambda *_:None)
   watcher._sleep=clk.wait
   page=FakePage(times,paused)
   original={'found':True,'duration':10,'current_time':times[0],
    'src_key':'same','title':'视频','url':'https://www.douyin.com/video/1'}
   with patch('agent_core.time.monotonic',clk.monotonic):
    status,elapsed,final=watcher._play_to_end(page,original,1)
   return status

  self.assertEqual(simulate([0,1,2,3,4,5,6,7,8,9,9.7]),'COMPLETE')
  self.assertNotEqual(simulate([9.3,0.2,0.6,9.5,9.7]),'COMPLETE')
  self.assertEqual(simulate([0,0.2,9.5]),'SEEK_DETECTED')
  self.assertNotEqual(simulate([0,1,2,3,4,5,6,7,8,9.7],paused=True),'COMPLETE')

 def test_local_active_frame_sample_is_bounded_and_scoped(self):
  class FakePage:
   def __init__(self,identity):
    self.identity=identity;self.calls=[]
   def evaluate(self,js):
    return {'found':True,'src_key':self.identity,'title':'测试视频',
     'url':'https://www.douyin.com/video/123','area_active':True,
     'frame_rect':{'x':15,'y':20,'width':300,'height':350}}
   def screenshot(self,**kwargs):
    self.calls.append(kwargs)
    Path(kwargs['path']).write_bytes(b'FAKE_LOCAL_TEST_ONLY')
  with tempfile.TemporaryDirectory() as tmp:
   events=[]
   p=FakePage('same')
   w=BrowserWatcher(WatchConfig(count=1),threading.Event(),lambda kind,payload:events.append((kind,payload)),output_dir=Path(tmp))
   expected=p.evaluate(None)
   w._capture_frame(p,1,10,expected)
   w._capture_frame(p,1,99,expected)
   self.assertEqual(len(p.calls),1)
   self.assertEqual(p.calls[0]['clip'],expected['frame_rect'])
   self.assertEqual(w._last_frames,['video-001-progress-10.png'])
   self.assertTrue((Path(tmp)/'frames'/w._last_frames[0]).exists())
   p.identity='changed'
   w._capture_frame(p,1,50,expected)
   self.assertEqual(len(p.calls),1)
   disabled=BrowserWatcher(WatchConfig(capture_frames=False),threading.Event(),lambda *_:None,output_dir=Path(tmp))
   disabled._capture_frame(p,2,10,p.evaluate(None))
   self.assertEqual(len(p.calls),1)

 def test_sessions_keep_separate_csv_and_frames_and_escape_formulas(self):
  class FakePage:
   def evaluate(self,js):
    return {'found':True,'src_key':'123','title':'clip',
            'url':'https://www.douyin.com/video/123','area_active':True,
            'frame_rect':{'x':0,'y':0,'width':320,'height':240}}
   def screenshot(self,**kwargs):
    Path(kwargs['path']).write_bytes(b'FAKE_EVIDENCE')
  with tempfile.TemporaryDirectory() as temp:
   out=Path(temp)
   first=RecordStore(out)
   first.append({'index':1,'status':'COMPLETE','title':'=HYPERLINK("https://evil.example")',
                 'comments':'+SUM(1,2)','ai_summary':'@SUM(1,2)','note':'-formula'})
   original=first.path.read_bytes()
   second=RecordStore(out)
   self.assertNotEqual(first.path,second.path)
   self.assertEqual(first.path.read_bytes(),original)
   row=next(csv.DictReader(first.path.open(encoding='utf-8-sig',newline='')))
   self.assertTrue(row['title'].startswith("'="))
   self.assertTrue(row['comments'].startswith("'+"))
   self.assertTrue(row['ai_summary'].startswith("'@"))
   self.assertTrue(row['note'].startswith("'-"))
   clips=[]
   page=FakePage()
   for store in (first,second):
    w=BrowserWatcher(WatchConfig(count=1),threading.Event(),lambda *_:None,output_dir=out)
    w._frame_dir_name=store.path.stem+'-frames'
    w._capture_frame(page,1,10,page.evaluate(None))
    self.assertEqual(len(w._last_frames),1)
    image=out/w._frame_dir_name/w._last_frames[0]
    self.assertTrue(image.exists())
    clips.append(image)
   self.assertNotEqual(clips[0],clips[1])
   self.assertTrue(clips[0].exists())
   self.assertTrue(clips[1].exists())

 def test_clip_and_url(self):
  self.assertEqual(clip(' a  \n b  '),'a b')
  self.assertEqual(safe_url('javascript:alert(1)'),'')
  self.assertEqual(safe_url('https://www.douyin.com.evil/'),'')

if __name__=='__main__':unittest.main()
