"""Named places (OpenStreetMap villages, hamlets, towns), shipped as a compressed list (app/places_data/places.json.gz, built from wildfire-ignition-forecasting/results/named_places.parquet).
OpenStreetMap is thin in many forests: an empty answer never means nobody lives there."""
from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

_KIND = {"v": "village", "h": "hamlet", "l": "locality", "t": "town", "c": "city"}
_FILE = Path(__file__).resolve().parents[1] / "places_data" / "places.json.gz"
_GRID = 0.1
_index: dict[tuple[int, int], list[tuple[str, str, float, float]]] | None = None


def _load() -> dict[tuple[int, int], list[tuple[str, str, float, float]]]:
    global _index
    if _index is None:
        _index = {}
        try:
            for name, k, lat, lon in json.loads(gzip.open(_FILE, "rt", encoding="utf-8").read()):
                _index.setdefault((int(math.floor(lat / _GRID)), int(math.floor(lon / _GRID))), []).append((name, _KIND.get(k, "village"), lat, lon))
        except (OSError, ValueError):
            _index = {}
    return _index


def near(lat: float, lon: float, radius_km: float) -> list[dict]:
    """Named places within radius_km of the point (a square test first, then the distance)."""
    idx = _load(); r = radius_km / 111.32 / _GRID + 1; cy, cx = int(math.floor(lat / _GRID)), int(math.floor(lon / _GRID)); out = []
    k = math.cos(math.radians(lat))
    for gy in range(cy - int(r), cy + int(r) + 1):
        for gx in range(cx - int(r / max(k, 0.3)), cx + int(r / max(k, 0.3)) + 1):
            for name, kind, plat, plon in idx.get((gy, gx), ()):
                if math.hypot((plat - lat) * 111.32, (plon - lon) * 111.32 * k) <= radius_km: out.append({"name": name, "kind": kind, "lat": plat, "lon": plon})
    return out
