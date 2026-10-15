"""Which GFS pixel does the runner use (rows[0] of gfs00_2024_01.csv), where is it, and what does the pixel nearest to the ignition say on the same day?
Uses the research repo's cell->pixel table and its (reconstructed) grid. Read-only; writes docs/sim_diagnosis/weather_pixel_check.json."""
import csv, json, math
from pathlib import Path
import numpy as np, pandas as pd
W = Path("/Users/kireeti/Desktop/Projects/RESQ/website"); D = W / "docs/sim_diagnosis"
LAT0, LON0 = 21.867894, 86.500688
g = pd.read_csv("/Users/kireeti/wildfire-data/processed/grid.csv")
cp = pd.read_csv("/Users/kireeti/wildfire-research/proposed/imagery/gfs_cell_pixel.csv").set_index("cell").pixel
with open(W / "backend/runtime_data/simulation_demo/weather/gfs00_2024_01.csv") as f:
    r = csv.DictReader(f); first = next(r); rows = {first["pixel"]: first} if first["day"] == "19723" else {}
    used = (first["pixel"], first["day"])
    nearest_pix = None
d = np.hypot((g.lat - LAT0) * 111.19, (g.lon - LON0) * 111.19 * math.cos(math.radians(LAT0)))
g["km"] = d; n = g.nsmallest(1, "km").iloc[0]; nearest_pix = str(int(cp[int(n.cell)]))
with open(W / "backend/runtime_data/simulation_demo/weather/gfs00_2024_01.csv") as f:
    for x in csv.DictReader(f):
        if x["day"] == "19723" and x["pixel"] in (used[0], nearest_pix): rows[x["pixel"]] = x
def wind(x): 
    out = []
    for h in range(6, 18):
        u = float(x[f"u10_h{h:02d}"]) / 100; v = float(x[f"v10_h{h:02d}"]) / 100
        out.append([round(math.hypot(u, v) * 3.6, 1), round((math.degrees(math.atan2(-u, -v)) + 360) % 360)])
    return out
cells = cp[cp == int(used[0])].index.values
gs = g.set_index("cell").loc[cells]
res = {"runner_pixel": used[0], "runner_day_number": used[1], "runner_day_is": "2024-01-01",
       "runner_pixel_cells": int(len(cells)), "runner_pixel_states": gs.state.value_counts().to_dict(),
       "runner_pixel_mean_lat_lon": [float(gs.lat.mean()), float(gs.lon.mean())],
       "distance_runner_pixel_to_origin_km": float(math.hypot((gs.lat.mean() - LAT0) * 111.19, (gs.lon.mean() - LON0) * 111.19 * math.cos(math.radians(LAT0)))),
       "nearest_research_grid_cell": int(n.cell), "nearest_cell_distance_km": float(n.km), "nearest_cell_state": n.state, "nearest_cell_pixel": nearest_pix,
       "wind_kmh_fromdeg_h06_h17_runner_pixel": wind(rows[used[0]]), "wind_kmh_fromdeg_h06_h17_nearest_pixel": wind(rows[nearest_pix])}
(D / "weather_pixel_check.json").write_text(json.dumps(res, indent=1))
print(json.dumps({k: v for k, v in res.items() if "wind" not in k}, indent=1))
