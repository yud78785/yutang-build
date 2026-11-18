"""One-shot public Douyin live-site smoke using the actual packaged BrowserWatcher.

Designed for GitHub Windows CI. This does not prove the user's desktop works.
Never logs in, modifies content, bypasses controls or stores web page text.
"""
from __future__ import annotations

import json
import math
import os
import secrets
import tempfile
import threading
from pathlib import Path
from typing import Any, Mapping

from agent_core import BrowserWatcher, WatchConfig

SCHEMA = 'yutang.douyin.live_site.v1'
REAL_PLAYBACK_MIN_S = 3.0
ALLOWED_RESULT_CODES = {
    'PREVIEW_VERIFIED', 'COMPLETE', 'PLAYBACK_STALLED', 'TIME_LIMIT',
    'VIDEO_LOST', 'VIDEO_CHANGED', 'SEEK_DETECTED', 'UNKNOWN_DURATION',
    'CONTENT_READ_FAILED', 'VIDEO_CHANGED_BEFORE_COMMENTS',
    'VIDEO_CHANGED_DURING_COMMENTS', 'STOPPED'
}

def _safe_number(v:Any,maximum:float) -> float | None:
    if isinstance(v,bool) or v is None:
        return None
    try:
        n=float(v)
    except (ValueError,TypeError,OverflowError):
        return None
    return round(n,2) if math.isfinite(n) and 0<=n<=maximum else None

def report_from_events(events:list[tuple[str,Mapping[str,Any]]]) -> dict[str,Any]:
    """Copy only an explicit scalar allowlist. Page text and URLs cannot escape."""
    navigation=None
    outcome=None
    errors=0
    for kind,fields in events:
        if kind=='navigation':
            http=fields.get('http_status')
            navigation={'http_status':http if type(http) is int and 100<=http<=599 else None,
                        'douyin_origin':fields.get('douyin_origin') is True}
        elif kind=='record':
            state=str(fields.get('status') or '')
            count=fields.get('comments')
            outcome={'result':state if state in ALLOWED_RESULT_CODES else 'UNVERIFIED',
                     'observed_playback_s':_safe_number(fields.get('observed_playback_s'),3600),
                     'visible_comment_count':max(0,min(5,count)) if type(count) is int else None}
        elif kind=='error':
            errors+=1
    http=navigation['http_status'] if navigation else None
    origin=navigation['douyin_origin'] if navigation else False
    state=outcome['result'] if outcome else 'UNVERIFIED'
    seconds=outcome['observed_playback_s'] if outcome else None
    verified=(state in ('PREVIEW_VERIFIED','COMPLETE') and
              seconds is not None and seconds>=REAL_PLAYBACK_MIN_S)
    if verified:
        classification='PUBLIC_VIDEO_PLAYBACK_OBSERVED'
    elif outcome:
        classification='VISIBLE_VIDEO_BUT_PLAYBACK_NOT_VERIFIED'
    elif http is not None and http>=400:
        classification='HTTP_RESTRICTED_OR_ERROR'
    elif origin and http is not None and 200<=http<400:
        classification='PAGE_RESPONDED_NO_VISIBLE_VIDEO'
    else:
        classification='SITE_OR_BROWSER_UNVERIFIED'
    return {'schema':SCHEMA,'environment':'github-windows-2022-msedge-headless',
            'destination_host':'www.douyin.com',
            'classification':classification,
            'real_public_playback_observed':bool(verified),
            'http_status':http,
            'douyin_origin':origin,
            'player_result':state,
            'observed_playback_s':seconds,
            'visible_comment_count':outcome['visible_comment_count'] if outcome else None,
            'error_events_count':min(errors,100),
            'limitations':'A headless CI session cannot establish user desktop playback, login, audio or AI understanding.'}

class TimedLiveWatcher(BrowserWatcher):
    def _find_live_video(self,context:Any,page:Any,limit:int=18):
        return super()._find_live_video(context,page,limit=18)

    def _hold_browser_until_user_stops(self,page:Any) -> None:
        # Avoid an unattended Windows CI worker waiting for a UI Stop click.
        return

def run_live_site_probe(destination:Path) -> dict[str,Any]:
    events:list[tuple[str,dict[str,Any]]]=[]
    try:
        with tempfile.TemporaryDirectory(prefix='yutang-public-douyin-probe-') as tmp:
            watcher=TimedLiveWatcher(
                WatchConfig(url='https://www.douyin.com/',count=1,
                            max_seconds_per_video=25,watch_mode='preview',
                            preview_seconds=4,read_comments=True,capture_frames=False),
                threading.Event(),lambda kind,payload:events.append((kind,payload)),
                output_dir=Path(tmp),launch_kwargs={'headless':True})
            watcher.run()
    except Exception:
        events.append(('error',{}))
    report=report_from_events(events)
    destination=Path(destination)
    destination.parent.mkdir(parents=True,exist_ok=True)
    temporary=destination.with_name(destination.name+'.'+secrets.token_hex(5)+'.tmp')
    try:
        with temporary.open('x',encoding='utf-8') as stream:
            json.dump(report,stream,ensure_ascii=False,indent=2,allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary,destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    return report
