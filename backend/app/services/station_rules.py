"""What a lookout station's readings mean, in words an operator can act on (docs/21, section 5). Pure functions: no database, no clock.
A statement is a key plus parameters that the screens translate; it is a prompt to look, never a fire. Thresholds are first values (see docs/21, section 6) and are set again after the field test."""
from __future__ import annotations

from statistics import median

RISE_RATIO = 2.0              # PM2.5 at least this many times the station's normal for this hour of day
HAZE_RATIO = 1.5              # other stations count as "also up" at this ratio
HAZE_SHARE = 0.6              # regional haze when this share of the other reporting stations within HAZE_KM are also up
HAZE_MIN_OTHERS = 2
HAZE_KM = 50.0
DAMP_PCT = 90.0               # above this humidity the sensor counts fog and droplets, so a rise is not trusted
SUSTAIN_MIN = 20              # the rise must hold this long
MIN_NORMAL = 1.0              # a normal below this is not a baseline yet
CHAINSAW_REPEAT = 2           # a chainsaw is announced after this many detections ...
CHAINSAW_WINDOW_MIN = 30      # ... within this many minutes
SEVERITY = {"gap": 3, "check": 2, "watch": 1, "ok": 0}


def hour_normal(readings, hour: int, min_n: int = 12):
    """Median PM2.5 for the hour of day `hour` (and the hours either side) over the readings given as (hour_of_day, pm25), or None when there are fewer than min_n of them."""
    near = [p for h, p in readings if p is not None and (h - hour) % 24 in (0, 1, 23)]
    return float(median(near)) if len(near) >= min_n else None


def sustained_minutes(points, normal, ratio: float = RISE_RATIO):
    """points: newest first as (minutes_ago, pm25). How many minutes the readings have stayed at `ratio` times `normal` or more, counted back from now; 0 when the newest is below it."""
    if not normal or normal < MIN_NORMAL:
        return 0
    held = 0
    for minutes_ago, pm in points:
        if pm is None or pm < ratio * normal:
            break
        held = minutes_ago
    return held


def is_haze(neighbour_ratios) -> bool:
    """neighbour_ratios: PM2.5 over normal of the other reporting stations within HAZE_KM. Haze when enough of them are up as well."""
    r = [x for x in neighbour_ratios if x is not None]
    return len(r) >= HAZE_MIN_OTHERS and sum(1 for x in r if x >= HAZE_RATIO) / len(r) >= HAZE_SHARE


def smoke_state(pm25, normal, humidity, held_min, neighbour_ratios):
    """'rising' (smoke up and holding, neighbours not), 'haze' (the whole range is up), 'damp' (rise not trusted in fog), 'watch' (up but not yet holding), 'normal', or 'unknown' (no baseline)."""
    if pm25 is None or not normal or normal < MIN_NORMAL:
        return "unknown"
    if pm25 < RISE_RATIO * normal:
        return "normal"
    if humidity is not None and humidity >= DAMP_PCT:
        return "damp"
    if is_haze(neighbour_ratios):
        return "haze"
    return "rising" if held_min >= SUSTAIN_MIN else "watch"


def statement(station: dict, smoke: str, held_min: int = 0, sounds=()):
    """station: status, age_s, battery_mv. sounds: (kind, age_min) of events in the last hours, newest first. Returns {'key', 'params', 'tone'}; tone is gap, check, watch or ok."""
    if station["status"] in ("offline", "never"):
        return {"key": "never" if station["status"] == "never" else "silent", "params": {"age_s": station.get("age_s")}, "tone": "gap"}
    if station["status"] == "late":
        return {"key": "late", "params": {"age_s": station.get("age_s")}, "tone": "watch"}
    chain = [a for k, a in sounds if k == "chainsaw" and a <= CHAINSAW_WINDOW_MIN]
    if len(chain) >= CHAINSAW_REPEAT:
        return {"key": "chainsaw", "params": {"n": len(chain)}, "tone": "check"}
    if any(k == "blast" and a <= 60 for k, a in sounds):
        return {"key": "blast", "params": {}, "tone": "check"}
    if smoke == "rising":
        return {"key": "smoke_rising", "params": {"minutes": held_min}, "tone": "check"}
    if smoke == "haze":
        return {"key": "haze", "params": {}, "tone": "watch"}
    if smoke == "watch":
        return {"key": "smoke_up", "params": {}, "tone": "watch"}
    if any(k == "fire" and a <= 60 for k, a in sounds):
        return {"key": "fire_sound", "params": {}, "tone": "watch"}
    if smoke == "damp":
        return {"key": "damp", "params": {}, "tone": "ok"}
    if smoke == "unknown":
        return {"key": "no_baseline", "params": {}, "tone": "ok"}
    return {"key": "normal", "params": {}, "tone": "ok"}


def should_notify(kind: str, recent_same: int, smoke_rising: bool, hotspots_near: int) -> bool:
    """One notification per check, not per detection. A chainsaw is announced on its second detection in the window, a blast on the first, an open-fire sound only with another signal (smoke rising or a satellite detection near)."""
    if kind == "blast":
        return True
    if kind == "chainsaw":
        return recent_same >= CHAINSAW_REPEAT
    if kind == "fire":
        return smoke_rising or hotspots_near > 0
    return False


def worst(statements) -> str:
    return max((s["tone"] for s in statements), key=lambda t: SEVERITY[t], default="ok")
