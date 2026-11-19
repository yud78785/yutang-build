"""Single-session public Douyin cloud canary: playback + visible comments + frames.

The browser opens one public video once. It observes browser-issued response
metadata and visible page state; it never calls Douyin endpoints directly,
downloads media, reads or exports cookies, logs in, submits comments or likes.
Only three screenshots of the visible video element are retained for frame
inspection. No comment text or usernames are persisted.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

PUBLIC_VIDEO_ID = "7708352061931622655"
PUBLIC_URL = f"https://www.douyin.com/video/{PUBLIC_VIDEO_ID}"
SCHEMA = "yutang.cloud.unified_video_session.v1"
UPSTREAM_BROWSER_REFERENCE = "xiaoke949/douyin-guest-dl@853553ee6cd57b4a5f753a25b440468d5f72e4fb"
UPSTREAM_FRAME_ANALYSIS_REFERENCE = "RanT711/video-parser@main"
FRAME_TARGETS = (3.0, 8.0, 13.0)
MAX_FRAMES = 3

PLAYER_JS = """(targetKeys) => {
  function key(raw) {
    try { const u=new URL(raw); return u.protocol==='https:' ? u.hostname.toLowerCase()+u.pathname : ''; }
    catch(e) { return ''; }
  }
  const targets=new Set((Array.isArray(targetKeys)?targetKeys:[]).filter(x=>typeof x==='string' && x.length>0));
  const all=Array.from(document.querySelectorAll('video'));
  const visible=all.map((v,i)=>{
    const r=v.getBoundingClientRect(),s=getComputedStyle(v);
    const ok=r.width>=80 && r.height>=80 && r.bottom>0 && r.right>0 &&
      r.left<innerWidth && r.top<innerHeight && s.display!=='none' && s.visibility!=='hidden';
    const src=v.currentSrc || v.src || '';
    return {v,i,ok,match:targets.has(key(src)),src_host:(()=>{try{return new URL(src).hostname.toLowerCase()}catch(e){return ''}})()};
  }).filter(x=>x.ok);
  const chosen=visible.find(x=>x.match && !x.v.paused && x.v.readyState>=2) ||
    visible.find(x=>x.match) ||
    visible.find(x=>!x.v.paused && x.v.readyState>=2) || visible[0];
  const v=chosen && chosen.v;
  return {
    total:all.length,visible:visible.length,index:chosen?chosen.i:null,
    is_target_media:chosen?chosen.match:false,
    media_host_is_douyin_vod:chosen?chosen.src_host.endsWith('douyinvod.com'):false,
    media_time:v && Number.isFinite(v.currentTime)?v.currentTime:null,
    duration_s:v && Number.isFinite(v.duration)?v.duration:null,
    paused:v?!!v.paused:null,ready:v?v.readyState:null
  };
}"""

COMMENT_JS = """() => {
  const panel=document.querySelector('.comment-mainContent') ||
    document.querySelector('[data-e2e="comment-list"]');
  const root=panel || document;
  const selectors=['[data-e2e="comment-item"]','[data-e2e="comment-content"]',
    '[class*="comment-content"]','[class*="CommentContent"]'];
  const texts=new Set();
  for(const sel of selectors) for(const el of root.querySelectorAll(sel)) {
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    if(r.width<=0 || r.height<=0 || s.display==='none' || s.visibility==='hidden') continue;
    const text=(el.innerText || el.textContent || '').trim();
    if(text.length>=4 && text.length<600) texts.add(text.slice(0,200));
    if(texts.size>=5) break;
  }
  function visible(el) {
    if(!el)return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden';
  }
  return {
    panel_present:!!panel,
    panel_visible:visible(panel),
    item_nodes:Math.min(50,panel ? panel.querySelectorAll('[data-e2e="comment-item"]').length : 0),
    visible_text_count:Math.min(5,texts.size),
    login_hint:/扫码登录|登录后评论|请先登录/.test(document.body?.innerText || '')
  };
}"""


PAGE_DIAGNOSTICS_JS = """() => {
  const body=document.body?.innerText || '';
  const title=document.title || '';
  const loginPanel=!!document.querySelector('[id^="login-full-panel"]');
  const loginDialog=!!document.querySelector('.trust-login-dialog-button-confirm,.trust-login-dialog-button-cancel');
  const captcha=document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],#uc-second-verify,iframe[src*="captcha"]').length;
  const ready=document.readyState;
  const bucket=body.length===0?'0':body.length<100?'1-99':body.length<1000?'100-999':body.length<5000?'1000-4999':'5000+';
  const loginHint=loginPanel || loginDialog ||
    /扫码登录|登录后评论|请先登录|登录后观看|登录后查看|Log in to Douyin|Scan to Log In|Phone number|Enter code/i.test(body);
  return {
    document_ready:ready,
    title_mentions_douyin:/抖音|Douyin/i.test(title),
    title_verification_hint:/验证|验证码|访问受限|安全检查/.test(title),
    body_length_bucket:bucket,
    challenge_hint:!!document.querySelector('#uc-second-verify,.second-verify-mask') ||
      /验证码|安全验证|访问频繁|操作过于频繁|验证后继续|滑动验证|环境异常/.test(body),
    login_hint:loginHint,
    login_panel_present:loginPanel,
    login_dialog_present:loginDialog,
    unavailable_hint:/作品不存在|已删除|暂时无法观看|内容不可用|视频不存在/.test(body),
    router_data_present:!!window._ROUTER_DATA || !!window.__INITIAL_STATE__ || !!document.querySelector('#RENDER_DATA'),
    og_video_present:!!document.querySelector('meta[property="og:video"],meta[property="og:video:url"]'),
    script_count:Math.min(500,document.scripts.length),
    video_source_count:Math.min(200,document.querySelectorAll('video[src],video source[src]').length),
    captcha_node_count:Math.min(50,captcha)
  };
}"""

def safe_page_diagnostics(raw: Any) -> dict[str,Any]:
    value=raw if isinstance(raw,dict) else {}
    ready=value.get("document_ready")
    bucket=value.get("body_length_bucket")
    if bucket not in ("0","1-99","100-999","1000-4999","5000+"):
        bucket="UNVERIFIED"
    def count(key: str,maximum: int) -> int:
        v=value.get(key)
        return min(max(v,0),maximum) if type(v) is int else 0
    return {
        "document_ready":ready if ready in ("loading","interactive","complete") else "UNVERIFIED",
        "title_mentions_douyin":value.get("title_mentions_douyin") is True,
        "title_verification_hint":value.get("title_verification_hint") is True,
        "body_length_bucket":bucket,
        "challenge_hint":value.get("challenge_hint") is True,
        "login_hint":value.get("login_hint") is True,
        "login_panel_present":value.get("login_panel_present") is True,
        "login_dialog_present":value.get("login_dialog_present") is True,
        "unavailable_hint":value.get("unavailable_hint") is True,
        "router_data_present":value.get("router_data_present") is True,
        "og_video_present":value.get("og_video_present") is True,
        "script_count":count("script_count",500),
        "video_source_count":count("video_source_count",200),
        "captcha_node_count":count("captcha_node_count",50),
    }


def finite(value: Any, upper: float) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number=float(value)
    except (TypeError,ValueError,OverflowError):
        return None
    return round(number,2) if math.isfinite(number) and 0<=number<=upper else None


def media_url_key(raw: Any) -> str:
    """Normalize a target media URL in memory; never persist the signed URL."""
    if not isinstance(raw,str):
        return ""
    try:
        u=urlsplit(raw)
        if u.scheme!="https" or not u.hostname:
            return ""
        return u.hostname.lower()+u.path
    except Exception:
        return ""


def extract_target_media(detail: Any) -> tuple[list[str],float | None]:
    """Collect target video's play_addr candidates from its own detail response."""
    if not isinstance(detail,dict) or not isinstance(detail.get("video"),dict):
        return [],None
    video=detail["video"]
    urls=[]
    def add(value: Any) -> None:
        if not isinstance(value,dict):
            return
        candidates=value.get("url_list")
        if isinstance(candidates,list):
            for item in candidates:
                if isinstance(item,str) and media_url_key(item) and item not in urls:
                    urls.append(item)
    add(video.get("play_addr"))
    bitrates=video.get("bit_rate")
    if isinstance(bitrates,list):
        for bitrate in bitrates[:30]:
            if isinstance(bitrate,dict):
                add(bitrate.get("play_addr"))
    duration=finite(video.get("duration"),86_400_000)
    duration_s=round(duration/1000,2) if duration is not None and duration>1000 else duration
    return urls[:60],duration_s


def safe_player_sample(raw: Any) -> dict[str,Any]:
    value=raw if isinstance(raw,dict) else {}
    def count(key: str) -> int | None:
        n=value.get(key)
        return n if type(n) is int and 0<=n<=200 else None
    idx=value.get("index")
    ready=value.get("ready")
    return {
        "total":count("total"),"visible":count("visible"),
        "index":idx if type(idx) is int and 0<=idx<=200 else None,
        "is_target_media":value.get("is_target_media") is True,
        "media_host_is_douyin_vod":value.get("media_host_is_douyin_vod") is True,
        "duration_s":finite(value.get("duration_s"),86400),
        "media_time":finite(value.get("media_time"),86400),
        "paused":value.get("paused") if type(value.get("paused")) is bool else None,
        "ready":ready if type(ready) is int and 0<=ready<=4 else None,
    }


def playback_summary(raw_samples: list[Any]) -> dict[str,Any]:
    samples=[safe_player_sample(x) for x in raw_samples[-30:]]
    observed=0.0
    advancing=0
    for previous,current in zip(samples,samples[1:]):
        a,b=previous["media_time"],current["media_time"]
        if (a is None or b is None or previous["is_target_media"] is not True or
                current["is_target_media"] is not True or previous["paused"] is not False or
                current["paused"] is not False or (previous["ready"] or 0)<2 or
                (current["ready"] or 0)<2):
            continue
        delta=b-a
        if 0.10<=delta<=2.75:
            observed+=delta
            advancing+=1
    return {
        "sample_count":len(samples),
        "advancing_samples":advancing,
        "target_media_samples":sum(1 for x in samples if x["is_target_media"]),
        "observed_playback_s":round(observed,2),
        "playback_observed":observed>=3.0 and advancing>=2,
        "visible_video_max":max((x["visible"] or 0 for x in samples),default=0),
        "video_element_max":max((x["total"] or 0 for x in samples),default=0),
    }


def safe_comment_snapshot(raw: Any) -> dict[str,Any]:
    value=raw if isinstance(raw,dict) else {}
    def count(key: str,maximum: int) -> int:
        v=value.get(key)
        return min(max(v,0),maximum) if type(v) is int else 0
    return {
        "panel_present":value.get("panel_present") is True,
        "panel_visible":value.get("panel_visible") is True,
        "item_nodes":count("item_nodes",50),
        "visible_text_count":count("visible_text_count",5),
        "login_hint":value.get("login_hint") is True,
    }


def comment_response_count(url: Any,payload: Any) -> int | None:
    if not isinstance(url,str):
        return None
    parts=urlsplit(url)
    if parts.hostname not in ("www.douyin.com","douyin.com") or parts.path!="/aweme/v1/web/comment/list/":
        return None
    if parse_qs(parts.query).get("aweme_id",[]) != [PUBLIC_VIDEO_ID]:
        return None
    if not isinstance(payload,dict) or not isinstance(payload.get("comments"),list):
        return None
    return min(20,sum(1 for c in payload["comments"][:20]
        if isinstance(c,dict) and isinstance(c.get("text"),str) and
        1<=len(c["text"].strip())<=3000))


def safe_frame_record(name: Any,media_time: Any,digest: Any,size: Any) -> dict[str,Any] | None:
    if not isinstance(name,str) or name not in ("frame_01.png","frame_02.png","frame_03.png"):
        return None
    if not isinstance(digest,str) or len(digest)!=64 or any(c not in "0123456789abcdef" for c in digest):
        return None
    n=size if type(size) is int and 0<size<=8_000_000 else None
    t=finite(media_time,86400)
    if n is None or t is None:
        return None
    return {"file":name,"media_time_s":t,"sha256":digest,"bytes":n}


def classify(http_status: Any,origin: bool,detail_seen: bool,playback: dict[str,Any],
             comments: dict[str,Any],response_comment_count: int,frames: list[Any],
             diagnostics: dict[str,Any] | None=None) -> str:
    http=http_status if type(http_status) is int and 100<=http_status<=599 else None
    diagnostics=diagnostics or {}
    has_comments=comments["visible_text_count"]>0 or response_comment_count>0
    frame_count=min(len(frames),MAX_FRAMES)
    login=diagnostics.get("login_hint") is True
    if playback["playback_observed"] and has_comments and frame_count>0 and not login:
        return "PLAYBACK_COMMENTS_AND_FRAMES_OBSERVED"
    if playback["playback_observed"] and has_comments and login:
        return "PLAYBACK_AND_COMMENTS_LOGIN_OVERLAY_BLOCKED_FRAMES"
    if has_comments and login:
        return "COMMENTS_READ_LOGIN_GATE_BLOCKED_VIDEO"
    if playback["playback_observed"] and has_comments:
        return "PLAYBACK_AND_COMMENTS_OBSERVED"
    if playback["playback_observed"] and frame_count>0 and not login:
        return "PLAYBACK_AND_FRAMES_OBSERVED"
    if playback["playback_observed"]:
        return "PLAYBACK_ONLY"
    if has_comments:
        return "COMMENTS_ONLY"
    if login:
        return "PAGE_LOGIN_GATE"
    if diagnostics.get("challenge_hint") or diagnostics.get("title_verification_hint"):
        return "PAGE_CHALLENGE_OR_RISK_CONTROL"
    if diagnostics.get("unavailable_hint"):
        return "PUBLIC_VIDEO_UNAVAILABLE"
    if http in (401,403,429) or (http is not None and http>=500):
        return "HTTP_RESTRICTED_OR_ERROR"
    if detail_seen and playback["target_media_samples"]==0:
        return "TARGET_MEDIA_IDENTITY_NOT_VERIFIED"
    if playback["target_media_samples"]>0 and not playback["playback_observed"]:
        return "TARGET_MEDIA_PRESENT_NO_VERIFIED_PLAYBACK"
    if detail_seen:
        return "PUBLIC_VIDEO_METADATA_OBSERVED"
    if http is not None and 200<=http<400 and origin:
        return "PAGE_RESPONDED_NO_VERIFIED_PLAYBACK"
    return "CLOUD_BROWSER_OR_SITE_UNVERIFIED"


async def run_session(output_dir: Path) -> dict[str,Any]:
    output_dir=Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=True)
    raw_samples=[]
    comment_samples=[]
    frame_records=[]
    http_status=None
    origin=False
    detail_seen=False
    comment_response_seen=False
    response_comment_count_value=0
    target_media_urls:list[str]=[]
    target_media_keys:list[str]=[]
    target_media_duration_s:float | None=None
    error_code=None
    correct_video=False
    page_diagnostics=[]
    request_failed_count=0
    console_error_count=0
    response_4xx_count=0
    response_5xx_count=0
    tasks:set[asyncio.Task[Any]]=set()
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(channel="chrome",headless=True)
            try:
                context=await browser.new_context(accept_downloads=False)
                page=await context.new_page()

                async def observe_response(response: Any) -> None:
                    nonlocal detail_seen,comment_response_seen,response_comment_count_value
                    nonlocal target_media_urls,target_media_duration_s
                    parts=urlsplit(response.url)
                    if parts.hostname not in ("www.douyin.com","douyin.com"):
                        return
                    if "/aweme/v1/web/aweme/detail" in parts.path:
                        try:
                            body=await response.json()
                            item=body.get("aweme_detail") if isinstance(body,dict) else None
                            if isinstance(item,dict) and str(item.get("aweme_id"))==PUBLIC_VIDEO_ID:
                                detail_seen=True
                                urls,duration=extract_target_media(item)
                                target_media_urls=list(dict.fromkeys(target_media_urls+urls))[:60]
                                target_media_keys=list(dict.fromkeys(target_media_keys+[media_url_key(u) for u in urls if media_url_key(u)]))[:60]
                                if duration is not None:
                                    target_media_duration_s=duration
                        except Exception:
                            pass
                    if parts.path=="/aweme/v1/web/comment/list/":
                        try:
                            body=await response.json()
                            count=comment_response_count(response.url,body)
                            if count is not None:
                                comment_response_seen=True
                                response_comment_count_value=max(response_comment_count_value,count)
                        except Exception:
                            pass

                def response_hook(response: Any) -> None:
                    parts=urlsplit(response.url)
                    if (parts.hostname in ("www.douyin.com","douyin.com") and
                        ("/aweme/v1/web/aweme/detail" in parts.path or
                         parts.path=="/aweme/v1/web/comment/list/")):
                        task=asyncio.create_task(observe_response(response))
                        tasks.add(task)
                        task.add_done_callback(tasks.discard)

                page.on("response",response_hook)
                def request_failed(_: Any) -> None:
                    nonlocal request_failed_count
                    request_failed_count=min(100,request_failed_count+1)
                def console_message(message: Any) -> None:
                    nonlocal console_error_count
                    if message.type=="error":
                        console_error_count=min(100,console_error_count+1)
                def response_status(response: Any) -> None:
                    nonlocal response_4xx_count,response_5xx_count
                    host=urlsplit(response.url).hostname
                    if host not in ("www.douyin.com","douyin.com"):
                        return
                    if 400<=response.status<500:
                        response_4xx_count=min(100,response_4xx_count+1)
                    elif response.status>=500:
                        response_5xx_count=min(100,response_5xx_count+1)
                page.on("requestfailed",request_failed)
                page.on("console",console_message)
                page.on("response",response_status)
                try:
                    response=await page.goto(PUBLIC_URL,wait_until="domcontentloaded",timeout=25000)
                    http_status=response.status if response else None
                except Exception:
                    error_code="NAVIGATION_FAILED"
                parts=urlsplit(page.url)
                origin=parts.hostname in ("www.douyin.com","douyin.com")
                correct_video=(origin and parts.path.rstrip("/").endswith("/video/"+PUBLIC_VIDEO_ID))

                # Standalone /video pages often auto-load the visible comment
                # panel. Inspect it; do not require the modal-only comment button.
                if correct_video:
                    await asyncio.sleep(4)
                    try:
                        comment_samples.append(safe_comment_snapshot(await page.evaluate(COMMENT_JS)))
                    except Exception:
                        comment_samples.append(safe_comment_snapshot({}))
                try:
                    page_diagnostics.append(safe_page_diagnostics(await page.evaluate(PAGE_DIAGNOSTICS_JS)))
                except Exception:
                    page_diagnostics.append(safe_page_diagnostics({}))

                captured_targets:set[float]=set()
                # One bounded 30-second wait helps distinguish delayed rendering
                # from an immediate empty/interstitial page. No retries/navigation.
                for _ in range(31):
                    try:
                        raw=await page.evaluate(PLAYER_JS,target_media_keys)
                    except Exception:
                        raw={}
                    safe=safe_player_sample(raw)
                    raw_samples.append(safe)

                    current=safe["media_time"]
                    login_blocked=bool(page_diagnostics and page_diagnostics[-1].get("login_hint"))
                    if (safe["is_target_media"] is True and not login_blocked and
                        safe["paused"] is False and (safe["ready"] or 0)>=2 and
                        safe["index"] is not None and current is not None and len(frame_records)<MAX_FRAMES):
                        for target in FRAME_TARGETS:
                            if target not in captured_targets and current>=target:
                                frame_no=len(frame_records)+1
                                filename=f"frame_{frame_no:02d}.png"
                                path=output_dir/filename
                                try:
                                    await page.locator("video").nth(safe["index"]).screenshot(
                                        path=str(path),timeout=4000,animations="disabled")
                                    digest=hashlib.sha256(path.read_bytes()).hexdigest()
                                    rec=safe_frame_record(filename,current,digest,path.stat().st_size)
                                    if rec:
                                        frame_records.append(rec)
                                        captured_targets.add(target)
                                except Exception:
                                    pass
                                break
                    if len(comment_samples)<5 and _%7==6 and correct_video:
                        try:
                            comment_samples.append(safe_comment_snapshot(await page.evaluate(COMMENT_JS)))
                        except Exception:
                            pass
                    if _ in (9,19,29):
                        try:
                            page_diagnostics.append(safe_page_diagnostics(await page.evaluate(PAGE_DIAGNOSTICS_JS)))
                        except Exception:
                            page_diagnostics.append(safe_page_diagnostics({}))
                    await asyncio.sleep(1)

                if tasks:
                    await asyncio.wait(tasks,timeout=2)
                await context.close()
            finally:
                await browser.close()
    except Exception:
        error_code=error_code or "BROWSER_UNAVAILABLE"

    playback=playback_summary(raw_samples)
    comments=max(comment_samples,key=lambda x:x["visible_text_count"],default=safe_comment_snapshot({}))
    frames=[x for x in frame_records[:MAX_FRAMES]]
    latest_diagnostics=page_diagnostics[-1] if page_diagnostics else safe_page_diagnostics({})
    state=classify(http_status,origin,detail_seen,playback,comments,
                   response_comment_count_value,frames,latest_diagnostics)
    return {
        "schema":SCHEMA,
        "public_video_id":PUBLIC_VIDEO_ID,
        "cloud_environment":"github-ubuntu-24.04-chrome-headless",
        "source_url_host":"www.douyin.com",
        "http_status":http_status if type(http_status) is int and 100<=http_status<=599 else None,
        "correct_video_url":bool(origin and correct_video),
        "detail_response_seen":bool(detail_seen),
        "target_media_url_count":min(len(target_media_urls),60),
        "target_media_duration_s":target_media_duration_s,
        "target_media_source_matched":playback["target_media_samples"]>0,
        "target_media_playback_verified":playback["playback_observed"],
        "page_diagnostics":latest_diagnostics,
        "page_diagnostic_snapshots":len(page_diagnostics),
        "request_failed_count":min(request_failed_count,100),
        "console_error_count":min(console_error_count,100),
        "response_4xx_count":min(response_4xx_count,100),
        "response_5xx_count":min(response_5xx_count,100),
        "playback":playback,
        "comments":{
            **comments,
            "response_seen":bool(comment_response_seen),
            "response_text_count":min(response_comment_count_value,20),
            "visible_comment_text_observed":comments["visible_text_count"]>0 or response_comment_count_value>0,
        },
        "frames":frames,
        "frame_count":len(frames),
        "classification":state,
        "error_code":error_code if error_code in ("NAVIGATION_FAILED","BROWSER_UNAVAILABLE") else None,
        "comments_submitted":False,
        "comment_text_or_usernames_persisted":False,
        "media_downloaded":False,
        "user_login_or_cookies_used":False,
        "automated_visual_ai_analysis":False,
        "automated_audio_transcription":False,
        "limitations":"One public video in one cloud headless Chrome session. Frame files are retained for separate visual inspection; no full video or comment text is stored.",
    }


def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--out-dir",required=True)
    args=parser.parse_args()
    report=asyncio.run(run_session(Path(args.out_dir)))
    target=Path(args.out_dir)/"unified-session-receipt.json"
    target.write_text(json.dumps(report,indent=2,ensure_ascii=False,allow_nan=False)+"\n",encoding="utf-8")
    print("YUTANG_UNIFIED_CLASSIFICATION="+report["classification"])
    print("YUTANG_UNIFIED_PLAYBACK="+str(report["playback"]["playback_observed"]))
    print("YUTANG_UNIFIED_COMMENTS="+str(report["comments"]["visible_comment_text_observed"]))
    print("YUTANG_UNIFIED_FRAMES="+str(report["frame_count"]))


if __name__=="__main__":
    main()
