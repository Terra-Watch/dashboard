"""Synthetic Cell2Fire harness for RESQ-4 (flat uniform fuel; no incident data).

Same binary and command line as backend/inference/run_demo_simulation.py (the runner's command is
reproduced literally; only the instance/output folders differ). The lookup table is the runner's own
copy of the stock table. `extra_args` is used ONLY for the labelled diagnostic runs (lowered ROS
threshold to read sub-threshold rates); the burned-area tables use the runner's arguments unchanged.
"""
import csv
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd

WEBSITE = Path(__file__).resolve().parents[2]
BIN = "/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP = WEBSITE / "backend/runtime_data/simulation_demo/scenario/spain_lookup_table.csv"
SCRATCH = Path("/private/tmp/claude-501/-Users-kireeti-Desktop-Projects-RESQ/4361418d-a675-4bff-bd57-0ed65ade5e8e/scratchpad/spread")
CELL = 30
# (d_row, d_col) of a neighbour -> compass bearing of the movement (row 0 is north)
DIRS = {(0, 1): "E", (-1, 1): "NE", (-1, 0): "N", (-1, -1): "NW", (0, -1): "W", (1, -1): "SW", (1, 0): "S", (1, 1): "SE"}


def write_asc(path: Path, n: int, value: float):
    row = " ".join([str(int(value))] * n)
    with path.open("w") as f:
        f.write(f"ncols {n}\nnrows {n}\nxllcorner 0\nyllcorner 0\ncellsize {CELL}\nNODATA_value -9999\n")
        f.write("\n".join([row] * n) + "\n")


def run_case(fuel: int, speeds_ms, dirs_from, n: int = 500, ign=None, extra_args=None, frames=(0, 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48)):
    """speeds_ms/dirs_from: one value per hour (m/s; meteorological 'from' degrees). Returns a dict of results."""
    SCRATCH.mkdir(parents=True, exist_ok=True)
    hours = len(speeds_ms)
    ign = ign or (n // 2, int(0.12 * n))
    with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
        tmp = Path(tmp)
        (tmp / "scenario").mkdir(); (tmp / "run").mkdir()
        sc = tmp / "scenario"
        for name, val in (("fuels.asc", fuel), ("elevation.asc", 500), ("slope.asc", 0), ("saz.asc", 0)):
            write_asc(sc / name, n, val)
        (sc / "spain_lookup_table.csv").write_text(LOOKUP.read_text())
        with (sc / "Weather.csv").open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
            for h in range(hours):
                w.writerow(["syn", f"2024-01-01 {h % 24:02d}:00", f"{max(0.1, speeds_ms[h] * 3.6):.3f}", f"{dirs_from[h]:.3f}", 1])
        with (sc / "Ignitions.csv").open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["Year", "Ncell"]); w.writerow([1, ign[0] * n + ign[1] + 1])
        cmd = [BIN, "--input-instance-folder", str(sc) + "/", "--output-folder", str(tmp / "run") + "/", "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid",
               "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"] + (extra_args or [])
        t0 = time.time()
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        wall = time.time() - t0
        if r.returncode:
            raise RuntimeError((r.stdout + r.stderr)[-800:])
        grids = tmp / "run/Grids/Grids1"
        found = {int(p.stem[10:]): p for p in grids.glob("ForestGrid*.csv")}
        res = {"fuel": fuel, "n": n, "hours": hours, "ign": list(ign), "wall_s": round(wall, 1), "frames": {}}
        touched = None
        for h in frames:
            if h not in found:
                continue
            g = pd.read_csv(found[h], header=None).values == 1
            rr, cc = np.where(g)
            cnt = int(g.sum())
            edge = bool(g[0].any() or g[-1].any() or g[:, 0].any() or g[:, -1].any())
            if edge and touched is None:
                touched = h
            if cnt:
                ext = {"east_m": int(cc.max() - ign[1]) * CELL, "west_m": int(ign[1] - cc.min()) * CELL, "north_m": int(ign[0] - rr.min()) * CELL, "south_m": int(rr.max() - ign[0]) * CELL}
            else:                                    # ignition cell is non-burnable: nothing burns
                ext = {"east_m": 0, "west_m": 0, "north_m": 0, "south_m": 0}
            res["frames"][h] = {"cells": cnt, "area_ha": round(cnt * CELL * CELL / 1e4, 1), "touches_edge": edge, **ext}
        res["first_edge_hour"] = touched
        last = max(found)
        res["last_frame"] = last
        # ROS values used by the model (m/min), by direction of the propagation edge
        msg = tmp / "run/Messages/MessagesFile1.csv"
        ros = {}
        if msg.exists() and msg.stat().st_size:
            m = pd.read_csv(msg, header=None, names=["src", "dst", "t_min", "ros"])
            m["dr"] = (m.dst - 1) // n - (m.src - 1) // n
            m["dc"] = (m.dst - 1) % n - (m.src - 1) % n
            m = m[(m.dr.abs() <= 1) & (m.dc.abs() <= 1)]
            m["dir"] = [DIRS.get((a, b)) for a, b in zip(m.dr, m.dc)]
            for d, g in m.groupby("dir"):
                ros[d] = {"n": int(len(g)), "min": round(float(g.ros.min()), 2), "median": round(float(g.ros.median()), 2), "max": round(float(g.ros.max()), 2)}
            res["messages"] = int(len(m))
        res["ros_by_direction_m_per_min"] = ros
        res["stdout_tail"] = r.stdout[-300:]
        return res


def run_case_messages(fuel, speeds_ms, dirs_from, n=500, ign=None):
    """Hourly head-rate read-out: for each model hour, the largest ROS and its direction among edges fired in that hour."""
    SCRATCH.mkdir(parents=True, exist_ok=True)
    hours = len(speeds_ms)
    ign = ign or (n // 2, n // 2)
    with tempfile.TemporaryDirectory(dir=SCRATCH) as tmp:
        tmp = Path(tmp)
        (tmp / "scenario").mkdir(); (tmp / "run").mkdir()
        sc = tmp / "scenario"
        for name, val in (("fuels.asc", fuel), ("elevation.asc", 500), ("slope.asc", 0), ("saz.asc", 0)):
            write_asc(sc / name, n, val)
        (sc / "spain_lookup_table.csv").write_text(LOOKUP.read_text())
        with (sc / "Weather.csv").open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
            for hh in range(hours):
                w.writerow(["syn", f"2024-01-01 {hh % 24:02d}:00", f"{max(0.1, speeds_ms[hh] * 3.6):.3f}", f"{dirs_from[hh]:.3f}", 1])
        with (sc / "Ignitions.csv").open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["Year", "Ncell"]); w.writerow([1, ign[0] * n + ign[1] + 1])
        cmd = [BIN, "--input-instance-folder", str(sc) + "/", "--output-folder", str(tmp / "run") + "/", "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid",
               "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if r.returncode:
            raise RuntimeError((r.stdout + r.stderr)[-800:])
        m = pd.read_csv(tmp / "run/Messages/MessagesFile1.csv", header=None, names=["src", "dst", "t_min", "ros"])
        m["dr"] = (m.dst - 1) // n - (m.src - 1) // n
        m["dc"] = (m.dst - 1) % n - (m.src - 1) % n
        m = m[(m.dr.abs() <= 1) & (m.dc.abs() <= 1)]
        m["dir"] = [DIRS.get((a, b)) for a, b in zip(m.dr, m.dc)]
        m["hour"] = m.t_min // 60
        rows = []
        for hh in range(hours):
            g = m[m.hour == hh]
            if g.empty:
                rows.append({"hour": hh, "wind_ms": speeds_ms[hh], "wind_from": dirs_from[hh], "edges": 0})
                continue
            top = g.loc[g.ros.idxmax()]
            by_dir = g.groupby("dir").ros.max().round(2).to_dict()
            rows.append({"hour": hh, "wind_ms": speeds_ms[hh], "wind_from": dirs_from[hh], "edges": int(len(g)), "max_ros": round(float(top.ros), 2), "max_ros_dir": top["dir"], "ros_by_dir_max": by_dir})
        grids = tmp / "run/Grids/Grids1"
        cells = {}
        for hh in (6, 12, 18, 24):
            p = grids / f"ForestGrid{hh}.csv"
            if p.exists():
                g = pd.read_csv(p, header=None).values == 1
                rr, cc = np.where(g)
                cells[hh] = {"cells": int(g.sum()), "east_m": int(cc.max() - ign[1]) * CELL, "west_m": int(ign[1] - cc.min()) * CELL, "north_m": int(ign[0] - rr.min()) * CELL, "south_m": int(rr.max() - ign[0]) * CELL}
        return {"fuel": fuel, "hours": rows, "extent_at_hour": cells, "last_frame": max(int(p.stem[10:]) for p in grids.glob("ForestGrid*.csv"))}
