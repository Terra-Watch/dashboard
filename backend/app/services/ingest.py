"""Dependency-light FIRMS ingestion primitives.

This module deliberately contains no database imports and performs no network
or filesystem work at import time. Persistence and live scheduling remain
separate integration responsibilities.
"""
from __future__ import annotations

import csv
import hashlib
import io
import math
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Callable

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
SATELLITES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"]
STATE_BOXES: dict[str, tuple[float, float, float, float]] = {
    "MH": (72.6, 15.6, 80.9, 22.1), "TS": (77.2, 15.8, 81.1, 19.9),
    "AP": (76.8, 12.6, 84.8, 19.9), "OD": (81.3, 17.8, 87.5, 22.6),
    "CG": (80.2, 17.8, 84.4, 24.1), "MP": (74.0, 21.0, 82.8, 26.9),
    "JH": (83.3, 21.9, 87.6, 25.3), "UK": (77.6, 28.7, 81.1, 31.5),
}
CLUSTER_DIST_KM = 1.5
CLUSTER_TIME_H = 12
STALE_AFTER_H = 6
CONFIDENCE_MAP = {"l": "low", "n": "nominal", "h": "high"}
_RETRY_DELAYS_S = (60, 120, 240, 480, 480)


class FetchError(RuntimeError):
    """A transport failure, with retryability derived from HTTP semantics."""

    def __init__(self, message: str, status: int | None = None, *, retryable: bool | None = None):
        super().__init__(message)
        self.status = status
        self.retryable = (retryable if retryable is not None else
                          status is None or status in {408, 429} or 500 <= status < 600)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2)
         * math.sin(d_lambda / 2) ** 2)
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def dedup_key(satellite: str, acq_date: str, acq_time: str, lat: float, lon: float) -> str:
    raw = f"{satellite}|{acq_date}|{acq_time}|{round(lat, 4)}|{round(lon, 4)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def map_confidence(raw: str) -> str:
    value = str(raw).strip().lower()
    if value in {"low", "nominal", "high"}:
        return value
    return CONFIDENCE_MAP.get(value[:1], "nominal")


def _parse_detected_at(acq_date: str, acq_time: str) -> datetime:
    """Parse a FIRMS date/time as UTC; malformed input is never fabricated."""
    raw_time = str(acq_time).strip()
    if not raw_time.isdigit():
        raise ValueError("FIRMS acquisition time is not numeric")
    time_text = raw_time.zfill(4)
    if len(time_text) != 4:
        raise ValueError("FIRMS acquisition time must be HHMM")
    return datetime.strptime(
        f"{acq_date} {time_text[:2]}:{time_text[2:]}", "%Y-%m-%d %H:%M"
    ).replace(tzinfo=timezone.utc)


def tag_state(lat: float, lon: float) -> str:
    for state, (west, south, east, north) in STATE_BOXES.items():
        if west <= lon <= east and south <= lat <= north:
            return state
    return "XX"


def parse_firms_csv(body: str, satellite: str) -> list[dict]:
    """Parse usable FIRMS rows, skipping malformed individual observations."""
    body = body.strip()
    if not body:
        return []
    reader = csv.DictReader(io.StringIO(body))
    if reader.fieldnames is None:
        raise ValueError("FIRMS CSV has no header row")
    reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError("FIRMS CSV has duplicate columns after header normalization")
    required = {"latitude", "longitude", "acq_date", "acq_time", "confidence"}
    missing = required - set(reader.fieldnames)
    if missing:
        raise ValueError(f"FIRMS CSV missing required columns: {missing}")

    parsed = []
    for raw in reader:
        try:
            lat, lon = float(raw["latitude"]), float(raw["longitude"])
            if not (math.isfinite(lat) and math.isfinite(lon)):
                continue
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            acq_date = (raw["acq_date"] or "").strip()
            acq_time = (raw["acq_time"] or "").strip()
            detected_at = _parse_detected_at(acq_date, acq_time)
            frp_text = (raw.get("frp") or "").strip()
            try:
                frp = float(frp_text) if frp_text else None
            except (ValueError, OverflowError):
                frp = None
            if frp is not None and not math.isfinite(frp):
                frp = None
            parsed.append({
                "dedup_key": dedup_key(satellite, acq_date, acq_time, lat, lon),
                "satellite": satellite, "acq_date": acq_date, "acq_time": acq_time,
                "detected_at": detected_at, "lat": lat, "lon": lon,
                "confidence": map_confidence(raw.get("confidence", "n")),
                "frp": frp, "state": tag_state(lat, lon),
            })
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
    return parsed


def _canonical_row_key(row: dict) -> tuple:
    frp = row["frp"]
    return (row["satellite"], row["acq_date"], row["acq_time"], float(row["lat"]),
            float(row["lon"]), row["detected_at"].isoformat(), row["confidence"],
            "" if frp is None else format(float(frp), ".17g"), row["state"])


def _cluster_rows(rows: list[dict], dist_km: float, time_h: float) -> list[list[int]]:
    parents = list(range(len(rows)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            hours = abs((rows[i]["detected_at"] - rows[j]["detected_at"]).total_seconds()) / 3600
            if hours < time_h and _haversine_km(
                rows[i]["lat"], rows[i]["lon"], rows[j]["lat"], rows[j]["lon"]
            ) < dist_km:
                parents[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for index in range(len(rows)):
        groups.setdefault(find(index), []).append(index)
    return list(groups.values())


def cluster_detections_in_memory(
    rows: list[dict], dist_km: float = CLUSTER_DIST_KM, time_h: float = CLUSTER_TIME_H
) -> list[list[int]]:
    """Group rows by strict spatial and temporal thresholds, without a DB."""
    return _cluster_rows(rows, dist_km, time_h)


def prepare_firms_batch(body: str, satellite: str) -> dict[str, object]:
    """Deduplicate and sort observations deterministically before downstream use."""
    parsed = parse_firms_csv(body, satellite)
    csv_rows = list(csv.reader(io.StringIO(body.strip()))) if body.strip() else []
    unique: dict[str, dict] = {}
    for row in parsed:
        key = row["dedup_key"]
        if key not in unique or _canonical_row_key(row) < _canonical_row_key(unique[key]):
            unique[key] = row
    rows = sorted(unique.values(), key=lambda row: (row["detected_at"], row["dedup_key"]))
    clusters = [[rows[index]["dedup_key"] for index in group]
                for group in cluster_detections_in_memory(rows)]
    return {"rows": rows, "clusters": clusters, "parsed_count": len(parsed),
            "input_count": max(0, len(csv_rows) - 1)}


def fetch_firms_csv(
    state: str, satellite: str, date_str: str, day_range: int = 1, *,
    map_key: str | None = None, _http: Callable[[str], tuple[int, str]] | None = None,
) -> tuple[int, str]:
    """Fetch one FIRMS Area API slice; network access occurs only when called."""
    key = map_key or os.getenv("RESQ_FIRMS_MAP_KEY")
    if not key:
        raise FetchError("RESQ_FIRMS_MAP_KEY is not set", retryable=False)
    try:
        west, south, east, north = STATE_BOXES[state]
    except KeyError as exc:
        raise ValueError(f"Unsupported FIRMS state: {state}") from exc
    url = (f"{FIRMS_BASE}/{key}/{satellite}/{west},{south},{east},{north}/"
           f"{day_range}/{date_str}")
    if _http is not None:
        return _http(url)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "terrawatch-ingest/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raise FetchError(f"FIRMS returned HTTP {exc.code}", status=exc.code) from exc
    except Exception as exc:
        raise FetchError(str(exc)) from exc


def _fetch_with_retry(
    state: str, satellite: str, date_str: str, *, map_key: str | None = None,
    _http: Callable[[str], tuple[int, str]] | None = None,
    _sleep: Callable[[float], None] | None = None,
) -> tuple[int, str]:
    sleep_fn = _sleep if _sleep is not None else time.sleep
    last_error: FetchError | None = None
    for attempt in range(len(_RETRY_DELAYS_S)):
        try:
            response = fetch_firms_csv(state, satellite, date_str, map_key=map_key, _http=_http)
            status, _body = response
            if not 200 <= status < 300:
                error = FetchError(f"FIRMS returned HTTP {status}", status=status)
                if not error.retryable:
                    raise error
                last_error = error
                if attempt == len(_RETRY_DELAYS_S) - 1:
                    raise error
                sleep_fn(_RETRY_DELAYS_S[attempt])
                continue
            return response
        except FetchError as exc:
            last_error = exc
            if not exc.retryable or attempt == len(_RETRY_DELAYS_S) - 1:
                raise
            sleep_fn(_RETRY_DELAYS_S[attempt])
    assert last_error is not None
    raise last_error


def get_health() -> dict:
    """Safe offline default; canonical live-ingestion configuration is absent."""
    return {"live": False, "stale": True, "last_fetched_at": None,
            "detection_count": 0, "stale_after_minutes": STALE_AFTER_H * 60}
