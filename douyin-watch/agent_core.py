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
import secrets
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
  // Media loading can change currentSrc, title and page URL without changing video.
  // A stable DOM node key plus explicit /video/ ID allow guarded comparisons.
  let registry=window.__YuTangWatchNodesV1;
  if(!registry || !registry.nodes){
    registry={nodes:new WeakMap(),next:1};
    window.__YuTangWatchNodesV1=registry;
  }
  let playerKey=registry.nodes.get(v);
  if(!playerKey){playerKey='player-'+registry.next++;registry.nodes.set(v,playerKey);}
  const source = v.currentSrc || v.src || '';
  function hash(s) {let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}return (x>>>0).toString(16)}
  const idMatch=location.pathname.match(/^\/video\/(\d{8,})(?:\/|$)/);
  const d = Number(v.duration), t = Number(v.currentTime);
  const vr=v.getBoundingClientRect();
  const rx=Math.max(0,Math.floor(vr.left)), ry=Math.max(0,Math.floor(vr.top));
  const rw=Math.max(0,Math.min(innerWidth-rx,Math.floor(vr.right)-rx));
  const rh=Math.max(0,Math.min(innerHeight-ry,Math.floor(vr.bottom)-ry));
  return {found:true,title:title || document.title || '',url:String(link).split('?')[0],
    frame_rect:{x:rx,y:ry,width:rw,height:rh},
    page_title:document.title,src_key:source?hash(source):'',
    player_key:playerKey,video_id:idMatch?idMatch[1]:'',
    duration:Number.isFinite(d)?d:null,
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
 // Never seek an already playing Douyin video: resets can trigger SPA transitions
 // and a user's genuine playback is stronger evidence than an autoplay promise.
 if(!v.paused && !v.ended)return 'ALREADY_PLAYING';
 try {
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


def confirmed_video_change(previous: dict[str, Any], current: dict[str, Any],
                           after_navigation: bool = False) -> bool:
    """Require actual media-change evidence, not dynamic title/URL churn.

    A single-page app can update its URL, title, and initial media source while
    still displaying the same video. For watched content require corroborated
    source/player changes plus a media-time reset; after an intentional Next
    action, source and title change together also suffices.
    """
    if not previous.get('found', True) or not current.get('found'):
        return False
    prev_id=str(previous.get('video_id') or '')
    curr_id=str(current.get('video_id') or '')
    if prev_id and curr_id:
        if prev_id!=curr_id:
            return True
        # This is an explicit fixed /video/ page; playlist metadata changed,
        # but the URL's current video ID did not.
        return False
    player_a=str(previous.get('player_key') or '')
    player_b=str(current.get('player_key') or '')
    player_changed=bool(player_a and player_b and player_a!=player_b)
    src_a=str(previous.get('src_key') or '')
    src_b=str(current.get('src_key') or '')
    source_changed=bool(src_a and src_b and src_a!=src_b)
    title_a=str(previous.get('title') or '').strip()
    title_b=str(current.get('title') or '').strip()
    title_changed=bool(title_a and title_b and title_a!=title_b)
    try:
        old_time=float(previous.get('current_time') or 0)
        new_time=float(current.get('current_time') or 0)
        time_reset=math.isfinite(old_time) and math.isfinite(new_time) and old_time-new_time>1.25
    except (TypeError,ValueError,OverflowError):
        time_reset=False
    if after_navigation:
        return bool((source_changed and (title_changed or time_reset or player_changed)) or
                    (player_changed and title_changed))
    return bool((source_changed and title_changed and time_reset) or
                (source_changed and player_changed and time_reset))


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
        self.path = output_dir / ('DouyinWatch-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'-'+secrets.token_hex(4)+'.csv')
        # Exclusive creation: never overwrite a different session's evidence.
        with self.path.open('x',encoding='utf-8-sig',newline='') as f:
            csv.DictWriter(f,fieldnames=self.COLUMNS).writeheader()

    def append(self, record: dict[str,Any]) -> None:
        sanitized={k:clip(str(record.get(k,'')),1200 if k in ('comments','ai_summary') else 300) for k in self.COLUMNS}
        # Titles/comments are untrusted web content. Excel/WPS can interpret
        # formula-like CSV cells as executable expressions when opened.
        for field in ('title','comments','ai_summary','note'):
            value=sanitized[field]
            if value and value[0] in ('=','+','-','@'):
                sanitized[field]="'"+value
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
        self._frame_dir_name = 'frames'

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
            if not current.get('found') or confirmed_video_change(expected,current):
                return
            rect=current.get('frame_rect') or {}
            if any(not isinstance(rect.get(k),(int,float)) or not math.isfinite(rect[k])
                   for k in ('x','y','width','height')):
                return
            if rect['width']<90 or rect['height']<90:
                return
            directory=self.output_dir/self._frame_dir_name
            directory.mkdir(parents=True,exist_ok=True)
            filename=f'video-{index:03d}-progress-{mark:02d}.png'
            page.screenshot(path=str(directory/filename),clip=rect,timeout=3000)
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
            self.emit('status',message='浏览器禁止自动播放；可以在 Edge 里手动点一下视频。')
        elif play_result=='ALREADY_PLAYING':
            self.emit('status',message='检测到视频已经播放；继续观察，不会自动跳进度。')
        previous=original
        self._last_frames=[]
        frame_marks=set()
        saw_start=False
        max_progress=0.0
        start=time.monotonic()
        last_checked=start
        last_media_time=0.0
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
            if confirmed_video_change(previous,current):
                return 'VIDEO_CHANGED',elapsed,current
            t=float(current.get('current_time') or 0)
            dur=current.get('duration')
            if isinstance(dur,(int,float)) and math.isfinite(dur) and dur>=1.5:
                # Never credit progress observed BEFORE the first real near-start sample.
                # A player opened near its end may loop back to zero; that is the start
                # of OUR observation, not proof that we watched the earlier loop.
                if not saw_start:
                    if not current.get('paused') and t <= min(1.5,dur*0.15):
                        saw_start=True
                        last_media_time=t
                        max_progress=t
                        last_checked=now
                else:
                    if t >= last_media_time:
                        max_plausible_step=max(1.25,(now-last_checked)*2.5+0.8)
                        if t-last_media_time > max_plausible_step:
                            return 'SEEK_DETECTED',elapsed,current
                    elif last_media_time-t >= 0.6:
                        # Accept a natural loop but never borrow progress from the
                        # previous loop unless the observed near-end threshold is met.
                        if last_media_time < dur*0.85 or max_progress < dur*0.85:
                            max_progress=t
                            frame_marks.clear()
                        else:
                            # Completion is checked below via watched progress.
                            pass
                    last_media_time=t
                    last_checked=now
                    max_progress=max(max_progress,t)
                if self.config.capture_frames and not current.get('paused') and saw_start:
                    fraction=t/dur
                    for mark in (10,50,85):
                        threshold=mark/100.0
                        if mark not in frame_marks and threshold<=fraction<threshold+0.2:
                            frame_marks.add(mark)
                            self._capture_frame(page,index,mark,original)
                            break
            if verified_full_watch(current,previous,max_progress,saw_start,elapsed) and (not current.get('paused') or current.get('ended')):
                return 'COMPLETE',elapsed,current
            if is_live_or_unknown(current) and elapsed >= 15:
                return 'UNKNOWN_DURATION',elapsed,current
            if t > stalled_value+0.3:
                stalled_value=t;stalled_at=now
            elif (isinstance(dur,(int,float)) and math.isfinite(dur) and dur>1.5
                  and stalled_value-t > dur*0.5 and t <= max(2.0,dur*0.2)):
                # Normal video-loop resets the clock. Never call it stalled merely
                # because the NEW loop has not yet exceeded the old maximum time.
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
        # Only known comment-panel OPEN controls. Broad "评论" selectors may match submit buttons.
        selectors=['[data-e2e="feed-comment-icon"]','[data-e2e="comment-icon"]',
                   'button[aria-label="打开评论"]','button[aria-label="查看评论"]']
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
                    if p.get('found') and confirmed_video_change(old,p,after_navigation=True):
                        return True
                except Exception: pass
        return False

    def run(self) -> None:
        from playwright.sync_api import sync_playwright
        records=RecordStore(self.output_dir)
        self._frame_dir_name=records.path.stem+'-frames'
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
                            if confirmed_video_change(final,before_content):
                                status='VIDEO_CHANGED_BEFORE_COMMENTS'
                            else:
                                comments=self._comments(page)
                                after_content=self._probe(page)
                                if confirmed_video_change(before_content,after_content):
                                    comments=[];status='VIDEO_CHANGED_DURING_COMMENTS'
                                else:
                                    summary=clip(page.evaluate(SUMMARY_JS),1200)
                        except Exception:
                            status='CONTENT_READ_FAILED'
                    player_audio=('PLAYER_AUDIO_STATE_UNKNOWN' if 'muted' not in final else
                        ('PLAYER_MUTED_OR_VOLUME_ZERO' if final.get('muted') or
                         final.get('volume') == 0 else 'PLAYER_UNMUTED_AUDIO_NOT_VERIFIED'))
                    title=clip(final.get('title') or current.get('title') or '',300)
                    record={'time':datetime.now(timezone.utc).astimezone().isoformat(timespec='seconds'),
                            'index':i,'status':status,'title':title,
                            'url':safe_url(final.get('url') or current.get('url') or page.url),
                            'duration_s':str(round(final.get('duration') or 0,1)),
                            'watched_s':str(round(elapsed,1)),
                            'comments':' | '.join(comments),
                            'ai_summary':summary,
                            'frame_samples':' | '.join(self._frame_dir_name+'/'+name for name in self._last_frames),
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
