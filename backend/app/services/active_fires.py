"""Active fires from satellite detections (docs/23). Pure functions: no database, no clock, no network.
A fire is a set of detections linked at 1 km and 36 h (the research rule in fire-spread/src/firespread/events.py). Everything here is observed: when it was seen, how big, whether it grew
at the last pass, which side it grew toward, and which named places lie near its edge. There is no prediction and no arrival time (pace does not carry over from one pass to the next: docs/23)."""
from __future__ import annotations

import hashlib
import math
from datetime import datetime, timedelta

LINK_KM, LINK_H = 1.0, 36.0          # linking rule of the research events
PASS_GAP_H = 2.0                       # detections more than this apart in time belong to different satellite passes
NEW_KM = 0.75                          # a detection farther than this from every earlier one is new growth (the research definition)
CELL_DEG = 0.0034                      # about one 375 m VIIRS pixel
OUT_AFTER_H = 24.0                     # no detection for this long: probably out
REACH_KM = 15.0                        # named places listed this close to the edge
SIDE_DEG = 60.0                        # a place is "on the side it grew toward" within this angle of the growth bearing
POINTS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    x = (b_lon - a_lon) * 111.32 * math.cos(math.radians((a_lat + b_lat) / 2)); y = (b_lat - a_lat) * 111.32
    return math.hypot(x, y)


def bearing(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    x = (b_lon - a_lon) * math.cos(math.radians((a_lat + b_lat) / 2)); y = b_lat - a_lat
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def compass(deg: float) -> str:
    return POINTS[int(((deg % 360) + 22.5) // 45) % 8]


def angle_between(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def link(dets: list[dict]) -> list[list[dict]]:
    """dets: dicts with t (datetime), lat, lon. Returns groups of detections, each one fire. Single link: two detections within LINK_KM and LINK_H are the same fire."""
    order = sorted(range(len(dets)), key=lambda i: dets[i]["t"]); parent = list(range(len(dets)))

    def find(i: int) -> int:
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    grid: dict[tuple[int, int], list[int]] = {}
    for i in order:
        d = dets[i]; gy, gx = int(math.floor(d["lat"] / 0.01)), int(math.floor(d["lon"] / 0.01))
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in grid.get((gy + dy, gx + dx), ()):
                    o = dets[j]
                    if (d["t"] - o["t"]) <= timedelta(hours=LINK_H) and km(d["lat"], d["lon"], o["lat"], o["lon"]) <= LINK_KM: parent[find(i)] = find(j)
        grid.setdefault((gy, gx), []).append(i)
    out: dict[int, list[dict]] = {}
    for i in order: out.setdefault(find(i), []).append(dets[i])
    return list(out.values())


def fire_id(first: dict) -> str:
    return hashlib.sha1(f"{first['t'].isoformat()}|{first['lat']:.4f}|{first['lon']:.4f}".encode()).hexdigest()[:10]


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return (round(lat / CELL_DEG), round(lon * math.cos(math.radians(lat)) / CELL_DEG))


def cell_ring(cell: tuple[int, int], lat_ref: float) -> list[list[float]]:
    lat = cell[0] * CELL_DEG; lon = cell[1] * CELL_DEG / math.cos(math.radians(lat_ref)); h, w = CELL_DEG / 2, CELL_DEG / 2 / math.cos(math.radians(lat_ref))
    return [[lon - w, lat - h], [lon + w, lat - h], [lon + w, lat + h], [lon - w, lat + h], [lon - w, lat - h]]


def _area(cells: int, lat: float) -> float:
    return round(cells * (CELL_DEG * 111.32) ** 2 * math.cos(math.radians(lat)), 2)


def passes_of(group: list[dict]) -> list[list[dict]]:
    g = sorted(group, key=lambda d: d["t"]); out: list[list[dict]] = []
    for d in g:
        if out and (d["t"] - out[-1][-1]["t"]) <= timedelta(hours=PASS_GAP_H): out[-1].append(d)
        else: out.append([d])
    return out


def describe(group: list[dict], now: datetime, places=None, with_geometry: bool = False) -> dict:
    """One fire: facts, status, growth and nearby places. `places(lat, lon, km)` returns dicts with name, kind, lat, lon."""
    ps = passes_of(group); g = sorted(group, key=lambda d: d["t"]); lat = sum(d["lat"] for d in g) / len(g); lon = sum(d["lon"] for d in g) / len(g)
    seen: list[dict] = []; seen_cells: set[tuple[int, int]] = set(); rows = []; geo = []; last_growth = None
    for k, p in enumerate(ps):
        new = [d for d in p if not seen or all(km(d["lat"], d["lon"], o["lat"], o["lon"]) > NEW_KM for o in seen)]
        fresh = {_cell(d["lat"], d["lon"]) for d in p} - seen_cells
        if k > 0 and new: last_growth = (k, [dict(o) for o in seen], new)
        seen_cells |= fresh; seen += p
        rows.append({"t": p[0]["t"].isoformat(), "n": len(p), "n_new": len(new), "area_km2": _area(len(seen_cells), lat)})
        if with_geometry: geo.append({"t": p[0]["t"].isoformat(), "rings": [cell_ring(c, lat) for c in sorted(fresh)]})
    last = ps[-1]; age_h = (now - g[-1]["t"]).total_seconds() / 3600; grew_last = len(ps) > 1 and rows[-1]["n_new"] > 0
    status = "out" if age_h > OUT_AFTER_H else "new" if len(ps) == 1 else "growing" if grew_last else "steady"
    toward = None
    if last_growth:
        _, old, new = last_growth; ol, oo = sum(d["lat"] for d in old) / len(old), sum(d["lon"] for d in old) / len(old); nl, no = sum(d["lat"] for d in new) / len(new), sum(d["lon"] for d in new) / len(new)
        if km(ol, oo, nl, no) >= 0.3: toward = bearing(ol, oo, nl, no)
    lats, lons = [d["lat"] for d in g], [d["lon"] for d in g]
    near = []
    for pl in (places(lat, lon, REACH_KM + 3) if places else []):
        edge = min(km(pl["lat"], pl["lon"], d["lat"], d["lon"]) for d in g)
        if edge > REACH_KM: continue
        b = bearing(lat, lon, pl["lat"], pl["lon"])
        near.append({"name": pl["name"], "kind": pl["kind"], "lat": pl["lat"], "lon": pl["lon"], "km": round(edge, 1), "bearing": compass(b), "on_side": toward is not None and angle_between(b, toward) <= SIDE_DEG})
    near.sort(key=lambda x: (x["km"], x["name"])); near = near[:8]
    out = {"id": fire_id(g[0]), "lat": round(lat, 4), "lon": round(lon, 4), "bbox": [min(lons), min(lats), max(lons), max(lats)], "first_seen": g[0]["t"].isoformat(), "last_seen": g[-1]["t"].isoformat(),
           "age_h": round(age_h, 1), "n_det": len(g), "n_passes": len(ps), "area_km2": rows[-1]["area_km2"], "frp_sum": round(sum(d.get("frp") or 0 for d in g), 1), "status": status,
           "kind": "likely" if any(d.get("grp") == "likely" for d in g) else "unconfirmed", "grew_toward": compass(toward) if toward is not None else None, "grew_deg": round(toward) if toward is not None else None,
           "passes": rows, "places": near, "nearest": near[0] if near else None,
           "multi": len(ps) > 1 or len(g) >= 3}
    if with_geometry: out["footprints"] = geo; out["detections"] = [{"t": d["t"].isoformat(), "lat": d["lat"], "lon": d["lon"], "frp": d.get("frp")} for d in g]
    return out


def attention(f: dict, tasked: bool = False) -> float:
    """Order for the board: growing first, then a village close to the edge (more when it is on the side the fire grew toward), then size; fires no one has a task for before those with one."""
    s = {"growing": 40, "new": 15, "steady": 12, "out": 0}[f["status"]] + (8 if f["kind"] == "likely" else 0)
    n = f.get("nearest")
    if n and n["km"] <= 2: s += 20 + (10 if n["on_side"] else 0)
    s += min(f["area_km2"], 10) + min(f["n_passes"], 5)
    return s + (0 if tasked else 6) if f["status"] != "out" else s


def sentence_key(f: dict) -> str:
    return f["status"]


def build(dets: list[dict], now: datetime, places=None, marks: dict | None = None, tasked: set | None = None) -> list[dict]:
    """All fires of the window, with the fire marks applied (a fire marked handled, out or not a forest fire is closed until a detection newer than the mark arrives)."""
    marks = marks or {}; tasked = tasked or set(); out = []
    for group in link(dets):
        f = describe(group, now, places); m = marks.get(f["id"])
        if m:
            f["mark"] = {"status": m["status"], "at": m["at"].isoformat() if hasattr(m["at"], "isoformat") else m["at"]}
            f["closed"] = m["status"] in ("handled", "out", "not_forest_fire") and group and max(d["t"] for d in group) <= m["at"]
        else: f["closed"] = False
        f["tasked"] = f["id"] in tasked; f["attention"] = round(attention(f, f["tasked"]), 1); out.append(f)
    out.sort(key=lambda f: -f["attention"])
    return out
