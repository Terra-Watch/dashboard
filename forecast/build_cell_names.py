"""Name every scored cell after the protected area or forest it lies in, from the WDPA polygons (national parks, sanctuaries, reserves, reserve and protected forests).
A cell gets the highest-ranked designation among the polygons that cover at least 25% of its 0.1 degree square; ties go to the larger overlap.
Usage: python forecast/build_cell_names.py --gdb <WDPA_..._IND.gdb> --cells ../terrawatch-datasets/dataset/forest_all_gfs/cells.parquet --out forecast/data/cell_names.json"""
import argparse, json, os
import numpy as np, pandas as pd, pyogrio, shapely
from shapely.strtree import STRtree
ap = argparse.ArgumentParser(); ap.add_argument("--gdb", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--rfa", help="Bharatmaps_RFA.parquet: names the cells WDPA leaves out by forest, range and division"); ap.add_argument("--out", required=True); a = ap.parse_args()
RANK = [("national park", 0), ("tiger reserve", 1), ("wildlife sanctuary", 1), ("sanctuary", 1), ("conservation reserve", 2), ("community reserve", 2), ("biosphere", 3), ("reserve forest", 4), ("reserved forest", 4), ("protected forest", 5)]
def rank(d):
    d = str(d).lower(); return next((r for k, r in RANK if k in d), 6)
NAMEKIND = [("national park", "National Park"), ("tiger reserve", "Tiger Reserve"), ("wildlife sanctuary", "Wildlife Sanctuary"), ("sanctuary", "Wildlife Sanctuary"), (" wls", "Wildlife Sanctuary"), ("_wl", "Wildlife Sanctuary"), (" wl", "Wildlife Sanctuary"), ("conservation reserve", "Conservation Reserve"), ("biosphere", "Biosphere Reserve")]
def kind(name, desig):
    n = f" {str(name).lower()}"; return next((k for key, k in NAMEKIND if key in n), str(desig))
t = pyogrio.read_dataframe(a.gdb, layer="WDPA_WDOECM_poly_Nov2026_IND", columns=["NAME_ENG", "NAME", "DESIG_ENG", "STATUS", "IUCN_CAT"])
t = t[t.STATUS.isin(["Designated", "Established", "Inscribed"])].reset_index(drop=True); t["kind"] = [kind(n, d) for n, d in zip(t.NAME_ENG, t.DESIG_ENG)]; t["rank"] = t.kind.map(rank)
g = shapely.make_valid(t.geometry.values); tree = STRtree(g)
cells = pd.read_parquet(a.cells, columns=["lat", "lon"]).drop_duplicates(); h = 0.05; out = {}
for r in cells.itertuples():
    b = shapely.box(r.lon - h, r.lat - h, r.lon + h, r.lat + h); idx = tree.query(b, predicate="intersects")
    if not len(idx): continue
    cov = np.array([g[i].intersection(b).area / b.area for i in idx]); keep = [(t["rank"][i], -c, i) for i, c in zip(idx, cov) if c >= 0.25]
    if not keep: continue
    i = min(keep)[2]; nm = str(t.NAME_ENG[i] or t.NAME[i]).replace("_", " ").strip()
    if nm and nm.lower() != "none": out[f"{r.lat:.1f},{r.lon:.1f}"] = {"name": nm, "kind": t.kind[i]}
if a.rfa:       # second pass: the reserved-forest polygon under the cell centre, named by its division and range
    import pyarrow.parquet as pq
    f = pq.ParquetFile(a.rfa).read(columns=["division", "range", "name_of_rf", "geometry"]).to_pandas(); fg = shapely.from_wkb(f.geometry.values); ft = STRtree(fg)
    rest = cells[[f"{r.lat:.1f},{r.lon:.1f}" not in out for r in cells.itertuples()]]
    pi, gi = ft.query(shapely.points(rest.lon.values, rest.lat.values), predicate="within")
    first = {}
    for q, j in zip(pi, gi): first.setdefault(q, j)
    for q, j in first.items():
        r = rest.iloc[q]; row = f.iloc[j]; div, rng = str(row.division).strip().title(), str(row.range).strip().title()
        if div or rng: out[f"{r.lat:.1f},{r.lon:.1f}"] = {"name": ", ".join(x + y for x, y in ((rng, " range"), (div, " division")) if x), "kind": "Reserved Forest"}
os.makedirs(os.path.dirname(a.out), exist_ok=True); json.dump(out, open(a.out, "w"), separators=(",", ":"), ensure_ascii=False)
k = pd.Series([v["kind"] for v in out.values()]); print(len(out), "of", len(cells), "cells named"); print(k.value_counts().head(8))
