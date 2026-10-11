"""RESQ-4 step 3: wind statistics (first 48 h after first detection) and disagreement between sources.

Sources per accepted incident (all hourly, UTC, at the ignition point):
  era5land_native : CDS reanalysis-era5-land u10/v10, 0.1 deg, nearest grid cell (no interpolation)
  era5_025        : Open-Meteo `era5` wind, 0.25 deg  (weather_era5_wind_and_surface.csv)
  best_match      : Open-Meteo `best_match`, NOT a reanalysis, sensitivity only
Window: hours h0 .. h0+47 where h0 = first-detection time floored to the hour (48 values).
Direction is the meteorological 'from' bearing; means are vector means (circular).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

WEBSITE = Path(__file__).resolve().parents[2]
OUT = WEBSITE / "data/resq2"
IDS = ["E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286"]


def uv(speed, from_deg):
    r = np.radians(from_deg)
    return -speed * np.sin(r), -speed * np.cos(r)


def circ_diff(a, b):
    return np.abs((a - b + 180) % 360 - 180)


def summarize(speed, direction):
    u, v = uv(speed, direction)
    mu, mv = u.mean(), v.mean()
    mean_dir = (np.degrees(np.arctan2(-mu, -mv)) + 360) % 360
    resultant = float(np.hypot(mu, mv) / max(speed.mean(), 1e-9))   # 1 = constant direction, 0 = no preferred direction
    return {"mean_ms": round(float(speed.mean()), 2), "q1_ms": round(float(np.percentile(speed, 25)), 2), "median_ms": round(float(np.median(speed)), 2),
            "q3_ms": round(float(np.percentile(speed, 75)), 2), "max_ms": round(float(speed.max()), 2), "min_ms": round(float(speed.min()), 2),
            "vector_mean_from_deg": round(float(mean_dir), 0), "direction_constancy": round(resultant, 2),
            "hourly_direction_range_deg": [round(float(direction.min()), 0), round(float(direction.max()), 0)]}


def main():
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str})
    res = {"window": "48 hourly values from the first-detection hour (UTC)", "incidents": {}}
    pooled = []
    for iid in IDS:
        row = next(cand[cand.event_id == iid].itertuples())
        h0 = pd.Timestamp(f"{row.first_date} {row.first_time_utc[:2]}:00")
        folder = OUT / iid
        nat = pd.read_csv(folder / "weather_era5land_native_wind.csv", parse_dates=["time"]).set_index("time")
        e5 = pd.read_csv(folder / "weather_era5_wind_and_surface.csv", parse_dates=["time"]).set_index("time")
        bm = pd.read_csv(folder / "weather_best_match_sensitivity_not_reanalysis.csv", parse_dates=["time"]).set_index("time")
        idx = pd.date_range(h0, periods=48, freq="h")
        series = {
            "era5land_native_0.1deg": (nat.loc[idx, "wind_speed_ms"].values, nat.loc[idx, "wind_from_deg"].values),
            "era5_0.25deg": (e5.loc[idx, "wind_speed_10m"].values, e5.loc[idx, "wind_direction_10m"].values),
            "best_match_not_reanalysis": (bm.loc[idx, "wind_speed_10m"].values, bm.loc[idx, "wind_direction_10m"].values),
        }
        out = {"window_start_utc": str(h0), "sources": {k: summarize(*v) for k, v in series.items()}, "differences": {}}
        ref_s, ref_d = series["era5land_native_0.1deg"]
        ru, rv = uv(ref_s, ref_d)
        for k, (s, d) in series.items():
            if k.startswith("era5land"):
                continue
            u, v = uv(s, d)
            out["differences"][f"{k}_minus_era5land"] = {
                "mean_speed_diff_ms": round(float((s - ref_s).mean()), 2), "mean_abs_speed_diff_ms": round(float(np.abs(s - ref_s).mean()), 2),
                "speed_ratio_of_means": round(float(s.mean() / max(ref_s.mean(), 1e-9)), 2), "speed_correlation": round(float(np.corrcoef(s, ref_s)[0, 1]), 2),
                "mean_abs_direction_diff_deg": round(float(circ_diff(d, ref_d).mean()), 0), "share_hours_direction_within_45deg_pct": round(float((circ_diff(d, ref_d) <= 45).mean() * 100), 0),
                "rms_vector_diff_ms": round(float(np.sqrt(((u - ru) ** 2 + (v - rv) ** 2).mean())), 2)}
        res["incidents"][iid] = out
        pooled.append(ref_s)
    pooled = np.concatenate(pooled)
    res["pooled_era5land_native_speed_ms"] = {"n": int(len(pooled)), "q1": round(float(np.percentile(pooled, 25)), 2), "median": round(float(np.median(pooled)), 2),
                                              "q3": round(float(np.percentile(pooled, 75)), 2), "max": round(float(pooled.max()), 2), "mean": round(float(pooled.mean()), 2)}
    (OUT / "wind_stats.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res["pooled_era5land_native_speed_ms"]))
    for iid, o in res["incidents"].items():
        print(iid, {k: (v["mean_ms"], v["max_ms"], v["vector_mean_from_deg"], v["direction_constancy"]) for k, v in o["sources"].items()})


if __name__ == "__main__":
    main()
