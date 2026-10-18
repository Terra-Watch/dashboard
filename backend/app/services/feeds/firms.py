"""NASA FIRMS active-fire (VIIRS) ingestion: fetch a bounding box, parse, upsert idempotently."""
from __future__ import annotations

import csv
import io
import os
from typing import Iterable

import httpx
from sqlalchemy import text

from ..ingest import FIRMS_BASE, SATELLITES, dedup_key, parse_firms_csv, tag_state
from .. import feeds as _feeds
from . import FeedError

SOURCE = "nasa-firms"
MAX_DAYS = 5  # FIRMS area API accepts 1..5 days per request


def _key() -> str:
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key:
        raise FeedError("Satellite feed is not connected (FIRMS_MAP_KEY is not set)", not_configured=True)
    return key


def validate_bbox(bbox: Iterable[float]) -> tuple[float, float, float, float]:
    try:
        west, south, east, north = (float(v) for v in bbox)
    except (TypeError, ValueError):
        raise FeedError("bbox must be four numbers: west,south,east,north") from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise FeedError("bbox is out of range or not ordered west<east, south<north")
    return west, south, east, north


def fetch_csv(bbox, days: int, satellite: str, client: httpx.Client | None = None) -> tuple[int, str]:
    """One FIRMS area request. Returns (status, body). Errors never include the URL or key."""
    west, south, east, north = validate_bbox(bbox)
    if not 1 <= int(days) <= MAX_DAYS:
        raise FeedError(f"days must be between 1 and {MAX_DAYS}")
    key = _key()
    url = f"{FIRMS_BASE}/{key}/{satellite}/{west},{south},{east},{north}/{int(days)}"
    owns = client is None
    client = client or _feeds.http_client()
    try:
        response = client.get(url)
        return response.status_code, response.text
    except httpx.TimeoutException:
        raise FeedError("Satellite feed timed out") from None
    except httpx.HTTPError as exc:
        raise FeedError(f"Satellite feed request failed ({type(exc).__name__})") from None
    finally:
        if owns:
            client.close()


def parse(body: str, satellite: str) -> list[dict]:
    """Rows ready for the table (reuses the ingest parser; adds brightness and day/night)."""
    try:
        rows = parse_firms_csv(body, satellite)
    except ValueError:
        raise FeedError("Satellite feed returned an unexpected response") from None
    extra: dict[str, dict] = {}
    if body.strip():
        reader = csv.DictReader(io.StringIO(body.strip()))
        reader.fieldnames = [n.strip().lower() for n in (reader.fieldnames or [])]
        for raw in reader:
            try:
                k = dedup_key(satellite, (raw.get("acq_date") or "").strip(), (raw.get("acq_time") or "").strip(),
                              float(raw["latitude"]), float(raw["longitude"]))
            except (KeyError, TypeError, ValueError):
                continue
            bright = raw.get("bright_ti4") or raw.get("brightness") or ""
            try:
                brightness = float(bright) if bright.strip() else None
            except ValueError:
                brightness = None
            extra[k] = {"brightness": brightness, "daynight": (raw.get("daynight") or "").strip()[:1].upper() or None}
    out = []
    for r in rows:
        e = extra.get(r["dedup_key"], {})
        state = tag_state(r["lat"], r["lon"])
        out.append({"satellite": r["satellite"], "acq_datetime": r["detected_at"], "latitude": r["lat"],
                    "longitude": r["lon"], "brightness": e.get("brightness"), "frp": r["frp"],
                    "confidence": r["confidence"], "daynight": e.get("daynight"),
                    "state": None if state == "XX" else state})
    return out


_UPSERT = text("""INSERT INTO resq_hotspots (satellite,acq_datetime,latitude,longitude,brightness,frp,confidence,daynight,state)
    VALUES (:satellite,:acq_datetime,:latitude,:longitude,:brightness,:frp,:confidence,:daynight,:state)
    ON CONFLICT (satellite,acq_datetime,latitude,longitude) DO NOTHING""")


def upsert(rows: list[dict], engine=None) -> int:
    """Insert new rows; existing ones are left untouched. Returns the number newly inserted."""
    if not rows:
        return 0
    if engine is None:
        from ...database.session import engine
    inserted = 0
    with engine.begin() as db:
        for row in rows:
            inserted += db.execute(_UPSERT, row).rowcount or 0
    return inserted


def fetch_area(bbox, days: int = 1, satellites: Iterable[str] | None = None,
               client: httpx.Client | None = None, engine=None) -> dict:
    """Fetch every satellite for the bbox and upsert. Counts only; partial failures are listed safely."""
    bbox = validate_bbox(bbox)
    sats = list(satellites or SATELLITES)
    bad = [s for s in sats if s not in SATELLITES]
    if bad:
        raise FeedError("Unknown satellite source requested")
    _key()
    owns = client is None
    client = client or _feeds.http_client()
    result = {"fetched": 0, "inserted": 0, "satellites": {}, "errors": []}
    try:
        for sat in sats:
            try:
                status, body = fetch_csv(bbox, days, sat, client)
                if status != 200:
                    raise FeedError(f"Satellite feed returned HTTP {status}")
                rows = parse(body, sat)
                inserted = upsert(rows, engine)
            except FeedError as exc:
                result["errors"].append({"satellite": sat, "error": str(exc)})
                continue
            result["fetched"] += len(rows)
            result["inserted"] += inserted
            result["satellites"][sat] = {"fetched": len(rows), "inserted": inserted}
    finally:
        if owns:
            client.close()
    if sats and not result["satellites"]:
        raise FeedError(result["errors"][0]["error"])
    return result
