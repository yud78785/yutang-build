"""YuTang Douyin visible-browser read-only watching controller.

Public page DOM/video access only; no Douyin private APIs, no login automation,
no captcha evasion, no likes/comments/follows/shares and no credential extraction.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import queue
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit, urlunsplit

APP_NAME = "YuTangDouyinWatch"
DEFAULT_URL = "https://www.douyin.com/"
MAX_VIDEOS = 50
MAX_PLAY_SECONDS = 300

# Read-only DOM analysis. Active video selection is critical on a single-page app:
# old videos frequently remain in the DOM but are hidden behind a new player.
PROBE_JS = r"""() => {
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 90 && r.height > 90 && s.display !== 'none' &&
      s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05 &&
      r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  const videos = Array.from(document.querySelectorAll('video')).filter(visible);
  let winner = null, best = -Infinity;
  for (const v of videos) {
    const r = v.getBoundingClientRect();
    const active = v.closest('[data-e2e="feed-active-video"]');
    const area = Math.min(r.width, innerWidth) * Math.min(r.height, innerHeight);
    const score = (active ? 10000000 : 0) + (!v.paused ? 2000000 : 0) +
      Math.min(area, 1000000) + (v.readyState >= 2 ? 5000 : 0);
    if (score > best) { best = score; winner = v; }
  }
  if (!winner) return {found:false, page_title:document.title,
    login_hint: /扫码登录|登录后|立即登录|验证码/.test(document.body?.innerText || '')};
  const v = winner;
  const area = v.closest('[data-e2e="feed-active-video"]') || v.closest('article') || v.parentElement;
  const selectors = [
    '[data-e2e="video-desc"]','[data-e2e*="video-desc"]',
    '[class*="video-desc"]','[class*="videoDesc"]',
    '[class*="video-title"]','[class*="videoTitle"]','h1'
  ];
  function textFrom(root, selector) {
    if (!root) return '';
    const els = Array.from(root.querySelectorAll(selector));
    for (const e of els) {
      const s=getComputedStyle(e), r=e.getBoundingClientRect();
      if (s.display !== 'none' && s.visibility !== 'hidden' && r.width && r.height) {
        const t = (e.innerText || e.textContent || '').trim().replace(/\s+/g,' ');
        if (t && t.length < 1200) return t.slice(0,300);
      }
    }
    return '';
  }
  let title = '';
  for (const root of [area, document]) {
    for (const s of selectors) { title=textFrom(root,s); if(title) break; }
    if (title) break;
  }
  const href = location.href.split('?')[0].split('#')[0];
  const link = area?.querySelector('a[href*="/video/"]')?.href || href;
  const source = v.currentSrc || v.src || v.poster || '';
  function hash(s) {let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return (x>>>0).toString(16)}
  const d = Number(v.duration), t = Number(v.currentTime);
  return {found:true,title:title || document.title || '',url:String(link).split('?')[0],
    page_title:document.title,src_key:hash(source),duration:Number.isFinite(d)?d:null,
    current_time:Number.isFinite(t)?t:0,paused:!!v.paused,ended:!!v.ended,
    muted:!!v.muted,volume:Number(v.volume),
    ready_state:v.readyState,area_active:!!v.closest('[data-e2e="feed-active-video"]')};
}"""

PLAY_JS = r"""async () => {
 const vids=Array.from(document.querySelectorAll('video'));
 function visible(v){const r=v.getBoundingClientRect();const s=getComputedStyle(v);
   return r.width>90 && r.height>90 && s.display!=='none' &&
     s.visibility!=='hidden' && r.bottom>0 && r.top<innerHeight;}
 const v=vids.filter(visible).sort((a,b)=>{
   const score=x=>(x.closest('[data-e2e="feed-active-video"]')?1000:0)+(!x.paused?100:0)+x.getBoundingClientRect().width;
   return score(b)-score(a);
 })[0];
 if(!v) return 'NO_VIDEO';
 try {
   if (Number.isFinite(v.duration) && v.currentTime > 2) v.currentTime=0;
   const result=await Promise.race([
     v.play().then(()=> 'PLAYING').catch(()=> 'GESTURE_REQUIRED'),
     new Promise(resolve=>setTimeout(()=>resolve('PLAY_PENDING'),2500))
   ]);
   return result;
 }catch(e){return 'GESTURE_REQUIRED';}
}"""

COMMENTS_JS = r"""(limit) => {
  const sel=['[data-e2e="comment-item"]','[data-e2e*="comment-item"]',
    '[class*="comment-item"]','[class*="commentItem"]','[class*="CommentItem"]'];
  const out=[],seen=new Set();
  for(const s of sel) for(const e of document.querySelectorAll(s)) {
    const r=e.getBoundingClientRect(), style=getComputedStyle(e);
    if(!r.width || !r.height || style.visibility==='hidden' || style.display==='none') continue;
    let v=(e.innerText||e.textContent||'').trim().replace(/\s+/g,' ');
    if(v.length<4 || v.length>600) continue;
    v=v.slice(0,280);if(!seen.has(v)){seen.add(v);out.push(v);}
    if(out.length>=limit)return out;
  }
  return out;
}"""

SUMMARY_JS = r"""() => {
  const sel=['[data-e2e*="ai-summary"]','[class*="aiSummary"]',
  '[class*="AISummary"]','[class*="ai-summary"]'];
  for(const s of sel)for(const el of document.querySelectorAll(s)){
    const r=el.getBoundingClientRect();
    if(!r.width || !r.height)continue;
    const t=(el.innerText||'').trim().replace(/\s+/g,' ');
    if(t.length>20 && t.length<2500)return t.slice(0,1200);
  }
  return '';
}"""


@dataclass(frozen=True)
class WatchConfig:
    url: str = DEFAULT_URL
    count: int = 8
    max_seconds_per_video: int = 180
    read_comments: bool = True
    capture_frames: bool = True

    def __post_init__(self) -> None:
        u = urlsplit(self.url)
        if u.scheme != 'https' or u.hostname not in ('douyin.com', 'www.douyin.com'):
            raise ValueError('起始地址必须是 https://www.douyin.com/ 下的网址')
        if not 1 <= self.count <= MAX_VIDEOS:
            raise ValueError('视频数量应在 1 到 50 之间')
        if not 15 <= self.max_seconds_per_video <= MAX_PLAY_SECONDS:
            raise ValueError('每条最长等待应在 15 到 300 秒之间')


def data_dir() -> Path:
    base = os.environ.get('LOCALAPPDATA')
    return (Path(base) if base else Path.home() / '.local' / 'share') / APP_NAME


def safe_url(raw: str) -> str:
    """Never store transient CDN tokens/query strings or browser credentials."""
    u = urlsplit(raw or '')
    if u.scheme not in ('http', 'https') or (u.hostname or '').lower() not in ('douyin.com', 'www.douyin.com'):
        return ''
    return urlunsplit((u.scheme, u.netloc, u.path, '', ''))


def clip(text: str, n: int = 300) -> str:
    return re.sub(r'\s+', ' ', (text or '')).strip()[:n]


def video_identity(probe: dict[str, Any]) -> str:
    # Source/key may be reused for cached/preloaded players. Include title and URL.
    return '|'.join(str(probe.get(k) or '') for k in ('src_key','title','url'))


def watching_complete(last: dict[str, Any], previous: dict[str, Any],
                      max_observed_time: float, min_duration: float = 1.5) -> bool:
    """Recognize end-of-video/near-end or looping player after reaching >85%."""
    dur = last.get('duration')
    if not isinstance(dur, (int,float)) or not math.isfinite(dur) or dur < min_duration:
        return False
    current = float(last.get('current_time') or 0)
    before = float(previous.get('current_time') or 0)
    return (bool(last.get('ended')) or current >= dur - 0.65 or
            (max_observed_time >= dur * 0.85 and before - current >= dur * 0.6))


def verified_full_watch(last: dict[str, Any], previous: dict[str, Any],
                        max_observed_time: float, saw_start: bool,
                        observed_seconds: float) -> bool:
    """Require observed playback from near start, not merely a player near its end."""
    duration=last.get('duration')
    if not isinstance(duration,(int,float)) or not math.isfinite(duration) or duration < 1.5:
        return False
    if not saw_start or max_observed_time < duration*0.85:
        return False
    if observed_seconds < min(duration*0.35,3):
        return False
    return watching_complete(last,previous,max_observed_time)


def is_live_or_unknown(probe: dict[str, Any]) -> bool:
    duration = probe.get('duration')
    return duration is None or not isinstance(duration, (int,float)) or duration <= 0 or not math.isfinite(duration)


class RecordStore:
    COLUMNS = ['time','index','status','title','url','duration_s','watched_s','comments','ai_summary','frame_samples','audio_status','note']

    def __init__(self, output_dir: Path):
        output_dir.mkdir(parents=True, exist_ok=True)
        self.path = output_dir / ('DouyinWatch-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.csv')
        with self.path.open('w',encoding='utf-8-sig',newline='') as f:
            csv.DictWriter(f,fieldnames=self.COLUMNS).writeheader()

    def append(self, record: dict[str,Any]) -> None:
        sanitized={k:clip(str(record.get(k,'')),1200 if k in ('comments','ai_summary') else 300) for k in self.COLUMNS}
        sanitized['url'] = safe_url(sanitized['url'])
        with self.path.open('a',encoding='utf-8-sig',newline='') as f:
            csv.DictWriter(f,fieldnames=self.COLUMNS).writerow(sanitized)


class BrowserWatcher:
    def __init__(self, config: WatchConfig, stop: threading.Event,
                 publish: Callable[[str,dict[str,Any]],None],
                 output_dir: Path | None = None,
                 launch_kwargs: dict | None = None):
        self.config=config
        self.stop=stop
        self.publish=publish
        self.output_dir=output_dir or data_dir()
        self.launch_kwargs=launch_kwargs or {}
        self._last_frames: list[str] = []

    def emit(self, kind: str, **fields: Any) -> None:
        self.publish(kind,fields)

    def _sleep(self, seconds: float) -> bool:
        return self.stop.wait(seconds)

    @staticmethod
    def _probe(page: Any) -> dict[str,Any]:
        return page.evaluate(PROBE_JS)

    def _wait_first_video(self, page: Any, limit: int=180) -> dict[str,Any] | None:
        started=time.monotonic()
        last_notice=-20
        while not self.stop.is_set() and time.monotonic()-started < limit:
            try:
                p=self._probe(page)
                if p.get('found'): return p
                elapsed=int(time.monotonic()-started)
                if elapsed-last_notice >= 10:
                    self.emit('status',message=('请在打开的 Edge 里手动完成登录并进入一条视频；无需提供密码。' if p.get('login_hint') else '正在等待网页出现可见视频；你可在 Edge 中手动打开一条视频。'))
                    last_notice=elapsed
            except Exception as e:
                self.emit('status',message='页面正在加载：'+clip(str(e),100))
            self._sleep(2)
        return None

    def _capture_frame(self,page:Any,index:int,mark:int,expected:dict[str,Any]) -> None:
        """At most three local images per video. Never upload, inspect other tabs or capture login pages."""
        if not self.config.capture_frames or self.stop.is_set() or mark not in (10,50,85):
            return
        try:
            current=self._probe(page)
            if not current.get('found') or video_identity(current)!=video_identity(expected):
                return
            selector='[data-e2e="feed-active-video"] video' if current.get('area_active') else 'video'
            elems=page.locator(selector)
            for n in range(min(elems.count(),8)):
                elem=elems.nth(n)
                if not elem.is_visible(): continue
                directory=self.output_dir/'frames'
                directory.mkdir(parents=True,exist_ok=True)
                filename=f'video-{index:03d}-progress-{mark:02d}.png'
                elem.screenshot(path=str(directory/filename),timeout=3000)
                self._last_frames.append(filename)
                self.emit('frame',index=index,mark=mark,filename=filename)
                return
        except Exception as e:
            self.emit('status',message='画面取样未成功：'+clip(str(e),100))

    def _play_to_end(self,page:Any,original:dict[str,Any],index:int) -> tuple[str,float,dict[str,Any]]:
        try:
            play_result=page.evaluate(PLAY_JS)
        except Exception:
            play_result='UNKNOWN'
        if play_result=='GESTURE_REQUIRED':
            self.emit('status',message='浏览器禁止自动播放，尝试手动点视频画面一次。')
        previous=original
        self._last_frames=[]
        frame_marks=set()
        saw_start=False
        max_progress=0.0
        start=time.monotonic()
        stalled_at=start
        stalled_value=max_progress
        while not self.stop.is_set():
            now=time.monotonic()
            elapsed=now-start
            if elapsed >= self.config.max_seconds_per_video:
                return 'TIME_LIMIT',elapsed,previous
            try:
                current=self._probe(page)
            except Exception:
                current={}
            if not current.get('found'):
                if elapsed>12:return 'VIDEO_LOST',elapsed,previous
                self._sleep(1); continue
            if video_identity(current)!=video_identity(original):
                return 'VIDEO_CHANGED',elapsed,current
            t=float(current.get('current_time') or 0)
            dur=current.get('duration')
            max_progress=max(max_progress,t)
            if isinstance(dur,(int,float)) and math.isfinite(dur) and dur>=1.5:
                if t <= max(2.0,dur*0.15):
                    saw_start=True
                if self.config.capture_frames and not current.get('paused') and saw_start:
                    fraction=t/dur
                    for mark in (10,50,85):
                        threshold=mark/100.0
                        if mark not in frame_marks and threshold<=fraction<threshold+0.2:
                            frame_marks.add(mark)
                            self._capture_frame(page,index,mark,original)
                            break
            if verified_full_watch(current,previous,max_progress,saw_start,elapsed):
                return 'COMPLETE',elapsed,current
            if is_live_or_unknown(current) and elapsed >= 15:
                return 'UNKNOWN_DURATION',elapsed,current
            if t > stalled_value+0.3:
                stalled_value=t;stalled_at=now
            if now-stalled_at>12:
                return 'PLAYBACK_STALLED',elapsed,current
            if int(elapsed)%5==0:
                self.emit('progress',elapsed=round(elapsed,1),current=round(t,1),duration=dur)
            previous=current
            self._sleep(1)
        return 'STOPPED',time.monotonic()-start,previous

    def _comments(self,page:Any) -> list[str]:
        if not self.config.read_comments: return []
        # Opening a read-only comment panel is allowed. No typing/submitting.
        selectors=['[data-e2e="feed-comment-icon"]','button[aria-label*="评论"]',
                   '[aria-label="评论"]','[data-e2e="comment-icon"]']
        for sel in selectors:
            try:
                loc=page.locator(sel).first
                if loc.count() and loc.is_visible():
                    loc.click(timeout=1500)
                    self._sleep(0.6)
                    break
            except Exception:
                continue
        try: return [clip(x,280) for x in page.evaluate(COMMENTS_JS,5)]
        except Exception: return []

    def _next_video(self,page:Any,old:dict[str,Any]) -> bool:
        before=video_identity(old)
        try: page.keyboard.press('Escape')
        except Exception: pass
        for action in ('ArrowDown','wheel','PageDown'):
            if self.stop.is_set():return False
            try:
                if action=='wheel': page.mouse.wheel(0,650)
                else: page.keyboard.press(action)
            except Exception as e:
                self.emit('status',message='切换尝试失败：'+clip(str(e),100))
            for _ in range(5):
                if self._sleep(0.75): return False
                try:
                    p=self._probe(page)
                    if p.get('found') and video_identity(p)!=before:
                        return True
                except Exception: pass
        return False

    def run(self) -> None:
        from playwright.sync_api import sync_playwright
        records=RecordStore(self.output_dir)
        self.emit('started',csv=str(records.path))
        context=None
        try:
            with sync_playwright() as playwright:
                profile=self.output_dir / 'edge-profile'
                profile.mkdir(parents=True,exist_ok=True)
                self.emit('status',message='打开独立 Edge 浏览器（不会使用你的日常浏览器资料）。')
                options=dict(channel='msedge',headless=False,accept_downloads=False,
                             viewport={'width':1280,'height':850},timeout=30000)
                options.update(self.launch_kwargs)
                context=playwright.chromium.launch_persistent_context(str(profile),**options)
                page=context.pages[0] if context.pages else context.new_page()
                page.set_default_timeout(4000)
                try: page.goto(self.config.url,wait_until='domcontentloaded',timeout=45000)
                except Exception as e: self.emit('status',message='网页加载可能受限：'+clip(str(e),150))
                current=self._wait_first_video(page)
                if not current:
                    self.emit('error',message='未找到可见视频。请检查抖音访问/登录或在 Edge 打开视频后重试。')
                    return
                for i in range(1,self.config.count+1):
                    if self.stop.is_set(): break
                    if i>1:
                        current=self._probe(page)
                        if not current.get('found'): break
                    self.emit('video',index=i,title=clip(current.get('title',''),100),url=safe_url(current.get('url','')))
                    status,elapsed,final=self._play_to_end(page,current,i)
                    if self.stop.is_set():break
                    # Never associate comments with an unverified or changed video.
                    comments=[];summary=''
                    if status=='COMPLETE':
                        try:
                            before_content=self._probe(page)
                            if video_identity(before_content)!=video_identity(final):
                                status='VIDEO_CHANGED_BEFORE_COMMENTS'
                            else:
                                comments=self._comments(page)
                                after_content=self._probe(page)
                                if video_identity(after_content)!=video_identity(final):
                                    comments=[];status='VIDEO_CHANGED_DURING_COMMENTS'
                                else:
                                    summary=clip(page.evaluate(SUMMARY_JS),1200)
                        except Exception:
                            status='CONTENT_READ_FAILED'
                    player_audio=('PLAYER_MUTED_OR_VOLUME_ZERO' if final.get('muted') or
                        final.get('volume') == 0 else 'PLAYER_UNMUTED_AUDIO_NOT_VERIFIED')
                    title=clip(final.get('title') or current.get('title') or '',300)
                    record={'time':datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds'),
                            'index':i,'status':status,'title':title,
                            'url':safe_url(final.get('url') or current.get('url') or page.url),
                            'duration_s':str(round(final.get('duration') or 0,1)),
                            'watched_s':str(round(elapsed,1)),
                            'comments':' | '.join(comments),
                            'ai_summary':summary,
                            'frame_samples':' | '.join(self._last_frames),
                            'audio_status':player_audio,
                            'note':('页面无现成AI总结' if not summary else '读取页面已显示的AI总结') if status=='COMPLETE' else '未确认完整播放；内容未归属'}
                    records.append(record)
                    self.emit('record',index=i,status=status,title=title,
                              comments=len(comments),ai_summary=bool(summary))
                    if status!='COMPLETE':
                        self.emit('error',message='没有确认完整播放或内容归属（'+status+'），已停止，不自动跳过该视频。')
                        break
                    if i < self.config.count:
                        if not self._next_video(page,final):
                            self.emit('error',message='无法确认切换到新视频，停止以避免重复播放和误记。')
                            break
                self.emit('done',message='本次观看结束。记录：'+str(records.path))
        except Exception as e:
            self.emit('error',message='浏览器启动或运行失败：'+clip(str(e),330))
            self.emit('done',message='可查看日志目录：'+str(records.path))
        finally:
            if context:
                try: context.close()
                except Exception: pass
            self.emit('finished')
