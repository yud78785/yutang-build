"""Evidence policy for one selected HTML video; no page access or network I/O."""
from __future__ import annotations
import math
from typing import Any, Mapping

def _finite_nonnegative(value: Any) -> float | None:
    try:
        number=float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) and number>=0 else None

def media_advance(previous: Mapping[str,Any], current: Mapping[str,Any], wall_seconds:float) -> float:
    """Count only forward media clock movement observed in a non-paused player."""
    old=_finite_nonnegative(previous.get('current_time'))
    new=_finite_nonnegative(current.get('current_time'))
    wall=_finite_nonnegative(wall_seconds)
    if old is None or new is None or wall is None or wall<=0:
        return 0.0
    if previous.get('paused',False) or current.get('paused',False):
        return 0.0
    if int(previous.get('ready_state',4) or 0)<2 or int(current.get('ready_state',4) or 0)<2:
        return 0.0
    jump=new-old
    if jump<0.05 or jump>max(1.25,wall*2.5+0.8):
        return 0.0
    return jump

def preview_verified(observed_seconds:float,required_seconds:float,advancing_samples:int) -> bool:
    actual=_finite_nonnegative(observed_seconds)
    required=_finite_nonnegative(required_seconds)
    return bool(actual is not None and required is not None and required>=3 and
                actual>=required and advancing_samples>=2)

def frame_fraction(media_time:float,duration:float | None,observed_seconds:float,
                   preview_seconds:float,mode:str) -> float:
    if mode=='preview':
        required=_finite_nonnegative(preview_seconds)
        actual=_finite_nonnegative(observed_seconds)
        return min(1.0,actual/required) if required and actual is not None else 0.0
    current=_finite_nonnegative(media_time)
    total=_finite_nonnegative(duration)
    return min(1.0,current/total) if current is not None and total else 0.0
