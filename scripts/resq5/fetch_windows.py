"""RESQ-5 Amendment 1: re-read WorldCover and Copernicus DEM windows covering the protocol domain + 0.5 km.
Same sources and method as RESQ-3 (anonymous COG range reads); no rule change."""
import json
import math
import sys
from pathlib import Path

from pyproj import Transformer

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "scripts/resq3"))
import fetch_inputs as fi  # noqa: E402

setup = json.loads((WEBSITE / "data/resq5/protocol_setup.json").read_text())
inv = Transformer.from_crs(32644, 4326, always_xy=True)
for iid, v in setup.items():
    d = v["domain"]
    side = d["cells_per_side"] * 30
    pad = 500.0
    xs, ys = [], []
    for x, y in ((d["west_m"] - pad, d["north_m"] + pad), (d["west_m"] + side + pad, d["north_m"] + pad), (d["west_m"] - pad, d["north_m"] - side - pad), (d["west_m"] + side + pad, d["north_m"] - side - pad)):
        lon, lat = inv.transform(x, y)
        xs.append(lon); ys.append(lat)
    bounds = (min(xs), min(ys), max(xs), max(ys))
    out = WEBSITE / "data/resq5" / iid
    out.mkdir(parents=True, exist_ok=True)
    wc = [fi.WC_URL.format(tile=f"N{la:02d}E{lo:03d}") for la, lo in fi.tiles(bounds, 3)]
    dem = [fi.DEM_URL.format(tile=f"N{la:02d}_00_E{lo:03d}_00") for la, lo in fi.tiles(bounds, 1)]
    a = fi.fetch_window(wc, bounds, out / "worldcover_2021_domain_window.tif", "ESA WorldCover 2021 v200 window covering the RESQ-5 domain + 0.5 km")
    b = fi.fetch_window(dem, bounds, out / "copernicus_dem_glo30_domain_window.tif", "Copernicus GLO-30 DSM window covering the RESQ-5 domain + 0.5 km")
    print(iid, a["shape"], b["shape"], flush=True)
