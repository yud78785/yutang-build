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

PLAYER_JS = """() => {
  const all = Array.from(document.querySelectorAll('video'));
  const visible = all.map((v,i) => {
    const r=v.getBoundingClientRect(), s=getComputedStyle(v);
    return {v,i,ok:r.width>=80 && r.height>=80 && r.bottom>0 && r.right>0 &&
      r.left<innerWidth && r.top<innerHeight && s.display!=='none' && s.visibility!=='hidden'};
  }).filter(x=>x.ok);
  const chosen=visible.find(x=>!x.v.paused && x.v.readyState>=2) || visible[0];
  const v=chosen && chosen.v;
  return {
    total:all.length, visible:visible.length,
    index:chosen ? chosen.i : null,
    media_time:v && Number.isFinite(v.currentTime) ? v.currentTime : null,
    paused:v ? !!v.paused : null,
    ready:v ? v.readyState : null
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


def finite(value: Any, upper: float) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number=float(value)
    except (TypeError,ValueError,OverflowError):
        return None
    return round(number,2) if math.isfinite(number) and 0<=number<=upper else None


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
        if (a is None or b is None or previous["paused"] is not False or
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
             comments: dict[str,Any],response_comment_count: int,frames: list[Any]) -> str:
    http=http_status if type(http_status) is int and 100<=http_status<=599 else None
    has_comments=comments["visible_text_count"]>0 or response_comment_count>0
    frame_count=min(len(frames),MAX_FRAMES)
    if playback["playback_observed"] and has_comments and frame_count>0:
        return "PLAYBACK_COMMENTS_AND_FRAMES_OBSERVED"
    if playback["playback_observed"] and has_comments:
        return "PLAYBACK_AND_COMMENTS_OBSERVED"
    if playback["playback_observed"] and frame_count>0:
        return "PLAYBACK_AND_FRAMES_OBSERVED"
    if playback["playback_observed"]:
        return "PLAYBACK_ONLY"
    if has_comments:
        return "COMMENTS_ONLY"
    if http in (401,403,429) or (http is not None and http>=500):
        return "HTTP_RESTRICTED_OR_ERROR"
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
    error_code=None
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
                    parts=urlsplit(response.url)
                    if parts.hostname not in ("www.douyin.com","douyin.com"):
                        return
                    if "/aweme/v1/web/aweme/detail" in parts.path:
                        try:
                            body=await response.json()
                            item=body.get("aweme_detail") if isinstance(body,dict) else None
                            if isinstance(item,dict) and str(item.get("aweme_id"))==PUBLIC_VIDEO_ID:
                                detail_seen=True
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

                captured_targets:set[float]=set()
                for _ in range(21):
                    try:
                        raw=await page.evaluate(PLAYER_JS)
                    except Exception:
                        raw={}
                    safe=safe_player_sample(raw)
                    raw_samples.append(safe)

                    current=safe["media_time"]
                    if (safe["paused"] is False and (safe["ready"] or 0)>=2 and
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
                    if len(comment_samples)<3 and _%7==6 and correct_video:
                        try:
                            comment_samples.append(safe_comment_snapshot(await page.evaluate(COMMENT_JS)))
                        except Exception:
                            pass
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
    state=classify(http_status,origin,detail_seen,playback,comments,
                   response_comment_count_value,frames)
    return {
        "schema":SCHEMA,
        "public_video_id":PUBLIC_VIDEO_ID,
        "cloud_environment":"github-ubuntu-24.04-chrome-headless",
        "source_url_host":"www.douyin.com",
        "http_status":http_status if type(http_status) is int and 100<=http_status<=599 else None,
        "correct_video_url":bool(origin and correct_video),
        "detail_response_seen":bool(detail_seen),
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
