"""RESQ-2 incident candidates from the staged VIIRS (FIRMS standard-processing) files.

Investigation only: reads local data, writes results/resq2_incident_candidates.csv and a
JSON summary. No simulation, no scoring of any model, no network access.

Method (fixed before looking at any simulation output):
  1. Load VIIRS 375 m detections, 2023-01-01..2024-12-31, both satellites, regions main+south,
     type 0 (presumed vegetation fire) only; every confidence class is kept and counted.
  2. Keep detections inside or within 7.1 km of a research-grid forest cell (tree fraction >= 0.20,
     the 17,764 cells of the model table) and take the state of the nearest such cell.
  3. Space-time connected components: link two detections if they are within LINK_KM on the ground
     with time scaled at LINK_KM / GAP_DAYS km per day (so a 3-day gap costs the full link distance).
  4. Per event: first overpass, ignition pixel (medoid of the first overpass), counts, extent.

Run with the system python3 (numpy, pandas, scipy, pyproj, pyhdf).
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import ConvexHull, cKDTree

WEBSITE = Path(__file__).resolve().parents[2]
FIRMS = Path("/Users/kireeti/wildfire-data/raw/_staging_firms")
GRID = Path("/Users/kireeti/wildfire-data/processed/grid.csv")
MCD = WEBSITE / "backend/runtime_data/mcd64a1"
WORLDCOVER = WEBSITE / "backend/runtime_data/simulation_demo/landcover/ESA_WorldCover_10m_2021_v200_N21E084_Map.tif"
GFS_PIXELS = Path("/Users/kireeti/wildfire-research/proposed-stage1/imagery/gfs_pixels.csv")
OUT_CSV = WEBSITE / "results/resq2_events_all.csv"
OUT_JSON = WEBSITE / "results/resq2_summary.json"

STATES = {"OD", "CG", "TS", "MP", "MH", "JH"}
YEARS = (2023, 2024)
LINK_KM, GAP_DAYS = 2.0, 3.0
STATE_MAX_KM = 7.1          # half-diagonal of a 5 km cell is 3.5 km; 7.1 allows one cell of slack
MIN_DETECTIONS = 5
VIIRS_PIXEL_KM2 = 0.375 * 0.375
MCD_PIXEL_M = 1_111_950.5196666666 / 2400      # true MCD64A1 pixel: tile width / 2400 (NOT 500 m)
R_SIN = 6_371_007.181
TILE_M = 1_111_950.5196666666
X0, Y0 = -20_015_109.354, 10_007_554.677


def load_viirs() -> pd.DataFrame:
    parts = []
    cols = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight", "type"]
    for path in sorted(FIRMS.glob("VIIRS_*_SP_*.csv")):
        year = int(re.search(r"_(\d{4})-\d\d-\d\d\.csv$", path.name).group(1))
        if year not in (2022, 2023, 2024, 2025):          # neighbours kept so events crossing New Year are whole
            continue
        d = pd.read_csv(path, usecols=cols, dtype={"confidence": str, "acq_time": int})
        d = d[(d.latitude >= 15.5) & (d.latitude <= 26.6) & (d.longitude >= 72.4) & (d.longitude <= 88.6)]
        if len(d):
            parts.append(d.assign(src=path.name))
    d = pd.concat(parts, ignore_index=True)
    d = d.drop_duplicates(["latitude", "longitude", "acq_date", "acq_time", "satellite"])
    return d


def main() -> None:
    raw = load_viirs()
    summary: dict[str, object] = {"rows_loaded_regions_main_south_2022_2025_bbox": int(len(raw))}
    raw["date"] = pd.to_datetime(raw.acq_date)
    in_years = raw[raw.date.dt.year.isin(YEARS)]
    summary["type_counts_2023_2024_bbox"] = {int(k): int(v) for k, v in in_years.type.value_counts().items()}
    summary["confidence_counts_type0_2023_2024_bbox"] = {k: int(v) for k, v in in_years[in_years.type == 0].confidence.value_counts().items()}
    d = raw[raw.type == 0].copy()

    proj = Transformer.from_crs(4326, 7755, always_xy=True)
    d["x"], d["y"] = proj.transform(d.longitude.values, d.latitude.values)
    d["t"] = (d.date - pd.Timestamp("1970-01-01")).dt.days + (d.acq_time // 100 + (d.acq_time % 100) / 60.0) / 24.0

    grid = pd.read_csv(GRID, usecols=["cell", "cx", "cy", "lon", "lat", "state", "role"])
    cells = grid[grid.role.notna() & grid.lon.notna()].copy()
    cells["x"], cells["y"] = proj.transform(cells.lon.values, cells.lat.values)
    tree = cKDTree(cells[["x", "y"]].values)
    dist, idx = tree.query(d[["x", "y"]].values, k=1)
    d["cell_dist_km"] = dist / 1000.0
    d["state"] = cells.state.values[idx]
    d["cell"] = cells.cell.values[idx]
    eq = Transformer.from_crs(4326, 6933, always_xy=True)
    ex, ey = eq.transform(d.longitude.values, d.latitude.values)
    d["in_forest_cell"] = (np.abs(ex - cells.cx.values[idx]) <= 2500) & (np.abs(ey - cells.cy.values[idx]) <= 2500)
    keep = (d.cell_dist_km <= STATE_MAX_KM) & d.state.isin(STATES)
    d = d[keep].reset_index(drop=True)
    summary["type0_detections_near_forest_cells_in_six_states_2022_2025"] = int(len(d))

    # ----- space-time components (km, days -> km)
    km_per_day = LINK_KM / GAP_DAYS
    pts = np.column_stack([d.x.values / 1000.0, d.y.values / 1000.0, d.t.values * km_per_day])
    kd = cKDTree(pts)
    pairs = kd.query_pairs(LINK_KM, output_type="ndarray")
    n = len(d)
    graph = coo_matrix((np.ones(len(pairs), dtype=np.int8), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
    _, labels = connected_components(graph, directed=False)
    d["event"] = labels
    d["year"] = d.date.dt.year

    rows = []
    mcd_pixels = load_mcd_pixels()
    wc = None
    try:
        import rasterio
        wc = rasterio.open(WORLDCOVER)
    except Exception:
        pass
    gfs = pd.read_csv(GFS_PIXELS)
    xy_tree = cKDTree(d[["x", "y"]].values)
    sizes = d.groupby("event").size()
    big = sizes[sizes >= MIN_DETECTIONS].index
    sub = d[d.event.isin(big)]
    first_dates = sub.groupby("event").date.min()
    for event, g in sub.groupby("event", sort=False):
        first_year = first_dates[event].year
        if first_year not in YEARS:
            continue
        g = g.sort_values(["t"])
        g = g.assign(overpass=g.satellite + "|" + g.acq_date + "|" + g.daynight)
        first_over = g[g.overpass == g.overpass.iloc[0]]
        # ignition pixel: medoid of the detections of the first overpass
        fx, fy = first_over.x.values, first_over.y.values
        medoid = np.argmin([np.hypot(fx - a, fy - b).sum() for a, b in zip(fx, fy)])
        ign = first_over.iloc[medoid]
        # local azimuthal-equidistant frame for extents (metric, small distortion)
        local = Transformer.from_crs(4326, f"+proj=aeqd +lat_0={ign.latitude} +lon_0={ign.longitude} +datum=WGS84", always_xy=True)
        lx, ly = local.transform(g.longitude.values, g.latitude.values)
        pts2 = np.column_stack([lx, ly]) / 1000.0
        diam, hull_km2 = extent_km(pts2)
        ix, iy = local.transform(ign.longitude, ign.latitude)
        max_from_ign = float(np.max(np.hypot(pts2[:, 0] - ix / 1000.0, pts2[:, 1] - iy / 1000.0)))
        west, east = pts2[:, 0].min() - 0.1875, pts2[:, 0].max() + 0.1875
        south, north = pts2[:, 1].min() - 0.1875, pts2[:, 1].max() + 0.1875
        clon, clat = local.transform((west + east) / 2 * 1000.0, (south + north) / 2 * 1000.0, direction="INVERSE")
        over_counts = g.groupby("overpass").size()
        first_t = g.iloc[0]
        ist = (int(first_t.acq_time) // 100 * 60 + int(first_t.acq_time) % 100 + 330) % 1440
        near = np.array(xy_tree.query_ball_point([ign.x, ign.y], 5000.0), dtype=int)
        prior = int(((d.t.values[near] < g.t.min()) & (d.t.values[near] >= g.t.min() - 3.0) & (d.event.values[near] != event)).sum()) if len(near) else 0
        lc = None
        if wc is not None and wc.bounds.left <= ign.longitude <= wc.bounds.right and wc.bounds.bottom <= ign.latitude <= wc.bounds.top:
            try:
                lc = int(next(wc.sample([(ign.longitude, ign.latitude)]))[0])
            except Exception:                                   # the staged tile has undecodable blocks
                lc = -1
        px = gfs_pixel(gfs, ign.latitude, ign.longitude)
        burned = mcd_match(mcd_pixels, g)
        rows.append({
            "event_id": f"E{first_year}-{int(event):06d}",
            "state": g.state.mode().iloc[0],
            "ign_lat": round(float(ign.latitude), 5), "ign_lon": round(float(ign.longitude), 5),
            "first_date": first_t.acq_date, "first_time_utc": f"{int(first_t.acq_time):04d}", "first_time_ist": f"{ist // 60:02d}{ist % 60:02d}",
            "last_date": g.acq_date.iloc[-1], "duration_days": round(float(g.t.max() - g.t.min()), 2),
            "n_det": int(len(g)), "n_det_nh": int(g.confidence.isin(["n", "h"]).sum()), "n_det_low": int((g.confidence == "l").sum()),
            "n_overpass": int(over_counts.size), "n_overpass_ge3": int((over_counts >= 3).sum()),
            "n_sat": int(g.satellite.nunique()),
            "first_overpass_n": int(len(first_over)), "first_overpass_spread_km": round(float(pairwise_max(fx, fy) / 1000.0), 2),
            "prior_det_5km_3d": prior,
            "bbox_ew_km": round(east - west, 2), "bbox_ns_km": round(north - south, 2),
            "bbox_centre_lat": round(float(clat), 5), "bbox_centre_lon": round(float(clon), 5),
            "max_dist_ign_km": round(max_from_ign, 2),
            "extent_km": round(diam, 2), "hull_km2": round(hull_km2, 2), "viirs_pixel_km2_sum": round(len(g) * VIIRS_PIXEL_KM2, 2),
            "frp_sum_mw": round(float(g.frp.sum()), 1),
            "forest_cell_5km": bool(ign.in_forest_cell),
            "ign_cell_dist_km": round(float(ign.cell_dist_km), 2),
            "worldcover_class_local": lc,
            "worldcover_tile": worldcover_tile(ign.latitude, ign.longitude),
            "mcd64a1_tile": mcd_tile(ign.latitude, ign.longitude),
            "mcd64a1_local": mcd_tile(ign.latitude, ign.longitude) == "h26v06",
            "mcd64a1_burned_km2_local": burned,
            "gfs_pixel": px["pixel"], "gfs_pixel_dist_km": px["dist_km"],
            "gfs00_export_month_local": first_t.acq_date[5:7] in {"01", "02", "03", "04", "05", "06", "11", "12"},
        })
    out = pd.DataFrame(rows)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_CSV, index=False)
    summary["events_ge_min_detections"] = int(len(out))
    summary["link_km"], summary["gap_days"], summary["min_detections"] = LINK_KM, GAP_DAYS, MIN_DETECTIONS
    OUT_JSON.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


def pairwise_max(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 2:
        return 0.0
    p = np.column_stack([x, y])
    if len(p) > 400:
        p = p[np.random.default_rng(0).choice(len(p), 400, replace=False)]
    return float(np.max(np.hypot(p[:, None, 0] - p[None, :, 0], p[:, None, 1] - p[None, :, 1])))


def extent_km(p: np.ndarray) -> tuple[float, float]:
    """Footprint diameter and hull area (km), each detection grown by half a 375 m pixel."""
    half = 0.1875
    corners = np.concatenate([p + [dx, dy] for dx in (-half, half) for dy in (-half, half)])
    try:
        hull = ConvexHull(corners)
    except Exception:
        return 0.375, 0.14
    v = corners[hull.vertices]
    diam = float(np.max(np.hypot(v[:, None, 0] - v[None, :, 0], v[:, None, 1] - v[None, :, 1])))
    return diam, float(hull.volume)


def worldcover_tile(lat: float, lon: float) -> str:
    la, lo = int(math.floor(lat / 3) * 3), int(math.floor(lon / 3) * 3)
    return f"N{la:02d}E{lo:03d}"


def mcd_tile(lat: float, lon: float) -> str:
    x = R_SIN * math.radians(lon) * math.cos(math.radians(lat))
    y = R_SIN * math.radians(lat)
    return f"h{int((x - X0) // TILE_M):02d}v{int((Y0 - y) // TILE_M):02d}"


def gfs_pixel(gfs: pd.DataFrame, lat: float, lon: float) -> dict[str, object]:
    # nearest 0.25-degree pixel centre in the export's pixel list
    dlat = (gfs.lat_c.values - lat) * 111.2
    dlon = (gfs.lon_c.values - lon) * 111.32 * math.cos(math.radians(lat))
    k = int(np.argmin(np.hypot(dlat, dlon)))
    return {"pixel": int(gfs.pixel.values[k]), "dist_km": round(float(math.hypot(dlat[k], dlon[k])), 1)}


def load_mcd_pixels() -> list[tuple[int, np.ndarray, np.ndarray, np.ndarray]]:
    from pyhdf.SD import SD, SDC
    out = []
    for path in sorted(MCD.glob("*/MCD64A1.*.h26v06.*.hdf")):
        doy0 = int(path.name.split(".A")[1][:7][4:])
        year = int(path.name.split(".A")[1][:4])
        bd = np.asarray(SD(str(path), SDC.READ).select("Burn Date").get())
        r, c = np.where(bd > 0)
        x = X0 + 26 * TILE_M + (c + 0.5) * MCD_PIXEL_M
        y = Y0 - 6 * TILE_M - (r + 0.5) * MCD_PIXEL_M
        lat = np.degrees(y / R_SIN)
        lon = np.degrees(x / (R_SIN * np.cos(np.radians(lat))))
        out.append((year, bd[r, c].astype(int), lat, lon))
    return out


def mcd_match(mcd: list, g: pd.DataFrame, buffer_km: float = 1.5, slack_days: int = 8) -> float | None:
    if not mcd or mcd_tile(float(g.latitude.iloc[0]), float(g.longitude.iloc[0])) != "h26v06":
        return None
    first = g.date.min()
    last = g.date.max()
    lo = (first - pd.Timedelta(days=slack_days)).timetuple().tm_yday
    hi = (last + pd.Timedelta(days=slack_days)).timetuple().tm_yday
    year = first.year
    tree = cKDTree(np.column_stack([g.latitude.values, g.longitude.values * math.cos(math.radians(g.latitude.mean()))]) * 111.2)
    total = 0
    for y, doy, lat, lon in mcd:
        if y != year:
            continue
        m = (doy >= lo) & (doy <= hi)
        if not m.any():
            continue
        q = np.column_stack([lat[m], lon[m] * math.cos(math.radians(g.latitude.mean()))]) * 111.2
        dist, _ = tree.query(q)
        total += int((dist <= buffer_km).sum())
    return round(total * (MCD_PIXEL_M / 1000.0) ** 2, 2)


if __name__ == "__main__":
    sys.exit(main())
