"""RESQ-5 replay: 30 ignition jitters x 3 wind sources per incident, exactly as docs/RESQ5_PROTOCOL.md.

Nothing here tunes anything. Scenario construction follows the protocol (fuel crosswalk, DEM, weather rows);
the simulator is the unmodified Cell2Fire binary with the runner's command line.
Usage: replay.py <incident_id> [--smoke]   (--smoke: one member, one source, result discarded)
"""
import csv
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import traceback
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from scipy import ndimage

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "scripts/resq3"))
sys.path.insert(0, str(WEBSITE / "scripts/resq5"))
BIN = "/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP = WEBSITE / "backend/runtime_data/simulation_demo/scenario/spain_lookup_table.csv"
SCRATCH = Path("/private/tmp/claude-501/-Users-kireeti-Desktop-Projects-RESQ/4361418d-a675-4bff-bd57-0ed65ade5e8e/scratchpad/resq5")
RESULTS = WEBSITE / "results/resq5"
SETUP = json.loads((WEBSITE / "data/resq5/protocol_setup.json").read_text())
CELL = 30.0
SOURCES = {
    "era5land_native": ("weather_era5land_native_wind.csv", "wind_speed_ms", "wind_from_deg"),
    "era5_025": ("weather_era5_wind_and_surface.csv", "wind_speed_10m", "wind_direction_10m"),
    "best_match": ("weather_best_match_sensitivity_not_reanalysis.csv", "wind_speed_10m", "wind_direction_10m"),
}
CLASSES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]         # ascending: argmax ties go to the lower class
FUEL_OF_CLASS = {10: 182, 30: 101, 40: 93, 50: 91, 60: 99, 80: 98}   # every other class -> 99 (non-burnable)
UTM = "EPSG:32644"
N_JITTER = 30


def jitter(seed):
    rng = np.random.default_rng(seed)
    r = 500.0 * np.sqrt(rng.uniform(size=N_JITTER))
    a = rng.uniform(0, 2 * np.pi, size=N_JITTER)
    return r * np.cos(a), r * np.sin(a)


def write_asc(path, arr, west, south_m, fmt):
    n = arr.shape[0]
    with open(path, "w") as f:
        f.write(f"ncols {n}\nnrows {n}\nxllcorner {west}\nyllcorner {south_m}\ncellsize {int(CELL)}\nNODATA_value -9999\n")
        for row in arr:
            f.write(" ".join(fmt(v) for v in row) + "\n")


def build_inputs(iid, shared: Path):
    s = SETUP[iid]; d = s["domain"]; n = d["cells_per_side"]; west = d["west_m"]; north = d["north_m"]
    ci = (np.arange(n) + 0.5) * CELL
    xc = west + ci[None, :] + np.zeros((n, 1))
    yc = north - ci[:, None] + np.zeros((1, n))
    inv = Transformer.from_crs(UTM, 4326, always_xy=True)
    # ---- fuel: majority of nine 10 m samples (nearest pixel) per 30 m cell
    folder = WEBSITE / "data/resq5" / iid
    with rasterio.open(folder / "worldcover_2021_domain_window.tif") as r:
        wc = r.read(1)
        T = r.transform
    counts = np.zeros((n, n, len(CLASSES)), dtype=np.int16)
    for dx in (-10.0, 0.0, 10.0):
        for dy in (-10.0, 0.0, 10.0):
            lon, lat = inv.transform((xc + dx).ravel(), (yc + dy).ravel())
            rows = np.floor((T.f - np.asarray(lat)) / abs(T.e)).astype(int)
            cols = np.floor((np.asarray(lon) - T.c) / T.a).astype(int)
            if rows.min() < 0 or cols.min() < 0 or rows.max() >= wc.shape[0] or cols.max() >= wc.shape[1]:
                raise RuntimeError(f"{iid}: WorldCover window does not cover the domain")
            cls = wc[rows, cols].reshape(n, n)
            for k, c in enumerate(CLASSES):
                counts[:, :, k] += (cls == c)
    cell_class = np.array(CLASSES)[counts.argmax(axis=2)]
    fuel = np.vectorize(lambda c: FUEL_OF_CLASS.get(int(c), 99))(cell_class).astype("int32")
    # ---- DEM: bilinear at cell centres, integer metres as the runner writes
    with rasterio.open(folder / "copernicus_dem_glo30_domain_window.tif") as r:
        dem = r.read(1).astype("float32")
        Td = r.transform
    lon, lat = inv.transform(xc.ravel(), yc.ravel())
    frow = (Td.f - np.asarray(lat)) / abs(Td.e) - 0.5
    fcol = (np.asarray(lon) - Td.c) / Td.a - 0.5
    if frow.min() < 0 or fcol.min() < 0 or frow.max() > dem.shape[0] - 1 or fcol.max() > dem.shape[1] - 1:
        raise RuntimeError(f"{iid}: DEM window does not cover the domain")
    elev = ndimage.map_coordinates(dem, [frow, fcol], order=1).reshape(n, n).astype("float32")
    gy, gx = np.gradient(elev, CELL, CELL)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")
    aspect = ((np.degrees(np.arctan2(-gx, gy)) + 360) % 360).astype("float32")
    south = north - n * CELL
    shared.mkdir(parents=True, exist_ok=True)
    fmt = lambda v: str(int(v))   # noqa: E731  (the runner truncates with int())
    write_asc(shared / "fuels.asc", fuel, west, south, fmt)
    write_asc(shared / "elevation.asc", elev, west, south, fmt)
    write_asc(shared / "slope.asc", slope, west, south, fmt)
    write_asc(shared / "saz.asc", aspect, west, south, fmt)
    (shared / "spain_lookup_table.csv").write_text(LOOKUP.read_text())
    summary = {"fuel_cell_share": {str(int(k)): round(float((fuel == k).mean()) * 100, 1) for k in np.unique(fuel)},
               "worldcover_class_share": {str(int(k)): round(float((cell_class == k).mean()) * 100, 1) for k in np.unique(cell_class)},
               "elevation_m": [float(elev.min()), float(elev.max())], "max_slope_deg": round(float(slope.max()), 1),
               "max_slope_ratio_between_neighbours": round(float(np.maximum(np.abs(np.diff(elev, axis=0)).max(), np.abs(np.diff(elev, axis=1)).max()) / CELL), 3)}
    return fuel, summary


def weather_rows(iid, source):
    s = SETUP[iid]
    f, scol, dcol = SOURCES[source]
    df = pd.read_csv(WEBSITE / "data/resq2" / iid / f, parse_dates=["time"]).set_index("time")
    idx = pd.date_range(pd.Timestamp(s["t0_utc"]), periods=s["weather_rows_hours"], freq="h")
    sub = df.loc[idx]
    if sub[[scol, dcol]].isna().any().any():
        raise RuntimeError(f"{iid}/{source}: missing wind values in the replay window")
    return idx, sub[scol].values.astype(float), sub[dcol].values.astype(float)


def run_member(args):
    iid, source, member, shared, want_frames = args
    s = SETUP[iid]; d = s["domain"]; n = d["cells_per_side"]
    t_start = time.time()
    try:
        idx, ws, wd = weather_rows(iid, source)
        dx, dy = jitter(s["jitter_seed"])
        x = s["ignition_utm_m"][0] + dx[member]; y = s["ignition_utm_m"][1] + dy[member]
        row = int(math.floor((d["north_m"] - y) / CELL)); col = int(math.floor((x - d["west_m"]) / CELL))
        SCRATCH.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
            tmp = Path(tmp)
            sc = tmp / "scenario"; sc.mkdir(); (tmp / "run").mkdir()
            for name in ("fuels.asc", "elevation.asc", "slope.asc", "saz.asc", "spain_lookup_table.csv"):
                os.symlink(Path(shared) / name, sc / name)
            with (sc / "Weather.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
                for t, a, b in zip(idx, ws, wd):
                    w.writerow([iid, f"{t:%Y-%m-%d %H:%M}", f"{max(0.1, a * 3.6):.3f}", f"{b:.3f}", 1])
            with (sc / "Ignitions.csv").open("w", newline="") as f:
                w = csv.writer(f); w.writerow(["Year", "Ncell"]); w.writerow([1, row * n + col + 1])
            cmd = [BIN, "--input-instance-folder", str(sc) + "/", "--output-folder", str(tmp / "run") + "/", "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid",
                   "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            if r.returncode:
                return {"iid": iid, "source": source, "member": member, "error": (r.stdout + r.stderr)[-600:], "ign_rc": [row, col]}
            grids = tmp / "run/Grids/Grids1"
            avail = sorted(int(p.stem[10:]) for p in grids.glob("ForestGrid*.csv"))
            out = {}
            for h in sorted(set(want_frames)):
                use = h if h in avail else max(a for a in avail if a <= h)
                out[h] = (pd.read_csv(grids / f"ForestGrid{use}.csv", header=None).values == 1)
            burnable = None
            return {"iid": iid, "source": source, "member": member, "frames": out, "last_frame": max(avail), "ign_rc": [row, col], "wall_s": round(time.time() - t_start, 1)}
    except Exception as exc:                    # report and continue
        return {"iid": iid, "source": source, "member": member, "error": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-500:]}", "wall_s": round(time.time() - t_start, 1)}


def main(iid, smoke=False):
    s = SETUP[iid]
    shared = SCRATCH / iid / "shared"
    fuel, fsum = build_inputs(iid, shared)
    used = s["overpasses_used"]
    frames = sorted({int(math.floor(p["hours_since_t0"])) for p in used})
    members = [0] if smoke else list(range(N_JITTER))
    sources = ["era5land_native"] if smoke else list(SOURCES)
    jobs = [(iid, src, m, str(shared), frames) for src in sources for m in members]
    results = []
    workers = 1 if smoke else 7
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(run_member, jobs):
            results.append(res)
            print(iid, res["source"], res["member"], "ERROR" if "error" in res else f"ok {res['wall_s']}s ign {res['ign_rc']}", flush=True)
    import pickle
    out_dir = RESULTS / iid
    if smoke:
        out_dir = SCRATCH / "smoke" / iid
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(SCRATCH / iid / ("smoke.pkl" if smoke else "members.pkl"), "wb") as f:
        pickle.dump({"results": results, "fuel": fuel, "fuel_summary": fsum, "frames": frames}, f)
    ok = sum("error" not in r for r in results)
    print(iid, "members ok", ok, "of", len(results), "fuel", fsum["fuel_cell_share"], flush=True)


if __name__ == "__main__":
    main(sys.argv[1], smoke="--smoke" in sys.argv)
