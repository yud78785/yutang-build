"""One-shot guest media -> timestamped JPEG frames using browser-issued Douyin URL.

Method reference: MIT xiaoke949/douyin-guest-dl (same browser context, Referer).
This does not call a private API, export cookies, log in, solve challenges, or
bypass a denied request. The video bytes are fetched in memory only; only up
to three JPEG frames and a bounded manifest are retained in the CI artifact.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

PUBLIC_VIDEO_ID="7708352061931622655"
PUBLIC_URL=f"https://www.douyin.com/video/{PUBLIC_VIDEO_ID}"
SCHEMA="yutang.cloud.guest_media_frames.v1"
MAX_MEDIA_BYTES=40_000_000
FRAME_TIMES=(3.0,8.0,13.0)
MAX_FRAMES=3

PLAYER_JS="""(targetKeys) => {
  function key(raw) {
    try { const u=new URL(raw); return u.protocol==='https'?u.hostname.toLowerCase()+u.pathname:''; }
    catch(e) { return ''; }
  }
  const targets=new Set(Array.isArray(targetKeys)?targetKeys:[]);
  const all=Array.from(document.querySelectorAll('video'));
  const visible=all.map((v,i)=>{
    const r=v.getBoundingClientRect(),s=getComputedStyle(v);
    const ok=r.width>=80&&r.height>=80&&r.bottom>0&&r.right>0&&
      r.left<innerWidth&&r.top<innerHeight&&s.display!=='none'&&s.visibility!=='hidden';
    const src=v.currentSrc||v.src||'';
    return {v,i,ok,match:targets.has(key(src))};
  }).filter(x=>x.ok);
  const chosen=visible.find(x=>x.match&&!x.v.paused&&x.v.readyState>=2)||
    visible.find(x=>x.match);
  const v=chosen&&chosen.v;
  return {is_target_media:!!(chosen&&chosen.match),
    media_time:v&&Number.isFinite(v.currentTime)?v.currentTime:null,
    duration_s:v&&Number.isFinite(v.duration)?v.duration:null,
    paused:v?!!v.paused:null,ready:v?v.readyState:null};
}"""

PAGE_STATE_JS="""() => {
  const body=document.body?.innerText||'';
  const login=!!document.querySelector('[id^="login-full-panel"]')||
    /Log in to Douyin|Scan to Log In|Phone number|Enter code|扫码登录|请先登录/.test(body);
  const challenge=!!document.querySelector('#uc-second-verify,.second-verify-mask')||
    /访问频繁|安全验证|滑动验证|环境异常/.test(body);
  return {login_panel_present:login,challenge_hint:challenge};
}"""

COMMENT_COUNT_JS="""() => {
  const panel=document.querySelector('.comment-mainContent')||
    document.querySelector('[data-e2e="comment-list"]');
  const root=panel||document;
  const selectors=['[data-e2e="comment-item"]','[data-e2e="comment-content"]',
    '[class*="comment-content"]','[class*="CommentContent"]'];
  const seen=new Set();
  for(const sel of selectors) for(const el of root.querySelectorAll(sel)) {
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    if(r.width<=0||r.height<=0||s.display==='none'||s.visibility==='hidden')continue;
    const t=(el.innerText||el.textContent||'').trim();
    if(t.length>=4&&t.length<600)seen.add(t.slice(0,200));
    if(seen.size>=5)break;
  }
  return {panel_present:!!panel,visible_comment_count:Math.min(5,seen.size)};
}"""


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def url_key(raw:Any)->str:
    if not isinstance(raw,str):
        return ""
    try:
        u=urlsplit(raw)
        if u.scheme!="https" or not u.hostname:
            return ""
        return u.hostname.lower()+u.path
    except Exception:
        return ""


def collect_media(detail:Any)->tuple[list[str],float|None]:
    if not isinstance(detail,dict) or not isinstance(detail.get("video"),dict):
        return [],None
    video=detail["video"]
    ranked=[]
    bitrate=video.get("bit_rate")
    if isinstance(bitrate,list):
        for item in bitrate[:30]:
            if not isinstance(item,dict):
                continue
            addr=item.get("play_addr")
            urls=addr.get("url_list") if isinstance(addr,dict) else None
            rate=item.get("bit_rate",0)
            if isinstance(urls,list):
                for u in urls:
                    if url_key(u):
                        ranked.append((rate if type(rate) is int else 0,u))
    if not ranked:
        addr=video.get("play_addr")
        urls=addr.get("url_list") if isinstance(addr,dict) else None
        if isinstance(urls,list):
            ranked.extend((0,u) for u in urls if url_key(u))
    ranked.sort(key=lambda x:x[0],reverse=True)
    urls=list(dict.fromkeys(u for _,u in ranked))[:60]
    d=video.get("duration")
    duration=None
    if type(d) in (int,float) and math.isfinite(d) and 0<d<=86_400_000:
        duration=round(d/1000,2) if d>1000 else round(float(d),2)
    return urls,duration


def extract_frame(media:bytes,second:float)->bytes:
    if not media or len(media)>MAX_MEDIA_BYTES:
        raise ValueError("MEDIA_SIZE_OUT_OF_RANGE")
    cmd=[
        "ffmpeg","-hide_banner","-loglevel","error",
        "-i","pipe:0","-ss",str(second),
        "-map","0:v:0","-an","-sn","-dn","-frames:v","1",
        "-vf","scale='min(1280,iw)':-2",
        "-f","image2pipe","-vcodec","mjpeg","pipe:1"
    ]
    result=subprocess.run(cmd,input=media,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                          timeout=35,check=False)
    if result.returncode!=0 or len(result.stdout)<1000 or len(result.stdout)>2_000_000:
        raise ValueError("FFMPEG_FRAME_EXTRACTION_FAILED")
    if not (result.stdout.startswith(b"\xff\xd8") and result.stdout.endswith(b"\xff\xd9")):
        raise ValueError("FRAME_NOT_VALID_JPEG")
    return result.stdout


async def run(output_dir:Path)->dict[str,Any]:
    output_dir=Path(output_dir)
    output_dir.mkdir(parents=True,exist_ok=True)
    http_status=None
    detail_seen=False
    target_urls=[]
    target_duration=None
    target_match=False
    player_progress=0.0
    comments={"panel_present":False,"visible_comment_count":0}
    page_state={"login_panel_present":False,"challenge_hint":False}
    media_status=None
    media_type=None
    media_bytes=0
    media_sha=None
    frame_records=[]
    error_code=None
    tasks:set[asyncio.Task[Any]]=set()
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as pw:
            browser=await pw.chromium.launch(channel="chrome",headless=True)
            try:
                context=await browser.new_context(accept_downloads=False)
                page=await context.new_page()
                detail_event=asyncio.Event()
                async def inspect(response:Any)->None:
                    nonlocal detail_seen,target_urls,target_duration
                    p=urlsplit(response.url)
                    if p.hostname not in ("www.douyin.com","douyin.com") or "/aweme/v1/web/aweme/detail" not in p.path:
                        return
                    try:
                        payload=await response.json()
                        item=payload.get("aweme_detail") if isinstance(payload,dict) else None
                        if isinstance(item,dict) and str(item.get("aweme_id"))==PUBLIC_VIDEO_ID:
                            target_urls,target_duration=collect_media(item)
                            detail_seen=bool(target_urls)
                            detail_event.set()
                    except Exception:
                        pass
                def on_response(response:Any)->None:
                    p=urlsplit(response.url)
                    if p.hostname in ("www.douyin.com","douyin.com") and "/aweme/v1/web/aweme/detail" in p.path:
                        task=asyncio.create_task(inspect(response))
                        tasks.add(task)
                        task.add_done_callback(tasks.discard)
                page.on("response",on_response)
                try:
                    response=await page.goto(PUBLIC_URL,wait_until="domcontentloaded",timeout=25000)
                    http_status=response.status if response else None
                except Exception:
                    error_code="NAVIGATION_FAILED"
                await asyncio.wait_for(detail_event.wait(),timeout=15)
                keys=[url_key(u) for u in target_urls if url_key(u)]
                if not keys:
                    raise ValueError("NO_TARGET_MEDIA_URLS")
                await asyncio.sleep(4)
                page_state=await page.evaluate(PAGE_STATE_JS)
                comments=await page.evaluate(COMMENT_COUNT_JS)
                for _ in range(10):
                    sample=await page.evaluate(PLAYER_JS,keys)
                    if sample.get("is_target_media") is True:
                        target_match=True
                        if sample.get("paused") is False and isinstance(sample.get("media_time"),(int,float)):
                            player_progress=max(player_progress,float(sample["media_time"]))
                    await asyncio.sleep(1)
                if not target_match or player_progress<3:
                    raise ValueError("TARGET_MEDIA_NOT_PLAYING_IN_GUEST_SESSION")
                if page_state.get("challenge_hint") is True:
                    raise ValueError("CHALLENGE_OR_RISK_CONTROL_PRESENT")
                # This is the same browser context and the same URL already used
                # by the target player; no login/cookie export or API endpoint.
                media_url=target_urls[0]
                response=await context.request.get(
                    media_url,headers={"Referer":PUBLIC_URL},timeout=60000
                )
                media_status=response.status
                media_type=(response.headers.get("content-type","").split(";")[0].lower())
                length=response.headers.get("content-length")
                if length and length.isdigit() and int(length)>MAX_MEDIA_BYTES:
                    raise ValueError("MEDIA_EXCEEDS_40MB_LIMIT")
                if media_status!=200 or media_type not in ("video/mp4","application/octet-stream","video/quicktime"):
                    raise ValueError("MEDIA_RESPONSE_NOT_ALLOWED")
                body=await response.body()
                media_bytes=len(body)
                if media_bytes==0 or media_bytes>MAX_MEDIA_BYTES:
                    raise ValueError("MEDIA_SIZE_OUT_OF_RANGE")
                media_sha=sha(body)
                for index,second in enumerate(FRAME_TIMES,1):
                    if target_duration is not None and second>=target_duration:
                        continue
                    frame=await asyncio.to_thread(extract_frame,body,second)
                    filename=f"frame_{index:02d}.jpg"
                    path=output_dir/filename
                    path.write_bytes(frame)
                    frame_records.append({"file":filename,"media_time_s":second,
                        "sha256":sha(frame),"bytes":len(frame)})
                del body
                await context.close()
            finally:
                await browser.close()
    except Exception as exc:
        text=str(exc)
        if text in ("NO_TARGET_MEDIA_URLS","TARGET_MEDIA_NOT_PLAYING_IN_GUEST_SESSION",
                    "CHALLENGE_OR_RISK_CONTROL_PRESENT","MEDIA_EXCEEDS_40MB_LIMIT",
                    "MEDIA_RESPONSE_NOT_ALLOWED","MEDIA_SIZE_OUT_OF_RANGE",
                    "FFMPEG_FRAME_EXTRACTION_FAILED","FRAME_NOT_VALID_JPEG"):
            error_code=text
        elif error_code is None:
            error_code="GUEST_MEDIA_OR_BROWSER_UNAVAILABLE"
    has_frames=len(frame_records)>0
    state="GUEST_MEDIA_FRAMES_EXTRACTED" if len(frame_records)>=2 else (
        "PARTIAL_FRAME_EXTRACTION" if has_frames else "NO_VIDEO_FRAMES_EXTRACTED")
    return {
        "schema":SCHEMA,"public_video_id":PUBLIC_VIDEO_ID,
        "cloud_environment":"github-ubuntu-24.04-chrome-headless",
        "http_status":http_status,"detail_response_seen":detail_seen,
        "target_media_url_count":len(target_urls),"target_media_source_matched":target_match,
        "target_player_clock_progress_s":round(player_progress,2),
        "target_duration_s":target_duration,
        "login_panel_present":page_state.get("login_panel_present") is True,
        "challenge_hint":page_state.get("challenge_hint") is True,
        "visible_comment_panel":comments.get("panel_present") is True,
        "visible_comment_count":min(max(comments.get("visible_comment_count",0),0),5),
        "media_response_status":media_status,"media_content_type":media_type,
        "media_bytes_fetched_in_memory":media_bytes,"media_sha256_in_memory":media_sha,
        "media_file_persisted":False,"media_uploaded":False,
        "frame_count":len(frame_records),"frames":frame_records,
        "classification":state,"error_code":error_code,
        "login_or_cookie_export":False,"captcha_or_waf_bypass":False,
        "comment_text_or_usernames_persisted":False,"comments_submitted":False,
        "audio_transcription_performed":False,"visual_ai_analysis_performed":False,
        "limitations":"Only three JPEG samples are retained. Full video bytes are memory-only and never uploaded."
    }


def main()->None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--out-dir",required=True)
    args=parser.parse_args()
    report=asyncio.run(run(Path(args.out_dir)))
    target=Path(args.out_dir)/"guest-media-frames-receipt.json"
    target.write_text(json.dumps(report,indent=2,ensure_ascii=False,allow_nan=False)+"\n",encoding="utf-8")
    print("YUTANG_GUEST_MEDIA_CLASSIFICATION="+report["classification"])
    print("YUTANG_GUEST_MEDIA_FRAMES="+str(report["frame_count"]))
    print("YUTANG_GUEST_MEDIA_STATUS="+str(report["media_response_status"]))


if __name__=="__main__":main()
