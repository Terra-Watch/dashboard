"""Writes src/features/landing/snapshotData.ts from one archived forecast day.
Usage: python scripts/make_snapshot.py ../backend/app/area_forecast_data/2025-03-10.json ../backend/models/risk/cell_centers.csv
Each forest cell takes the level of the 0.5 degree area that holds it. Bands 0-3 are Extreme, High, Moderate and None; band 4 is a cell no area covers."""
import sys, json, pandas as pd
day = json.load(open(sys.argv[1])); r = pd.read_csv(sys.argv[2])
r["x"] = ((r.lon - r.lon.min()) * 10).round().astype(int); r["y"] = ((r.lat.max() - r.lat) * 10).round().astype(int)
assert not r.duplicated(["x", "y"]).any(), "two cells share a pixel: the grid is finer than 0.1 degree"
rank = {"extreme": 0, "high": 1, "moderate": 2, "none": 3}
def band(lon, lat):
    for a in day["areas"]:
        w, s, e, n = a["bbox"]
        if w <= lon < e and s <= lat < n: return rank[a["level"]]
    return 4
r["b"] = [band(lo, la) for lo, la in zip(r.lon, r.lat)]
def path(df):
    out = []
    for y, g in df.groupby("y"):
        xs = sorted(g.x); start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is not None and x == prev + 1: prev = x; continue
            out.append(f"M{start} {y}h{prev - start + 1}v1h-{prev - start + 1}z"); start = prev = x
    return "".join(out)
paths = [path(r[r.b == b]) if (r.b == b).any() else "" for b in range(5)]
w, h = int(r.x.max()) + 1, int(r.y.max()) + 1
states = sorted(r.state.unique())
body = (f"// Generated from the archived forecast for {day['date']} ({day['model']['id']} {day['model']['version']}), forest cell centres of the {len(states)} states, each shaded by the level of its 0.5 degree area.\n"
        f"// Bands 0-3 are Extreme, High, Moderate and None; band 4 is a forest cell no area covers.\n"
        f"export const SNAPSHOT = {{ date: '{day['date']}', width: {w}, height: {h}, cells: {len(r)}, ranked: {int((r.b < 4).sum())}, states: {json.dumps(states)},\n  paths: {json.dumps(paths)} }};\n")
open("src/features/landing/snapshotData.ts", "w").write(body); print(w, h, len(r), len(states), r.b.value_counts().sort_index().to_dict(), len(body) // 1000, "kB")
