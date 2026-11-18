"""Privacy-limited diagnostics for a single local Douyin browsing session.

Strict allowlist: player timing and network states only. No DOM body, cookies,
profile paths, titles, full URLs, screenshots or browser storage.
"""
from __future__ import annotations

import json
import math
import os
import re
import secrets
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

ALLOWED_OUTCOMES = frozenset({
    'COMPLETE','PREVIEW_VERIFIED','TIME_LIMIT','VIDEO_LOST',
    'VIDEO_CHANGED','SEEK_DETECTED','UNKNOWN_DURATION',
    'PLAYBACK_STALLED','STOPPED','NO_VIDEO',
    'VIDEO_CHANGED_BEFORE_COMMENTS','VIDEO_CHANGED_DURING_COMMENTS',
    'CONTENT_READ_FAILED','NAVIGATION_NOT_CONFIRMED'
})

def _number(value: Any, maximum: float) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        v=float(value)
    except (TypeError,ValueError,OverflowError):
        return None
    return round(v,2) if math.isfinite(v) and 0 <= v <= maximum else None

def _count(value: Any, maximum: int) -> int | None:
    return value if type(value) is int and 0 <= value <= maximum else None


def _state(value: Any, upper: int) -> int | None:
    if type(value) is int and 0 <= value <= upper:
        return value
    return None

def _probe_sample(index: int, elapsed: float, probe: Mapping[str, Any]) -> dict[str, Any]:
    value=str(probe.get('video_id') or '')
    return {
        'index': max(0,min(50,int(index))),
        'elapsed_s': _number(elapsed,3600),
        'video_id':value if re.fullmatch(r'[0-9]{8,30}',value) else None,
        'visible_video': bool(probe.get('found')) if type(probe.get('found')) is bool else None,
        'video_elements_total':_count(probe.get('video_elements_total'),200),
        'video_elements_visible':_count(probe.get('video_elements_visible'),200),
        'login_hint':probe.get('login_hint') if type(probe.get('login_hint')) is bool else None,
        'document_ready':(probe.get('document_ready') if probe.get('document_ready') in
                          ('loading','interactive','complete') else None),
        'media_s':_number(probe.get('current_time'),86400),
        'duration_s':_number(probe.get('duration'),86400),
        'paused':probe.get('paused') if type(probe.get('paused')) is bool else None,
        'ready_state':_state(probe.get('ready_state'),4),
        'network_state':_state(probe.get('network_state'),3),
        'page_visible':probe.get('page_visible') if type(probe.get('page_visible')) is bool else None,
    }

class SessionDiagnostics:
    def __init__(self, path: Path) -> None:
        self.path=Path(path)
        self.samples: deque[dict[str,Any]]=deque(maxlen=64)
        self.outcomes: deque[dict[str,Any]]=deque(maxlen=50)
        self.navigation_info:dict[str,Any]={'http_status':None,'douyin_origin':None}

    def record_navigation(self,http_status:Any,douyin_origin:Any)->None:
        self.navigation_info={'http_status':_count(http_status,599) if
                              type(http_status) is int and http_status>=100 else None,
                              'douyin_origin':douyin_origin if type(douyin_origin) is bool else None}

    def observe(self,index:int,elapsed:float,probe:Mapping[str,Any]) -> None:
        self.samples.append(_probe_sample(index,elapsed,probe))

    def finish_video(self,index:int,status:str,elapsed:float,observed:float) -> None:
        safe=status if status in ALLOWED_OUTCOMES else 'UNVERIFIED'
        self.outcomes.append({'index':max(0,min(50,int(index))),
                              'result':safe,
                              'elapsed_s':_number(elapsed,3600),
                              'observed_playback_s':_number(observed,86400)})

    def save(self) -> None:
        """Atomic local write; no requests, uploads, browser state or credentials."""
        self.path.parent.mkdir(parents=True,exist_ok=True)
        data={'schema':'yutang.douyin.diagnostics.v1',
              'written_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'navigation':dict(self.navigation_info),
              'samples':list(self.samples),'outcomes':list(self.outcomes),
              'limitations':'Media metadata only; cannot prove web connectivity or visual/audio understanding.'}
        serialized=json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2)+'\n'
        temp=self.path.with_name(self.path.name+'.'+secrets.token_hex(6)+'.tmp')
        try:
            with temp.open('x',encoding='utf-8') as fp:
                fp.write(serialized)
                fp.flush()
                os.fsync(fp.fileno())
            os.replace(temp,self.path)
        finally:
            if temp.exists():
                temp.unlink()

def safe_share_summary(document: Mapping[str,Any], exe_sha256: str | None = None) -> str:
    """Strict allowlist for copying a report into a support chat.

    Deliberately omit video IDs, URLs, titles, paths, text and raw error values.
    """
    if document.get('schema') != 'yutang.douyin.diagnostics.v1':
        raise ValueError('Unknown diagnostic schema')
    nav=document.get('navigation')
    nav=nav if isinstance(nav,dict) else {}
    samples=document.get('samples')
    samples=samples if isinstance(samples,list) else []
    results=document.get('outcomes')
    results=results if isinstance(results,list) else []
    sample=samples[-1] if samples and isinstance(samples[-1],dict) else {}
    result=results[-1] if results and isinstance(results[-1],dict) else {}
    status=str(result.get('result') or '')
    if status not in ALLOWED_OUTCOMES and status!='UNVERIFIED':
        status='UNVERIFIED'
    if not status:
        status='PENDING'
    sha=exe_sha256.lower() if isinstance(exe_sha256,str) and re.fullmatch(r'[0-9a-fA-F]{64}',exe_sha256) else 'UNVERIFIED'
    def fmt(value:Any)->str:
        return 'UNVERIFIED' if value is None else str(value)
    def flag(value:Any)->str:
        return 'YES' if value is True else ('NO' if value is False else 'UNVERIFIED')
    code=_count(nav.get('http_status'),599)
    code=code if code is not None and code>=100 else None
    ready=sample.get('document_ready')
    ready=ready if ready in ('loading','interactive','complete') else None
    lines=[
        'YUTANG_FIELD_DIAGNOSTIC_V1',
        'EXE_SHA256='+sha,
        'HTTP_STATUS='+fmt(code),
        'DOUYIN_ORIGIN='+flag(nav.get('douyin_origin')),
        'SAMPLE_COUNT='+str(min(len(samples),64)),
        'VISIBLE_VIDEO='+flag(sample.get('visible_video')),
        'VIDEO_ELEMENTS_TOTAL='+fmt(_count(sample.get('video_elements_total'),200)),
        'VIDEO_ELEMENTS_VISIBLE='+fmt(_count(sample.get('video_elements_visible'),200)),
        'LOGIN_HINT='+flag(sample.get('login_hint')),
        'DOCUMENT_READY='+fmt(ready),
        'MEDIA_SECONDS='+fmt(_number(sample.get('media_s'),86400)),
        'DURATION_SECONDS='+fmt(_number(sample.get('duration_s'),86400)),
        'PAUSED='+flag(sample.get('paused')),
        'READY_STATE='+fmt(_state(sample.get('ready_state'),4)),
        'NETWORK_STATE='+fmt(_state(sample.get('network_state'),3)),
        'OUTCOME='+status,
        'OBSERVED_PLAYBACK_SECONDS='+fmt(_number(result.get('observed_playback_s'),86400)),
        'NOTES=Local sanitized media metadata; no audio or video understanding claimed.'
    ]
    return '\n'.join(lines)
