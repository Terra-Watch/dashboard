"""Overlay on the OpenStreetMap basemap the app uses (9 tiles at z15 saved in docs/sim_diagnosis/basemap/):
ignition cell, true 1.2 km grid bounds, the extent drawn by SimulationCanvas.tsx, simulated frames 0 and 48 placed in that drawn extent, and the
MCD64A1 2024-03 burned pixels (500 m). Read-only on the repo."""
import math, json
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle

D = Path("/Users/kireeti/Desktop/Projects/RESQ/website/docs/sim_diagnosis")
W = Path("/Users/kireeti/Desktop/Projects/RESQ/website")
LAT0, LON0 = 21.867894, 86.500688
Z = 15; TX, TY = 24257, 14343
R, T = 6371007.181, 1111950.5196666666
N = 2 ** Z
def merc(lon, lat):                     # lon/lat -> pixel in the 3x3 mosaic
    x = (lon + 180) / 360 * N; y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * N
    return (x - (TX - 1)) * 256, (y - (TY - 1)) * 256
mos = Image.new("RGB", (768, 768))
for i, dx in enumerate((-1, 0, 1)):
    for j, dy in enumerate((-1, 0, 1)):
        mos.paste(Image.open(D / f"basemap/osm_{Z}_{TX+dx}_{TY+dy}.png").convert("RGB"), (i * 256, j * 256))
mx = 111319.49 * math.cos(math.radians(LAT0)); my = 110574.0
half = 0.007
def lonlat_from_m(dx_m, dy_m): return LON0 + dx_m / mx, LAT0 + dy_m / my
# frames
frames = {k: np.array([[int(v) for v in l.split(",")] for l in (W / f"backend/runtime_data/simulation_demo/run/Grids/Grids1/ForestGrid{k}.csv").read_text().splitlines() if l]) == 1 for k in (0, 48)}
# MCD pixels
w = np.load(D / "mcd_window_2024_03.npy")
x0, y0 = -20015109.354 + 26 * T, 10007554.677 - 6 * T
xo = R * math.radians(LON0) * math.cos(math.radians(LAT0)); yo = R * math.radians(LAT0)
c0 = int((xo - x0) / 500.0); r0 = int((y0 - yo) / 500.0)
def px_corners(i, j):
    rows = r0 - 40 + i; cols = c0 - 40 + j
    pts = []
    for (rr, cc) in ((rows, cols), (rows, cols + 1), (rows + 1, cols + 1), (rows + 1, cols)):
        x = x0 + cc * 500.0; y = y0 - rr * 500.0
        lat = math.degrees(y / R); lon = math.degrees(x / (R * math.cos(math.radians(lat))))
        pts.append(merc(lon, lat))
    return pts
fig, axs = plt.subplots(1, 2, figsize=(15, 7.5))
for a, k in zip(axs, (0, 48)):
    a.imshow(mos)
    # simulated frame drawn in the extent used by SimulationCanvas.tsx
    (xl, yt), (xr, yb) = merc(LON0 - half, LAT0 + half), merc(LON0 + half, LAT0 - half)
    img = np.zeros((40, 40, 4)); img[frames[k]] = (0.69, 0.09, 0.23, 0.8)
    a.imshow(img, extent=[xl, xr, yb, yt], interpolation="nearest")
    a.add_patch(Rectangle((xl, yt), xr - xl, yb - yt, fill=False, ec="red", ls="--", lw=1.5, label="extent drawn by the app (+-0.007 deg: 1.45 x 1.55 km)"))
    # true bounds
    (tl, tt), (tr_, tb) = merc(*lonlat_from_m(-600, 600)), merc(*lonlat_from_m(600, -600))
    a.add_patch(Rectangle((tl, tt), tr_ - tl, tb - tt, fill=False, ec="cyan", lw=2, label="true 40 x 40 grid, 30 m cells (1.2 x 1.2 km)"))
    for i in range(w.shape[0]):
        for j in range(w.shape[1]):
            if w[i, j] > 0:
                a.add_patch(Polygon(px_corners(i, j), closed=True, fill=False, ec="blue", lw=1.5))
    a.plot([], [], color="blue", label="MCD64A1 2024-03 burned 500 m pixels (Burn Date 91)")
    px, py = merc(LON0, LAT0); a.plot(px, py, "y*", ms=14, mec="k", label="ignition cell (grid row 20, col 20)")
    a.set_xlim(px - 340, px + 340); a.set_ylim(py + 340, py - 340)
    a.set_title(f"OSM basemap, simulation frame {k}", fontsize=11); a.set_xticks([]); a.set_yticks([])
axs[0].legend(loc="lower left", fontsize=8)
plt.tight_layout(); plt.savefig(D / "images/basemap_overlay.png", dpi=110); plt.close()
print("ok")
