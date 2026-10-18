#!/usr/bin/env python3
"""Prepare a compact "area pack" for the what-if fire spread engine.

One command per location:

    python scripts/whatif/prepare_area.py --name similipal \
        --center-lat 21.8679 --center-lon 86.5007 --size-km 10 --cell-m 30 \
        --out-dir frontend/public/whatif/similipal

Inputs (all open data, nothing synthetic):
  * Copernicus GLO-30 DEM (AWS Open Data, COG tiles, 1 degree)
  * ESA WorldCover 2021 v200 (AWS Open Data, COG tiles, 3 degree)
  * OpenStreetMap (Overpass API, or the OSM API map call as fallback)

Outputs in --out-dir:
  manifest.json   georeference, file list with sha256/bytes, sources, licences
  elevation.i16   little-endian Int16 metres, row-major, first row = NORTH row
  landcover.u8    ESA WorldCover class codes (uint8), same layout, 0 = no data
  assets.json     GeoJSON FeatureCollection (villages, roads, water), lon/lat

Grid conventions: north-up, cells are squares of cellSizeM in the local UTM
zone, row 0 is the northernmost row, col 0 the westernmost column, value index
= row * width + col. originX/originY are the UTM coordinates (metres) of the
TOP-LEFT CORNER of cell (0,0); the centre of cell (c,r) is
(originX + (c+0.5)*cell, originY - (r+0.5)*cell).

The resampling/encoding/clipping steps are pure functions (numpy only, plus
pyproj for coordinate transforms) so they can be tested on synthetic rasters.
Network and rasterio are only used in the `read_*`/`fetch_*` functions.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
from pyproj import Transformer

TOOL_NAME = "prepare_area.py"
TOOL_SCHEMA = 1
NODATA_I16 = -32768
WORLDCOVER_CODES = (10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100)
SIZE_CAP_BYTES = 5 * 1024 * 1024
USER_AGENT = "resq-whatif-prepare-area/1 (offline data prep; contact: project maintainers)"

OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
OSM_API = "https://api.openstreetmap.org/api/0.6/map"

PLACE_VALUES = ("village", "hamlet", "town", "city", "isolated_dwelling")
# Roads worth routing/evacuation planning; footways, steps etc. are left out.
HIGHWAY_VALUES = (
    "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
    "residential", "service", "track", "road", "living_street",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
)
WATERWAY_VALUES = ("river", "stream", "canal", "drain", "ditch")

WORLDCOVER_NAMES = {
    10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland",
    50: "Built-up", 60: "Bare / sparse vegetation", 70: "Snow and ice",
    80: "Permanent water bodies", 90: "Herbaceous wetland", 95: "Mangroves",
    100: "Moss and lichen",
}


# ----------------------------------------------------------------------------
# Grid geometry (pure)
# ----------------------------------------------------------------------------

def utm_epsg(lat: float, lon: float) -> int:
    """EPSG code of the WGS84 UTM zone containing the point."""
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    zone = max(1, min(60, zone))
    return (32600 if lat >= 0 else 32700) + zone


def make_grid_spec(center_lat: float, center_lon: float, size_km: float, cell_m: float) -> dict:
    """Square grid centred on the point, in the local UTM zone.

    Width/height are ceil(size/cell) so the grid covers at least size_km. The
    origin is snapped to a multiple of cell_m so packs of the same cell size
    share a lattice.
    """
    if size_km <= 0 or cell_m <= 0:
        raise ValueError("size_km and cell_m must be positive")
    epsg = utm_epsg(center_lat, center_lon)
    fwd = Transformer.from_crs(4326, epsg, always_xy=True)
    cx, cy = fwd.transform(center_lon, center_lat)
    n = int(math.ceil(size_km * 1000.0 / cell_m - 1e-9))
    half = n * cell_m / 2.0
    origin_x = math.floor((cx - half) / cell_m + 0.5) * cell_m
    origin_y = math.floor((cy + half) / cell_m + 0.5) * cell_m
    return {
        "epsg": epsg, "originX": origin_x, "originY": origin_y,
        "width": n, "height": n, "cellSizeM": float(cell_m),
        "centerLat": center_lat, "centerLon": center_lon,
    }


def cell_centres_utm(spec: dict) -> tuple[np.ndarray, np.ndarray]:
    """(xs[width], ys[height]) UTM coordinates of cell centres."""
    c = spec["cellSizeM"]
    xs = spec["originX"] + (np.arange(spec["width"]) + 0.5) * c
    ys = spec["originY"] - (np.arange(spec["height"]) + 0.5) * c
    return xs, ys


def grid_extent_utm(spec: dict) -> tuple[float, float, float, float]:
    """(xmin, ymin, xmax, ymax) of the grid edge in UTM metres."""
    c = spec["cellSizeM"]
    return (spec["originX"], spec["originY"] - spec["height"] * c,
            spec["originX"] + spec["width"] * c, spec["originY"])


def grid_corners_lonlat(spec: dict) -> dict:
    """Corner lon/lat of the grid edge: nw, ne, se, sw."""
    xmin, ymin, xmax, ymax = grid_extent_utm(spec)
    inv = Transformer.from_crs(spec["epsg"], 4326, always_xy=True)
    out = {}
    for k, (x, y) in {"nw": (xmin, ymax), "ne": (xmax, ymax),
                      "se": (xmax, ymin), "sw": (xmin, ymin)}.items():
        lon, lat = inv.transform(x, y)
        out[k] = {"lon": lon, "lat": lat}
    return out


def grid_lonlat_bounds(spec: dict, margin_deg: float = 0.0) -> tuple[float, float, float, float]:
    """(west, south, east, north) bounding box of the grid in lon/lat."""
    c = grid_corners_lonlat(spec)
    lons = [v["lon"] for v in c.values()]
    lats = [v["lat"] for v in c.values()]
    return (min(lons) - margin_deg, min(lats) - margin_deg,
            max(lons) + margin_deg, max(lats) + margin_deg)


def cell_centres_lonlat(spec: dict) -> tuple[np.ndarray, np.ndarray]:
    """(lon[h,w], lat[h,w]) of every cell centre."""
    xs, ys = cell_centres_utm(spec)
    X, Y = np.meshgrid(xs, ys)
    inv = Transformer.from_crs(spec["epsg"], 4326, always_xy=True)
    lon, lat = inv.transform(X, Y)
    return np.asarray(lon), np.asarray(lat)


# ----------------------------------------------------------------------------
# Resampling (pure, geographic north-up sources)
# ----------------------------------------------------------------------------

def resample_geographic(src: np.ndarray, src_origin_lon: float, src_origin_lat: float,
                        src_dlon: float, src_dlat: float, lon: np.ndarray, lat: np.ndarray,
                        method: str) -> np.ndarray:
    """Sample a north-up EPSG:4326 raster at the given lon/lat points.

    src_origin_* is the outer top-left corner of pixel (0,0); src_dlon/src_dlat
    are positive pixel sizes in degrees. method is "nearest" or "bilinear".
    Points outside the raster give NaN. Bilinear uses only valid (finite)
    neighbours (weights renormalised); NaN only if none is valid.
    """
    fc = (lon - src_origin_lon) / src_dlon - 0.5   # fractional column of pixel centres
    fr = (src_origin_lat - lat) / src_dlat - 0.5
    h, w = src.shape
    inside = (fc > -0.5) & (fc < w - 0.5) & (fr > -0.5) & (fr < h - 0.5)
    out = np.full(lon.shape, np.nan, dtype=np.float64)
    if method == "nearest":
        c = np.clip(np.rint(fc).astype(np.int64), 0, w - 1)
        r = np.clip(np.rint(fr).astype(np.int64), 0, h - 1)
        out = src[r, c].astype(np.float64)
        out[~inside] = np.nan
        return out
    if method != "bilinear":
        raise ValueError(f"unknown method {method}")
    c0 = np.clip(np.floor(fc).astype(np.int64), 0, w - 1)
    r0 = np.clip(np.floor(fr).astype(np.int64), 0, h - 1)
    c1 = np.clip(c0 + 1, 0, w - 1)
    r1 = np.clip(r0 + 1, 0, h - 1)
    tx = np.clip(fc - c0, 0.0, 1.0)
    ty = np.clip(fr - r0, 0.0, 1.0)
    acc = np.zeros(lon.shape)
    wsum = np.zeros(lon.shape)
    for rr, cc, wt in ((r0, c0, (1 - tx) * (1 - ty)), (r0, c1, tx * (1 - ty)),
                       (r1, c0, (1 - tx) * ty), (r1, c1, tx * ty)):
        v = src[rr, cc].astype(np.float64)
        ok = np.isfinite(v)
        acc += np.where(ok, v * wt, 0.0)
        wsum += np.where(ok, wt, 0.0)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(wsum > 0, acc / wsum, np.nan)
    out[~inside] = np.nan
    return out


def combine_first_valid(layers: list[np.ndarray]) -> np.ndarray:
    """Fill NaNs of the first layer from later layers (tile mosaicking)."""
    out = layers[0].copy()
    for nxt in layers[1:]:
        m = np.isnan(out)
        out[m] = nxt[m]
    return out


# ----------------------------------------------------------------------------
# Encoding (pure)
# ----------------------------------------------------------------------------

def elevation_to_i16(elev: np.ndarray) -> tuple[np.ndarray, int]:
    """Round to whole metres, NaN -> -32768. Returns (int16 array, void count)."""
    void = ~np.isfinite(elev)
    out = np.where(void, NODATA_I16, np.clip(np.rint(np.nan_to_num(elev)), -32767, 32767))
    return out.astype("<i2"), int(void.sum())


def landcover_to_u8(lc: np.ndarray) -> tuple[np.ndarray, int]:
    """Keep only valid WorldCover codes; anything else (incl. NaN) becomes 0."""
    arr = np.nan_to_num(lc, nan=0.0)
    rounded = np.rint(arr).astype(np.int64)
    valid = np.isin(rounded, WORLDCOVER_CODES)
    out = np.where(valid, rounded, 0).astype(np.uint8)
    return out, int((~valid).sum())


def encode_i16_le(a: np.ndarray) -> bytes:
    return np.ascontiguousarray(a, dtype="<i2").tobytes()


def decode_i16_le(b: bytes, width: int, height: int) -> np.ndarray:
    return np.frombuffer(b, dtype="<i2").reshape(height, width)


def encode_u8(a: np.ndarray) -> bytes:
    return np.ascontiguousarray(a, dtype=np.uint8).tobytes()


def decode_u8(b: bytes, width: int, height: int) -> np.ndarray:
    return np.frombuffer(b, dtype=np.uint8).reshape(height, width)


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def class_histogram(lc_u8: np.ndarray) -> dict:
    vals, counts = np.unique(lc_u8, return_counts=True)
    return {str(int(v)): int(c) for v, c in zip(vals, counts)}


# ----------------------------------------------------------------------------
# Tiles (pure)
# ----------------------------------------------------------------------------

def _ns(lat: int) -> str:
    return f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}"


def _ew(lon: int, width: int = 3) -> str:
    return f"{'E' if lon >= 0 else 'W'}{abs(lon):0{width}d}"


def dem_tile_name(lat_floor: int, lon_floor: int) -> str:
    return f"Copernicus_DSM_COG_10_{_ns(lat_floor)}_00_{_ew(lon_floor)}_00_DEM"


def dem_tile_url(lat_floor: int, lon_floor: int) -> str:
    n = dem_tile_name(lat_floor, lon_floor)
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif"


def worldcover_tile_name(lat_floor3: int, lon_floor3: int) -> str:
    return f"ESA_WorldCover_10m_2021_v200_{_ns(lat_floor3)}{_ew(lon_floor3)}_Map"


def worldcover_tile_url(lat_floor3: int, lon_floor3: int) -> str:
    return ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
            f"{worldcover_tile_name(lat_floor3, lon_floor3)}.tif")


def tiles_for_bounds(bounds, step: int) -> list[tuple[int, int]]:
    """(lat_floor, lon_floor) of every step-degree tile touching the bounds."""
    w, s, e, n = bounds
    la0 = int(math.floor(s / step)) * step
    la1 = int(math.floor(n / step)) * step
    lo0 = int(math.floor(w / step)) * step
    lo1 = int(math.floor(e / step)) * step
    return [(la, lo) for la in range(la0, la1 + 1, step) for lo in range(lo0, lo1 + 1, step)]


# ----------------------------------------------------------------------------
# Vector geometry (pure, planar metres)
# ----------------------------------------------------------------------------

def clip_polyline(pts, xmin, ymin, xmax, ymax):
    """Clip a polyline to a rectangle (Liang-Barsky). Returns list of polylines."""
    out, cur = [], []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        t0, t1 = 0.0, 1.0
        ok = True
        for p, q in ((-dx, x0 - xmin), (dx, xmax - x0), (-dy, y0 - ymin), (dy, ymax - y0)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                r = q / p
                if p < 0:
                    if r > t1:
                        ok = False
                        break
                    t0 = max(t0, r)
                else:
                    if r < t0:
                        ok = False
                        break
                    t1 = min(t1, r)
        if not ok:
            if len(cur) >= 2:
                out.append(cur)
            cur = []
            continue
        a = (x0 + t0 * dx, y0 + t0 * dy)
        b = (x0 + t1 * dx, y0 + t1 * dy)
        if cur and cur[-1] == a:
            cur.append(b)
        else:
            if len(cur) >= 2:
                out.append(cur)
            cur = [a, b]
        if t1 < 1.0:
            out.append(cur)
            cur = []
    if len(cur) >= 2:
        out.append(cur)
    return out


def clip_polygon(ring, xmin, ymin, xmax, ymax):
    """Sutherland-Hodgman clip of a ring (no repeated closing vertex)."""
    def clip(poly, inside, inter):
        res = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            ci, pi = inside(cur), inside(prev)
            if ci:
                if not pi:
                    res.append(inter(prev, cur))
                res.append(cur)
            elif pi:
                res.append(inter(prev, cur))
        return res

    def ix(xc):
        return lambda a, b: (xc, a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]))

    def iy(yc):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (yc - a[1]) / (b[1] - a[1]), yc)

    poly = list(ring)
    for inside, inter in (
        (lambda p: p[0] >= xmin, ix(xmin)), (lambda p: p[0] <= xmax, ix(xmax)),
        (lambda p: p[1] >= ymin, iy(ymin)), (lambda p: p[1] <= ymax, iy(ymax)),
    ):
        if not poly:
            break
        poly = clip(poly, inside, inter)
    return poly if len(poly) >= 3 else []


def simplify_dp(pts, tol):
    """Douglas-Peucker (iterative). Keeps endpoints."""
    n = len(pts)
    if n < 3 or tol <= 0:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def simplify_to_cap(lines: list, cap: int, start_tol: float = 2.0, min_vertices: int = 2):
    """Simplify every line, raising the tolerance until total vertices <= cap.

    Returns (lines, tolerance_used). Lines that collapse below min_vertices are
    dropped. If even a huge tolerance cannot meet the cap, lines are dropped
    shortest-first (never silently: the caller records the counts).
    """
    tol = start_tol
    for _ in range(40):
        simp = [simplify_dp(l, tol) for l in lines]
        simp = [l for l in simp if len(l) >= min_vertices]
        if sum(len(l) for l in simp) <= cap:
            return simp, tol
        tol *= 1.6
    simp.sort(key=lambda l: -len(l))
    while simp and sum(len(l) for l in simp) > cap:
        simp.pop()
    return simp, tol


# ----------------------------------------------------------------------------
# OpenStreetMap (parse is pure; fetch uses the network)
# ----------------------------------------------------------------------------

def parse_osm_xml(xml_bytes: bytes) -> dict:
    """Parse OSM XML (API map call or Overpass [out:xml]) into plain dicts."""
    nodes, ways, rels = {}, {}, {}
    root = ET.fromstring(xml_bytes)
    for el in root:
        if el.tag == "node":
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            nodes[int(el.get("id"))] = (float(el.get("lon")), float(el.get("lat")), tags)
        elif el.tag == "way":
            ways[int(el.get("id"))] = {
                "nodes": [int(n.get("ref")) for n in el.findall("nd")],
                "tags": {t.get("k"): t.get("v") for t in el.findall("tag")},
            }
        elif el.tag == "relation":
            rels[int(el.get("id"))] = {
                "members": [(m.get("type"), int(m.get("ref")), m.get("role")) for m in el.findall("member")],
                "tags": {t.get("k"): t.get("v") for t in el.findall("tag")},
            }
    return {"nodes": nodes, "ways": ways, "relations": rels}


def merge_osm(a: dict, b: dict) -> dict:
    for k in ("nodes", "ways", "relations"):
        a[k].update(b[k])
    return a


def classify_osm(osm: dict) -> dict:
    """Pick villages (points), roads (lines), water (lines/rings) in lon/lat.

    Returns {"villages": [...], "roads": [...], "water_lines": [...],
    "water_rings": [...]} with each item a dict carrying osm id and tags of
    interest. Relations: only member ways with role outer/inner of
    natural=water multipolygons are used, as their own rings/lines (relations
    are not stitched; documented limitation).
    """
    nodes, ways, rels = osm["nodes"], osm["ways"], osm["relations"]

    def coords(way):
        return [(nodes[n][0], nodes[n][1]) for n in way["nodes"] if n in nodes]

    villages, roads, wlines, wrings = [], [], [], []
    for nid, (lon, lat, tags) in nodes.items():
        p = tags.get("place")
        if p in PLACE_VALUES:
            villages.append({"id": f"node/{nid}", "lon": lon, "lat": lat,
                             "name": tags.get("name") or tags.get("name:en") or "",
                             "place": p})
    water_member_ways = set()
    for rid, rel in rels.items():
        if rel["tags"].get("natural") == "water":
            for typ, ref, role in rel["members"]:
                if typ == "way" and role in ("outer", "inner", ""):
                    water_member_ways.add(ref)
    for wid, way in ways.items():
        t = way["tags"]
        pts = coords(way)
        if len(pts) < 2:
            continue
        closed = way["nodes"][0] == way["nodes"][-1] and len(pts) >= 4
        if t.get("highway") in HIGHWAY_VALUES:
            roads.append({"id": f"way/{wid}", "pts": pts, "highway": t["highway"],
                          "name": t.get("name", "")})
        elif t.get("natural") == "water" or wid in water_member_ways:
            if closed:
                wrings.append({"id": f"way/{wid}", "pts": pts[:-1], "name": t.get("name", "")})
            else:
                wlines.append({"id": f"way/{wid}", "pts": pts, "kind": "partial-water-outline",
                               "name": t.get("name", "")})
        elif t.get("waterway") in WATERWAY_VALUES:
            wlines.append({"id": f"way/{wid}", "pts": pts, "kind": t["waterway"],
                           "name": t.get("name", "")})
        # village polygons (place=* on ways) -> centroid point
        p = t.get("place")
        if p in PLACE_VALUES and closed:
            xs = [q[0] for q in pts[:-1]]
            ys = [q[1] for q in pts[:-1]]
            villages.append({"id": f"way/{wid}", "lon": sum(xs) / len(xs), "lat": sum(ys) / len(ys),
                             "name": t.get("name", ""), "place": p})
    return {"villages": villages, "roads": roads, "water_lines": wlines, "water_rings": wrings}


def build_assets(classified: dict, spec: dict, road_cap: int = 15000, water_cap: int = 8000) -> tuple[dict, dict]:
    """Clip to the grid square, simplify, cap vertices; GeoJSON in lon/lat.

    Returns (geojson dict, stats dict).
    """
    fwd = Transformer.from_crs(4326, spec["epsg"], always_xy=True)
    inv = Transformer.from_crs(spec["epsg"], 4326, always_xy=True)
    xmin, ymin, xmax, ymax = grid_extent_utm(spec)

    def to_xy(pts):
        xs, ys = fwd.transform([p[0] for p in pts], [p[1] for p in pts])
        return list(zip(xs, ys))

    def to_ll(pts):
        xs, ys = inv.transform([p[0] for p in pts], [p[1] for p in pts])
        return [[round(float(x), 5), round(float(y), 5)] for x, y in zip(xs, ys)]

    feats, stats = [], {}
    nv = 0
    for v in classified["villages"]:
        x, y = fwd.transform(v["lon"], v["lat"])
        if xmin <= x <= xmax and ymin <= y <= ymax:
            nv += 1
            feats.append({"type": "Feature", "id": v["id"],
                          "properties": {"kind": "village", "name": v["name"], "place": v["place"]},
                          "geometry": {"type": "Point",
                                       "coordinates": [round(v["lon"], 5), round(v["lat"], 5)]}})
    stats["villages"] = nv

    def line_group(items, cap, kind):
        segs = []   # (item, xy polyline)
        for it in items:
            for part in clip_polyline(to_xy(it["pts"]), xmin, ymin, xmax, ymax):
                segs.append((it, part))
        before = sum(len(p) for _, p in segs)
        # simplify each, shared tolerance chosen to meet the cap
        simp, tol = simplify_to_cap([p for _, p in segs], cap)
        # re-associate: simplify_to_cap may drop lines, so redo per-line with final tol
        out = []
        for it, p in segs:
            s = simplify_dp(p, tol)
            if len(s) >= 2:
                out.append((it, s))
        # enforce cap strictly (drop shortest if needed)
        total = sum(len(s) for _, s in out)
        if total > cap:
            out.sort(key=lambda a: -len(a[1]))
            while out and sum(len(s) for _, s in out) > cap:
                out.pop()
        return out, before, tol

    road_out, rb, rtol = line_group(classified["roads"], road_cap, "road")
    for it, s in road_out:
        feats.append({"type": "Feature", "id": it["id"],
                      "properties": {"kind": "road", "highway": it["highway"], "name": it["name"]},
                      "geometry": {"type": "LineString", "coordinates": to_ll(s)}})
    stats["roadFeatures"] = len(road_out)
    stats["roadVertices"] = sum(len(s) for _, s in road_out)
    stats["roadVerticesBeforeSimplify"] = rb
    stats["roadSimplifyToleranceM"] = round(rtol, 2)

    wl_out, wb, wtol = line_group(classified["water_lines"], water_cap // 2, "water")
    for it, s in wl_out:
        feats.append({"type": "Feature", "id": it["id"],
                      "properties": {"kind": "water", "waterway": it["kind"], "name": it["name"]},
                      "geometry": {"type": "LineString", "coordinates": to_ll(s)}})
    rings = []
    for it in classified["water_rings"]:
        ring = clip_polygon(to_xy(it["pts"]), xmin, ymin, xmax, ymax)
        if ring:
            rings.append((it, ring))
    ring_budget = water_cap - sum(len(s) for _, s in wl_out)
    simp_rings, rtol2 = simplify_to_cap([r + [r[0]] for _, r in rings], max(ring_budget, 4), min_vertices=4) \
        if rings else ([], 0.0)
    # map back by recomputing with final tolerance (keeps association)
    n_rings = 0
    for it, r in rings:
        s = simplify_dp(r + [r[0]], rtol2)
        if len(s) >= 4:
            n_rings += 1
            feats.append({"type": "Feature", "id": it["id"],
                          "properties": {"kind": "water", "waterway": "area", "name": it["name"]},
                          "geometry": {"type": "Polygon", "coordinates": [to_ll(s)]}})
    stats["waterLineFeatures"] = len(wl_out)
    stats["waterPolygons"] = n_rings
    stats["waterFeatures"] = len(wl_out) + n_rings
    stats["waterVertices"] = sum(len(s) for _, s in wl_out) + sum(
        len(simplify_dp(r + [r[0]], rtol2)) for _, r in rings
        if len(simplify_dp(r + [r[0]], rtol2)) >= 4)
    gj = {
        "type": "FeatureCollection",
        "attribution": "Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright",
        "features": feats,
    }
    return gj, stats


def _http(url: str, data: bytes | None = None, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def overpass_query(bounds) -> str:
    w, s, e, n = bounds
    bb = f"{s:.5f},{w:.5f},{n:.5f},{e:.5f}"
    return (
        "[out:xml][timeout:90];("
        f'node["place"~"^({"|".join(PLACE_VALUES)})$"]({bb});'
        f'way["place"~"^({"|".join(PLACE_VALUES)})$"]({bb});'
        f'way["highway"]({bb});way["natural"="water"]({bb});way["waterway"]({bb});'
        f'relation["natural"="water"]({bb});'
        ");(._;>;);out body;"
    )


def fetch_osm(bounds, osm_file: str | None = None, log=print) -> tuple[dict, dict]:
    """Return (osm dict, source description). Order: --osm-file, Overpass, OSM API."""
    if osm_file:
        data = Path(osm_file).read_bytes()
        return parse_osm_xml(data), {"endpoint": f"file:{osm_file}", "method": "local OSM XML"}
    q = overpass_query(bounds).encode()
    errors = []
    for ep in OVERPASS_ENDPOINTS:
        try:
            data = _http(ep, data=urllib.parse.urlencode({"data": q.decode()}).encode(), timeout=150)
            osm = parse_osm_xml(data)
            log(f"  OSM via Overpass {ep}: {len(osm['nodes'])} nodes, {len(osm['ways'])} ways")
            return osm, {"endpoint": ep, "method": "Overpass API (out:xml)"}
        except Exception as ex:  # noqa: BLE001 - recorded, then fall through
            errors.append(f"{ep}: {type(ex).__name__} {str(ex)[:80]}")
            log(f"  Overpass failed: {errors[-1]}")
    # Fallback: OSM API map call, tiled so each request is < 0.25 sq deg and polite.
    w, s, e, n = bounds
    step = 0.1
    osm = {"nodes": {}, "ways": {}, "relations": {}}
    la = s
    try:
        while la < n:
            lo = w
            while lo < e:
                bb = f"{lo:.5f},{la:.5f},{min(lo + step, e):.5f},{min(la + step, n):.5f}"
                data = _http(f"{OSM_API}?bbox={bb}", timeout=120)
                merge_osm(osm, parse_osm_xml(data))
                time.sleep(1.0)
                lo += step
            la += step
    except Exception as ex:  # noqa: BLE001
        errors.append(f"{OSM_API}: {type(ex).__name__} {str(ex)[:80]}")
        raise RuntimeError("OpenStreetMap unreachable: " + "; ".join(errors)) from ex
    log(f"  OSM via OSM API map call: {len(osm['nodes'])} nodes, {len(osm['ways'])} ways")
    return osm, {"endpoint": OSM_API, "method": "OSM API 0.6 map call (Overpass endpoints failed: "
                 + "; ".join(errors) + ")"}


# ----------------------------------------------------------------------------
# Raster sources (network; rasterio)
# ----------------------------------------------------------------------------

def read_cog_window(url: str, bounds, margin_deg: float = 0.002):
    """Read the window of a geographic COG covering bounds (+margin).

    Returns (array float64 with NaN for nodata, origin_lon, origin_lat, dlon, dlat)
    or None if the tile does not exist (HTTP 404/403 => ocean tile).
    """
    import rasterio
    from rasterio.windows import from_bounds
    env = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
           "GDAL_HTTP_MAX_RETRY": "3", "GDAL_HTTP_RETRY_DELAY": "2"}
    ca = os.environ.get("CURL_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if ca:
        env["GDAL_HTTP_CAINFO"] = ca
    w, s, e, n = bounds
    with rasterio.Env(**env):
        try:
            ds = rasterio.open("/vsicurl/" + url)
        except rasterio.errors.RasterioIOError as ex:
            if "404" in str(ex) or "not recognized" in str(ex) or "No such file" in str(ex):
                return None
            raise
        with ds:
            t = ds.transform
            win = from_bounds(w - margin_deg, s - margin_deg, e + margin_deg, n + margin_deg, t)
            c0, r0 = int(math.floor(win.col_off)), int(math.floor(win.row_off))
            c1, r1 = int(math.ceil(win.col_off + win.width)), int(math.ceil(win.row_off + win.height))
            c0, r0 = max(c0, 0), max(r0, 0)
            c1, r1 = min(c1, ds.width), min(r1, ds.height)
            if c1 <= c0 or r1 <= r0:
                return None
            win = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0)
            arr = ds.read(1, window=win).astype(np.float64)
            nd = ds.nodata
            if nd is not None:
                arr[arr == nd] = np.nan
            wt = ds.window_transform(win)
            return arr, wt.c, wt.f, abs(wt.a), abs(wt.e)


def sample_layer(spec: dict, tiles: list[str], method: str, log=print):
    """Read all tiles and resample onto the grid; returns (array, tiles_used)."""
    bounds = grid_lonlat_bounds(spec)
    lon, lat = cell_centres_lonlat(spec)
    layers, used = [], []
    for url in tiles:
        log(f"  reading {url}")
        got = read_cog_window(url, bounds)
        if got is None:
            log("    (tile absent: treated as no data)")
            continue
        arr, olon, olat, dlon, dlat = got
        layers.append(resample_geographic(arr, olon, olat, dlon, dlat, lon, lat, method))
        used.append(url)
    if not layers:
        raise RuntimeError("no raster tile available for this area: " + ", ".join(tiles))
    return combine_first_valid(layers), used


# ----------------------------------------------------------------------------
# Manifest (pure)
# ----------------------------------------------------------------------------

def file_entry(name: str, data: bytes, description: str, **extra) -> dict:
    d = {"name": name, "bytes": len(data), "sha256": sha256_hex(data), "description": description}
    d.update(extra)
    return d


def build_manifest(name: str, spec: dict, files: list[dict], sources: list[dict],
                   stats: dict, build_time: str | None = None, versions: dict | None = None) -> dict:
    return {
        "schema": "resq-whatif-area-pack/1",
        "name": name,
        "center": {"lat": spec["centerLat"], "lon": spec["centerLon"]},
        "crs": {"epsg": spec["epsg"], "description": f"WGS 84 / UTM zone, EPSG:{spec['epsg']}"},
        "grid": {
            "originX": spec["originX"], "originY": spec["originY"],
            "originMeaning": "UTM metres of the TOP-LEFT CORNER of cell (col 0, row 0)",
            "width": spec["width"], "height": spec["height"], "cellSizeM": spec["cellSizeM"],
            "orientation": "north-up; row 0 is the northernmost row; col 0 the westernmost; index = row*width + col",
            "cellCentre": "x = originX + (col+0.5)*cellSizeM ; y = originY - (row+0.5)*cellSizeM",
            "extentKm": [spec["width"] * spec["cellSizeM"] / 1000.0, spec["height"] * spec["cellSizeM"] / 1000.0],
        },
        "cornersLonLat": grid_corners_lonlat(spec),
        "files": files,
        "totalBytes": sum(f["bytes"] for f in files),
        "compression": "none (files are raw; the browser can fetch them directly)",
        "sources": sources,
        "stats": stats,
        "syntheticInputs": "none",
        "statement": "Synthetic inputs: none. Spread rates are not part of this pack; the engine "
                     "assigns uncalibrated spread assumptions to land-cover classes.",
        "buildTime": build_time or _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "toolVersions": versions or {},
    }


def verify_manifest(out_dir: Path) -> list[str]:
    """Return a list of problems (empty if every file matches the manifest)."""
    out_dir = Path(out_dir)
    m = json.loads((out_dir / "manifest.json").read_text())
    problems = []
    for f in m["files"]:
        p = out_dir / f["name"]
        if not p.exists():
            problems.append(f"missing {f['name']}")
            continue
        b = p.read_bytes()
        if len(b) != f["bytes"]:
            problems.append(f"{f['name']}: size {len(b)} != {f['bytes']}")
        if sha256_hex(b) != f["sha256"]:
            problems.append(f"{f['name']}: sha256 mismatch")
    return problems


def tool_versions() -> dict:
    v = {"python": sys.version.split()[0], "numpy": np.__version__, TOOL_NAME: str(TOOL_SCHEMA)}
    try:
        import pyproj
        v["pyproj"] = pyproj.__version__
    except Exception:  # noqa: BLE001
        pass
    try:
        import rasterio
        v["rasterio"] = rasterio.__version__
        v["gdal"] = rasterio.__gdal_version__
    except Exception:  # noqa: BLE001
        pass
    return v


# ----------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------

def write_pack(out_dir: Path, name: str, spec: dict, elev_i16: np.ndarray, lc_u8: np.ndarray,
               assets: dict, sources: list[dict], stats: dict, build_time: str | None = None) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    eb = encode_i16_le(elev_i16)
    lb = encode_u8(lc_u8)
    ab = json.dumps(assets, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    files = [
        file_entry("elevation.i16", eb, "Int16 little-endian metres above the EGM2008 geoid (GLO-30 surface "
                   "model incl. canopy), row-major from the NORTH row; -32768 = no data",
                   dtype="int16", endianness="little", noData=NODATA_I16),
        file_entry("landcover.u8", lb, "ESA WorldCover 2021 v200 class codes, uint8, same layout as elevation; "
                   "0 = no data", dtype="uint8", classes={str(k): v for k, v in WORLDCOVER_NAMES.items()}),
        file_entry("assets.json", ab, "GeoJSON FeatureCollection in lon/lat: villages (Point), roads "
                   "(LineString, simplified), water (LineString/Polygon)", format="GeoJSON"),
    ]
    total = sum(f["bytes"] for f in files)
    if total > SIZE_CAP_BYTES:
        raise RuntimeError(f"area pack is {total} bytes, over the {SIZE_CAP_BYTES} byte cap")
    manifest = build_manifest(name, spec, files, sources, stats, build_time, tool_versions())
    mb = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")
    (out_dir / "elevation.i16").write_bytes(eb)
    (out_dir / "landcover.u8").write_bytes(lb)
    (out_dir / "assets.json").write_bytes(ab)
    (out_dir / "manifest.json").write_bytes(mb + b"\n")
    return manifest


def run(args) -> int:
    log = print
    spec = make_grid_spec(args.center_lat, args.center_lon, args.size_km, args.cell_m)
    log(f"Grid: EPSG:{spec['epsg']} {spec['width']}x{spec['height']} cells of {spec['cellSizeM']} m")
    bounds = grid_lonlat_bounds(spec)
    dem_tiles = [dem_tile_url(la, lo) for la, lo in tiles_for_bounds(bounds, 1)]
    wc_tiles = [worldcover_tile_url(la, lo) for la, lo in tiles_for_bounds(bounds, 3)]
    log("Elevation (Copernicus GLO-30)")
    elev, dem_used = sample_layer(spec, dem_tiles, "bilinear", log)
    log("Land cover (ESA WorldCover 2021 v200)")
    lc, wc_used = sample_layer(spec, wc_tiles, "nearest", log)
    elev_i16, voids = elevation_to_i16(elev)
    lc_u8, invalid = landcover_to_u8(lc)
    log("OpenStreetMap")
    osm, osm_src = fetch_osm(grid_lonlat_bounds(spec, 0.002), args.osm_file, log)
    classified = classify_osm(osm)
    assets, astats = build_assets(classified, spec, args.road_vertex_cap, args.water_vertex_cap)
    valid = elev_i16[elev_i16 != NODATA_I16]
    stats = {
        "elevationMinM": int(valid.min()) if valid.size else None,
        "elevationMaxM": int(valid.max()) if valid.size else None,
        "elevationVoidCells": voids,
        "landcoverHistogram": class_histogram(lc_u8),
        "landcoverNoDataCells": invalid,
        **astats,
    }
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    sources = [
        {"layer": "elevation", "name": "Copernicus DEM GLO-30 (COP-DEM_GLO-30, 2021 release)",
         "urls": dem_used, "licence": "Copernicus DEM licence (free, including commercial use, with attribution)",
         "attribution": "Contains modified Copernicus DEM GLO-30 data (c) DLR e.V. 2010-2014 and (c) Airbus Defence "
                        "and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved.",
         "resampling": "bilinear (valid neighbours only), geographic -> UTM at cell centres",
         "note": "Surface model: includes canopy and buildings; heights are above EGM2008 geoid."},
        {"layer": "landcover", "name": "ESA WorldCover 10 m 2021 v200", "urls": wc_used,
         "licence": "CC BY 4.0", "attribution": "(c) ESA WorldCover project 2021 / Contains modified Copernicus "
                                               "Sentinel data (2021) processed by ESA WorldCover consortium. CC BY 4.0.",
         "resampling": "nearest neighbour at cell centres (10 m source -> 30 m cell; no majority filter)",
         "note": "Land-cover class, not a fuel model."},
        {"layer": "assets", "name": "OpenStreetMap", "urls": [osm_src["endpoint"]], "method": osm_src["method"],
         "licence": "ODbL 1.0", "attribution": "(c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright",
         "retrieved": now, "note": "Completeness varies by region."},
    ]
    manifest = write_pack(Path(args.out_dir), args.name, spec, elev_i16, lc_u8, assets, sources, stats)
    probs = verify_manifest(Path(args.out_dir))
    if probs:
        log("VERIFY FAILED: " + "; ".join(probs))
        return 2
    log(f"Wrote {args.out_dir}: {manifest['totalBytes']} bytes in files; manifest verified")
    log(json.dumps(stats, indent=1))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True)
    ap.add_argument("--center-lat", type=float, required=True)
    ap.add_argument("--center-lon", type=float, required=True)
    ap.add_argument("--size-km", type=float, default=10.0)
    ap.add_argument("--cell-m", type=float, default=30.0)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--osm-file", help="use a local OSM XML file instead of the network")
    ap.add_argument("--road-vertex-cap", type=int, default=15000)
    ap.add_argument("--water-vertex-cap", type=int, default=8000)
    return run(ap.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
