"""Lookout stations: decoding the node's telemetry payload, a station's status, and distance helpers. Pure functions, no database.

Payload v1 (15 bytes, little-endian, written by node-firmware lib/Telemetry): 'S', version 1, flags (bit0 BME680 valid, bit1 PMS5003 valid), PM2.5 (2), PM10 (2),
PM2.5 baseline (2, 0xFFFF = not sent), temperature in 0.01 C (2, signed), humidity in 0.01 percent (2), battery mV (2, 0xFFFF = not sent). PM values are the PMS5003
"atmospheric" figures in ug/m3: a sensor estimate, not a calibrated air-quality measurement.
"""
from __future__ import annotations

import math
import struct
from datetime import datetime, timezone

NOT_SENT = 0xFFFF
LATE_AFTER, OFFLINE_AFTER = 2, 6          # multiples of the station's own reporting interval


def decode_payload(payload: bytes) -> dict | None:
    """The readings in a payload, or None when it is not a v1 station telemetry packet."""
    if len(payload) != 15 or payload[0] != 0x53 or payload[1] != 1: return None
    flags = payload[2]
    pm25, pm10, _base, temp, hum, batt = struct.unpack_from("<HHHhHH", payload, 3)
    ok = lambda v: None if v == NOT_SENT else v
    bme, pms = bool(flags & 1), bool(flags & 2)
    return {"flags": flags, "pm25": ok(pm25) if pms else None, "pm10": ok(pm10) if pms else None,
            "temp_c": round(temp / 100, 2) if bme else None, "humidity_pct": round(hum / 100, 2) if bme else None, "battery_mv": ok(batt)}


SOUND_KINDS = {1: "chainsaw", 2: "blast"}


def decode_sound(payload: bytes) -> dict | None:
    """A sound alert from a station's classifier ('A', version 1, kind 1 chainsaw or 2 blast, confidence in percent), or None when the payload is not one."""
    if len(payload) != 4 or payload[0] != 0x41 or payload[1] != 1 or payload[2] not in SOUND_KINDS or payload[3] > 100: return None
    return {"kind": SOUND_KINDS[payload[2]], "confidence": payload[3]}


def status_of(last_heard: datetime | None, interval_s: int, now: datetime | None = None) -> str:
    """online: heard within 2 intervals; late: within 6; offline: longer; never: nothing yet. Thresholds scale with the station's own interval."""
    if last_heard is None: return "never"
    age = ((now or datetime.now(timezone.utc)) - last_heard).total_seconds()
    return "online" if age <= LATE_AFTER * interval_s else "late" if age <= OFFLINE_AFTER * interval_s else "offline"


def distance_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2); dp = p2 - p1; dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def bearing_deg(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2); dl = math.radians(lon2 - lon1)
    return (math.degrees(math.atan2(math.sin(dl) * math.cos(p2), math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) + 360) % 360


def compass_point(deg: float) -> str:
    return ("N", "NE", "E", "SE", "S", "SW", "W", "NW")[round(deg / 45) % 8]
