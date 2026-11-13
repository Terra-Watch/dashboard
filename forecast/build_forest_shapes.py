"""Forest outline of every scored cell, for the dashboard map: each 0.1 degree cell clipped to the forest land boundaries (reserved-forest polygons from Bharatmaps plus the SOI forest polygons),
so the map shades forest, not the towns, villages and fields that share the square. Writes frontend/public/forecast/forest_cells.json: {"lat,lon": [ring, ...]} with rings as [[lon, lat], ...].
Usage: python forecast/build_forest_shapes.py --fsi ../terrawatch-datasets/dataset/fsi_boundaries --cells ../terrawatch-datasets/dataset/forest_all_gfs/cells.parquet --out frontend/public/forecast/forest_cells.json
"""
import argparse, json
import numpy as np, pandas as pd, pyarrow.parquet as pq, shapely
from shapely.geometry import box
from shapely.strtree import STRtree

ap = argparse.ArgumentParser(); ap.add_argument("--fsi", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--out", required=True); ap.add_argument("--tol", type=float, default=0.003); a = ap.parse_args()
cells = pd.read_parquet(a.cells, columns=["lat", "lon"]).drop_duplicates()
geoms = []
for f in ("Bharatmaps_RFA", "SOI_Forests"):
    pf = pq.ParquetFile(f"{a.fsi}/{f}.parquet")
    for b in pf.iter_batches(batch_size=20000, columns=["geometry"]):
        g = shapely.from_wkb(b.column("geometry").to_numpy(zero_copy_only=False)); g = g[~shapely.is_missing(g)]
        geoms.append(shapely.simplify(g, a.tol))        # about 300 m: the outline is for the eye, not for surveying
geoms = np.concatenate(geoms); tree = STRtree(geoms); out = {}; h = 0.05
for r in cells.itertuples():
    b = box(r.lon - h, r.lat - h, r.lon + h, r.lat + h); idx = tree.query(b)
    if not len(idx): continue
    u = shapely.union_all(shapely.make_valid(geoms[idx])).intersection(b)
    rings = [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in getattr(u, "geoms", [u]) if p.geom_type == "Polygon" and not p.is_empty and p.area > 2e-4]
    if rings: out[f"{r.lat:.1f},{r.lon:.1f}"] = rings
json.dump(out, open(a.out, "w"), separators=(",", ":")); print(len(out), "of", len(cells), "cells have forest outline")
