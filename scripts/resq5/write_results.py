"""Assemble docs/RESQ5_RESULTS.md from results/resq5 (no new computation of scores, no reruns)."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

W = Path(__file__).resolve().parents[2]
R = W / "results/resq5"
setup = json.loads((W / "data/resq5/protocol_setup.json").read_text())
IDS = ["E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286"]
NAME = {"simulation:era5land_native": "simulation (ERA5-Land, primary)", "simulation:era5_025": "sim, ERA5 0.25° (sens.)", "simulation:best_match": "sim, best_match (sens.)",
        "simulation:pooled": "sim, pooled 90 (secondary)", "baseline_a_proximity": "baseline (a) proximity", "baseline_b_circle_final_area": "baseline (b) circle, final area"}
f3 = lambda x: "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.3f}"   # noqa: E731

metrics = {i: pd.read_csv(R / i / "metrics_by_overpass.csv") for i in IDS}
members = {i: pd.read_csv(R / i / "members.csv") for i in IDS}
summ = {i: json.loads((R / i / "summary.json").read_text()) for i in IDS}
npx = {i: pd.read_csv(R / i / "nextpass_style.csv") for i in IDS}

# ---------- headline
head_rows = []
for i in IDS:
    m = metrics[i]; m = m[m.reference == "obs_nh"]
    K = m.overpass_k.max()
    def val(model, k, col):
        return m[(m.model == model) & (m.overpass_k == k)][col].iloc[0]
    for base in ("baseline_a_proximity", "baseline_b_circle_final_area"):
        ap_s, ap_b = val("simulation:era5land_native", K, "ap"), val(base, K, "ap")
        io_s, io_b = val("simulation:era5land_native", K, "iou"), val(base, K, "iou")
        ks = range(K + 1)
        win_ap = sum(val("simulation:era5land_native", k, "ap") > val(base, k, "ap") for k in ks)
        win_io = sum(val("simulation:era5land_native", k, "iou") > val(base, k, "iou") for k in ks)
        head_rows.append(f"| {i} | {NAME[base]} | {f3(ap_s)} vs {f3(ap_b)} | {'**sim**' if ap_s > ap_b else 'baseline'} | {win_ap}/{K + 1} | {f3(io_s)} vs {f3(io_b)} | {'**sim**' if io_s > io_b else 'baseline'} | {win_io}/{K + 1} |")
head = "\n".join(head_rows)

# ---------- per-incident tables
def per_incident(i):
    m = metrics[i]; m = m[(m.reference == "obs_nh") & (m.model.isin(["simulation:era5land_native", "baseline_a_proximity", "baseline_b_circle_final_area"]))]
    lines = ["| k | time UTC | h after t0 | model | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells | max p |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for k, g in m.groupby("overpass_k"):
        for model in ("simulation:era5land_native", "baseline_a_proximity", "baseline_b_circle_final_area"):
            r = g[g.model == model].iloc[0]
            lines.append(f"| {k} | {r.time_utc[5:16]} | {r.hours_since_t0} | {NAME[model]} | {f3(r.auc)} | {f3(r.ap)} | {f3(r.iou)} | {f3(r.precision)} | {f3(r.recall)} | {f3(r.area_ratio)} | {r.sim_cells} | {r.obs_cells} | {f3(r.max_p)} |")
    return "\n".join(lines)

def sens(i):
    m = metrics[i]; m = m[(m.reference == "obs_nh") & (m.overpass_k == m.overpass_k.max()) & m.model.str.startswith("simulation")]
    lines = ["| source | members | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells |", "|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in m.iterrows():
        lines.append(f"| {NAME[r.model]} | {int(r.members)} | {f3(r.auc)} | {f3(r.ap)} | {f3(r.iou)} | {f3(r.precision)} | {f3(r.recall)} | {f3(r.area_ratio)} | {r.sim_cells} | {r.obs_cells} |")
    return "\n".join(lines)

def member_tbl(i):
    mm = members[i]; mm = mm[mm.overpass_k == mm.overpass_k.max()]
    lines = ["| source | median burned cells | IQR | member IoU mean / median | area ratio median |", "|---|---|---|---|---|"]
    for src, g in mm.groupby("source"):
        lines.append(f"| {src} | {g.burned_cells.median():.0f} | {g.burned_cells.quantile(.25):.0f}-{g.burned_cells.quantile(.75):.0f} | {g.iou.mean():.3f} / {g.iou.median():.3f} | {g.area_ratio.median():.2f} |")
    return "\n".join(lines)

# ---------- burn-out analysis
def burnout(i):
    s = setup[i]; rows = s["weather_rows_hours"]
    mm = members[i].drop_duplicates(["source", "member"])
    out = []
    for src, g in mm.groupby("source"):
        early = g[g.last_frame_written < rows]
        out.append(f"| {src} | {len(g)} | {len(early)} | {sorted(early.last_frame_written.unique().tolist())[:8]} |")
    return "\n".join(["| source | members | fire ended before the last weather hour | end frames |", "|---|---|---|---|"] + out)

def grass_share(i):
    z = np.load(R / i / "observed_footprints.npz")
    fuel = z["fuel"]
    c = np.load(R / i / "burn_count_era5land_native.npz")
    k = [int(x[1:]) for x in c.files if x.startswith("k")]
    last = c[f"k{max(k)}"]; n = int(c["members"])
    sel = (last / n) >= 0.5
    if sel.sum() == 0:
        return None
    return round(float((fuel[sel] == 101).mean()) * 100, 1), int(sel.sum())

def wx_tbl(i):
    w = summ[i]["weather_window"]
    lines = ["| source | hours | mean m/s | max m/s | min m/s | hours < 0.145 m/s |", "|---|---|---|---|---|---|"]
    for k, v in w.items():
        lines.append(f"| {k} | {v['hours']} | {v['mean_ms']} | {v['max_ms']} | {v['min_ms']} | {v['hours_below_0.145_ms']} ({v['share_below_pct']} %) |")
    return "\n".join(lines)

def np_tbl():
    lines = ["| incident | pairs with defined AUC | simulation (ERA5-Land) AP > proximity AP | AP > circle AP | AUC > proximity AUC |", "|---|---|---|---|---|"]
    for i in IDS:
        t = npx[i]
        if "error" in t and t.model.isna().all():
            lines.append(f"| {i} | error | | | |"); continue
        piv = t.pivot_table(index="pair_k", columns="model", values=["ap", "auc"], aggfunc="first")
        ok = piv["ap"].dropna(subset=["simulation:era5land_native"]) if "simulation:era5land_native" in piv["ap"] else piv["ap"]
        n = len(ok)
        a = int((piv["ap"]["simulation:era5land_native"] > piv["ap"]["baseline_a_proximity"]).sum())
        b = int((piv["ap"]["simulation:era5land_native"] > piv["ap"]["baseline_b_circle_final_area"]).sum())
        c = int((piv["auc"]["simulation:era5land_native"] > piv["auc"]["baseline_a_proximity"]).sum())
        lines.append(f"| {i} | {n} | {a}/{n} | {b}/{n} | {c}/{n} |")
    return "\n".join(lines)

old = summ["E2024-135332"]["old_check_demonstration"]
oc = old["old_check"]; nm = old["new_metrics_same_shapes_vs_cumulative_footprint"]
old_tbl = "\n".join(["| shape | old check IoU (463.31 m pixels, clip rule) | pixels predicted / kept | new IoU vs cumulative VIIRS footprint | new AP | new AUC |", "|---|---|---|---|---|---|"] +
                    [f"| {k} | {oc[k]['iou']} | {oc[k]['predicted_pixels']} / {oc[k].get('observed_pixels_kept', 0)} | {nm[k]['iou']:.3f} | {nm[k]['ap']:.3f} | {nm[k]['auc']:.3f} |" for k in oc])

sec = []
for i in IDS:
    s = setup[i]; d = s["domain"]; sm = summ[i]
    gs = grass_share(i)
    sec.append(f"""### {i} ({s['state']})

Domain {d['side_km']} km ({d['cells_per_side']}² cells), t0 {s['t0_utc']} UTC, {s['weather_rows_hours']} weather hours, {len(s['overpasses_used'])} overpasses. Fuel cells: {', '.join(f'{k}: {v} %' for k, v in sm['fuel_summary']['fuel_cell_share'].items())} (101 GR1, 182 TL2, rest non-burnable). Steepest neighbour slope ratio {sm['fuel_summary']['max_slope_ratio_between_neighbours']} (slope factor at most {1 + 0.023322 * sm['fuel_summary']['max_slope_ratio_between_neighbours'] + 0.00013585 * sm['fuel_summary']['max_slope_ratio_between_neighbours'] ** 2:.3f}).

Primary source, every overpass (reference: cumulative n/h VIIRS footprint):

{per_incident(i)}

Wind-source sensitivity at the last overpass:

{sens(i)}

Member level at the last overpass (single runs, no thresholding):

{member_tbl(i)}

Wind in the replay window (m/s):

{wx_tbl(i)}

Fire ended before the last weather hour:

{burnout(i)}

Share of grass (GR1) among cells with p >= 0.5 at the last overpass, primary source: {('%s %% of %d cells' % gs) if gs else 'no cell reaches p >= 0.5'}. Edge clipping (members whose burned cells touch the outer ring at the last overpass): {json.dumps({k: v['touch_outer_ring_at_last_overpass'] for k, v in sm['edge_clipping'].items()})} of {json.dumps({k: v['members'] for k, v in sm['edge_clipping'].items()})}.
""")
sec = "\n".join(sec)

doc = f"""# RESQ-5 results

Protocol: `docs/RESQ5_PROTOCOL.md` (commit `7e752ac`, written and committed before any replay; Amendment 1 and 2 committed before the runs, no later amendment). 360 replays (4 incidents x 3 wind sources x 30 jitters), all completed, no run repeated or tuned. Simulator, fuel parameters and ROS unchanged. Outputs: `results/resq5/<incident>/` (`metrics_by_overpass.csv`, `members.csv`, `nextpass_style.csv`, `burn_count_*.npz` = number of burning members per cell per overpass (divide by members for p), `observed_footprints.npz`, `summary.json`).

## 1. Answer

**The simulation does not beat the simple baselines in a consistent way.** At the last overpass, with the primary (ERA5-Land) ensemble:

| Incident | Baseline | AP: sim vs baseline | AP winner | overpasses where sim AP higher | IoU@0.5: sim vs baseline | IoU winner | overpasses where sim IoU higher |
|---|---|---|---|---|---|---|---|
{head}

Rank-based ability (AUC) of the proximity baseline is higher than the simulation's in all four incidents. The simulation's footprint is larger than observed in three of four (area ratio 1.2-3.0 at the last overpass) and is empty at p >= 0.5 for E2023-084925 under the primary wind. Interpretation is in section 6.

## 2. What was run

- Ignition: first-overpass medoid, t0 = first detection - 12 h; 30 jitters in a 500 m disc; fuel TL2 for class 10, GR1 for class 30, other classes non-burnable (uncalibrated); wind per protocol; temperature 27 C and RH 40 % fixed by the simulator; slope negligible.
- Run time per member: 8-15 s (7 workers); no crash, no memory problem.
- Implementation notes (not protocol changes): AUC/AP computed with scikit-learn over all cells of the domain; frames are read at floor(hours after t0), or the last written frame if the fire had ended; the harness metric used NextPass `domain.py` and `score_footprint.score` with its `load_domain` replaced by the rebuilt D.

## 3. Per-incident results

{sec}

## 4. Both baselines and the harness metric

- (a) proximity has no wind, fuel or physics, yet its AUC is 0.956-0.980 at the last overpass because the observed footprint sits around the ignition point; the simulation, whose footprints are shifted by the 500 m jitter and lengthened by the fastest fuel patches, has AUC 0.75-0.91.
- (b) circle of the final area is information-advantaged (it knows the final area) and, with a binary score, has a low AUC (0.55-0.73) and an IoU of 0.06-0.30 at the last overpass.
- NextPass-style target (cells newly detected at overpass k+1, domain within r_max = 2,855.9 m of the footprint at k, `score_footprint.score` unmodified except `load_domain`). Counts of pairs where the primary simulation beats the baseline (pairs with an undefined AUC, because only one class is present, are excluded):

{np_tbl()}

Positives per pair are 1-8 cells in D of 176-312 cells, so each pair is noisy; the table is a count, not a significance test.

## 5. The earlier check and the baselines

Old check (500 m logic, corrected to 463.31 m), E2024-135332 only, median-area primary member, fully burned domain, and a one-cell cross through the ignition:

{old_tbl}

Under the old check the fully burned domain scores 0.0225 and the simulation 0.0 (the one scar pixel kept does not overlap), so the fully burned domain beats the simulation; the cross scores 0.0, equal to the simulation, not higher. The earlier statement (cross shape 0.750 above the simulation's 0.636) belonged to a 40 x 40 cell domain 2.4 MODIS pixels wide and does not carry over to these 10 km domains, where the old score is near zero for every shape. With the cumulative VIIRS footprint as reference, the same three shapes score IoU 0.029 (simulation member), 0.012 (full domain), 0.012 (cross) and AUC 0.54, 0.50, 0.51: the new metric separates a random shape from a located one and, as the proximity baseline shows, a located point already scores well.

## 6. Honest conclusions

1. **Skill beyond location is not shown.** At the last overpass the proximity baseline has the higher AUC in 4 of 4 incidents and the higher AP in 4 of 4 (E2024-155286 by 0.280 vs 0.300). The simulation has the higher IoU at p >= 0.5 in 1 of 4 incidents against proximity (E2024-135332) and against the circle in 1 of 4. It never has both a higher AP and a higher IoU than the proximity baseline in the same incident under the primary wind.
2. **The primary-wind ensemble can be empty, and one calm hour decides it.** E2023-084925 has mean ERA5-Land wind 0.80 m/s and one hour at 0.06 m/s (IST 09). In 22 of 30 primary members the fire ended at frame 22, right after that hour; under `best_match` (one hour at 0.10 m/s, IST 02) 18 of 30 ended at frame 15; under ERA5 0.25° (no hour below 0.145 m/s) none ended. This is consistent with the simulator's rule that a cell whose head rate is below the threshold cannot send and burns out, so a small fire dies at the first calm hour and never restarts. With the primary wind p never reaches 0.5 (maximum 0.43); under ERA5 0.25° the IoU is 0.271 (proximity 0.216 is lower, the circle 0.302 is higher). Result depends more on the wind source than on anything else tested, and the three sources disagree (RESQ-4).
3. **Footprint size is over-predicted where the fire does not die.** Area ratio at the last overpass is 2.1, 3.0, 0.0 and 1.2 (primary). It is not the grass: cells with p >= 0.5 are 1.0 %, 20.8 %, (none) and 0.0 % GR1 although GR1 is 8-23 % of the burnable cells. The TL2 curve alone, at 0.2-1.3 m/min for 50-72 h, gives p >= 0.5 footprints of 2,174-4,286 cells (196-386 ha) in the three incidents where it is not empty, against 1,419-1,913 observed cells (128-172 ha) in the same incidents. Whether the observed footprint is a complete picture of the burn is not known (VIIRS flags only the active front at overpass time).
4. **Night hours:** with the 3-day windows only 0-1 hours per source fall below the 0.145 m/s TL2 threshold. TL2 therefore spreads, slowly (about 0.2-1.0 m/min), at night in these windows, because the reanalysis gives no calm hours; the effect that does appear is a single calm hour ending a small fire (E2023-084925).
5. **Edge clipping:** none: 0 of 90 members touch the outer ring in any incident (3 km margin).
6. **Time evolution:** at the overpasses 12-25 h after t0 the primary ensemble has 0-243 cells at p >= 0.5 against 144-1,524 observed; in three of four incidents (not E2023-084925) it is ahead of the observed footprint (area ratio > 1) from 48-72 h.
7. **What this does not show:** it does not validate the model, the fuel mapping, the ROS curve or the 12 h ignition lead; the ignition time and place are assumptions fixed in the protocol; the observed footprint is a sparse sample of 375 m detections at 4-8 passes.

## 7. Could not verify

- The true ignition place and time (VIIRS first detection is an upper bound; the 12 h lead is a fixed assumption).
- Whether grass patches in WorldCover are fuel for the observed fire; the DSM includes canopy; the 10 m majority resampling of the crosswalk is a rule, not a validated fuel map.
- Wind at the fire: all three sources are 0.1-0.25° model fields.
- The harness domain lacks NextPass's terrain-validity mask and uses single passes as epochs, so its numbers are not comparable with NextPass's published values.
- The one-class pairs (E2024-131853 pair 0; E2023-084925 pairs 3 and 6) have no AUC.
- No statistical test, no confidence intervals: four incidents, 4-8 overpasses each, strongly autocorrelated cumulative footprints.
"""
(W / "docs/RESQ5_RESULTS.md").write_text(doc)
print(len(doc.splitlines()))
