"""RESQ-4 step 4: synthetic spread test (flat, uniform fuel, 48 h). No incident data, nothing tuned.

A. burned area vs wind speed and fuel (500 x 500 cells of 30 m, constant wind from the west, runner arguments unchanged)
B. diagnostic ROS read-out with --ROS-Threshold 0.001 on a small grid (to see rates below the runner's 0.1 m/min); NOT used in A
C. do hourly wind changes (direction and speed) reach the model each hour?
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spread_harness as h  # noqa: E402

WEBSITE = h.WEBSITE
FUELS = {101: "GR1 (grass)", 145: "SH5 (shrub)", 182: "TL2 (broadleaf litter)"}
NONBURN = {91: "NB1", 92: "NB2", 93: "NB3", 98: "NB8", 99: "NB9"}


def part_a(winds):
    out = []
    for fuel, name in FUELS.items():
        for ws in winds:
            r = h.run_case(fuel, [ws] * 48, [270.0] * 48, n=500)
            f = r["frames"]
            last = r["last_frame"]
            fin = f.get(48) or f.get(max(k for k in f))
            row = {"fuel": fuel, "fuel_name": name, "wind_ms": round(ws, 2), "wind_kmh": round(ws * 3.6, 1), "area_ha_48h": fin["area_ha"], "cells_48h": fin["cells"],
                   "frame_hours_written": last, "clipped_by_domain_edge": r["first_edge_hour"] is not None, "first_edge_hour": r["first_edge_hour"],
                   "east_extent_km_at_edge_or_end": round(fin["east_m"] / 1000, 2), "area_ha_by_hour": {k: v["area_ha"] for k, v in f.items() if k in (1, 6, 12, 24, 36, 48)},
                   "ros_head_E_m_per_min": r["ros_by_direction_m_per_min"].get("E", {}).get("max"), "ros_by_direction": r["ros_by_direction_m_per_min"], "wall_s": r["wall_s"]}
            out.append(row)
            (WEBSITE / "results/resq4_spread_matrix.partial.json").write_text(json.dumps(out, indent=1))
            print("A", fuel, ws, row["area_ha_48h"], row["clipped_by_domain_edge"], row["ros_head_E_m_per_min"], flush=True)
    for fuel, name in NONBURN.items():
        r = h.run_case(fuel, [12.0] * 48, [270.0] * 48, n=100)
        out.append({"fuel": fuel, "fuel_name": name + " (non-burnable)", "wind_ms": 12.0, "area_ha_48h": r["frames"][max(r["frames"])]["area_ha"], "cells_48h": r["frames"][max(r["frames"])]["cells"], "frame_hours_written": r["last_frame"]})
    return out


def part_b(winds):
    out = []
    for fuel, name in FUELS.items():
        for ws in winds:
            r = h.run_case(fuel, [ws] * 24, [270.0] * 24, n=61, ign=(30, 30), extra_args=["--ROS-Threshold", "0.001"], frames=(0, 1, 2, 3, 6, 12, 24))
            ros = r["ros_by_direction_m_per_min"]
            out.append({"fuel": fuel, "fuel_name": name, "wind_ms": round(ws, 2), "head_E": ros.get("E", {}).get("max"), "flank_N": ros.get("N", {}).get("max"), "back_W": ros.get("W", {}).get("max"),
                        "cells_after_24h_with_threshold_0.001": r["frames"][max(r["frames"])]["cells"], "frame_hours_written": r["last_frame"], "ros": ros})
            print("B", fuel, ws, out[-1]["head_E"], out[-1]["back_W"], flush=True)
    return out


def hourly_profile(res_msgs_run, n):
    pass


def part_c():
    import tempfile
    out = {}
    seqs = {
        "direction_sequence": ([(4.0, 270.0), (4.0, 0.0), (4.0, 90.0), (4.0, 180.0)], "W,N,E,S at 4 m/s, 6 h each"),
        "speed_sequence": ([(1.0, 270.0), (4.0, 270.0), (8.0, 270.0), (2.0, 270.0)], "W at 1,4,8,2 m/s, 6 h each"),
    }
    for fuel in (101, 182):
        for key, (phases, label) in seqs.items():
            speeds, dirs = [], []
            for s, d in phases:
                speeds += [s] * 6
                dirs += [d] * 6
            r = h.run_case_messages(fuel, speeds, dirs, n=500, ign=(250, 250))
            out[f"{FUELS[fuel]} | {label}"] = r
    return out


def main():
    which = sys.argv[1:] or ["A", "B", "C"]
    if which == ["C"]:
        stats, observed = {}, []
    else:
        stats = json.loads((WEBSITE / "data/resq2/wind_stats.json").read_text())["pooled_era5land_native_speed_ms"]
        observed = [stats["q1"], stats["median"], stats["q3"], stats["max"]]
    winds = sorted({0.0, 2.0, 5.0, 8.0, 12.0, *observed})
    res = {"observed_pooled_era5land_ms": stats, "winds_ms": winds}
    if "B" in which:
        res["B"] = part_b(sorted({0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 12.0, *observed}))
        (WEBSITE / "results/resq4_ros_readout.json").write_text(json.dumps(res["B"], indent=1))
    if "C" in which:
        res["C"] = part_c()
        (WEBSITE / "results/resq4_hourly_wind_test.json").write_text(json.dumps(res["C"], indent=1))
    if "A" in which:
        res["A"] = part_a(winds)
        (WEBSITE / "results/resq4_spread_matrix.json").write_text(json.dumps(res["A"], indent=1))


if __name__ == "__main__":
    main()
