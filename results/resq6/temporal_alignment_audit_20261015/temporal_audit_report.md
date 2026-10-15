# RESQ6 development temporal target-alignment audit

Audit date: 2026-10-15. Scope: the four frozen development incidents and their nominal 24 h / 48 h comparisons, plus 6 h / 12 h scorability. No held-out incident was opened, no Cell2Fire run was performed, and no labels or historical result files were changed.

## Finding

The evaluator follows the written rule “latest VIIRS overpass at or before the horizon” and scores exact simulator frames at 24 h and 48 h. It does **not** require the observation to be close to that horizon. Seven of the eight scored targets are therefore many hours earlier than the forecast frame (10.28–35.23 h); the remaining target is 0.63 h earlier. The protocol defines no maximum observation lag, so scientific adequacy cannot be formally certified from its wording. The seven long-gap comparisons are materially time-mismatched for interpreting the metric as performance against a same-horizon fire extent. The existing official metrics remain reproducible as comparisons against the protocol-selected cumulative detections, but they should not be read as eight contemporaneous 24 h / 48 h fire-perimeter validations.

### Timing and per-cell classification

Elapsed time is measured from the fixed `t0_utc` in `data/resq5/protocol_setup.json`. “Gap” is nominal forecast horizon minus selected observation elapsed time; positive means the target observation is earlier. Category A for the sole sub-hour case is **provisional descriptive alignment**, not an adopted tolerance. B means an observation exists but is many hours stale; this is an evidence-based description, not a new protocol cutoff. The protocol owner must still specify an acceptable lag. A separate D provenance caveat applies to **all eight** historical comparisons: recorded execution-source hashes for `run_dev.py` and `rescore_fair.py` match neither the recorded Git revision nor current worktree source, so exact historical source replay cannot be established. Raw timestamps, selected masks, archive hashes, and numeric reproduction are established independently.

| Incident | t0 UTC | Horizon | Selected target pass (UTC) | Elapsed | Gap | Target cells | Category / interpretation |
|---|---|---:|---|---:|---:|---:|---|
| E2024-131853 | 2024-02-16 08:00 | 24 h | 2024-02-17 07:22 | 23.37 h | 0.63 h | 494 | A + D, provisional nearest-aligned; no approved tolerance |
| E2024-131853 | 2024-02-16 08:00 | 48 h | 2024-02-17 08:12 | 24.20 h | 23.80 h | 638 | B + D, long temporal mismatch |
| E2024-135332 | 2024-03-04 19:00 | 24 h | 2024-03-05 08:43 | 13.72 h | 10.28 h | 312 | B + D, long temporal mismatch |
| E2024-135332 | 2024-03-04 19:00 | 48 h | 2024-03-06 08:24 | 37.40 h | 10.60 h | 1,131 | B + D, long temporal mismatch |
| E2023-084925 | 2023-03-10 07:00 | 24 h | 2023-03-10 19:51 | 12.85 h | 11.15 h | 144 | B + D, long temporal mismatch |
| E2023-084925 | 2023-03-10 07:00 | 48 h | 2023-03-11 20:24 | 37.40 h | 10.60 h | 2,343 | B + D, long temporal mismatch |
| E2024-155286 | 2024-04-12 07:00 | 24 h | 2024-04-12 19:46 | 12.77 h | 11.23 h | 482 | B + D, long temporal mismatch |
| E2024-155286 | 2024-04-12 07:00 | 48 h | 2024-04-12 19:46 | 12.77 h | 35.23 h | 482 | B + D, very long temporal mismatch |

All 6 h and 12 h cases are category C: no n/h observation pass exists by those horizons. The earliest qualifying pass is 12.18 h (E2024-131853); the others are 12.77–12.88 h. They correctly remain unscorable; no synthetic label is made. Full pass enumeration—including confidence counts, pass timestamp ranges, eligibility, and selected flags—is in `temporal_timing_table.json` and `.csv`.

Notable selection correction: E2023-084925 has a 2023-03-11 07:02 UTC pass at 24.033 h (24 h 2 min), which is **after** the 24 h horizon and is excluded by the strict rule. The score actually uses the preceding 2023-03-10 19:51 UTC pass at 12.85 h. `docs/simulation/RESULTS_DEV.md` lines 242–245 currently says 24.03 h was selected; that narrative is inconsistent with the executable `<= horizon` selector and the score-reproducing mask. Its 24 h score has 144 positive cells, matching the earlier mask. No code change is made because the selector agrees with the frozen protocol; the results narrative needs a separately reviewed correction.

At 48 h, E2024-131853 uses 24.20 h (the next n/h observation is 60.38 h); E2024-135332 uses 37.40 h (next 49.07 h); E2023-084925 uses 37.40 h (next 48.58 h); and E2024-155286 uses 12.77 h (next 48.88 h). Thus the 155286 comparison is a 48 h forecast against a target more than 35 h earlier.

### End-to-end timing and label path

1. `data/resq2/<incident>/viirs_detections.csv` contains FIRMS columns `acq_date`, `acq_time` (HHMM), `satellite`, `daynight`, `confidence`, `type`, `latitude`, and `longitude`. NASA FIRMS defines acquisition time as UTC, coordinates as the center of a nominal 375 m fire pixel, and confidence classes `l/n/h`; `type=0` is presumed vegetation fire ([NASA FIRMS VIIRS product description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)). The source CSV has minute precision; records are not timestamped to seconds.
2. `scripts/resq3/check_inputs.py:event_detections()` (lines 80–95) keeps `type == 0`, links detections in space-time using the existing 2 km 3-D connected-component rule, and selects the component containing the first-date detection nearest the candidate ignition. This clustering step includes confidence classes; later mask creation restricts positive observations to `n` and `h`.
3. `scripts/resq5/setup_incidents.py` (lines 44–68) constructs naive timestamps from date + HHMM, derives `t0` as first clustered detection minus 12 h floored to the hour, groups by satellite/date/day-night, uses each group’s median timestamp floored to a minute, and saves elapsed hours rounded to two decimals. Setup labels these timestamps UTC; NASA’s field definition supports that convention. No explicit timezone conversion happens in the pandas timestamp construction.
4. `scripts/resq5/analyze.py:observed_arrays()` (lines 56–85) repeats date + HHMM parsing, forms the same pass key, projects lon/lat from EPSG:4326 into each domain CRS (EPSG:32644), and floors projected coordinates into a global-origin 375 m grid. It maps 30 m simulation-cell centers using the same `floor(x/375), floor(y/375)` keys. A cell becomes positive if its key matches any qualifying detection key in the cumulative pass set.
5. The label is cumulative: `obs_nh[k]` is the union of all nominal/high detections through pass `k`; the metric treats every other domain cell as zero. It is not a perimeter polygon or a snapshot of all burned area.
6. `scripts/resq6/run_dev.py:prediction_frame_hours()` (lines 82–85) and `run_dev()` (lines 290–312) select exact model frames 6/12/24/48 and independently select the latest saved pass whose rounded elapsed hours are `<=` the horizon. `scripts/resq6/rescore_fair.py:obs_at_horizon()` (lines 76–78) repeats that observation rule; its artifact path scores saved exact-horizon NPZ grids and matched 500 m blurred baselines (lines 112–158).

There is no nearest-observation tolerance or interpolation. Prediction frames do not shift to the observation time. For current data, using the two-decimal elapsed values does not change any 24/48 selection: the closest boundary pass is 24.033 h, still after 24 h. The persisted raw UTC minute timestamps in the setup list corroborate all selected passes.

### Spatial and observation-coverage limitations

- CRS and axes are consistent in the current mask builder: projected eastings increase by column; northings decrease by row (row 0 is north). 30 m cell centers are compared with floored 375 m keys.
- There is no additional radius/buffer beyond assigning a whole nominal 375 m key block of 30 m cell centers; duplicates within a key collapse to one positive block. The code does not use each FIRMS row’s `scan`/`track` footprint dimensions, which NASA says reflect actual pixel size away from nadir. This is a known spatial approximation, not changed here.
- The mask is detection-only, not an observed burn scar. It has no clear-sky, cloud, smoke, or satellite-coverage mask. Therefore domain cells without n/h detections are treated as negatives even though absence of a detection is not proof of no burning. NASA describes these as active-fire detections, not a complete burned-area map; omission/coverage is consequently a validity concern for both AP and Brier. This audit did not fabricate negative/unknown labels or alter masks.
- The fixed ignition cell falls inside seven of eight selected cumulative masks; both E2024-135332 masks exclude it. This is a target-alignment warning, not evidence that ignition coordinates or labels should be edited.

## Frozen score reproduction

All 240 member archives (60 × 4 incidents) were SHA-256 checked against their per-incident manifests; each archive contains exact 6/12/24/48 frames. Their mean probability maps were scored against the actual cumulative masks selected by the current code. The frozen baselines were recomputed through the existing fair-score functions from cached weather, and all six AP/Brier values in each of the eight cells matched `fair_rescore.json` with maximum absolute difference **0.0** (tolerance 1e-12). Existing official artifact SHA-256: `3861be1e2cc61f17f70f9dcf26c694386654187a92ef0857a331584919f4ec8d`.

| Incident | h | Engine / baseline A / baseline B AP | Engine / A / B Brier | Frozen call |
|---|---:|---|---|---|
| E2024-131853 | 24 | 0.5080 / 0.5782 / 0.5611 | 0.002376 / 0.010946 / 0.097088 | LOSS |
| E2024-131853 | 48 | 0.3324 / 0.5354 / 0.4548 | 0.004992 / 0.010909 / 0.250938 | LOSS |
| E2024-135332 | 24 | 0.0425 / 0.1421 / 0.1175 | 0.003690 / 0.014388 / 0.114334 | LOSS |
| E2024-135332 | 48 | 0.0632 / 0.1281 / 0.0851 | 0.030052 / 0.017386 / 0.280034 | LOSS |
| E2023-084925 | 24 | 0.2614 / 0.8666 / 0.8875 | 0.000931 / 0.010587 / 0.063484 | LOSS |
| E2023-084925 | 48 | 0.4300 / 0.6003 / 0.5273 | 0.011242 / 0.011882 / 0.196722 | LOSS |
| E2024-155286 | 24 | 0.3664 / 0.4920 / 0.4848 | 0.003067 / 0.013609 / 0.120532 | LOSS |
| E2024-155286 | 48 | 0.4653 / 0.4920 / 0.4828 | 0.005358 / 0.013609 / 0.290540 | TIE |

The baseline formulas and ±0.05 AP decision margin were not changed. The tally remains **0 wins, 1 tie, 7 losses**. This reproduces the frozen scores for the implemented target-selection behavior; it does not make the stale targets contemporaneous.

The normal `rescore_fair.py --member-grid-dir ...` CLI was also attempted into this new directory but stopped before scoring: current modified CLI requires `ignition_jitter_radius_m` in each saved member manifest, while these official per-incident manifests do not contain that field. No radius was guessed. The independent reproduction above validated all archive hashes and used the existing scorer functions directly.

### Provenance limits

The recovery provenance records Git HEAD `4650cc599d4476bdc29cedcc1d05b7ab3cf28334`, but the recorded SHA-256 values for `scripts/resq6/run_dev.py` and `scripts/resq6/rescore_fair.py` match neither that commit’s source nor the current modified worktree source; those exact source bytes are not archived. Therefore the score values and saved grids are verifiable, but byte-identical replay of the historical execution code is not. `scripts/resq5/analyze.py`, protocol, decision rule, setup, baseline/weather/fuel/smoulder sources and listed raster/weather inputs match the recorded hashes where checked. The recorded sklearn version is 1.7.2 while the available environment is 1.5.2; no dependency was installed, and current-environment scores nevertheless match exactly. Details are in `provenance_manifest.json`.

## Scientific interpretation and next action

No target-selection code defect is confirmed: the strict latest-at-or-before selector is correct, including exclusion of the 24.033 h E2023-084925 pass. The confirmed issue is a **target-age limitation** (the protocol has no maximum lag) plus an inaccurate E2023-084925 24 h timestamp statement in `RESULTS_DEV.md`. Category A is provisional; the project owner must define an acceptable observation-to-horizon lag before making stronger contemporaneous claims. Categories B show that nominal 24/48-hour scoring often evaluates a much earlier cumulative detection surface. Category C is the expected lack of early overpasses. Historical source-version hash gaps constrain exact run provenance but did not prevent numeric score reproduction.

Highest-value next action: before further model tuning, approve a maximum target-age rule and a target interpretation (active-fire detections versus burned extent), then source or derive temporally aligned observation-and-coverage masks for development cases. If such masks are unavailable, explicitly restrict the forecast horizons to adequately observed times under a predeclared rule and re-evaluate development only. Never treat cloud/coverage-unknown cells as negatives without an approved observation model. Do not touch held-out data until that target policy and the existing failed development gate are resolved.

## Files and verification

This directory contains `temporal_timing_table.json`, `temporal_timing_table.csv`, `official_score_reproduction.json`, and `provenance_manifest.json`. No application, simulation, protocol, label, or historical result file was modified. No code change or regression test was necessary. Score reproduction and all member/input integrity checks are recorded machine-readably. `git diff --check` passed; the separately attempted standard fair-rescore CLI limitation is documented above.
