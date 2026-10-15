"""Synthetic sanity tests for the Cell2Fire binary exactly as RESQ calls it.
Uses the same binary and the same command line as backend/inference/run_demo_simulation.py (line 144). Inputs and outputs are written only
under docs/sim_diagnosis/synthetic/. The repository's own scenario, runtime_data and frontend files are never written.
Pass criteria are declared here, in the code, before the runs.
"""
import csv, json, math, shutil, subprocess
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

W = Path("/Users/kireeti/Desktop/Projects/RESQ/website")
D = W / "docs/sim_diagnosis"
SYN = D / "synthetic"
BIN = "/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP = W / "backend/runtime_data/simulation_demo/scenario/spain_lookup_table.csv"   # copied, never modified
N = 40
CELL = 30
IG = (20, 20)

def write_asc(path, a, fmt=lambda v: str(int(round(v)))):
    with open(path, "w") as f:
        f.write(f"ncols {N}\nnrows {N}\nxllcorner 0\nyllcorner 0\ncellsize {CELL}\nNODATA_value -9999\n")
        for row in a:
            f.write(" ".join(fmt(v) for v in row) + "\n")

def make(name, fuel, elev=None, ws=0.0, wd=0.0, hours=12):
    d = SYN / name
    if d.exists():
        shutil.rmtree(d)
    (d / "scenario").mkdir(parents=True); (d / "run").mkdir()
    elev = np.full((N, N), 500.0) if elev is None else elev
    gy, gx = np.gradient(elev, CELL, CELL)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    aspect = (np.degrees(np.arctan2(-gx, gy)) + 360) % 360
    write_asc(d / "scenario/fuels.asc", fuel); write_asc(d / "scenario/elevation.asc", elev)
    write_asc(d / "scenario/slope.asc", slope); write_asc(d / "scenario/saz.asc", aspect)
    shutil.copy(LOOKUP, d / "scenario/spain_lookup_table.csv")
    with open(d / "scenario/Weather.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
        for h in range(hours):
            w.writerow(["syn", f"2024-01-01 {h % 24:02d}:00", f"{ws:.3f}", f"{wd:.3f}", 1])
    with open(d / "scenario/Ignitions.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["Year", "Ncell"]); w.writerow([1, IG[0] * N + IG[1] + 1])
    cmd = [BIN, "--input-instance-folder", str(d / "scenario") + "/", "--output-folder", str(d / "run") + "/", "--sim", "S", "--ignitions", "--nsims", "1",
           "--grids", "--final-grid", "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    (d / "stdout.txt").write_text(r.stdout + r.stderr)
    assert r.returncode == 0, (name, r.stdout[-500:], r.stderr[-500:])
    frames = sorted((d / "run/Grids/Grids1").glob("ForestGrid*.csv"), key=lambda p: int(p.stem[10:]))
    G = np.stack([np.array([[int(v) for v in line.split(",")] for line in p.read_text().splitlines() if line]) for p in frames])
    return G, elev

rr, cc = np.indices((N, N))
dy = -(rr - IG[0]) * CELL; dx = (cc - IG[1]) * CELL
bearing = (np.degrees(np.arctan2(dx, dy)) + 360) % 360
dist = np.hypot(dx, dy)

def extents(B):
    out = {}
    for n, b in {"N": 0, "NE": 45, "E": 90, "SE": 135, "S": 180, "SW": 225, "W": 270, "NW": 315}.items():
        diff = np.abs((bearing - b + 180) % 360 - 180)
        m = B & (diff <= 22.5) & (dist > 0)
        out[n] = float(dist[m].max()) if m.any() else 0.0
    return out

res = {}
GR1, TL2, NB = 101, 182, 93
uni = lambda code: np.full((N, N), code)

# (a) uniform fuel, flat, no wind: roughly circular
G, _ = make("a_uniform_nowind", uni(GR1), ws=0.0, hours=12)
B = G[12] == 1; e = extents(B); ax = [e[k] for k in ("N", "E", "S", "W")]; dg = [e[k] for k in ("NE", "SE", "SW", "NW")]
cen = (np.argwhere(B).mean(0) - np.array(IG)) * CELL
res["a"] = dict(hour=12, burned=int(B.sum()), extents_m=e, max_over_min_extent=max(e.values()) / max(min(e.values()), 1e-9),
                axis_mean_m=float(np.mean(ax)), diag_mean_m=float(np.mean(dg)), centroid_offset_m_row_col=[float(cen[0]), float(cen[1])])
res["a"]["pass"] = bool(res["a"]["max_over_min_extent"] <= 1.35 and np.hypot(*cen) <= CELL)
res["a"]["criterion"] = "max/min extent over 8 sectors <= 1.35 and centroid within 1 cell of the ignition"
Ga = G

# (b) same, wind from the west (WD = 270 = direction the wind comes FROM): elongated toward the east
G, _ = make("b_wind_from_west", uni(GR1), ws=3.0, wd=270.0, hours=4)
HB = len(G) - 1
B = G[HB] == 1; e = extents(B); cen = (np.argwhere(B).mean(0) - np.array(IG)) * CELL
res["b"] = dict(hour=HB, frames=len(G), burned=int(B.sum()), extents_m=e, east_over_west=e["E"] / max(e["W"], 1e-9), centroid_offset_m_east=float(cen[1]), centroid_offset_m_north=float(-cen[0]),
                width_ns_m=float(max(e["N"], e["S"])), length_ew_m=float(e["E"] + e["W"]))
res["b"]["pass"] = bool(e["E"] >= 2.0 * e["W"] and cen[1] > 0)
res["b"]["criterion"] = "east extent >= 2 x west extent and centroid east of ignition"
Gb = G

# (c) tilted plane, no wind: faster spread upslope. Terrain rises 20 degrees toward the north.
rise = CELL * math.tan(math.radians(20))
elev = 500 + (N - 1 - rr) * rise
G, _ = make("c_slope_north_up_20deg", uni(GR1), elev=elev, ws=0.0, hours=12)
B = G[12] == 1; e = extents(B)
res["c"] = dict(hour=12, burned=int(B.sum()), extents_m=e, up_N_over_down_S=e["N"] / max(e["S"], 1e-9), slope_deg=20.0)
res["c"]["pass"] = bool(e["N"] >= 1.25 * e["S"])
res["c"]["criterion"] = "upslope (N) extent >= 1.25 x downslope (S) extent"
Gc = G
# physical slope factor as coded: neighbour elevation difference over cell size, then 1 + 0.023322 ps + 0.00013585 ps^2
ps = rise / CELL
res["c"]["slope_effect_as_coded_upslope"] = 1 + 0.023322 * ps + 0.00013585 * ps ** 2
res["c"]["slope_effect_if_ps_in_percent_upslope"] = 1 + 0.023322 * ps * 100 + 0.00013585 * (ps * 100) ** 2

# (d) uniform fuel with a full-height line of non-burnable cells (NB3, code 93) at column 26, east of the ignition; wind from the west pushes toward it
fuel = uni(GR1); fuel[:, 26] = NB
G, _ = make("d_barrier_column", fuel, ws=3.0, wd=270.0, hours=6)
HD = len(G) - 1
B = G[HD] == 1
res["d"] = dict(hour=HD, frames=len(G), burned=int(B.sum()), burned_east_of_barrier=int(B[:, 27:].sum()), burned_on_barrier=int(B[:, 26].sum()), burned_west_of_barrier=int(B[:, :26].sum()),
                fire_reached_barrier=bool(B[:, 25].any()))
res["d"]["pass"] = bool(res["d"]["burned_east_of_barrier"] == 0 and res["d"]["burned_on_barrier"] == 0 and res["d"]["fire_reached_barrier"])
res["d"]["criterion"] = "fire reaches the barrier column and no burned cell is on or beyond it"
Gd = G; fuel_d = fuel

# (d2) extra: a one-cell-thick diagonal line (8-neighbour leak check)
fuel2 = uni(GR1)
for r in range(N):
    c = r + 6
    if 0 <= c < N: fuel2[r, c] = NB
G, _ = make("d2_barrier_diagonal", fuel2, ws=3.0, wd=270.0, hours=6)
HD2 = len(G) - 1
B = G[HD2] == 1
side = (cc - rr) > 6    # cells strictly on the far side of the diagonal line
res["d2"] = dict(hour=HD2, frames=len(G), burned=int(B.sum()), burned_far_side=int(B[side].sum()), burned_on_line=int(B[fuel2 == NB].sum()))
res["d2"]["pass"] = bool(res["d2"]["burned_far_side"] == 0)
res["d2"]["criterion"] = "no burned cell on the far side of a one-cell-thick diagonal line (supplementary)"
Gd2 = G; fuel_d2 = fuel2

# supplementary: production fuel TL2 with no wind, then with 10 km/h from the west
G, _ = make("s1_TL2_nowind", uni(TL2), ws=0.0, hours=48)
res["s1"] = dict(hour=len(G) - 1, frames=len(G), burned=int((G[-1] == 1).sum()), note="TL2 head ROS at 0 km/h is 0.085 m/min, below Cell2Fire ROSThreshold 0.1 m/min (ReadArgs.cpp:dROS_Threshold)")
G, _ = make("s2_TL2_west10", uni(TL2), ws=10.0, wd=270.0, hours=24)
HS2 = len(G) - 1
B = G[HS2] == 1; e = extents(B)
res["s2"] = dict(hour=HS2, frames=len(G), burned=int(B.sum()), extents_m=e, east_over_west=e["E"] / max(e["W"], 1e-9))

# wind-direction conversion used by the runner (run_demo_simulation.py:101-104), applied to a pure westerly (u > 0, v = 0)
def runner_wd(u, v):
    return (math.degrees(math.atan2(-u, -v)) + 360) % 360
res["runner_conversion"] = {"u=+5_v=0_(from_west)": runner_wd(5, 0), "u=0_v=-5_(from_north)": runner_wd(0, -5), "u=-5_v=0_(from_east)": runner_wd(-5, 0), "u=0_v=+5_(from_south)": runner_wd(0, 5)}

(D / "synthetic_results.json").write_text(json.dumps(res, indent=1, default=float))

fig, axs = plt.subplots(2, 3, figsize=(15, 9.5))
def show(a, B, title, extra=None):
    a.imshow(B, cmap="Reds", vmin=0, vmax=1, interpolation="nearest")
    if extra is not None:
        a.imshow(np.ma.masked_where(~extra, np.ones((N, N))), cmap="gray", alpha=0.9, interpolation="nearest")
    a.plot(IG[1], IG[0], "k+", ms=10); a.set_title(title, fontsize=9); a.set_xticks([0, 20, 39]); a.set_yticks([0, 20, 39])
show(axs[0, 0], Ga[12] == 1, f"(a) uniform GR1, flat, no wind, h12: {'PASS' if res['a']['pass'] else 'FAIL'}\nmax/min extent {res['a']['max_over_min_extent']:.2f}")
show(axs[0, 1], Gb[HB] == 1, f"(b) wind FROM west 3 km/h, h{HB}: {'PASS' if res['b']['pass'] else 'FAIL'}\nE/W extent {res['b']['east_over_west']:.1f}")
show(axs[0, 2], Gc[12] == 1, f"(c) 20 deg slope rising to N, no wind, h12: {'PASS' if res['c']['pass'] else 'FAIL'}\nN/S extent {res['c']['up_N_over_down_S']:.2f}")
show(axs[1, 0], Gd[HD] == 1, f"(d) barrier column (grey), wind from W 3 km/h, h{HD}: {'PASS' if res['d']['pass'] else 'FAIL'}\nburned beyond {res['d']['burned_east_of_barrier']}", extra=(fuel_d == NB))
show(axs[1, 1], Gd2[HD2] == 1, f"(d2) diagonal 1-cell line (grey), wind from W 3 km/h, h{HD2}: {'PASS' if res['d2']['pass'] else 'FAIL'}\nburned beyond {res['d2']['burned_far_side']}", extra=(fuel_d2 == NB))
axs[1, 2].axis("off")
axs[1, 2].text(0, 1, "Runner wind conversion (u,v) -> WD (from):\n" + "\n".join(f"  {k}: {v:.0f} deg" for k, v in res["runner_conversion"].items()) +
               f"\n\nTL2 (production fuel) no wind, last frame: {res['s1']['burned']} cell(s) burned\nTL2 10 km/h from W, last frame: E/W = {res['s2']['east_over_west']:.1f}", va="top", fontsize=10, family="monospace")
plt.tight_layout(); plt.savefig(D / "images/synthetic_tests.png", dpi=110); plt.close()
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk in ("pass", "burned", "max_over_min_extent", "east_over_west", "up_N_over_down_S", "burned_east_of_barrier", "burned_far_side", "extents_m")} if isinstance(v, dict) else v for k, v in res.items()}, indent=1, default=float))
