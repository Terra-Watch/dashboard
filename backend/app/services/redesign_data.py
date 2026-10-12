"""Read-only loaders for the redesign-v2 screens, sourced directly from repo data files.

Every number served here is read from `data/` or `results/` at request time (small
CSV/JSON files, cached in-process) rather than retyped into this file, so there is
no risk of a hand-transcribed number drifting from `docs/RESQ5_RESULTS.md`'s source
tables (see docs/redesign/06_simulation_ui.md's "no rounding beyond source" rule).
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio.features
from affine import Affine
from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform as shapely_transform

REPO_ROOT = Path(__file__).resolve().parents[3]
RESQ5_PROTOCOL_STATES = {"OD", "CG", "TS", "MP", "MH", "JH"}

# RESQ5_PROTOCOL.md §8(a): p(d) = exp(-d/1000m); footprint at p=0.5 is the disc d <= 1000*ln(2) m.
PROXIMITY_BASELINE_RADIUS_M = 1000.0 * math.log(2)

WIND_CSV_COLUMNS = {
    # wind_source -> (filename, time column, direction-FROM column (deg), speed column (m/s))
    "era5land_native": ("weather_era5land_native_wind.csv", "time", "wind_from_deg", "wind_speed_ms"),
    "era5_025": ("weather_era5_wind_and_surface.csv", "time", "wind_direction_10m", "wind_speed_10m"),
    "best_match": ("weather_best_match_sensitivity_not_reanalysis.csv", "time", "wind_direction_10m", "wind_speed_10m"),
}

REPLAY_INCIDENTS: dict[str, dict] = {
    "E2023-084925": {"state": "OD", "label": "Similipal, Odisha — Mar 2023"},
    "E2024-131853": {"state": "TS", "label": "Telangana — Feb 2024"},
    "E2024-135332": {"state": "MH", "label": "Maharashtra — Mar 2024"},
    "E2024-155286": {"state": "CG", "label": "Chhattisgarh — 2024"},
}

BASELINE_LABELS = {
    "baseline_a_proximity": "Proximity (fire stays near the ignition point)",
    "baseline_b_circle_final_area": "Circle, final observed area (uses information only known after the fact)",
}
MODEL_LABELS = {
    "simulation:era5land_native": "Simulation (ERA5-Land, primary)",
    "simulation:era5_025": "Simulation (ERA5 0.25°, sensitivity)",
    "simulation:best_match": "Simulation (best_match, not a reanalysis, sensitivity)",
    "simulation:pooled": "Simulation (pooled 90 members, secondary)",
    **BASELINE_LABELS,
}


@lru_cache(maxsize=16)
def _metrics_csv(incident_id: str) -> pd.DataFrame:
    path = REPO_ROOT / "results" / "resq5" / incident_id / "metrics_by_overpass.csv"
    if not path.exists():
        raise FileNotFoundError(path)
    return pd.read_csv(path)


@lru_cache(maxsize=16)
def _viirs_csv(incident_id: str) -> pd.DataFrame:
    for data_root in ("data/resq2", "data/resq5"):
        path = REPO_ROOT / data_root / incident_id / "viirs_detections.csv"
        if path.exists():
            return pd.read_csv(path)
    raise FileNotFoundError(incident_id)


def list_detections() -> list[dict]:
    """The 4 replay incidents' earliest VIIRS detection, as sample-data triage items."""
    out = []
    for incident_id, meta in REPLAY_INCIDENTS.items():
        try:
            df = _viirs_csv(incident_id)
        except FileNotFoundError:
            continue
        row = df.iloc[0]
        out.append({
            "id": f"det-{incident_id}",
            "incident_id": incident_id,
            "source": "VIIRS",
            "state": meta["state"],
            "label": meta["label"],
            "detected_at": f"{row['acq_date']}T{str(int(row['acq_time'])).zfill(4)[:2]}:{str(int(row['acq_time'])).zfill(4)[2:]}:00Z",
            "confidence": {"l": "low", "n": "nominal", "h": "high"}.get(str(row.get("confidence", "n")).lower(), "nominal"),
            "lat": float(row["latitude"]),
            "lon": float(row["longitude"]),
            "frp": float(row.get("frp", 0.0)),
            "sample_data": True,
        })
    return out


def replay_for(incident_id: str) -> dict:
    if incident_id not in REPLAY_INCIDENTS:
        raise KeyError(incident_id)
    df = _metrics_csv(incident_id)
    obs_nh = df[df["reference"] == "obs_nh"].sort_values("overpass_k")

    def rows_for(model: str) -> list[dict]:
        sub = obs_nh[obs_nh["model"] == model]
        return [
            {
                "overpass_k": int(r.overpass_k),
                "time_utc": r.time_utc,
                "hours_since_t0": float(r.hours_since_t0),
                "auc": None if pd.isna(r.auc) else round(float(r.auc), 3),
                "ap": None if pd.isna(r.ap) else round(float(r.ap), 3),
                "iou": None if pd.isna(r.iou) else round(float(r.iou), 3),
                "precision": None if pd.isna(r.precision) else round(float(r.precision), 3),
                "recall": None if pd.isna(r.recall) else round(float(r.recall), 3),
                "area_ratio": None if pd.isna(r.area_ratio) else round(float(r.area_ratio), 3),
                "sim_cells": int(r.sim_cells),
                "obs_cells": int(r.obs_cells),
            }
            for r in sub.itertuples()
        ]

    models_present = sorted(obs_nh["model"].unique().tolist())
    last_k = int(obs_nh["overpass_k"].max())
    last = obs_nh[obs_nh["overpass_k"] == last_k]

    def last_value(model: str, field: str) -> float | None:
        matched = last[last["model"] == model]
        if matched.empty:
            return None
        value = matched.iloc[0][field]
        return None if pd.isna(value) else round(float(value), 3)

    headline = {
        "last_overpass_k": last_k,
        "auc": {model: last_value(model, "auc") for model in models_present},
        "ap": {model: last_value(model, "ap") for model in models_present},
        "iou": {model: last_value(model, "iou") for model in models_present},
    }

    return {
        "incident_id": incident_id,
        "state": REPLAY_INCIDENTS[incident_id]["state"],
        "label": REPLAY_INCIDENTS[incident_id]["label"],
        "sample_data": True,
        "development_incident": True,
        "model_labels": {m: MODEL_LABELS.get(m, m) for m in models_present},
        "series": {model: rows_for(model) for model in models_present},
        "headline_last_overpass": headline,
        "source": f"results/resq5/{incident_id}/metrics_by_overpass.csv (reference=obs_nh, nominal+high confidence, protocol primary per RESQ5_PROTOCOL.md §2)",
    }


def cross_incident_win_counts() -> dict:
    """Recomputed at request time from the per-incident CSVs — not hand-transcribed.

    Mirrors the method in docs/redesign/06_simulation_ui.md: at each incident's last
    overpass, does the primary simulation (era5land_native) beat each baseline on
    AUC/AP/IoU?
    """
    sim_model = "simulation:era5land_native"
    counts = {
        "auc_vs_proximity": 0, "ap_vs_proximity": 0, "ap_vs_circle": 0,
        "iou_vs_proximity": 0, "iou_vs_circle": 0,
    }
    per_incident = {}
    for incident_id in REPLAY_INCIDENTS:
        try:
            df = _metrics_csv(incident_id)
        except FileNotFoundError:
            continue
        obs_nh = df[df["reference"] == "obs_nh"]
        last_k = int(obs_nh["overpass_k"].max())
        last = obs_nh[obs_nh["overpass_k"] == last_k]

        def val(model: str, field: str) -> float | None:
            matched = last[last["model"] == model]
            if matched.empty or pd.isna(matched.iloc[0][field]):
                return None
            return float(matched.iloc[0][field])

        sim_auc, prox_auc = val(sim_model, "auc"), val("baseline_a_proximity", "auc")
        sim_ap, prox_ap, circ_ap = val(sim_model, "ap"), val("baseline_a_proximity", "ap"), val("baseline_b_circle_final_area", "ap")
        sim_iou, prox_iou, circ_iou = val(sim_model, "iou"), val("baseline_a_proximity", "iou"), val("baseline_b_circle_final_area", "iou")

        wins = {
            "auc_vs_proximity": sim_auc is not None and prox_auc is not None and sim_auc > prox_auc,
            "ap_vs_proximity": sim_ap is not None and prox_ap is not None and sim_ap > prox_ap,
            "ap_vs_circle": sim_ap is not None and circ_ap is not None and sim_ap > circ_ap,
            "iou_vs_proximity": sim_iou is not None and prox_iou is not None and sim_iou > prox_iou,
            "iou_vs_circle": sim_iou is not None and circ_iou is not None and sim_iou > circ_iou,
        }
        per_incident[incident_id] = wins
        for key, won in wins.items():
            counts[key] += int(won)
    return {"wins_out_of_4": counts, "per_incident": per_incident, "n_incidents": len(REPLAY_INCIDENTS)}


# ---------- Geo helpers for the real MapShell (MapLibre + PMTiles) ----------
# Every geometry below is computed at request time from the same source files the rest of
# this module reads (results/resq5/<id>/summary.json domain block, burn_count_*.npz,
# observed_footprints.npz, viirs_detections.csv) — none of it is hand-digitized.

@lru_cache(maxsize=16)
def _summary(incident_id: str) -> dict:
    path = REPO_ROOT / "results" / "resq5" / incident_id / "summary.json"
    return json.loads(path.read_text())


@lru_cache(maxsize=16)
def _wind_csv(incident_id: str, filename: str) -> pd.DataFrame:
    path = REPO_ROOT / "data" / "resq2" / incident_id / filename
    df = pd.read_csv(path)
    return df


@lru_cache(maxsize=4)
def _wgs84_transformer(crs: str) -> Transformer:
    return Transformer.from_crs(crs, "EPSG:4326", always_xy=True)


@lru_cache(maxsize=4)
def _from_wgs84_transformer(crs: str) -> Transformer:
    return Transformer.from_crs("EPSG:4326", crs, always_xy=True)


def domain_transform(incident_id: str) -> tuple[Affine, str, float, int]:
    """(affine UTM->pixel transform, CRS, cell size in m, cells per side) for the incident's
    30 m simulation domain, read from summary.json's `domain` block (same domain used to build
    burn_count_*.npz and observed_footprints.npz — see RESQ5_PROTOCOL.md §6)."""
    dom = _summary(incident_id)["domain"]
    cell_m = dom["side_km"] * 1000.0 / dom["cells_per_side"]
    transform = Affine(cell_m, 0, dom["west_m"], 0, -cell_m, dom["north_m"])
    return transform, dom["crs"], cell_m, dom["cells_per_side"]


def domain_bounds_wgs84(incident_id: str) -> list[float]:
    """[west, south, east, north] in WGS84, for fitting the MapShell's view to this incident."""
    transform, crs, cell_m, n = domain_transform(incident_id)
    tr = _wgs84_transformer(crs)
    west_m, north_m = transform.c, transform.f
    east_m, south_m = west_m + cell_m * n, north_m - cell_m * n
    corners = [(west_m, north_m), (east_m, north_m), (east_m, south_m), (west_m, south_m)]
    lons, lats = zip(*(tr.transform(x, y) for x, y in corners))
    return [min(lons), min(lats), max(lons), max(lats)]


def _haversine_m(lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    r = 6_371_000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi, dlambda = np.radians(lat2 - lat1), np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlambda / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


@lru_cache(maxsize=16)
def nominal_ignition(incident_id: str) -> dict:
    """The medoid of the incident's first-overpass VIIRS detections — the protocol's "nominal
    (un-jittered) ignition point" (RESQ5_PROTOCOL.md §8(a)), same method as
    scripts/resq2/build_incident_candidates.py's ignition-pixel selection, computed here from
    the raw detection CSV rather than re-reading that script's cached output."""
    df = _viirs_csv(incident_id).copy()
    df["overpass"] = df["satellite"].astype(str) + "|" + df["acq_date"].astype(str) + "|" + df["daynight"].astype(str)
    df = df.sort_values(["acq_date", "acq_time"])
    first = df[df["overpass"] == df["overpass"].iloc[0]]
    lat, lon = first["latitude"].to_numpy(), first["longitude"].to_numpy()
    dist_sums = np.array([_haversine_m(lat, lon, lat[i], lon[i]).sum() for i in range(len(lat))])
    i = int(np.argmin(dist_sums))
    return {"lat": float(lat[i]), "lon": float(lon[i])}


def _grid_to_wgs84_geojson(grid: np.ndarray, incident_id: str, mask: np.ndarray | None = None) -> dict:
    transform, crs, _cell_m, _n = domain_transform(incident_id)
    tr = _wgs84_transformer(crs)
    features = []
    for geom, value in rasterio.features.shapes(grid, mask=mask, transform=transform):
        poly = shape(geom)
        poly_wgs = shapely_transform(lambda x, y: tr.transform(x, y), poly)
        features.append({"type": "Feature", "properties": {"band": int(value)}, "geometry": mapping(poly_wgs)})
    return {"type": "FeatureCollection", "features": features}


def probability_grid_geojson(incident_id: str, wind_source: str, overpass_k: int) -> dict:
    """Burn-probability bands as real georeferenced polygons (dissolved per band via
    rasterio.features.shapes, not per-cell squares), reprojected from the simulation's
    EPSG:32644 domain to WGS84. Same 4-band digitisation as the router's downsampled-grid
    endpoint (0.2/0.5/0.8 thresholds), full resolution (no stride) since polygons generalise
    naturally."""
    path = REPO_ROOT / "results" / "resq5" / incident_id / f"burn_count_{wind_source}.npz"
    data = np.load(path)
    key = f"k{overpass_k}"
    counts = data[key].astype(float)
    members = float(data["members"])
    p = counts / members if members else counts * 0
    bands = np.digitize(p, bins=[0.2, 0.5, 0.8]).astype(np.int32)
    return _grid_to_wgs84_geojson(bands, incident_id)


def observed_footprint_geojson(incident_id: str, overpass_k: int, reference: str = "nh") -> dict:
    """The observed cumulative VIIRS footprint at overpass k, as a real georeferenced polygon
    (dissolved from the same 30 m domain grid as the probability bands) — RESQ5_PROTOCOL.md's
    Amendment 2 cumulative-by-pass definition."""
    path = REPO_ROOT / "results" / "resq5" / incident_id / "observed_footprints.npz"
    data = np.load(path)
    key = f"{reference}_k{overpass_k}"
    mask = data[key]
    grid = mask.astype(np.uint8)
    return _grid_to_wgs84_geojson(grid, incident_id, mask=mask)


def baseline_circles_geojson(incident_id: str) -> dict:
    """Both baselines from RESQ5_PROTOCOL.md §8, as real circles centred on the nominal
    ignition point: (a) proximity, fixed radius 1000*ln(2) m ≈ 693 m; (b) circle of the final
    observed area, radius from summary.json's `baseline_circle_radius_m` (computed by
    scripts/resq5/analyze.py from the actual final footprint area, not retyped here)."""
    transform, crs, _cell_m, _n = domain_transform(incident_id)
    to_utm = _from_wgs84_transformer(crs)
    to_wgs = _wgs84_transformer(crs)
    ign = nominal_ignition(incident_id)
    x, y = to_utm.transform(ign["lon"], ign["lat"])
    circle_radius_m = float(_summary(incident_id)["baseline_circle_radius_m"])

    def circle(radius_m: float) -> dict:
        poly = Point(x, y).buffer(radius_m, resolution=32)
        poly_wgs = shapely_transform(lambda a, b: to_wgs.transform(a, b), poly)
        return {
            "type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {"radius_m": round(radius_m, 1)}, "geometry": mapping(poly_wgs)}],
        }

    return {
        "proximity": circle(PROXIMITY_BASELINE_RADIUS_M),
        "circle_final_area": circle(circle_radius_m),
    }


def overpass_time_utc(incident_id: str, overpass_k: int) -> str:
    df = _metrics_csv(incident_id)
    obs_nh = df[(df["reference"] == "obs_nh") & (df["overpass_k"] == overpass_k)]
    if obs_nh.empty:
        raise KeyError(f"no overpass {overpass_k} for {incident_id}")
    return str(obs_nh.iloc[0]["time_utc"])


def wind_arrow(incident_id: str, wind_source: str, time_utc: str) -> dict:
    """A single point wind observation (direction + speed) nearest `time_utc`, placed at the
    nominal ignition point — the wind data itself is a point time series, not spatially
    gridded (07_maps.md: "hourly, point value"). `direction_deg` is the direction the wind
    blows TOWARD (meteorological "from" direction + 180°), for arrow rendering."""
    filename, time_col, dir_col, speed_col = WIND_CSV_COLUMNS[wind_source]
    df = _wind_csv(incident_id, filename)
    times = pd.to_datetime(df[time_col], utc=True)
    target = pd.to_datetime(time_utc, utc=True)
    idx = (times - target).abs().idxmin()
    row = df.loc[idx]
    ign = nominal_ignition(incident_id)
    direction_from = float(row[dir_col])
    return {
        "lat": ign["lat"],
        "lon": ign["lon"],
        "direction_deg": (direction_from + 180.0) % 360.0,
        "speed_ms": round(float(row[speed_col]), 2),
        "source_time_utc": str(row[time_col]),
    }
