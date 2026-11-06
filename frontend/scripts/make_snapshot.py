"""Writes src/features/landing/snapshotData.ts from one scored forecast day (scores.parquet from website/forecast/live/score_daily.py).
Usage: python scripts/make_snapshot.py SCORES.parquet [--states STATES_TXT]  Ranks only: bands 0-3 are Very high, High, Moderate, Low; band 4 is a cell with no ranking that day."""
import sys, json, pandas as pd
src = sys.argv[1]; r = pd.read_parquet(src); info = json.load(open(src.replace("scores.parquet", "run.json")))
r["x"] = ((r.lon - r.lon.min()) * 10).round().astype(int); r["y"] = ((r.lat.max() - r.lat) * 10).round().astype(int)
assert not r.duplicated(["x", "y"]).any(), "two cells share a pixel: the grid is finer than 0.1 degree"
band = {"Very high": 0, "High": 1, "Moderate": 2, "Low": 3}; r["b"] = r.band.map(band)
def path(df):
    out = []
    for y, g in df.groupby("y"):
        xs = sorted(g.x); start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == prev + 1: prev = x; continue
            out.append(f"M{start} {y}h{prev - start + 1}v1h-{prev - start + 1}z"); start = prev = x
    return "".join(out)
paths = [path(r[r.b == b]) for b in range(4)] + [""]
w, h = int(r.x.max()) + 1, int(r.y.max()) + 1
states = sorted(r.state.unique())
body = (f"// Generated from the forecast for {info['forecast_date']} (issued {info['issue_day']}; model {info['model_id']} {info['model_version']}), cell centres of the {len(states)} states in the bundle.\n"
        f"// Ranks only: bands 0-3 are Very high, High, Moderate and Low; band 4 is a forest cell with no ranking that day.\n"
        f"export const SNAPSHOT = {{ date: '{info['forecast_date']}', width: {w}, height: {h}, cells: {len(r)}, ranked: {len(r)}, states: {json.dumps(states)},\n  paths: {json.dumps(paths)} }};\n")
open("src/features/landing/snapshotData.ts", "w").write(body); print(w, h, len(r), len(states), len(body) // 1000, "kB")
