"""RESQ-6 Step 3 item 1: scoring-only comparison of the wind-elongated
ellipse WITH vs WITHOUT the slope term (`docs/simulation/FALLBACK.md`
section 1), development set only, same ±500 m ignition-jitter blur and AP-
primary rule as `scripts/resq6/rescore_fair.py`. No Cell2Fire run. The
result decides whether `backend/inference/engine/spread_ellipse.py`
includes the slope term at all (it is included only if slope wins on more
cells than it loses, per instruction).
"""
from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from scipy import ndimage
from sklearn.metrics import average_precision_score

WEBSITE = Path(__file__).resolve().parents[2]
for p in ("backend/inference", "scripts/resq5", "scripts/resq3", "scripts/resq6"):
    sys.path.insert(0, str(WEBSITE / p))

from engine import baseline as ebaseline  # noqa: E402
from engine import weather as eweather  # noqa: E402
import analyze as resq5_analyze  # noqa: E402
import run_dev as rd  # noqa: E402

MARGIN = 0.05


def slope_tan_at_ignition(iid: str) -> float:
    s = rd.SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    west, north = d["west_m"], d["north_m"]
    with rasterio.open(WEBSITE / "data/resq5" / iid / "copernicus_dem_glo30_domain_window.tif") as r:
        dem = r.read(1).astype("float32")
        T = r.transform
    inv = Transformer.from_crs(d["crs"], 4326, always_xy=True)
    ci_ = (np.arange(n) + 0.5) * rd.CELL
    xc = west + ci_[None, :] + np.zeros((n, 1))
    yc = north - ci_[:, None] + np.zeros((1, n))
    lon, lat = inv.transform(xc.ravel(), yc.ravel())
    frow = (T.f - np.asarray(lat)) / abs(T.e) - 0.5
    fcol = (np.asarray(lon) - T.c) / T.a - 0.5
    elev = ndimage.map_coordinates(dem, [frow, fcol], order=1).reshape(n, n).astype("float32")
    gy, gx = np.gradient(elev, rd.CELL, rd.CELL)
    row = int(np.floor((north - s["ignition_utm_m"][1]) / rd.CELL))
    col = int(np.floor((s["ignition_utm_m"][0] - west) / rd.CELL))
    return float(np.hypot(gx[row, col], gy[row, col]))  # tan(slope) directly from the gradient magnitude


def blurred_ellipse_ap(iid: str, horizon_h: int, slope_tan: float, obs: np.ndarray) -> float | None:
    s = rd.SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    ci_ = (np.arange(n) + 0.5) * rd.CELL
    xc = d["west_m"] + ci_[None, :] + np.zeros((n, 1))
    yc = d["north_m"] - ci_[:, None] + np.zeros((1, n))
    dxj, dyj = rd.ignition_jitter(s["jitter_seed"], 60)
    t0 = pd.Timestamp(s["t0_utc"])
    series = eweather.fetch_era5land_historical(
        lat=s["ignition_lat_lon"][0], lon=s["ignition_lat_lon"][1],
        start_utc=t0.to_pydatetime().replace(tzinfo=datetime.timezone.utc),
        hours=s["weather_rows_hours"], incident_id=iid,
    )
    t0_dt = t0.to_pydatetime().replace(tzinfo=datetime.timezone.utc)
    t_end = (t0 + pd.Timedelta(hours=horizon_h)).to_pydatetime().replace(tzinfo=datetime.timezone.utc)
    v_mean = series.mean_speed(t0_dt, t_end)
    bearing = series.mean_vector_bearing(t0_dt, t_end)
    ign = np.array(s["ignition_utm_m"])
    p_sum = np.zeros((n, n))
    for j in range(60):
        jx, jy = ign[0] + dxj[j], ign[1] + dyj[j]
        dx_cells, dy_cells = xc - jx, yc - jy
        d_down, d_cross = ebaseline.downwind_crosswind_offsets(dx_cells, dy_cells, bearing)
        p_sum += ebaseline.wind_elongated_proximity(d_down, d_cross, horizon_h, v_mean, slope_tan=slope_tan)
    p = p_sum / 60
    if obs.min() == obs.max():
        return None
    return float(average_precision_score(obs.ravel().astype(int), p.ravel()))


def main():
    wins = losses = ties = 0
    rows = []
    for iid in rd.SETUP:
        slope_tan = slope_tan_at_ignition(iid)
        oa = resq5_analyze.observed_arrays(iid)
        used = rd.SETUP[iid]["overpasses_used"]
        for h in rd.HORIZONS_H:
            idx = [k for k, p in enumerate(used) if p["hours_since_t0"] <= h]
            if not idx:
                continue
            obs = oa["obs_nh"][max(idx)]
            ap_no_slope = blurred_ellipse_ap(iid, h, 0.0, obs)
            ap_slope = blurred_ellipse_ap(iid, h, slope_tan, obs)
            if ap_no_slope is None:
                continue
            delta = ap_slope - ap_no_slope
            call = "WIN" if delta >= MARGIN else ("LOSS" if delta <= -MARGIN else "TIE")
            if call == "WIN":
                wins += 1
            elif call == "LOSS":
                losses += 1
            else:
                ties += 1
            rows.append({"incident_id": iid, "horizon_h": h, "slope_tan": slope_tan, "ap_no_slope": ap_no_slope, "ap_slope": ap_slope, "delta": delta, "call": call})
            print(f"{iid} h={h:>2}h slope_tan={slope_tan:.3f}  AP no_slope={ap_no_slope:.3f} slope={ap_slope:.3f} delta={delta:+.3f} -> {call}", flush=True)

    decision = "INCLUDE slope term" if wins > losses else "DO NOT include slope term"
    print(f"\n{wins} wins, {ties} ties, {losses} losses for the slope term vs no-slope.")
    print("DECISION:", decision, f"(wins={wins} {'>' if wins > losses else '<='} losses={losses})")
    out = {"wins": wins, "ties": ties, "losses": losses, "decision": decision, "cells": rows}
    (WEBSITE / "results/resq6/dev/slope_term_scoring.json").write_text(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main()
