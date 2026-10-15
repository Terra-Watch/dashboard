"""RESQ-6 Step 2a: engine ensemble run + scoring, development set ONLY.

Reuses the 4 development incidents' already-fixed ignition/t0/domain corner
from data/resq5/protocol_setup.json (docs/simulation/PROTOCOL.md section 1 --
"not re-derived here") and their already-fetched WorldCover/DEM windows
(data/resq5/<iid>/). Uses backend/inference/engine/{fuel,weather,baseline,
smoulder}.py for the crosswalk, wind sourcing, baselines, and the
ROS-Threshold smouldering fix. Ensemble: ignition-position jitter (same
500 m-radius method as scripts/resq5/replay.py) x wind perturbation (new:
per-member multiplicative speed noise + additive direction noise on top of
the real ERA5-Land series). Ground truth reuses scripts/resq5/analyze.py's
own VIIRS clustering (`observed_arrays`), evaluated at the product's 4
horizons (6/12/24/48 h) via "the latest overpass at or before that horizon",
per docs/simulation/PROTOCOL.md section 4, not RESQ-5's own overpass-index
scheme.

Never touches the test-set candidates. Metrics/baselines here are for
docs/logs only -- never for the product UI (docs/simulation/PROTOCOL.md's
own header rule).

Usage: run_dev.py <incident_id|all> [--members N] [--smoke]
       [--ignition-jitter-radius-m 0..500] [--output-dir NEW_DIR --save-member-grids]
"""
from __future__ import annotations

import csv
import argparse
import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from scipy import ndimage
from sklearn.metrics import average_precision_score

WEBSITE = Path(__file__).resolve().parents[2]
for p in ("backend/inference", "scripts/resq5", "scripts/resq3"):
    sys.path.insert(0, str(WEBSITE / p))

from engine import baseline as ebaseline  # noqa: E402
from engine import fuel as efuel  # noqa: E402
from engine import smoulder as esmoulder  # noqa: E402
from engine import weather as eweather  # noqa: E402
import analyze as resq5_analyze  # noqa: E402  (reused for observed_arrays -- VIIRS clustering, not reimplemented)

BIN = "/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP_SRC = Path("/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/test/model/sb-asc/spain_lookup_table.csv")
SETUP = json.loads((WEBSITE / "data/resq5/protocol_setup.json").read_text())
RESULTS_DIR = WEBSITE / "results/resq6/dev"
CELL = 30.0
HORIZONS_H = [6, 12, 24, 48]
JITTER_RADIUS_M = 500.0
WIND_SPEED_JITTER = (0.7, 1.3)       # multiplicative, uniform
WIND_DIR_JITTER_SD_DEG = 15.0        # additive, normal, wrapped


def ignition_jitter(
    seed: int, n: int, radius_m: float = JITTER_RADIUS_M
) -> tuple[np.ndarray, np.ndarray]:
    """Same method as scripts/resq5/replay.py's jitter(): uniform over a
    disk of radius JITTER_RADIUS_M, same seed per incident as RESQ-5 used,
    generalised to an arbitrary ensemble size n (RESQ-5 fixed n=30)."""
    if not math.isfinite(radius_m) or radius_m < 0:
        raise ValueError("ignition jitter radius must be finite and non-negative")
    rng = np.random.default_rng(seed)
    r = radius_m * np.sqrt(rng.uniform(size=n))
    a = rng.uniform(0, 2 * np.pi, size=n)
    return r * np.cos(a), r * np.sin(a)


def prediction_frame_hours() -> tuple[int, ...]:
    """Fixed product horizons; observation overpass times do not choose frames."""
    return tuple(HORIZONS_H)


def ignition_offset_for_member(
    seed: int, member: int, n_members: int, radius_m: float = JITTER_RADIUS_M
) -> tuple[float, float]:
    """Select a member from the one fixed, seeded ensemble jitter sample."""
    if n_members < 1 or not 0 <= member < n_members:
        raise ValueError("member must be within the positive ensemble size")
    dx, dy = ignition_jitter(seed, n_members, radius_m)
    return float(dx[member]), float(dy[member])


def perturb_wind(ws: np.ndarray, wd: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """One multiplicative speed factor and one additive direction offset per
    member, applied uniformly across that member's whole series (not
    per-hour noise) -- a single, documented ensemble perturbation, not
    fitted to any incident's outcome."""
    speed_factor = rng.uniform(*WIND_SPEED_JITTER)
    dir_offset = rng.normal(0.0, WIND_DIR_JITTER_SD_DEG)
    return ws * speed_factor, (wd + dir_offset) % 360.0


def wind_perturbation_parameters(seed: int, member: int) -> tuple[float, float]:
    """Return the existing per-member wind draws without involving ignition jitter."""
    rng = np.random.default_rng(seed + member)
    return float(rng.uniform(*WIND_SPEED_JITTER)), float(rng.normal(0.0, WIND_DIR_JITTER_SD_DEG))


def build_inputs(iid: str, shared: Path) -> dict:
    s = SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    west, north = d["west_m"], d["north_m"]
    ci_ = (np.arange(n) + 0.5) * CELL
    xc = west + ci_[None, :] + np.zeros((n, 1))
    yc = north - ci_[:, None] + np.zeros((1, n))
    inv = Transformer.from_crs(d["crs"], 4326, always_xy=True)
    folder = WEBSITE / "data/resq5" / iid

    with rasterio.open(folder / "worldcover_2021_domain_window.tif") as r:
        wc = r.read(1)
        T = r.transform
    classes = sorted(efuel.WORLDCOVER_TO_FUEL) + [0]
    counts = np.zeros((n, n, len(classes)), dtype=np.int16)
    for dx in (-10.0, 0.0, 10.0):
        for dy in (-10.0, 0.0, 10.0):
            lon, lat = inv.transform((xc + dx).ravel(), (yc + dy).ravel())
            rows = np.floor((T.f - np.asarray(lat)) / abs(T.e)).astype(int)
            cols = np.floor((np.asarray(lon) - T.c) / T.a).astype(int)
            cls = wc[rows, cols].reshape(n, n)
            for k, c in enumerate(classes):
                counts[:, :, k] += (cls == c)
    cell_class = np.array(classes)[counts.argmax(axis=2)]
    fuel_grid = efuel.classify(cell_class)   # engine/fuel.py, FUEL_RULE.md crosswalk

    with rasterio.open(folder / "copernicus_dem_glo30_domain_window.tif") as r:
        dem = r.read(1).astype("float32")
        Td = r.transform
    lon, lat = inv.transform(xc.ravel(), yc.ravel())
    frow = (Td.f - np.asarray(lat)) / abs(Td.e) - 0.5
    fcol = (np.asarray(lon) - Td.c) / Td.a - 0.5
    elev = ndimage.map_coordinates(dem, [frow, fcol], order=1).reshape(n, n).astype("float32")
    gy, gx = np.gradient(elev, CELL, CELL)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")

    south = north - n * CELL
    shared.mkdir(parents=True, exist_ok=True)
    fmt = lambda v: str(int(v))  # noqa: E731
    _write_asc(shared / "fuels.asc", fuel_grid, west, south, fmt)
    _write_asc(shared / "elevation.asc", elev, west, south, fmt)
    _write_asc(shared / "slope.asc", slope, west, south, fmt)
    # No saz.asc -- "slope used" only, per PROTOCOL.md Amendment 1 / engine/domain.py.
    (shared / "spain_lookup_table.csv").write_text(LOOKUP_SRC.read_text())
    return {"fuel_grid": fuel_grid, "xc": xc, "yc": yc}


def _write_asc(path: Path, arr: np.ndarray, west: float, south: float, fmt) -> None:
    n = arr.shape[0]
    with path.open("w") as f:
        f.write(f"ncols {n}\nnrows {n}\nxllcorner {west}\nyllcorner {south}\ncellsize {int(CELL)}\nNODATA_value -9999\n")
        for row in arr:
            f.write(" ".join(fmt(v) for v in row) + "\n")


def run_member(args: tuple) -> dict:
    iid, member, shared, scratch_root, want_frames, seed, n_members, jitter_radius_m = args
    s = SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    t0 = pd.Timestamp(s["t0_utc"])
    t_start = time.time()
    try:
        series = eweather.fetch_era5land_historical(
            lat=s["ignition_lat_lon"][0], lon=s["ignition_lat_lon"][1],
            start_utc=t0.to_pydatetime().replace(tzinfo=timezone.utc),
            hours=s["weather_rows_hours"], incident_id=iid,
        )
        wind_speed_factor, wind_direction_offset_deg = wind_perturbation_parameters(seed, member)
        ws = series.wind_speed_ms.copy() * wind_speed_factor
        wd = (series.wind_from_deg.copy() + wind_direction_offset_deg) % 360.0

        jitter_x, jitter_y = ignition_offset_for_member(seed, member, n_members, jitter_radius_m)
        x = s["ignition_utm_m"][0] + jitter_x
        y = s["ignition_utm_m"][1] + jitter_y
        row = int(math.floor((d["north_m"] - y) / CELL))
        col = int(math.floor((x - d["west_m"]) / CELL))

        scratch_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch_root) as tmp:
            tmp = Path(tmp)
            sc = tmp / "scenario"
            sc.mkdir()
            (tmp / "run").mkdir()
            for name in ("fuels.asc", "elevation.asc", "slope.asc", "spain_lookup_table.csv"):
                os.symlink(Path(shared) / name, sc / name)
            with (sc / "Weather.csv").open("w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
                for t, a, b in zip(series.times_utc, ws, wd):
                    w.writerow([iid, f"{t:%Y-%m-%d %H:%M}", f"{max(0.1, a * 3.6):.3f}", f"{b:.3f}", 1])
            with (sc / "Ignitions.csv").open("w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["Year", "Ncell"])
                w.writerow([1, row * n + col + 1])
            cmd = [
                BIN, "--input-instance-folder", str(sc) + "/", "--output-folder", str(tmp / "run") + "/",
                "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid",
                "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1",
                "--output-messages", "--scenario", "1", "--seed", "42",
                "--ROS-Threshold", str(esmoulder.ROS_THRESHOLD_SMOULDER),
            ]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if r.returncode:
                return {"member": member, "error": (r.stdout + r.stderr)[-600:], "wall_s": round(time.time() - t_start, 1)}
            grids = tmp / "run/Grids/Grids1"
            avail = sorted(int(p.stem[10:]) for p in grids.glob("ForestGrid*.csv"))
            missing_frames = sorted(set(want_frames) - set(avail))
            if missing_frames:
                return {
                    "member": member,
                    "error": f"simulator did not produce required horizon frames {missing_frames}; available={avail}",
                    "wall_s": round(time.time() - t_start, 1),
                }
            out = {}
            source_frames = {}
            for h in sorted(set(want_frames)):
                source_frames[h] = h
                out[h] = (pd.read_csv(grids / f"ForestGrid{h}.csv", header=None).values == 1)
            return {
                "member": member, "frames": out, "source_frames": source_frames,
                "last_frame": max(avail), "ign_rc": [row, col],
                "wind_speed_factor": wind_speed_factor,
                "wind_direction_offset_deg": wind_direction_offset_deg,
                "wall_s": round(time.time() - t_start, 1),
            }
    except Exception as exc:
        return {"member": member, "error": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-500:]}", "wall_s": round(time.time() - t_start, 1)}


def score(p: np.ndarray, obs: np.ndarray) -> dict:
    if obs.min() == obs.max():
        return {"ap": None, "brier": None, "note": "ground truth has no positive or no negative cells -- AP undefined"}
    y = obs.ravel().astype(int)
    return {"ap": float(average_precision_score(y, p.ravel())), "brier": float(np.mean((p.ravel() - y) ** 2))}


def run_incident(
    iid: str, n_members: int, smoke: bool, *, artifact_dir: Path | None = None,
    jitter_radius_m: float = JITTER_RADIUS_M,
) -> dict:
    s = SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    t0 = pd.Timestamp(s["t0_utc"])
    used = s["overpasses_used"]
    # Simulated predictions are made at fixed product horizons. VIIRS overpass
    # timestamps select the observed cumulative mask only; they must not shift
    # the model forecast frame being scored.
    frames_h = list(prediction_frame_hours())

    scratch_root = Path(tempfile.mkdtemp(prefix=f"resq6_{iid}_"))
    shared = scratch_root / "shared"
    built = build_inputs(iid, shared)

    members = list(range(n_members))
    jobs = [
        (iid, m, str(shared), scratch_root, frames_h, s["jitter_seed"], n_members, jitter_radius_m)
        for m in members
    ]
    t_start = time.time()
    results = []
    workers = 1 if smoke else 7
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(run_member, jobs):
            results.append(res)
            tag = "ERROR" if "error" in res else f"ok {res['wall_s']}s"
            print(f"{iid} member {res['member']} {tag}", flush=True)
    wall_total = time.time() - t_start
    ok = [r for r in results if "error" not in r]
    errors = [r for r in results if "error" in r]
    if artifact_dir is not None:
        write_member_grid_artifacts(artifact_dir, iid, ok, jitter_radius_m=jitter_radius_m)

    # ---- ground truth (reuses scripts/resq5/analyze.py's own VIIRS clustering)
    oa = resq5_analyze.observed_arrays(iid)

    def obs_at_horizon(h: int):
        idx = [k for k, p in enumerate(used) if p["hours_since_t0"] <= h]
        if not idx:
            return None
        return oa["obs_nh"][max(idx)]

    ign = np.array(s["ignition_utm_m"])
    dx_cells = built["xc"] - ign[0]
    dy_cells = built["yc"] - ign[1]
    dist = np.hypot(dx_cells, dy_cells)

    horizon_results = []
    for h in HORIZONS_H:
        obs = obs_at_horizon(h)
        if obs is None:
            horizon_results.append({"horizon_h": h, "scorable": False})
            continue
        use_h = h
        if ok:
            p_engine = np.mean([m["frames"][use_h] for m in ok], axis=0)
        else:
            p_engine = np.zeros_like(obs, dtype=float)

        p_a = ebaseline.proximity(dist)

        series = eweather.fetch_era5land_historical(
            lat=s["ignition_lat_lon"][0], lon=s["ignition_lat_lon"][1],
            start_utc=t0.to_pydatetime().replace(tzinfo=timezone.utc), hours=s["weather_rows_hours"], incident_id=iid,
        )
        t0_dt, t_end = t0.to_pydatetime().replace(tzinfo=timezone.utc), (t0 + pd.Timedelta(hours=h)).to_pydatetime().replace(tzinfo=timezone.utc)
        v_mean = series.mean_speed(t0_dt, t_end)
        bearing = series.mean_vector_bearing(t0_dt, t_end)
        d_down, d_cross = ebaseline.downwind_crosswind_offsets(dx_cells, dy_cells, bearing)
        p_b = ebaseline.wind_elongated_proximity(d_down, d_cross, h, v_mean)

        horizon_results.append({
            "horizon_h": h, "scorable": True, "obs_cells": int(obs.sum()),
            "engine": score(p_engine, obs), "baseline_a_proximity": score(p_a, obs),
            "baseline_b_wind_elongated": score(p_b, obs),
            "wind_mean_speed_ms": v_mean, "wind_to_bearing_deg": bearing,
        })

    return {
        "incident_id": iid, "n_members_requested": n_members, "n_members_ok": len(ok), "n_members_error": len(errors),
        "errors_sample": errors[:3], "wall_s_total": round(wall_total, 1),
        "wall_s_per_member_mean": round(wall_total * workers / max(len(results), 1), 2),
        "ros_threshold_used": esmoulder.ROS_THRESHOLD_SMOULDER, "horizons": horizon_results,
        "ignition_jitter_radius_m": jitter_radius_m,
        "wind_perturbation_seed_rule": "incident jitter_seed + member index",
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda: src.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_member_grid_artifacts(
    results_dir: Path, iid: str, members: list[dict], *,
    jitter_radius_m: float = JITTER_RADIUS_M,
) -> Path:
    """Persist each successful member's requested probability inputs losslessly.

    The compressed NPZs contain Boolean per-member burn grids, before ensemble
    averaging. The manifest is written last so its presence denotes a complete
    artifact set for this incident.
    """
    incident_dir = results_dir / "member_grids" / iid
    incident_dir.mkdir(parents=True, exist_ok=False)
    entries = []
    for result in sorted(members, key=lambda item: item["member"]):
        member_id = int(result["member"])
        frames = result["frames"]
        if not frames:
            raise ValueError(f"member {member_id} for {iid} has no saved frames")
        shapes = {np.asarray(frame).shape for frame in frames.values()}
        if len(shapes) != 1 or next(iter(shapes)) != (SETUP[iid]["domain"]["cells_per_side"],) * 2:
            raise ValueError(f"member {member_id} for {iid} has unexpected frame dimensions: {shapes}")
        source_frames = result.get("source_frames", {})
        if any(int(source_frames.get(hour, -1)) != int(hour) for hour in frames):
            raise ValueError(f"member {member_id} for {iid} is missing a required exact-horizon frame")
        artifact = incident_dir / f"member_{member_id:03d}.npz"
        temporary = artifact.with_suffix(".npz.tmp")
        payload = {
            f"hour_{int(hour):02d}": np.asarray(grid, dtype=np.bool_)
            for hour, grid in sorted(frames.items())
        }
        payload.update({
            "member": np.asarray(member_id, dtype=np.int32),
            "last_frame": np.asarray(int(result["last_frame"]), dtype=np.int32),
            "ignition_row_col": np.asarray(result["ign_rc"], dtype=np.int32),
            "wind_speed_factor": np.asarray(result.get("wind_speed_factor", np.nan), dtype=np.float64),
            "wind_direction_offset_deg": np.asarray(result.get("wind_direction_offset_deg", np.nan), dtype=np.float64),
        })
        with temporary.open("wb") as dst:
            np.savez_compressed(dst, **payload)
            dst.flush()
            os.fsync(dst.fileno())
        os.replace(temporary, artifact)
        entries.append({
            "member": member_id,
            "file": artifact.name,
            "sha256": sha256_file(artifact),
            "frame_hours": sorted(int(hour) for hour in frames),
            "source_frame_hours": {str(int(hour)): int(source_frames[hour]) for hour in sorted(frames)},
            "last_frame": int(result["last_frame"]),
            "ignition_row_col": [int(value) for value in result["ign_rc"]],
            "wind_speed_factor": result.get("wind_speed_factor"),
            "wind_direction_offset_deg": result.get("wind_direction_offset_deg"),
        })

    manifest = {
        "incident_id": iid,
        "ignition_jitter_radius_m": jitter_radius_m,
        "grid_shape": list(next(iter(members[0]["frames"].values())).shape) if members else None,
        "members_saved": len(entries),
        "members": entries,
    }
    manifest_path = incident_dir / "manifest.json"
    temporary_manifest = incident_dir / "manifest.json.tmp"
    temporary_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(temporary_manifest, manifest_path)
    return manifest_path


def write_run_provenance(results_dir: Path, member_count: int, jitter_radius_m: float) -> Path:
    """Record the exact local code, engine, and input artifacts used for recovery."""
    tracked_inputs = [
        Path(__file__),
        WEBSITE / "docs/simulation/PROTOCOL.md",
        WEBSITE / "data/resq5/protocol_setup.json",
        Path(BIN), LOOKUP_SRC,
        WEBSITE / "backend/inference/engine/fuel.py",
        WEBSITE / "backend/inference/engine/weather.py",
        WEBSITE / "backend/inference/engine/baseline.py",
        WEBSITE / "backend/inference/engine/smoulder.py",
        WEBSITE / "scripts/resq5/analyze.py",
        WEBSITE / "scripts/resq6/rescore_fair.py",
        WEBSITE / "docs/simulation/DECISION_RULE.md",
    ]
    for incident_id in SETUP:
        tracked_inputs.extend([
            WEBSITE / "data/resq5" / incident_id / "worldcover_2021_domain_window.tif",
            WEBSITE / "data/resq5" / incident_id / "copernicus_dem_glo30_domain_window.tif",
            WEBSITE / "data/resq2" / incident_id / "weather_era5land_native_wind.csv",
        ])
    hashes = {}
    for path in tracked_inputs:
        if not path.is_file():
            raise FileNotFoundError(f"required reproducibility input missing: {path}")
        try:
            label = str(path.relative_to(WEBSITE))
        except ValueError:
            label = str(path)
        hashes[label] = sha256_file(path)

    try:
        import sklearn
    except ImportError:
        sklearn = None
    metadata = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "RESQ6 Step 2a development-only horizon-aligned member-grid evaluation",
        "protocol": "docs/simulation/PROTOCOL.md; development set only",
        "git_head": subprocess.run(
            ["git", "-C", str(WEBSITE), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "pandas": pd.__version__,
        "scikit_learn": getattr(sklearn, "__version__", None),
        "cell2fire_binary": str(Path(BIN)),
        "input_sha256": hashes,
        "member_count": member_count,
        "ignition_jitter_radius_m": jitter_radius_m,
        "wind_perturbation_seed_rule": "incident jitter_seed + member index",
        "incident_ids": list(SETUP),
    }
    path = results_dir / "recovery_provenance.json"
    temp = path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(metadata, indent=2) + "\n")
    os.replace(temp, path)
    return path


def write_incident_result(results_dir: Path, result: dict) -> Path:
    """Persist a completed incident immediately, including during `all` runs."""
    results_dir.mkdir(parents=True, exist_ok=True)
    incident_path = results_dir / f"{result['incident_id']}.json"
    incident_path.write_text(json.dumps(result, indent=2, default=str))
    return incident_path


def write_aggregate_results(
    results_dir: Path,
    results: list[dict],
    *,
    target: str,
    smoke: bool,
) -> Path | None:
    """Publish a complete-run aggregate, never a partial single-incident list.

    The CLI permits a single-incident run for development iteration. Such a
    run must not replace ``dev_all.json``/``smoke_all.json`` with a partial
    list and make it look like a complete-set result.
    """
    if target != "all":
        return None

    results_dir.mkdir(parents=True, exist_ok=True)
    aggregate_path = results_dir / ("smoke_all.json" if smoke else "dev_all.json")
    aggregate_path.write_text(json.dumps(results, indent=2, default=str))
    return aggregate_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", nargs="?", default="all", help="incident ID or all")
    parser.add_argument("--members", type=int)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--save-member-grids", action="store_true")
    parser.add_argument("--ignition-jitter-radius-m", type=float, default=JITTER_RADIUS_M)
    args = parser.parse_args()
    smoke = args.smoke
    n_members = args.members if args.members is not None else (3 if smoke else 60)
    if n_members < 1:
        parser.error("--members must be positive")
    if not math.isfinite(args.ignition_jitter_radius_m) or not 0 <= args.ignition_jitter_radius_m <= JITTER_RADIUS_M:
        parser.error(f"--ignition-jitter-radius-m must be between 0 and {JITTER_RADIUS_M:g}")
    target = args.target
    results_dir = RESULTS_DIR
    if args.output_dir is not None:
        results_dir = args.output_dir
        if not results_dir.is_absolute():
            results_dir = WEBSITE / results_dir
        results_dir = results_dir.resolve()
        if results_dir.exists():
            parser.error(f"refusing to reuse existing output directory: {results_dir}")
    if args.save_member_grids and args.output_dir is None:
        parser.error("--save-member-grids requires a new, explicit --output-dir")
    incident_ids = list(SETUP) if target == "all" else [target]
    unknown = [iid for iid in incident_ids if iid not in SETUP]
    if unknown:
        parser.error(f"unknown incident ID(s): {', '.join(unknown)}")

    results_dir.mkdir(parents=True, exist_ok=True)
    if args.save_member_grids:
        write_run_provenance(results_dir, n_members, args.ignition_jitter_radius_m)

    all_results = []
    for iid in incident_ids:
        print(f"=== {iid} ({n_members} members) ===", flush=True)
        res = run_incident(
            iid, n_members, smoke,
            artifact_dir=results_dir if args.save_member_grids else None,
            jitter_radius_m=args.ignition_jitter_radius_m,
        )
        all_results.append(res)
        write_incident_result(results_dir, res)
        print(f"{iid}: {res['n_members_ok']}/{n_members} ok, {res['wall_s_total']}s total", flush=True)

    write_aggregate_results(results_dir, all_results, target=target, smoke=smoke)


if __name__ == "__main__":
    main()
