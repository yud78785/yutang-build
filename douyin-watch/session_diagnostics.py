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
