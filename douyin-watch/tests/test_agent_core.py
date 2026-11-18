import csv
import tempfile
import unittest
import threading
from unittest.mock import patch
from pathlib import Path
from agent_core import WatchConfig,RecordStore,watching_complete,verified_full_watch,is_live_or_unknown,video_identity,confirmed_video_change,safe_url,clip,BrowserWatcher,PLAY_JS

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

 def test_metadata_and_source_loading_are_not_video_changes(self):
  old={'found':True,'src_key':'source-a','player_key':'player-1',
       'title':'抖音加载中','url':'https://www.douyin.com/',
       'current_time':2.0,'ready_state':4}
  title_update=dict(old,title='视频正文标题',url='https://www.douyin.com/discover')
  self.assertFalse(confirmed_video_change(old,title_update))
  loading=dict(title_update,src_key='source-b',current_time=2.9)
  self.assertFalse(confirmed_video_change(old,loading))
  blank=dict(old,src_key='',current_time=0.1)
  settled=dict(blank,src_key='source-a',title='视频正文标题',current_time=0.5)
  self.assertFalse(confirmed_video_change(blank,settled))
  self.assertFalse(confirmed_video_change(blank,settled,after_navigation=True))
  self.assertFalse(confirmed_video_change(old,title_update,after_navigation=True))
  self.assertFalse(confirmed_video_change(old,old))

 def test_real_change_requires_multiple_media_signals(self):
  old={'found':True,'src_key':'source-a','player_key':'player-1',
       'title':'视频一','current_time':8.6,'duration':10,
       'url':'https://www.douyin.com/'}
  another=dict(old,src_key='source-b',title='视频二',current_time=0.1)
  self.assertTrue(confirmed_video_change(old,another))
  self.assertTrue(confirmed_video_change(old,another,after_navigation=True))
  altered=dict(old,src_key='source-b',current_time=8.7)
  self.assertFalse(confirmed_video_change(old,altered))
  player_replaced=dict(old,player_key='player-2',title='视频二',current_time=0)
  self.assertFalse(confirmed_video_change(old,player_replaced))
  self.assertTrue(confirmed_video_change(old,player_replaced,after_navigation=True))
  explicit_a=dict(old,video_id='1234567890')
  explicit_b=dict(another,video_id='9999999999')
  self.assertTrue(confirmed_video_change(explicit_a,explicit_b))
  same_explicit=dict(another,video_id='1234567890')
  self.assertFalse(confirmed_video_change(explicit_a,same_explicit))

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

 def test_watcher_keeps_playing_when_douyin_metadata_changes(self):
  class FakeClock:
   def __init__(self):self.t=0.0
   def monotonic(self):return self.t
   def wait(self,seconds):self.t+=seconds;return False
  class FakePage:
   def __init__(self,sequence):self.sequence=sequence;self.i=0
   def evaluate(self,expr):
    if expr==PLAY_JS:return 'ALREADY_PLAYING'
    k=min(self.i,len(self.sequence)-1)
    self.i+=1
    return self.sequence[k]
  def scene(t,src='video-a',title='加载中'):
   return {'found':True,'duration':10,'current_time':t,'paused':False,'ended':False,
    'src_key':src,'player_key':'player-1','title':title,'url':'https://www.douyin.com/'}
  def run(samples):
   clock=FakeClock()
   watcher=BrowserWatcher(WatchConfig(count=1,max_seconds_per_video=15,capture_frames=False),
    threading.Event(),lambda *_:None)
   watcher._sleep=clock.wait
   with patch('agent_core.time.monotonic',clock.monotonic):
    return watcher._play_to_end(FakePage(samples),samples[0],1)[0]
  # Loading titles, URLs and an adaptive CDN source change do not mean Next.
  normal=[scene(t) for t in [0,1,2,3,4,5,6,7,8,9,9.7]]
  normal[2]=dict(normal[2],title='已加载的标题',url='https://www.douyin.com/discover')
  normal[3:]=[dict(x,title='已加载的标题',src_key='adaptive-cdn-b') for x in normal[3:]]
  self.assertEqual(run(normal),'COMPLETE')
  # If the actual source, title AND media clock reset, stop rather than
  # mistakenly attach the following video's comments to the previous one.
  changed=[scene(t) for t in [0,1,2,3,4,5,6]]
  changed.append(scene(0.1,src='video-b',title='下一条视频'))
  self.assertEqual(run(changed),'VIDEO_CHANGED')

 def test_local_active_frame_sample_is_bounded_and_scoped(self):
  class FakePage:
   def __init__(self,identity):
    self.identity=identity;self.calls=[];self.title='测试视频';self.t=6.0
   def evaluate(self,js):
    return {'found':True,'src_key':self.identity,'title':self.title,
     'url':'https://www.douyin.com/video/123','area_active':True,
     'current_time':self.t,
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
   # A CDN source change ALONE is not a proven next video.
   p.identity='cdn-rotated'
   w._capture_frame(p,1,50,expected)
   self.assertEqual(len(p.calls),2)
   # A different title and source with a real time reset IS a new video.
   p.identity='changed';p.title='下一条视频';p.t=0.0
   w._capture_frame(p,1,85,expected)
   self.assertEqual(len(p.calls),2)
   disabled=BrowserWatcher(WatchConfig(capture_frames=False),threading.Event(),lambda *_:None,output_dir=Path(tmp))
   disabled._capture_frame(p,2,10,p.evaluate(None))
   self.assertEqual(len(p.calls),2)

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
   with first.path.open(encoding='utf-8-sig',newline='') as fp:
    row=next(csv.DictReader(fp))
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

 def test_v2_preview_is_not_full_completion(self):
  class Clock:
   def __init__(self): self.t=0.0
   def monotonic(self): return self.t
   def wait(self,seconds): self.t+=seconds;return False
  class Page:
   def __init__(self): self.i=0
   def evaluate(self,expression):
    if expression==PLAY_JS:return 'PLAYING'
    t=min(self.i,8)
    self.i+=1
    return {'found':True,'duration':2267.9,'current_time':float(t),
      'paused':False,'ready_state':4,'src_key':'media-a','player_key':'p1',
      'title':'长视频','url':'https://www.douyin.com/video/7512345678901234567'}
  clk=Clock()
  watcher=BrowserWatcher(WatchConfig(count=1,max_seconds_per_video=15,
   watch_mode='preview',preview_seconds=4,capture_frames=False),
   threading.Event(),lambda *_:None)
  watcher._sleep=clk.wait
  original={'found':True,'duration':2267.9,'current_time':0.0,'paused':False,
   'ready_state':4,'src_key':'media-a','player_key':'p1',
   'title':'长视频','url':'https://www.douyin.com/video/7512345678901234567'}
  with patch('agent_core.time.monotonic',clk.monotonic):
   status,elapsed,final=watcher._play_to_end(Page(),original,1)
  self.assertEqual(status,'PREVIEW_VERIFIED')
  self.assertGreaterEqual(final['observed_playback_s'],4.0)
  self.assertLess(elapsed,15)
  self.assertNotEqual(status,'COMPLETE')

 def test_v2_hold_edge_until_explicit_stop(self):
  stop=threading.Event()
  events=[]
  watcher=BrowserWatcher(WatchConfig(),stop,lambda kind,data:events.append((kind,data)))
  class Page:
   def is_closed(self): return False
  worker=threading.Thread(target=watcher._hold_browser_until_user_stops,args=(Page(),))
  worker.start()
  self.assertTrue(worker.is_alive())
  self.assertTrue(any(k=='status' for k,_ in events))
  stop.set()
  worker.join(2)
  self.assertFalse(worker.is_alive())

 def test_v3_rebinds_new_douyin_tab_without_inspecting_offsite_content(self):
  class FakePage:
   def __init__(self,url,found):
    self.url=url;self.found=found;self.evals=0;self.timeout=None
   def is_closed(self): return False
   def set_default_timeout(self,t): self.timeout=t
   def evaluate(self,js):
    self.evals+=1
    if 'offsite.example' in self.url: raise AssertionError('Offsite DOM inspected')
    return {'found':self.found,'paused':False,'duration':10,'current_time':2}
  class Context:
   def __init__(self,pages): self.pages=pages
  home=FakePage('https://www.douyin.com/',False)
  other=FakePage('https://offsite.example/private?token=SECRET',True)
  opened=FakePage('https://www.douyin.com/video/7512345678901234567',True)
  events=[]
  watcher=BrowserWatcher(WatchConfig(),threading.Event(),lambda k,p:events.append((k,p)))
  selected,probe=watcher._find_live_video(Context([home,other,opened]),home,limit=2)
  self.assertIs(selected,opened)
  self.assertTrue(probe['found'])
  self.assertEqual(other.evals,0)
  self.assertEqual(opened.evals,1)
  self.assertEqual(opened.timeout,4000)
  self.assertTrue(any('新打开' in p.get('message','') for k,p in events if k=='status'))

 def test_v4_next_tab_handoff_never_inspects_offsite_page(self):
  class Page:
   def __init__(self,url,probe):
    self.url=url;self.probe=probe;self.evals=0;self.timeout=None
   def is_closed(self):return False
   def set_default_timeout(self,ms):self.timeout=ms
   def evaluate(self,js):
    self.evals+=1
    if 'offsite.example' in self.url: raise AssertionError('Offsite DOM inspected')
    return dict(self.probe)
  class Context:
   def __init__(self,pages):self.pages=pages
  old={'found':True,'video_id':'7512345678901234567','src_key':'a',
       'title':'视频一','current_time':10.0}
  new={'found':True,'video_id':'7512345678901234568','src_key':'b',
       'title':'视频二','current_time':0.0}
  prior=Page('https://www.douyin.com/video/7512345678901234567',old)
  offsite=Page('https://offsite.example/private?secret=1',new)
  recent=Page('https://www.douyin.com/video/7512345678901234568',new)
  w=BrowserWatcher(WatchConfig(),threading.Event(),lambda *_:None)
  with patch.object(w,'_next_video',side_effect=AssertionError('Should not swipe when another tab exists')):
   selected=w._next_video_or_tab(Context([prior,offsite,recent]),prior,old)
  self.assertIs(selected[0],recent)
  self.assertEqual(selected[1]['video_id'],new['video_id'])
  self.assertEqual(offsite.evals,0)
  self.assertEqual(recent.timeout,4000)

 def test_v4_handoff_rejects_same_video_or_missing_site(self):
  class Page:
   def __init__(self,url,probe,closed=False):
    self.url=url;self.probe=probe;self.closed=closed;self.evals=0
   def is_closed(self):return self.closed
   def evaluate(self,js):self.evals+=1;return dict(self.probe)
  class Context:
   def __init__(self,pages):self.pages=pages
  original={'found':True,'video_id':'7512345678901234567',
            'src_key':'a','title':'标题','current_time':8.0}
  same={**original,'src_key':'new-cdn','title':'相同视频标题'}
  old=Page('https://www.douyin.com/video/7512345678901234567',original)
  duplicate=Page('https://www.douyin.com/video/7512345678901234567',same)
  hostile=Page('https://www.douyin.com.evil.example/video/7512345678901234568',original)
  closed=Page('https://www.douyin.com/video/7512345678901234568',original,closed=True)
  w=BrowserWatcher(WatchConfig(),threading.Event(),lambda *_:None)
  with patch.object(w,'_next_video',return_value=False):
   selected=w._next_video_or_tab(Context([old,hostile,duplicate,closed]),old,original)
  self.assertIsNone(selected)
  self.assertEqual(hostile.evals,0)
  self.assertEqual(closed.evals,0)

 def test_v4_same_tab_arrow_navigation_still_works(self):
  class Page:
   def __init__(self,url,probe):self.url=url;self.probe=probe
   def is_closed(self):return False
   def evaluate(self,js):return dict(self.probe)
  class Context:
   def __init__(self,pages):self.pages=pages
  old={'found':True,'video_id':'7512345678901234567','src_key':'a','title':'一','current_time':9}
  new={'found':True,'video_id':'7512345678901234568','src_key':'b','title':'二','current_time':0}
  page=Page('https://www.douyin.com/',old)
  w=BrowserWatcher(WatchConfig(),threading.Event(),lambda *_:None)
  def advance(p,old):p.probe=new;return True
  with patch.object(w,'_next_video',side_effect=advance) as nav:
   result=w._next_video_or_tab(Context([page]),page,old)
  self.assertIs(result[0],page)
  self.assertEqual(result[1]['video_id'],new['video_id'])
  self.assertEqual(nav.call_count,1)

 def test_clip_and_url(self):
  self.assertEqual(clip(' a  \n b  '),'a b')
  self.assertEqual(safe_url('javascript:alert(1)'),'')
  self.assertEqual(safe_url('https://www.douyin.com.evil/'),'')

if __name__=='__main__':unittest.main()
