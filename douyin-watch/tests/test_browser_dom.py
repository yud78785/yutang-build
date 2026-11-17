"""Real Chromium local DOM simulation. Does not visit Douyin or external services."""
import os
import threading
import tempfile
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
from agent_core import PROBE_JS, COMMENTS_JS, SUMMARY_JS, BrowserWatcher, WatchConfig

HTML = '''<!doctype html><html><head><title>抖音-本地模拟</title></head><body>
<div id="old" style="display:none"><video id="oldvideo" style="width:400px;height:600px"></video><h1>旧标题</h1></div>
<div data-e2e="feed-active-video" style="width:400px;height:550px">
<video id="now" style="width:400px;height:500px"></video><p data-e2e="video-desc">第一个测试视频</p></div>
<div data-e2e="comment-item">很棒的评论A</div><div data-e2e="comment-item">很棒的评论B</div>
<div class="aiSummary">AI总结：这是一条页面已有的公开总结，与模拟测试相关。</div>
<script>
 let counter=0;
 let v=document.getElementById('now');
 v.setAttribute('src','https://example.invalid/video1.webm');
 Object.defineProperty(v,'duration',{get:()=>9.6});
 Object.defineProperty(v,'readyState',{get:()=>4});
 Object.defineProperty(v,'paused',{get:()=>false});
 Object.defineProperty(v,'currentTime',{configurable:true,get:()=>window.mockTime||0,set:(n)=>{window.mockTime=n;}});
 window.addEventListener('keydown', e=>{if(e.key==='ArrowDown'){
    counter++;
    document.querySelector('[data-e2e="video-desc"]').textContent='下一条 '+counter;
    v.setAttribute('src','https://example.invalid/video'+(counter+1)+'.webm');
    window.mockTime=0;
 }});
</script></body></html>'''

class BrowserDOMTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  try:
   cls.play=sync_playwright().start()
   launch_args={'headless':True}
   if os.name=='nt': launch_args['channel']='msedge'
   else: launch_args.update(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   cls.browser=cls.play.chromium.launch(**launch_args)
  except Exception as e:
   raise unittest.SkipTest('Chromium unavailable: '+str(e)[:180])

 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.play.stop()

 def setUp(self):
  self.page=self.browser.new_page()
  self.page.set_content(HTML)

 def tearDown(self): self.page.close()

 def test_active_player_ignores_hidden_old_video(self):
  probe=self.page.evaluate(PROBE_JS)
  self.assertTrue(probe['found'])
  self.assertEqual(probe['title'],'第一个测试视频')
  self.assertTrue(probe['area_active'])
  self.assertAlmostEqual(probe['duration'],9.6)
  self.assertEqual(len(self.page.evaluate(COMMENTS_JS,5)),2)
  self.assertIn('AI总结',self.page.evaluate(SUMMARY_JS))

 def test_real_edge_crops_active_video_and_saves_only_local_png(self):
  with tempfile.TemporaryDirectory() as temp:
   w=BrowserWatcher(WatchConfig(count=1,capture_frames=True),threading.Event(),lambda *_:None,output_dir=Path(temp))
   probe=w._probe(self.page)
   rect=probe.get('frame_rect') or {}
   self.assertGreaterEqual(rect.get('width',0),300)
   self.assertGreaterEqual(rect.get('height',0),350)
   w._capture_frame(self.page,1,10,probe)
   image=Path(temp)/'frames'/'video-001-progress-10.png'
   self.assertTrue(image.exists())
   self.assertTrue(image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
   self.page.evaluate("document.querySelector('[data-e2e=video-desc]').textContent='视频切换了'")
   w._capture_frame(self.page,1,50,probe)
   self.assertFalse((Path(temp)/'frames'/'video-001-progress-50.png').exists())

 def test_arrow_down_actually_changes_active_video(self):
  w=BrowserWatcher(WatchConfig(count=2),threading.Event(),lambda *_:None)
  before=w._probe(self.page)
  self.assertTrue(w._next_video(self.page,before))
  after=w._probe(self.page)
  self.assertNotEqual(after['title'],before['title'])
  self.assertNotEqual(after['src_key'],before['src_key'])

if __name__=='__main__':unittest.main()
