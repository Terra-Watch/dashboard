"""Assemble docs/RESQ4_SPREAD_TEST.md from the stored JSON results (no new computation)."""
import json
from pathlib import Path

W = Path(__file__).resolve().parents[2]
ws = json.loads((W / "data/resq2/wind_stats.json").read_text())
mat = json.loads((W / "results/resq4_spread_matrix.json").read_text())
ros = json.loads((W / "results/resq4_ros_readout.json").read_text())
hr = json.loads((W / "results/resq4_hourly_wind_test.json").read_text())
formula = json.loads((W / "results/resq4_ros_formula.json").read_text())
scr = json.loads((W / "data/resq2/replacement_screening.json").read_text())
cds = json.loads((W / "data/resq2/era5land_fetch_status.json").read_text())
IDS = ["E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286"]
checks = {i: json.loads((W / f"data/resq2/{i}/input_checks.json").read_text()) for i in IDS}
STATE = {"E2024-131853": "TS", "E2024-135332": "MH", "E2023-084925": "OD", "E2024-155286": "CG"}


def fnum(x, nd=1):
    return "-" if x is None else f"{x:.{nd}f}"


# ---- section 2 table
rows = []
for i in IDS:
    c = checks[i]; f = c["forest"]; s = c["scar"]; v = c["viirs_cluster"]
    if s.get("pixels_event_window", 0) == 0:
        scar = "none in the event window" + (" (8 px dated 2024-03-05, 18 d later, ~7 km away)" if i == "E2024-131853" else "")
    else:
        scar = f"{s['pixels_event_window']} px, {s['scar_area_km2']} km², centroid offset {s['centroid_offset_km']} km, {s['detections_within_1km_of_scar_pct_nh']} % of n/h detections within 1 km; {s['verdict']}"
    rows.append(f"| {i} | {STATE[i]} | {f['ignition_pixel_class']} {f['ignition_pixel_class_name']} | {f['domain_forest_share_pct']} % | {v['event_detections']} det, {v['overpasses']} overpasses, {v['first']}-{v['last_date']} | {scar} |")
inc_table = "\n".join(rows)

# ---- wind table
wrows = []
for i in IDS:
    for src, label in (("era5land_native_0.1deg", "ERA5-Land native 0.1°"), ("era5_0.25deg", "ERA5 0.25°"), ("best_match_not_reanalysis", "best_match (not reanalysis)")):
        s = ws["incidents"][i]["sources"][src]
        wrows.append(f"| {i} | {label} | {s['mean_ms']} | {s['q1_ms']} / {s['median_ms']} / {s['q3_ms']} | {s['max_ms']} | {s['vector_mean_from_deg']:.0f} | {s['direction_constancy']} | {s['hourly_direction_range_deg'][0]:.0f}-{s['hourly_direction_range_deg'][1]:.0f} |")
wind_table = "\n".join(wrows)
drows = []
for i in IDS:
    for k, label in (("era5_0.25deg_minus_era5land", "ERA5 0.25° vs native"), ("best_match_not_reanalysis_minus_era5land", "best_match vs native")):
        d = ws["incidents"][i]["differences"][k]
        drows.append(f"| {i} | {label} | {d['mean_speed_diff_ms']:+} | {d['mean_abs_speed_diff_ms']} | {d['speed_ratio_of_means']} | {d['speed_correlation']} | {d['mean_abs_direction_diff_deg']:.0f} | {d['share_hours_direction_within_45deg_pct']:.0f} % | {d['rms_vector_diff_ms']} |")
diff_table = "\n".join(drows)
P = ws["pooled_era5land_native_speed_ms"]

# ---- matrix tables
winds = sorted({r["wind_ms"] for r in mat if r["fuel"] in (101, 145, 182)})
fuels = [(101, "GR1"), (145, "SH5"), (182, "TL2")]
hdr = "| wind m/s (km/h) | " + " | ".join(n for _, n in fuels) + " |"
sep = "|---|" + "---|" * len(fuels)
lines = [hdr, sep]
for w in winds:
    cells = []
    for f, _ in fuels:
        r = next(x for x in mat if x["fuel"] == f and x["wind_ms"] == w)
        tag = "" if not r["clipped_by_domain_edge"] else f" (edge h{r['first_edge_hour']})"
        a = r["area_ha_48h"]
        cells.append((f"{a:,.1f}" if a < 100 else f"{a:,.0f}") + tag)
    lines.append(f"| {w} ({w * 3.6:.1f}) | " + " | ".join(cells) + " |")
area_table = "\n".join(lines)

lines = ["| wind m/s | GR1 head / flank / back | SH5 head / flank / back | TL2 head / flank / back |", "|---|---|---|---|"]
for w in sorted({r["wind_ms"] for r in ros}):
    cells = []
    for f, _ in fuels:
        r = next(x for x in ros if x["fuel"] == f and x["wind_ms"] == w)
        cells.append(f"{fnum(r['head_E'], 2)} / {fnum(r['flank_N'], 2)} / {fnum(r['back_W'], 2)}")
    lines.append(f"| {w} | " + " | ".join(cells) + " |")
ros_table = "\n".join(lines)

nb = [r for r in mat if r["fuel"] in (91, 92, 93, 98, 99)]
nb_txt = ", ".join(f"{r['fuel_name']}: {r['cells_48h']} cell" for r in nb)

# ---- hourly test summary
def hour_summary(key):
    v = hr[key]
    out = []
    for r in v["hours"]:
        if r.get("max_ros") is None:
            out.append(f"{r['hour']}: none")
        else:
            out.append(f"{r['hour']}: {r['max_ros_dir']} {r['max_ros']}")
    return v, out

hourly_md = []
for key in hr:
    v, out = hour_summary(key)
    phases = []
    for p in range(4):
        seg = [r for r in v["hours"][p * 6:(p + 1) * 6]]
        dirs = [r.get("max_ros_dir") for r in seg]
        mx = [r.get("max_ros") for r in seg]
        phases.append(f"h{p*6}-{p*6+5}: wind {seg[0]['wind_ms']} m/s from {seg[0]['wind_from']:.0f}°, head edge direction by hour {dirs}, max ROS by hour {mx}")
    ext = v["extent_at_hour"]
    hourly_md.append(f"**{key}**\n\n" + "\n".join(f"- {p}" for p in phases) + f"\n- extents (m from ignition) at h6/12/18/24: " + "; ".join(f"h{h}: E{e['east_m']} W{e['west_m']} N{e['north_m']} S{e['south_m']}" for h, e in ext.items()) + "\n")
hourly_txt = "\n".join(hourly_md)

doc = f"""# RESQ-4: demo incident set, native ERA5-Land wind, and a synthetic spread test

Branch `resq4/demo-set-wind-and-spread-test` (off `resq3/pixel-fix-and-inputs`). 2026-10-11. No incident replay was run, no model scored, the simulator was not changed, nothing pushed. `.env` was not read and no credential value was printed.

## 0. Answer in five lines

1. **Demo set complete: 4 accepted incidents** (E2024-131853 TS, E2024-135332 MH, E2023-084925 OD, E2024-155286 CG). The two replacements tried first both passed the forest rule; none of the later candidates was evaluated.
2. **Native ERA5-Land wind was downloaded** for all four through CDS (0.1°, hourly, no nulls). The first-48-h wind is weak: pooled quartiles {P['q1']} / {P['median']} / {P['q3']} m/s, maximum {P['max']} m/s.
3. **The model's rate of spread is a saturating curve of wind** (`ROS = 1/(p1 e^(-p2 w) + p3)`, w in km/h). At these winds it gives: GR1 2.3-9.0 m/min, TL2 0.2-1.0 m/min, SH5 25-44 m/min. SH5 spreads at 19.7 m/min in calm air and its curve does not saturate until 359 m/min.
4. **Hourly wind changes are read every hour** (head direction follows the wind within one hour), but above about 4 m/s extra speed changes almost nothing for GR1 and TL2 because of the saturation.
5. **Recommendation:** keep the demo as an explicitly uncalibrated example now (option A); do not change the crosswalk to chase the replays (option B is tuning); use the ROS override only when independent fuel/moisture data exist (option C). Details in section 5.

## 1. Incident set

### Rule (unchanged from RESQ-3)
The 10 m WorldCover 2021 class at the pixel containing the ignition coordinate must be forest (10 tree cover, 95 mangroves). Not changed after seeing any result.

### Accepted (4)

| Incident | State | Ignition class | Domain forest | VIIRS cluster | MCD64A1 scar vs cluster |
|---|---|---|---|---|---|
{inc_table}

- E2024-131853 and E2024-155286 are **footprint-only** (no usable scar). E2023-084925 and E2024-135332 have scar fragments that cover only part of the cluster; they are reported, not smoothed over. For E2023-084925 the scar pixels are dated 2023-03-04 to 03-17 (the earliest 6 days before the first detection) and spread 9.3 km north-south against a 4.1 km cluster, so they may include a different fire.
- Details per incident (files, sizes, windows) are in `docs/RESQ3_INPUTS.md` for the first two and `data/resq2/<id>/fetch_report.json` and `input_checks.json` for all four. Everything fetched by windowed reads; the largest single download was an MCD64A1 file of 2.3 MB.

### Rejected
| Incident | Stage | Reason |
|---|---|---|
| E2023-078506 (OD) | RESQ-3 | ignition pixel class 30 (grassland); 94 % grass within 190 m, 79 % forest within 1 km |
| E2024-133629 (TS) | RESQ-3 | ignition pixel class 40 (cropland); 99.5 % cropland within 190 m |
| E2023-084925 | RESQ-4 screening | **accepted**, class 10 (99.4 % tree within 190 m) |
| E2024-155286 | RESQ-4 screening | **accepted**, class 10 (100 % tree within 190 m) |
| E2023-076569, E2023-098685, E2023-078410 | RESQ-4 screening | not evaluated: two replacements had already passed (the stated stop rule) |

Screening record: `data/resq2/replacement_screening.json`. The leftover probe file `data/resq2/_probe/t.hdf` was removed (the file and its empty folder); the sandbox allowed a single-file `rm`.

## 2. Wind sources and how far they differ

Native ERA5-Land u10/v10 from CDS `reanalysis-era5-land` (variables `10m_u_component_of_wind`, `10m_v_component_of_wind`; area box of ±0.1° around the ignition; nearest 0.1° cell, nothing interpolated; speed = hypot(u, v), direction = meteorological "from" = (270 - atan2(v, u)) mod 360). 120 hourly values per incident, 00:00 UTC of D-1 to 23:00 UTC of D+3, no nulls, hourly step verified. Cells (distance from ignition): {", ".join(f"{i} {cds[i]['grid_cell']} ({cds[i]['distance_km']} km)" for i in IDS)}. The ERA5 0.25° and `best_match` series from RESQ-3 are kept unchanged as labelled sensitivity files (`weather_era5_wind_and_surface.*`, `weather_best_match_sensitivity_not_reanalysis.*`).

Window: 48 hourly values from the first-detection hour (UTC).

| Incident | Source | Mean m/s | Q1 / median / Q3 | Max | Vector-mean from (°) | Direction constancy (1 = steady) | Hourly direction range (°) |
|---|---|---|---|---|---|---|---|
{wind_table}

Pooled native ERA5-Land speed (4 incidents x 48 h = {P['n']} hours): Q1 {P['q1']}, median {P['median']}, Q3 {P['q3']}, mean {P['mean']}, maximum {P['max']} m/s. The wind direction is not steady: constancy 0.6-0.72 and hourly bearings that cover much of the compass (the min-max column is the raw bearing range and wraps at 0/360) mean a diurnal swing, so a single "from" bearing misleads.

Disagreement with the native series (ERA5-Land taken as the reference):

| Incident | Source | Mean speed diff m/s | Mean abs diff | Ratio of means | Speed correlation | Mean abs direction diff (°) | Hours within 45° | RMS vector diff m/s |
|---|---|---|---|---|---|---|---|---|
{diff_table}

Reading: ERA5 at 0.25° is 11-42 % stronger than ERA5-Land (the cells are 7-17 km from the ignition; ERA5-Land cells 0.4-5.5 km) and agrees on direction within 45° for 73-96 % of hours (88 % but a speed correlation of only 0.02 for E2024-155286). `best_match` (a forecast-model blend, not a reanalysis) correlates poorly with ERA5-Land (0.12-0.42), differs in direction by 33-71° on average and has higher peaks (up to 4.7 m/s). Reanalysis winds at 0.1-0.25° describe a regional flow; none resolves ridge-valley winds, so all four are weak and uncertain at the fire.

## 3. Synthetic spread test

**Set-up.** Same Cell2Fire binary and command line as `run_demo_simulation.py` (simulator `S`, `--Fire-Period-Length 1.0`, `--weather rows`, `--scenario 1`, `--seed 42`, outputs: grids and messages), the runner's own stock lookup table, flat terrain (elevation 500 m, slope 0), uniform fuel, 500 x 500 cells of 30 m (15 km square), ignition at row 250, column 60, constant wind from the west, 48 weather rows. Wind speed is entered as the runner does (m/s x 3.6, floor 0.1 km/h). Nothing was tuned. The burnable fuels of the crosswalk are 182 (TL2, from WorldCover 10 and 95), 145 (SH5, class 20) and 101 (GR1, classes 30 and 100); classes 40, 50, 60, 70, 80, 90 map to non-burnable codes 93, 91, 99, 92, 98, 99. Winds: 0, 2, 5, 8, 12 m/s and the pooled ERA5-Land quartiles and maximum.

### The rate-of-spread formula the model uses

`FuelModelSpain.cpp:2251-2262` (marked "TODO: citation needed" in the source): `ROS_head = 1 / (p1 exp(-p2 w) + p3)` with w in km/h, coefficients of scenario 1:

| Fuel | p1 | p2 | p3 | ROS at calm (0.1 km/h) | Asymptote 1/p3 |
|---|---|---|---|---|---|
| GR1 (101) | 2.575 | 0.6665 | 0.1096 | {formula['GR1']['rss_calm(0.1km/h)']} | {formula['GR1']['asymptote_1_over_p3']} m/min |
| SH5 (145) | 0.0483 | 0.0781 | 0.002783 | {formula['SH5']['rss_calm(0.1km/h)']} | {formula['SH5']['asymptote_1_over_p3']} m/min |
| TL2 (182) | 11.01 | 0.3366 | 0.7639 | {formula['TL2']['rss_calm(0.1km/h)']} | {formula['TL2']['asymptote_1_over_p3']} m/min |

The values written into the model's `Messages` output match this formula (GR1 at 1, 2, 4 m/s: 2.92, 7.65, 9.11 measured against 2.91, 7.64, 9.11 computed). The curve has no slope, moisture or terrain term in this path (report `docs/sim_diagnosis/REPORT.md` section 5).

### Burned area at 48 h (ha) by wind and fuel

Grid area is 22,500 ha. "(edge hN)" means burned cells touched the boundary of the box at the first sampled frame N (frames sampled at 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48 h), so the figure is a lower bound for what an unbounded domain would burn. The ignition is 1.8 km from the west edge, so fast omnidirectional fires (SH5) touch that edge within hours even in calm air. Fires also stop when the fuel within reach is used up. A value of 0.1 ha is the ignition cell alone. Area is not monotonic in wind because stronger wind makes a narrower, longer fire that leaves the box earlier.

{area_table}

Non-burnable fuels at 12 m/s (100 x 100 grid): {nb_txt}.

### Rate of spread the model uses (m/min), read from the model's own messages

Diagnostic runs only: 61 x 61 cells, 24 h, with `--ROS-Threshold 0.001` so that rates below the runner's 0.1 m/min threshold are visible; these runs are not part of the area table. Values are the largest realised ROS among edges towards E (head, downwind), N (flank) and W (back). "-" = no edge fired in 24 h.

{ros_table}

Notes: (a) the realised edge value is slightly below the formula's head rate when the fire is nearly circular (TL2 at 0.5 m/s: formula 0.148, edge 0.107); (b) the runner's threshold (`ROSThreshold` 0.1 m/min, `ReadArgs.cpp:255`) is applied to the head rate of a burning cell, so a fire stops when the head rate is below 0.1.

### Stopping at 0.1 m/min and which fuels spread at the observed winds

- **TL2:** head ROS reaches 0.1 m/min at about 0.145 m/s (0.52 km/h). Below that, a TL2 fire does not leave the ignition cell (calm: 0.088 m/min, 1 cell burned at 48 h; consistent with the diagnosis test s1). At the observed quartiles it spreads, slowly: 0.22 m/min at 0.87 m/s to 1.0 m/min at 3.18 m/s. Flank edges only appear from about 1.2 m/s and back edges from about 3 m/s, so TL2 fires are narrow, directional strips in light wind. The first-48-h minima in the data (0.06-0.46 m/s) put some hours below the threshold.
- **GR1:** spreads in calm air (0.37 m/min) and at every observed wind: 2.3-9.0 m/min.
- **SH5:** spreads in calm air at 19.7 m/min; 24.6-44.4 m/min at the observed winds; 225 m/min at 12 m/s. It burns the whole 15 km domain within hours.
- **Non-burnable codes:** none spread, even at 12 m/s.
- For the four accepted incidents the ignition pixel and about 50-84 % of each domain are forest (TL2). WorldCover also puts 7-14 % grassland, 0-6 % shrubland and 3.5-31 % cropland (non-burnable) in each domain. At the observed quartiles GR1 is 9-14 times and SH5 44-112 times faster than TL2 at the same wind, so grass and shrub cells will control the footprint wherever they are connected.

### Do hourly wind changes reach the model each hour?

Sequences of 6 h phases at 500 x 500 cells, ignition at the centre, GR1 and TL2, reading the largest edge rate and its direction in each model hour from the messages.

{hourly_txt}

Findings:
- **Direction:** yes. The head edge turns with the wind at each phase change (E, S, W, N for winds from W, N, E, S), for both fuels, and the extents change accordingly. In four of the six phase changes (all three for GR1, one for TL2) the first hour after the change still shows the old head direction, because edges already scheduled carry the sender's hour; the lag is at most one hour.
- **Speed:** the new speed is read each hour (flank and back rates change at once, for example GR1 N edge 2.32 -> 0.83 m/min when 4 -> 8 m/s), but the **head** rate does not follow above about 4 m/s: GR1 9.11 at 4 m/s vs 9.13 at 8 m/s; TL2 1.18 vs 1.31. After a drop to 2 m/s GR1 keeps its old head rate (9.13) for one hour and then falls to 7.65; TL2 drops to 0.58 at once.

## 4. What the test does and does not show

- The simulator reads the weather correctly in time; the ROS values themselves come from a fixed curve per fuel whose coefficients are labelled as lacking a citation, are for Spanish fuels, and contain no moisture, slope (on this path), canopy or terrain term.
- At the observed winds the forest proxy (TL2) spreads at 0.2-1.0 m/min, which is the order of the average growth of the four VIIRS clusters (farthest detection from the ignition divided by cluster duration: 0.5-0.95 km/day, 0.35-0.66 m/min; a lower bound on the head rate because it is averaged over day and night). That is a plausibility check on one number, not validation.
- The grass and shrub proxies spread 9-14 and 44-112 times faster than TL2 at the same wind, so a mixed domain will be dominated by them.

## 5. Options for the fuel / ROS problem

| Option | What it would take | What it would NOT make valid |
|---|---|---|
| **A. Keep the demo as an uncalibrated example, with the limitation stated** (recommended now) | Already in the UI after RESQ-3. Add the three facts to the replay panel: fixed Spanish ROS curve per fuel, ROS saturates above about 4 m/s, wind is a 0.1° reanalysis point value; show the replay next to the VIIRS footprints without a score. Run the four accepted incidents once, with the rules written in advance. | Any statement that the footprint is accurate, any use for operational decisions, any inference about Indian fuels, or the claim that the hourly wind influences the head rate at 4 m/s and above. |
| **B. Change the fuel crosswalk** (for example map tree cover to another stock Spanish model, or drop GR1/SH5 proxies) | Choose the replacement from the stock lookup table by a written rule before replaying (for example the model with the lowest and highest ROS at 1-3 m/s as bounds); document it; re-run the synthetic matrix. Hours of work. | Validity: every model is still a Spanish empirical curve. Choosing a fuel because the replay then fits is tuning to the test set and would destroy the independence of the validation set. It cannot create the missing moisture or canopy inputs. |
| **C. Override the ROS** with an external model through the fork's `--ros-override-file` (experimental) | Per-cell `cell_id, ros_head, ros_flank, ros_back, angle_deg` for every cell (a static value per cell: no time dimension, so hourly wind has to be handled by regenerating the file and restarting in chunks or by a change to the fork, which this stage excludes). An external ROS model (Rothermel or an empirical relation) with Indian fuel load, depth, moisture and slope inputs; the evidence file `wild-fire-simulation/fuel/evidence/indian_runtime_readiness.md` records the Indian runtime as BLOCKED. Days to weeks, and field data for fuels. | Anything the new model's inputs cannot support: with the present data (land-cover class only, no fuel load, moisture or canopy) it exchanges one uncalibrated ROS for another. It would not validate the wind response above 4 m/s unless the external model has one, and it does not fix cell geometry (the 8-neighbour diagonal leakage, test d2). |

Order of work: A now for the demo; for paper 2, collect an independent ROS source or Indian fuel parameters first, then C, and judge it against the proximity baseline.

## 6. Could not verify

- **Real wind on the fire:** none of the three sources is an observation; ERA5-Land has no ridge-valley resolution. No station data were used.
- **Meaning of the CDS direction:** direction conversion was checked against the Open-Meteo convention only by the sign test in the harness (wind from west blows east); it was not compared hour by hour with the ERA5 0.25° series beyond the statistics above.
- **Domain-edge clipping:** the burned areas at high winds are bounded by a 15 km box; unbounded areas were not measured. Run time of one 500 x 500 run was 20-300 s (see `wall_s` in `results/resq4_spread_matrix.json`).
- **Messages ROS:** the ROS column was read from `MessagesFile1.csv` and matched to the source formula at six points; the other fuels' values were not checked against a second implementation.
- **The one-hour lag** is read from messages; whether the binary computes ROS at the sender's ignition hour or at the receiver's was not confirmed in the source.
- **Seeds:** the runner uses seed 42 and the model has no stochastic ROS here (`ROSCV` 0); other seeds were not run.
- **Replay not run:** by design nothing was done with the four incidents, so the plausibility of the footprints is untested.

## Reproduce

```
python3 scripts/resq4/screen_replacements.py
python3 scripts/resq3/fetch_inputs.py E2023-084925 E2024-155286 && python3 scripts/resq3/check_inputs.py E2023-084925 E2024-155286
python3 scripts/resq4/fetch_era5land_wind.py E2024-131853 E2024-135332 E2023-084925 E2024-155286   # needs ~/.cdsapirc
python3 scripts/resq4/wind_stats.py
python3 scripts/resq4/run_spread_test.py B C A   # about 1 h
python3 scripts/resq4/write_doc.py
```
"""
(W / "docs/RESQ4_SPREAD_TEST.md").write_text(doc)
print(len(doc.splitlines()))
