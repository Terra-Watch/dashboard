"""Read-only analysis of the existing RESQ Similipal run (Cell2Fire grids) and of its inputs.
Writes only inside docs/sim_diagnosis/. Usage: python3 analyze_run.py
"""
import csv, json, math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from PIL import Image

W = Path("/Users/kireeti/Desktop/Projects/RESQ/website")
D = W / "docs/sim_diagnosis"
RUN = W / "backend/runtime_data/simulation_demo/run/Grids/Grids1"
SC = W / "backend/runtime_data/simulation_demo/scenario"
LC = W / "backend/runtime_data/simulation_demo/landcover/worldcover_similipal_demo.tif"
DEM = W / "backend/runtime_data/simulation_demo/terrain/elevation_similipal_demo.tif"
PUB = W / "frontend/public/simulation/similipal-demo"
LAT0, LON0 = 21.867894, 86.500688
ROWS = COLS = 40
CELL = 30.0
IG = (820 // COLS, 820 % COLS)          # Ncell 821, 1-based row-major from the top-left (Ignitions.csv)
out = {}

def asc(path):
    return np.array([l.split() for l in Path(path).read_text().splitlines()[6:]], dtype=float)

grids = []
for k in range(49):
    g = np.array([[int(v) for v in line.split(",")] for line in (RUN / f"ForestGrid{k}.csv").read_text().splitlines() if line])
    grids.append(g)
G = np.stack(grids)
out["values_present"] = sorted(int(v) for v in np.unique(G))
B = (G == 1)
burn = B.sum((1, 2))
out["burned_cells"] = burn.tolist()
out["burned_ha"] = (burn * CELL * CELL / 1e4).round(2).tolist()
out["monotonic_burned_set"] = bool(all((B[k] <= B[k + 1]).all() for k in range(48)))
out["monotonic_counts"] = bool(np.all(np.diff(burn) >= 0))
out["ignition_rowcol"] = IG
out["ignition_burned_at_frame0"] = bool(B[0, IG[0], IG[1]])
out["frame0_cells"] = int(burn[0])

edge = np.zeros((ROWS, COLS), bool); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
touch = [int((B[k] & edge).sum()) for k in range(49)]
first_edge = next((k for k, t in enumerate(touch) if t > 0), None)
out["edge_cells_burned"] = touch
out["first_hour_fire_touches_domain_edge"] = first_edge
out["edge_cells_total"] = int(edge.sum())
out["final_fraction_of_domain"] = float(burn[-1] / (ROWS * COLS))

# directional extent from ignition (cell centres), metres
dirs = {"N": (-1, 0), "NE": (-1, 1), "E": (0, 1), "SE": (1, 1), "S": (1, 0), "SW": (1, -1), "W": (0, -1), "NW": (-1, -1)}
rr, cc = np.indices((ROWS, COLS))
dy = -(rr - IG[0]) * CELL   # north positive
dx = (cc - IG[1]) * CELL    # east positive
bearing = (np.degrees(np.arctan2(dx, dy)) + 360) % 360
dist = np.hypot(dx, dy)
sector = {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}
ext = {n: [] for n in sector}
for k in range(49):
    for n, b in sector.items():
        diff = np.abs((bearing - b + 180) % 360 - 180)
        m = B[k] & (diff <= 22.5) & (dist > 0)
        ext[n].append(float(dist[m].max()) if m.any() else 0.0)
out["extent_m_by_direction"] = {n: v for n, v in ext.items()}
rate = {}
for n in sector:
    e = np.array(ext[n])
    reach = next((k for k, v in enumerate(e) if v >= 0.9 * 600), None)
    # mean rate over hours 1..24 (before the edge is reached for most directions), m/min
    rate[n] = dict(m_per_min_h0_24=float(e[24] / (24 * 60)), m_per_min_h0_48=float(e[48] / (48 * 60)), extent_h24_m=float(e[24]), extent_h48_m=float(e[48]))
out["rate_by_direction"] = rate
cy = float((np.where(B[48])[0].mean() - IG[0]) * -CELL); cx = float((np.where(B[48])[1].mean() - IG[1]) * CELL)
out["final_centroid_offset_m_east_north"] = [cx, cy]

# weather file as given to Cell2Fire
wx = list(csv.DictReader(open(SC / "Weather.csv")))
ws = np.array([float(r["WS"]) for r in wx]); wd = np.array([float(r["WD"]) for r in wx])
out["weather_rows"] = len(wx)
out["ws_kmh_min_mean_max"] = [float(ws.min()), float(ws.mean()), float(ws.max())]
out["wd_from_deg_range"] = [float(wd.min()), float(wd.max())]
out["weather_period_pattern_repeats"] = int(len(wx) / 12)
# Spain-model head ROS for the fuels present (coefficients from FuelModelSpain.cpp: p1,p2,p3)
coef = {101: (2.575, 0.6665, 0.1096), 145: (0.0483, 0.0781, 0.002783), 182: (11.01, 0.3366, 0.7639)}
def rss(f, w): p1, p2, p3 = coef[f]; return 1.0 / (p1 * math.exp(-p2 * w) + p3)
out["head_ros_m_per_min"] = {str(f): {"ws0": rss(f, 0.0), "ws9.2": rss(f, 9.196), "ws14.5": rss(f, 14.481), "max_ws_inf": 1.0 / coef[f][2]} for f in coef}
fuel = asc(SC / "fuels.asc").astype(int)
u, c = np.unique(fuel, return_counts=True)
out["fuel_counts"] = {int(a): int(b) for a, b in zip(u, c)}
slope = asc(SC / "slope.asc"); saz = asc(SC / "saz.asc"); elev = asc(SC / "elevation.asc")
out["elevation_min_max"] = [float(elev.min()), float(elev.max())]
out["slope_deg_min_mean_max"] = [float(slope.min()), float(slope.mean()), float(slope.max())]
# slope_effect as coded in Cells.cpp:443-450 for neighbours (ps_ij = delta elev / cellsize, a ratio)
se = []
for r in range(ROWS):
    for c_ in range(COLS):
        for a, b in ((0, 1), (1, 0), (1, 1), (1, -1)):
            r2, c2 = r + a, c_ + b
            if 0 <= r2 < ROWS and 0 <= c2 < COLS:
                ps = (elev[r2, c2] - elev[r, c_]) / CELL
                se.append(1 + 0.023322 * ps + 0.00013585 * ps * ps)
                ps = -ps
                se.append(1 + 0.023322 * ps + 0.00013585 * ps * ps)
se = np.array(se)
out["slope_effect_as_coded"] = {"min": float(se.min()), "p1": float(np.percentile(se, 1)), "p99": float(np.percentile(se, 99)), "max": float(se.max())}
# same formula if ps_ij were in percent (x100) to show what the coefficients were fitted for
se2 = 1 + 0.023322 * (np.array([(x - 1) for x in se]) * 0 + 0)  # placeholder, replaced below
ps_all = []
for r in range(ROWS):
    for c_ in range(COLS):
        for a, b in ((0, 1), (1, 0), (1, 1), (1, -1)):
            r2, c2 = r + a, c_ + b
            if 0 <= r2 < ROWS and 0 <= c2 < COLS:
                ps_all += [(elev[r2, c2] - elev[r, c_]) / CELL * 100, -(elev[r2, c2] - elev[r, c_]) / CELL * 100]
ps_all = np.array(ps_all)
se_pct = 1 + 0.023322 * ps_all + 0.00013585 * ps_all ** 2
out["slope_effect_if_percent"] = {"min": float(se_pct.min()), "p1": float(np.percentile(se_pct, 1)), "p99": float(np.percentile(se_pct, 99)), "max": float(se_pct.max())}

# georeferencing: what the frontend draws vs the physical grid
half = 0.007
mx = 111_319.49 * math.cos(math.radians(LAT0))   # metres per degree of longitude
my = 110_574.0                                    # metres per degree of latitude (approx., 22N)
out["frontend_extent_deg"] = {"lon": [LON0 - half, LON0 + half], "lat": [LAT0 - half, LAT0 + half]}
out["frontend_extent_m"] = {"east_west": 2 * half * mx, "north_south": 2 * half * my}
out["grid_extent_m"] = {"east_west": COLS * CELL, "north_south": ROWS * CELL}
out["frontend_scale_factor"] = {"east_west": 2 * half * mx / (COLS * CELL), "north_south": 2 * half * my / (ROWS * CELL)}
out["domain_ha"] = ROWS * COLS * CELL * CELL / 1e4
out["domain_modis_pixels_across"] = COLS * CELL / 500.0
out["maplibre_zoom9_m_per_px_512tiles"] = 40_075_016.686 / (512 * 2 ** 9) * math.cos(math.radians(LAT0))
out["overlay_px_at_zoom9"] = out["frontend_extent_m"]["east_west"] / out["maplibre_zoom9_m_per_px_512tiles"]

# public frames identical to ForestGrid?
same = True; counts = []
for k in range(49):
    png = np.array(Image.open(PUB / f"frame-{k:02d}.png").convert("RGBA"))
    cnt = int((png[..., 0] == 176).sum())
    counts.append(cnt)
    same &= (cnt == burn[k]) and bool(((png[..., 3] > 0) == B[k]).all())
out["public_frames_match_forestgrids"] = bool(same)

(D / "analysis_metrics.json").write_text(json.dumps(out, indent=1, default=float))

# ---- figures
t = np.arange(49)
fig, ax = plt.subplots(1, 3, figsize=(15, 4.2))
ax[0].plot(t, burn, "o-"); ax[0].axhline(1600, color="k", ls="--", lw=0.8); ax[0].set_xlabel("frame (= weather hour)"); ax[0].set_ylabel("burned cells (of 1600)")
ax[0].set_title("Burned cells vs time");
if first_edge is not None: ax[0].axvline(first_edge, color="r", ls=":"); ax[0].text(first_edge + 0.5, 100, f"edge reached h{first_edge}", color="r")
for n in ("N", "E", "S", "W"):
    ax[1].plot(t, ext[n], label=n)
ax[1].axhline(600, color="k", ls="--", lw=0.8); ax[1].text(1, 610, "domain edge (600 m from centre)")
ax[1].set_xlabel("frame (hour)"); ax[1].set_ylabel("farthest burned cell centre from ignition (m)"); ax[1].legend(); ax[1].set_title("Extent by direction (22.5 deg sectors)")
ax[2].plot(np.arange(48), ws[:48], label="WS km/h (Weather.csv)"); ax2 = ax[2].twinx(); ax2.plot(np.arange(48), wd[:48], "r.", label="WD (from, deg)")
ax[2].set_xlabel("hour"); ax[2].set_ylabel("wind speed km/h"); ax2.set_ylabel("direction wind comes FROM (deg)"); ax[2].set_title("Weather rows given to Cell2Fire (12-row pattern x4)")
plt.tight_layout(); plt.savefig(D / "images/burned_area_and_extent.png", dpi=120); plt.close()

fig, axs = plt.subplots(1, 6, figsize=(18, 3.6))
for a, k in zip(axs, (0, 6, 12, 24, 36, 48)):
    a.imshow(G[k] == 1, cmap="Reds", vmin=0, vmax=1, interpolation="nearest")
    a.plot(IG[1], IG[0], "k+", ms=10); a.set_title(f"frame {k}: {burn[k]} cells\n{burn[k]*0.09:.1f} ha"); a.set_xticks([0, 20, 39]); a.set_yticks([0, 20, 39])
plt.suptitle("ForestGrid frames as written by Cell2Fire (row 0 = north); + = ignition cell 821 (row 20, col 20)")
plt.tight_layout(); plt.savefig(D / "images/frames_mosaic.png", dpi=110); plt.close()

# overlay on the staged land-cover raster (local 'basemap'): intended bounds vs the extent the app draws
lc = np.array(Image.open(LC))
lon_w, lat_n, px = 86.49, 21.88, 1 / 12000
extent_lc = [lon_w, lon_w + lc.shape[1] * px, lat_n - lc.shape[0] * px, lat_n]
dem = np.array(Image.open(DEM)).astype(float)
extent_dem = [lon_w, lon_w + dem.shape[1] / 3600, lat_n - dem.shape[0] / 3600, lat_n]
# intended bounds of the 40x40 grid: 600 m each side of the origin (30 m cells)
dlon = 600 / mx; dlat = 600 / my
intended = [LON0 - dlon, LON0 + dlon, LAT0 - dlat, LAT0 + dlat]
shown = [LON0 - half, LON0 + half, LAT0 - half, LAT0 + half]
fig, axs = plt.subplots(1, 2, figsize=(13, 6))
for a, k in zip(axs, (0, 48)):
    a.imshow(lc, extent=extent_lc, cmap="Greens", vmin=0, vmax=40, alpha=0.5)
    a.imshow(dem, extent=extent_dem, cmap="gray", alpha=0.35)
    fr = np.ma.masked_where(G[k] != 1, np.ones_like(G[k], float))
    a.imshow(fr, extent=shown, cmap="autumn", alpha=0.85, interpolation="nearest")
    a.add_patch(Rectangle((intended[0], intended[2]), intended[1] - intended[0], intended[3] - intended[2], fill=False, ec="blue", lw=1.5, label="true 1.2 km x 1.2 km grid bounds"))
    a.add_patch(Rectangle((shown[0], shown[2]), shown[1] - shown[0], shown[3] - shown[2], fill=False, ec="red", lw=1.5, ls="--", label="extent drawn by SimulationCanvas.tsx (+-0.007 deg)"))
    a.plot(LON0, LAT0, "k+", ms=12)
    a.set_xlim(LON0 - 0.012, LON0 + 0.012); a.set_ylim(LAT0 - 0.012, LAT0 + 0.012); a.set_aspect(1 / math.cos(math.radians(LAT0)))
    a.set_title(f"frame {k} ({burn[k]} cells) over staged land cover + DEM"); a.set_xlabel("longitude"); a.set_ylabel("latitude")
axs[0].legend(loc="lower left", fontsize=8)
plt.tight_layout(); plt.savefig(D / "images/georeference_overlay.png", dpi=110); plt.close()

# observed MCD64A1 window (2024-03) against the simulated domain, if the scratch array exists
mcd = Path("/private/tmp/claude-501/-Users-kireeti-wildfire-research/9ebc24af-afe9-492b-aa90-5139aaa77567/scratchpad/mcd_window_2024_03.npy")
if mcd.exists():
    w = np.load(mcd)
    R_, T_ = 6371007.181, 1111950.5196666666
    x0, y0 = -20015109.354 + 26 * T_, 10007554.677 - 6 * T_       # tile h26v06 upper-left corner
    xo = R_ * math.radians(LON0) * math.cos(math.radians(LAT0)); yo = R_ * math.radians(LAT0)
    cpix = int((xo - x0) / 500.0); rpix = int((y0 - yo) / 500.0)
    fx = ((xo - x0) - cpix * 500.0) / 1000.0      # km east of the pixel's west edge
    fy = ((y0 - yo) - rpix * 500.0) / 1000.0      # km south of the pixel's north edge
    # window array index (40, 40) is the origin pixel; pixel (i, j) spans east [(j-40)*0.5, (j-39)*0.5] km from that pixel's west edge
    fig, a = plt.subplots(figsize=(6.4, 6.4))
    ext_km = [-40 * 0.5 - fx, 41 * 0.5 - fx, -(41 * 0.5) + fy, 40 * 0.5 + fy]   # km relative to the ignition point
    a.imshow(w > 0, cmap="Oranges", extent=ext_km, interpolation="nearest")
    a.add_patch(Rectangle((-0.6, -0.6), 1.2, 1.2, fill=False, ec="blue", lw=2))
    a.plot(0, 0, "k+", ms=12)
    a.set_xlim(-5, 5); a.set_ylim(-5, 5); a.set_title("MCD64A1 2024-03 burned pixels (orange, 500 m, Burn Date 91)\nblue square = the simulated 1.2 km x 1.2 km grid")
    a.set_xlabel("km east of ignition point"); a.set_ylabel("km north of ignition point")
    plt.tight_layout(); plt.savefig(D / "images/mcd64a1_vs_domain.png", dpi=110); plt.close()
    out["ignition_offset_inside_modis_pixel_km"] = [fx, fy]
    (D / "analysis_metrics.json").write_text(json.dumps(out, indent=1, default=float))
print(json.dumps({k: out[k] for k in ("monotonic_burned_set", "first_hour_fire_touches_domain_edge", "final_fraction_of_domain", "frontend_scale_factor", "overlay_px_at_zoom9", "public_frames_match_forestgrids", "values_present")}, default=float))
