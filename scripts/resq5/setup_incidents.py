"""RESQ-5 protocol geometry: ignition time, domain, overpass list per incident. Inputs only; no simulation.

Writes data/resq5/protocol_setup.json. Definitions are those of docs/RESQ5_PROTOCOL.md.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "scripts/resq3"))
import check_inputs as ci  # noqa: E402

INCIDENTS = ["E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286"]
SEEDS = {"E2024-131853": 5001, "E2024-135332": 5002, "E2023-084925": 5003, "E2024-155286": 5004}
UTM = "EPSG:32644"          # 78-84 E; all four ignitions lie in this zone
CELL_OBS = 375.0
CELL_SIM = 30.0
MARGIN_M = 3000.0
MAX_HOURS = 72
IGNITION_LEAD_H = 12
JITTER_M = 500.0
N_JITTER = 30


def jitter_points(seed: int):
    rng = np.random.default_rng(seed)
    r = JITTER_M * np.sqrt(rng.uniform(size=N_JITTER))
    a = rng.uniform(0, 2 * np.pi, size=N_JITTER)
    return r * np.cos(a), r * np.sin(a)


def main():
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    to_utm = Transformer.from_crs(4326, UTM, always_xy=True)
    out = {}
    for iid in INCIDENTS:
        row = next(cand[cand.event_id == iid].itertuples())
        folder = WEBSITE / "data/resq2" / iid
        _, ev = ci.event_detections(row, folder)
        ev = ev.copy()
        ev["time"] = pd.to_datetime(ev.acq_date) + pd.to_timedelta(ev.acq_time // 100, unit="h") + pd.to_timedelta(ev.acq_time % 100, unit="m")
        first = ev.time.min()
        t0 = (first - pd.Timedelta(hours=IGNITION_LEAD_H)).floor("h")
        x, y = to_utm.transform(ev.longitude.values, ev.latitude.values)
        ix = np.floor(x / CELL_OBS).astype(int); iy = np.floor(y / CELL_OBS).astype(int)
        # domain: square, 30 m cells, covering every 375 m detection cell of the full cluster plus 3 km
        xmin, xmax = ix.min() * CELL_OBS - MARGIN_M, (ix.max() + 1) * CELL_OBS + MARGIN_M
        ymin, ymax = iy.min() * CELL_OBS - MARGIN_M, (iy.max() + 1) * CELL_OBS + MARGIN_M
        side = max(xmax - xmin, ymax - ymin)
        n = int(math.ceil(side / CELL_SIM))
        cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
        x0 = round(cx - n * CELL_SIM / 2); y1 = round(cy + n * CELL_SIM / 2)       # west edge, north edge (m), whole metres
        ign_x, ign_y = to_utm.transform(row.ign_lon, row.ign_lat)
        # overpasses: satellite-date-day/night passes with >= 1 nominal/high detection, inside (t0, t0+72h]
        nh = ev[ev.confidence.isin(["n", "h"])].copy()
        nh["pass"] = nh.satellite + "|" + nh.acq_date + "|" + nh.daynight
        passes = []
        for key, g in nh.groupby("pass"):
            t = g.time.median().floor("min")
            passes.append({"pass": key, "time_utc": str(t), "n_nh": int(len(g)), "hours_since_t0": round((t - t0).total_seconds() / 3600, 2)})
        passes = sorted(passes, key=lambda p: p["time_utc"])
        used = [p for p in passes if 0 < p["hours_since_t0"] <= MAX_HOURS]
        t_last = max(p["hours_since_t0"] for p in used)
        hours = int(math.ceil(t_last))
        dx, dy = jitter_points(SEEDS[iid])
        out[iid] = {
            "state": row.state, "ignition_lat_lon": [row.ign_lat, row.ign_lon], "ignition_utm_m": [round(ign_x, 1), round(ign_y, 1)],
            "first_detection_utc": str(first), "t0_utc": str(t0), "weather_rows_hours": hours, "last_overpass_hours_since_t0": round(t_last, 2),
            "domain": {"crs": UTM, "west_m": x0, "north_m": y1, "cells_per_side": n, "side_km": round(n * CELL_SIM / 1000, 2),
                       "cluster_bbox_km": [round((ix.max() - ix.min() + 1) * CELL_OBS / 1000, 2), round((iy.max() - iy.min() + 1) * CELL_OBS / 1000, 2)], "n_cells": n * n},
            "ignition_cell_rowcol": [int((y1 - ign_y) // CELL_SIM), int((ign_x - x0) // CELL_SIM)],
            "jitter_seed": SEEDS[iid], "jitter_offsets_m_first3": [[round(float(a), 1), round(float(b), 1)] for a, b in list(zip(dx, dy))[:3]],
            "cluster_detections_all_conf": int(len(ev)), "cluster_detections_nh": int(len(nh)),
            "overpasses_all_listed": len(passes), "overpasses_used": used,
        }
        print(iid, out[iid]["t0_utc"], "hours", hours, "domain", out[iid]["domain"]["side_km"], "km", n, "cells; overpasses used", len(used), "of", len(passes))
    p = WEBSITE / "data/resq5/protocol_setup.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
