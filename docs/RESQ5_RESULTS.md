# RESQ-5 results

Protocol: `docs/RESQ5_PROTOCOL.md` (commit `7e752ac`, written and committed before any replay; Amendment 1 and 2 committed before the runs, no later amendment). 360 replays (4 incidents x 3 wind sources x 30 jitters), all completed, no run repeated or tuned. Simulator, fuel parameters and ROS unchanged. Outputs: `results/resq5/<incident>/` (`metrics_by_overpass.csv`, `members.csv`, `nextpass_style.csv`, `burn_count_*.npz` = number of burning members per cell per overpass (divide by members for p), `observed_footprints.npz`, `summary.json`).

## 1. Answer

**The simulation does not beat the simple baselines in a consistent way.** At the last overpass, with the primary (ERA5-Land) ensemble:

| Incident | Baseline | AP: sim vs baseline | AP winner | overpasses where sim AP higher | IoU@0.5: sim vs baseline | IoU winner | overpasses where sim IoU higher |
|---|---|---|---|---|---|---|---|
| E2024-131853 | baseline (a) proximity | 0.191 vs 0.367 | baseline | 2/6 | 0.167 vs 0.230 | baseline | 0/6 |
| E2024-131853 | baseline (b) circle, final area | 0.191 vs 0.149 | **sim** | 6/6 | 0.167 vs 0.230 | baseline | 0/6 |
| E2024-135332 | baseline (a) proximity | 0.075 vs 0.153 | baseline | 0/7 | 0.082 vs 0.060 | **sim** | 2/7 |
| E2024-135332 | baseline (b) circle, final area | 0.075 vs 0.024 | **sim** | 6/7 | 0.082 vs 0.060 | **sim** | 2/7 |
| E2023-084925 | baseline (a) proximity | 0.208 vs 0.510 | baseline | 0/8 | 0.000 vs 0.216 | baseline | 0/8 |
| E2023-084925 | baseline (b) circle, final area | 0.208 vs 0.229 | baseline | 2/8 | 0.000 vs 0.302 | baseline | 0/8 |
| E2024-155286 | baseline (a) proximity | 0.280 vs 0.300 | baseline | 0/4 | 0.163 vs 0.173 | baseline | 1/4 |
| E2024-155286 | baseline (b) circle, final area | 0.280 vs 0.103 | **sim** | 4/4 | 0.163 vs 0.180 | baseline | 1/4 |

Rank-based ability (AUC) of the proximity baseline is higher than the simulation's in all four incidents. The simulation's footprint is larger than observed in three of four (area ratio 1.2-3.0 at the last overpass) and is empty at p >= 0.5 for E2023-084925 under the primary wind. Interpretation is in section 6.

## 2. What was run

- Ignition: first-overpass medoid, t0 = first detection - 12 h; 30 jitters in a 500 m disc; fuel TL2 for class 10, GR1 for class 30, other classes non-burnable (uncalibrated); wind per protocol; temperature 27 C and RH 40 % fixed by the simulator; slope negligible.
- Run time per member: 8-15 s (7 workers); no crash, no memory problem.
- Implementation notes (not protocol changes): AUC/AP computed with scikit-learn over all cells of the domain; frames are read at floor(hours after t0), or the last written frame if the fire had ended; the harness metric used NextPass `domain.py` and `score_footprint.score` with its `load_domain` replaced by the rebuilt D.

## 3. Per-incident results

### E2024-131853 (TS)

Domain 11.25 km (375² cells), t0 2024-02-16 08:00:00 UTC, 72 weather hours, 6 overpasses. Fuel cells: 91: 0.4 %, 93: 23.8 %, 98: 0.4 %, 99: 5.4 %, 101: 12.2 %, 182: 57.8 % (101 GR1, 182 TL2, rest non-burnable). Steepest neighbour slope ratio 0.677 (slope factor at most 1.016).

Primary source, every overpass (reference: cumulative n/h VIIRS footprint):

| k | time UTC | h after t0 | model | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells | max p |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 02-16 20:11 | 12.18 | simulation (ERA5-Land, primary) | 0.999 | 0.652 | 0.000 | n/a | 0.000 | 0.000 | 0 | 325 | 0.300 |
| 0 | 02-16 20:11 | 12.18 | baseline (a) proximity | 0.999 | 0.811 | 0.194 | 0.194 | 1.000 | 5.157 | 1676 | 325 | 1.000 |
| 0 | 02-16 20:11 | 12.18 | baseline (b) circle, final area | 0.994 | 0.170 | 0.170 | 0.170 | 1.000 | 5.877 | 1910 | 325 | 1.000 |
| 1 | 02-16 21:00 | 13.0 | simulation (ERA5-Land, primary) | 0.999 | 0.670 | 0.000 | n/a | 0.000 | 0.000 | 0 | 325 | 0.300 |
| 1 | 02-16 21:00 | 13.0 | baseline (a) proximity | 0.999 | 0.811 | 0.194 | 0.194 | 1.000 | 5.157 | 1676 | 325 | 1.000 |
| 1 | 02-16 21:00 | 13.0 | baseline (b) circle, final area | 0.994 | 0.170 | 0.170 | 0.170 | 1.000 | 5.877 | 1910 | 325 | 1.000 |
| 2 | 02-17 07:22 | 23.37 | simulation (ERA5-Land, primary) | 0.975 | 0.710 | 0.000 | n/a | 0.000 | 0.000 | 0 | 494 | 0.467 |
| 2 | 02-17 07:22 | 23.37 | baseline (a) proximity | 0.997 | 0.624 | 0.236 | 0.247 | 0.838 | 3.393 | 1676 | 494 | 1.000 |
| 2 | 02-17 07:22 | 23.37 | baseline (b) circle, final area | 0.938 | 0.204 | 0.223 | 0.229 | 0.887 | 3.866 | 1910 | 494 | 1.000 |
| 3 | 02-17 08:12 | 24.2 | simulation (ERA5-Land, primary) | 0.930 | 0.595 | 0.003 | 1.000 | 0.003 | 0.003 | 2 | 638 | 0.500 |
| 3 | 02-17 08:12 | 24.2 | baseline (a) proximity | 0.996 | 0.573 | 0.287 | 0.308 | 0.809 | 2.627 | 1676 | 638 | 1.000 |
| 3 | 02-17 08:12 | 24.2 | baseline (b) circle, final area | 0.934 | 0.258 | 0.282 | 0.293 | 0.878 | 2.994 | 1910 | 638 | 1.000 |
| 4 | 02-18 20:23 | 60.38 | simulation (ERA5-Land, primary) | 0.835 | 0.284 | 0.214 | 0.285 | 0.461 | 1.620 | 2340 | 1444 | 1.000 |
| 4 | 02-18 20:23 | 60.38 | baseline (a) proximity | 0.969 | 0.438 | 0.275 | 0.401 | 0.465 | 1.161 | 1676 | 1444 | 1.000 |
| 4 | 02-18 20:23 | 60.38 | baseline (b) circle, final area | 0.744 | 0.191 | 0.271 | 0.375 | 0.496 | 1.323 | 1910 | 1444 | 1.000 |
| 5 | 02-19 07:34 | 71.57 | simulation (ERA5-Land, primary) | 0.837 | 0.191 | 0.167 | 0.212 | 0.438 | 2.065 | 3951 | 1913 | 1.000 |
| 5 | 02-19 07:34 | 71.57 | baseline (a) proximity | 0.960 | 0.367 | 0.230 | 0.401 | 0.351 | 0.876 | 1676 | 1913 | 1.000 |
| 5 | 02-19 07:34 | 71.57 | baseline (b) circle, final area | 0.683 | 0.149 | 0.230 | 0.375 | 0.374 | 0.998 | 1910 | 1913 | 1.000 |

Wind-source sensitivity at the last overpass:

| source | members | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells |
|---|---|---|---|---|---|---|---|---|---|
| simulation (ERA5-Land, primary) | 30 | 0.837 | 0.191 | 0.167 | 0.212 | 0.438 | 2.065 | 3951 | 1913 |
| sim, ERA5 0.25° (sens.) | 30 | 0.942 | 0.183 | 0.163 | 0.179 | 0.647 | 3.607 | 6900 | 1913 |
| sim, best_match (sens.) | 30 | 0.822 | 0.215 | 0.171 | 0.221 | 0.429 | 1.941 | 3713 | 1913 |
| sim, pooled 90 (secondary) | 90 | 0.942 | 0.260 | 0.167 | 0.205 | 0.478 | 2.339 | 4474 | 1913 |

Member level at the last overpass (single runs, no thresholding):

| source | median burned cells | IQR | member IoU mean / median | area ratio median |
|---|---|---|---|---|
| best_match | 3898 | 3844-4016 | 0.169 / 0.163 | 2.04 |
| era5_025 | 6909 | 6690-7570 | 0.165 / 0.155 | 3.61 |
| era5land_native | 4083 | 3975-4191 | 0.166 / 0.160 | 2.13 |

Wind in the replay window (m/s):

| source | hours | mean m/s | max m/s | min m/s | hours < 0.145 m/s |
|---|---|---|---|---|---|
| era5land_native | 72 | 1.57 | 2.79 | 0.46 | 0 (0.0 %) |
| era5_025 | 72 | 2.04 | 3.32 | 0.58 | 0 (0.0 %) |
| best_match | 72 | 1.55 | 3.89 | 0.22 | 0 (0.0 %) |

Fire ended before the last weather hour:

| source | members | fire ended before the last weather hour | end frames |
|---|---|---|---|
| best_match | 30 | 0 | [] |
| era5_025 | 30 | 0 | [] |
| era5land_native | 30 | 0 | [] |

Share of grass (GR1) among cells with p >= 0.5 at the last overpass, primary source: 1.0 % of 3951 cells. Edge clipping (members whose burned cells touch the outer ring at the last overpass): {"era5land_native": 0, "era5_025": 0, "best_match": 0, "pooled": 0} of {"era5land_native": 30, "era5_025": 30, "best_match": 30, "pooled": 90}.

### E2024-135332 (MH)

Domain 10.14 km (338² cells), t0 2024-03-04 19:00:00 UTC, 50 weather hours, 7 overpasses. Fuel cells: 91: 0.2 %, 93: 37.3 %, 98: 0.1 %, 99: 3.9 %, 101: 13.2 %, 182: 45.3 % (101 GR1, 182 TL2, rest non-burnable). Steepest neighbour slope ratio 0.574 (slope factor at most 1.013).

Primary source, every overpass (reference: cumulative n/h VIIRS footprint):

| k | time UTC | h after t0 | model | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells | max p |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 03-05 07:53 | 12.88 | simulation (ERA5-Land, primary) | 0.492 | 0.001 | 0.000 | n/a | 0.000 | 0.000 | 0 | 156 | 0.433 |
| 0 | 03-05 07:53 | 12.88 | baseline (a) proximity | 0.968 | 0.020 | 0.000 | 0.000 | 0.000 | 10.744 | 1676 | 156 | 1.000 |
| 0 | 03-05 07:53 | 12.88 | baseline (b) circle, final area | 0.494 | 0.001 | 0.000 | 0.000 | 0.000 | 9.083 | 1417 | 156 | 1.000 |
| 1 | 03-05 08:43 | 13.72 | simulation (ERA5-Land, primary) | 0.733 | 0.072 | 0.000 | n/a | 0.000 | 0.000 | 0 | 312 | 0.433 |
| 1 | 03-05 08:43 | 13.72 | baseline (a) proximity | 0.984 | 0.208 | 0.085 | 0.093 | 0.500 | 5.372 | 1676 | 312 | 1.000 |
| 1 | 03-05 08:43 | 13.72 | baseline (b) circle, final area | 0.744 | 0.056 | 0.099 | 0.110 | 0.500 | 4.542 | 1417 | 312 | 1.000 |
| 2 | 03-05 20:23 | 25.38 | simulation (ERA5-Land, primary) | 0.724 | 0.058 | 0.013 | 0.045 | 0.017 | 0.381 | 243 | 637 | 0.800 |
| 2 | 03-05 20:23 | 25.38 | baseline (a) proximity | 0.981 | 0.177 | 0.082 | 0.104 | 0.275 | 2.631 | 1676 | 637 | 1.000 |
| 2 | 03-05 20:23 | 25.38 | baseline (b) circle, final area | 0.620 | 0.033 | 0.084 | 0.113 | 0.251 | 2.224 | 1417 | 637 | 1.000 |
| 3 | 03-06 07:34 | 36.57 | simulation (ERA5-Land, primary) | 0.677 | 0.048 | 0.040 | 0.079 | 0.074 | 0.933 | 898 | 962 | 1.000 |
| 3 | 03-06 07:34 | 36.57 | baseline (a) proximity | 0.967 | 0.153 | 0.071 | 0.104 | 0.182 | 1.742 | 1676 | 962 | 1.000 |
| 3 | 03-06 07:34 | 36.57 | baseline (b) circle, final area | 0.578 | 0.026 | 0.072 | 0.113 | 0.166 | 1.473 | 1417 | 962 | 1.000 |
| 4 | 03-06 08:24 | 37.4 | simulation (ERA5-Land, primary) | 0.653 | 0.043 | 0.039 | 0.080 | 0.070 | 0.869 | 983 | 1131 | 1.000 |
| 4 | 03-06 08:24 | 37.4 | baseline (a) proximity | 0.965 | 0.154 | 0.066 | 0.104 | 0.155 | 1.482 | 1676 | 1131 | 1.000 |
| 4 | 03-06 08:24 | 37.4 | baseline (b) circle, final area | 0.565 | 0.024 | 0.067 | 0.113 | 0.141 | 1.253 | 1417 | 1131 | 1.000 |
| 5 | 03-06 20:04 | 49.07 | simulation (ERA5-Land, primary) | 0.834 | 0.082 | 0.085 | 0.101 | 0.340 | 3.362 | 4286 | 1275 | 1.000 |
| 5 | 03-06 20:04 | 49.07 | baseline (a) proximity | 0.965 | 0.160 | 0.063 | 0.104 | 0.137 | 1.315 | 1676 | 1275 | 1.000 |
| 5 | 03-06 20:04 | 49.07 | baseline (b) circle, final area | 0.557 | 0.024 | 0.063 | 0.113 | 0.125 | 1.111 | 1417 | 1275 | 1.000 |
| 6 | 03-06 20:54 | 49.9 | simulation (ERA5-Land, primary) | 0.796 | 0.075 | 0.082 | 0.101 | 0.306 | 3.020 | 4286 | 1419 | 1.000 |
| 6 | 03-06 20:54 | 49.9 | baseline (a) proximity | 0.956 | 0.153 | 0.060 | 0.104 | 0.123 | 1.181 | 1676 | 1419 | 1.000 |
| 6 | 03-06 20:54 | 49.9 | baseline (b) circle, final area | 0.551 | 0.024 | 0.060 | 0.113 | 0.113 | 0.999 | 1417 | 1419 | 1.000 |

Wind-source sensitivity at the last overpass:

| source | members | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells |
|---|---|---|---|---|---|---|---|---|---|
| simulation (ERA5-Land, primary) | 30 | 0.796 | 0.075 | 0.082 | 0.101 | 0.306 | 3.020 | 4286 | 1419 |
| sim, ERA5 0.25° (sens.) | 30 | 0.813 | 0.065 | 0.072 | 0.085 | 0.307 | 3.595 | 5101 | 1419 |
| sim, best_match (sens.) | 30 | 0.874 | 0.082 | 0.109 | 0.119 | 0.572 | 4.811 | 6827 | 1419 |
| sim, pooled 90 (secondary) | 90 | 0.873 | 0.084 | 0.085 | 0.100 | 0.367 | 3.665 | 5200 | 1419 |

Member level at the last overpass (single runs, no thresholding):

| source | median burned cells | IQR | member IoU mean / median | area ratio median |
|---|---|---|---|---|
| best_match | 6879 | 6276-7123 | 0.089 / 0.102 | 4.85 |
| era5_025 | 4726 | 4346-5539 | 0.072 / 0.086 | 3.33 |
| era5land_native | 3774 | 3580-4484 | 0.083 / 0.099 | 2.66 |

Wind in the replay window (m/s):

| source | hours | mean m/s | max m/s | min m/s | hours < 0.145 m/s |
|---|---|---|---|---|---|
| era5land_native | 50 | 1.82 | 3.18 | 0.19 | 0 (0.0 %) |
| era5_025 | 50 | 2.03 | 3.36 | 0.5 | 0 (0.0 %) |
| best_match | 50 | 2.43 | 4.7 | 0.86 | 0 (0.0 %) |

Fire ended before the last weather hour:

| source | members | fire ended before the last weather hour | end frames |
|---|---|---|---|
| best_match | 30 | 0 | [] |
| era5_025 | 30 | 0 | [] |
| era5land_native | 30 | 0 | [] |

Share of grass (GR1) among cells with p >= 0.5 at the last overpass, primary source: 20.8 % of 4286 cells. Edge clipping (members whose burned cells touch the outer ring at the last overpass): {"era5land_native": 0, "era5_025": 0, "best_match": 0, "pooled": 0} of {"era5land_native": 30, "era5_025": 30, "best_match": 30, "pooled": 90}.

### E2023-084925 (OD)

Domain 11.64 km (388² cells), t0 2023-03-10 07:00:00 UTC, 62 weather hours, 8 overpasses. Fuel cells: 91: 0.3 %, 93: 10.3 %, 98: 4.0 %, 99: 0.1 %, 101: 11.8 %, 182: 73.5 % (101 GR1, 182 TL2, rest non-burnable). Steepest neighbour slope ratio 1.377 (slope factor at most 1.032).

Primary source, every overpass (reference: cumulative n/h VIIRS footprint):

| k | time UTC | h after t0 | model | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells | max p |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 03-10 19:51 | 12.85 | simulation (ERA5-Land, primary) | 0.859 | 0.094 | 0.000 | n/a | 0.000 | 0.000 | 0 | 144 | 0.200 |
| 0 | 03-10 19:51 | 12.85 | baseline (a) proximity | 1.000 | 0.916 | 0.086 | 0.086 | 1.000 | 11.646 | 1677 | 144 | 1.000 |
| 0 | 03-10 19:51 | 12.85 | baseline (b) circle, final area | 0.988 | 0.038 | 0.038 | 0.038 | 1.000 | 26.062 | 3753 | 144 | 1.000 |
| 1 | 03-11 07:02 | 24.03 | simulation (ERA5-Land, primary) | 0.732 | 0.108 | 0.000 | n/a | 0.000 | 0.000 | 0 | 756 | 0.333 |
| 1 | 03-11 07:02 | 24.03 | baseline (a) proximity | 0.988 | 0.411 | 0.179 | 0.220 | 0.488 | 2.218 | 1677 | 756 | 1.000 |
| 1 | 03-11 07:02 | 24.03 | baseline (b) circle, final area | 0.845 | 0.103 | 0.135 | 0.143 | 0.712 | 4.964 | 3753 | 756 | 1.000 |
| 2 | 03-11 07:54 | 24.9 | simulation (ERA5-Land, primary) | 0.712 | 0.229 | 0.000 | n/a | 0.000 | 0.000 | 0 | 1524 | 0.333 |
| 2 | 03-11 07:54 | 24.9 | baseline (a) proximity | 0.992 | 0.579 | 0.328 | 0.471 | 0.518 | 1.100 | 1677 | 1524 | 1.000 |
| 2 | 03-11 07:54 | 24.9 | baseline (b) circle, final area | 0.920 | 0.300 | 0.329 | 0.348 | 0.857 | 2.463 | 3753 | 1524 | 1.000 |
| 3 | 03-11 19:32 | 36.53 | simulation (ERA5-Land, primary) | 0.761 | 0.221 | 0.000 | n/a | 0.000 | 0.000 | 0 | 2343 | 0.400 |
| 3 | 03-11 19:32 | 36.53 | baseline (a) proximity | 0.991 | 0.601 | 0.315 | 0.575 | 0.411 | 0.716 | 1677 | 2343 | 1.000 |
| 3 | 03-11 19:32 | 36.53 | baseline (b) circle, final area | 0.861 | 0.343 | 0.395 | 0.460 | 0.736 | 1.602 | 3753 | 2343 | 1.000 |
| 4 | 03-11 20:24 | 37.4 | simulation (ERA5-Land, primary) | 0.769 | 0.226 | 0.000 | n/a | 0.000 | 0.000 | 0 | 2343 | 0.400 |
| 4 | 03-11 20:24 | 37.4 | baseline (a) proximity | 0.991 | 0.601 | 0.315 | 0.575 | 0.411 | 0.716 | 1677 | 2343 | 1.000 |
| 4 | 03-11 20:24 | 37.4 | baseline (b) circle, final area | 0.861 | 0.343 | 0.395 | 0.460 | 0.736 | 1.602 | 3753 | 2343 | 1.000 |
| 5 | 03-12 07:35 | 48.58 | simulation (ERA5-Land, primary) | 0.794 | 0.246 | 0.000 | n/a | 0.000 | 0.000 | 0 | 2487 | 0.400 |
| 5 | 03-12 07:35 | 48.58 | baseline (a) proximity | 0.989 | 0.581 | 0.301 | 0.575 | 0.388 | 0.674 | 1677 | 2487 | 1.000 |
| 5 | 03-12 07:35 | 48.58 | baseline (b) circle, final area | 0.840 | 0.324 | 0.382 | 0.460 | 0.694 | 1.509 | 3753 | 2487 | 1.000 |
| 6 | 03-12 20:05 | 61.08 | simulation (ERA5-Land, primary) | 0.751 | 0.208 | 0.000 | n/a | 0.000 | 0.000 | 0 | 3750 | 0.433 |
| 6 | 03-12 20:05 | 61.08 | baseline (a) proximity | 0.980 | 0.510 | 0.216 | 0.575 | 0.257 | 0.447 | 1677 | 3750 | 1.000 |
| 6 | 03-12 20:05 | 61.08 | baseline (b) circle, final area | 0.725 | 0.229 | 0.302 | 0.464 | 0.465 | 1.001 | 3753 | 3750 | 1.000 |
| 7 | 03-12 20:54 | 61.9 | simulation (ERA5-Land, primary) | 0.751 | 0.208 | 0.000 | n/a | 0.000 | 0.000 | 0 | 3750 | 0.433 |
| 7 | 03-12 20:54 | 61.9 | baseline (a) proximity | 0.980 | 0.510 | 0.216 | 0.575 | 0.257 | 0.447 | 1677 | 3750 | 1.000 |
| 7 | 03-12 20:54 | 61.9 | baseline (b) circle, final area | 0.725 | 0.229 | 0.302 | 0.464 | 0.465 | 1.001 | 3753 | 3750 | 1.000 |

Wind-source sensitivity at the last overpass:

| source | members | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells |
|---|---|---|---|---|---|---|---|---|---|
| simulation (ERA5-Land, primary) | 30 | 0.751 | 0.208 | 0.000 | n/a | 0.000 | 0.000 | 0 | 3750 |
| sim, ERA5 0.25° (sens.) | 30 | 0.871 | 0.399 | 0.271 | 0.368 | 0.505 | 1.373 | 5149 | 3750 |
| sim, best_match (sens.) | 30 | 0.832 | 0.264 | 0.045 | 0.929 | 0.045 | 0.049 | 182 | 3750 |
| sim, pooled 90 (secondary) | 90 | 0.868 | 0.357 | 0.096 | 0.786 | 0.099 | 0.126 | 471 | 3750 |

Member level at the last overpass (single runs, no thresholding):

| source | median burned cells | IQR | member IoU mean / median | area ratio median |
|---|---|---|---|---|
| best_match | 158 | 134-7473 | 0.087 / 0.039 | 0.04 |
| era5_025 | 4882 | 3495-6337 | 0.267 / 0.258 | 1.30 |
| era5land_native | 80 | 70-972 | 0.051 / 0.019 | 0.02 |

Wind in the replay window (m/s):

| source | hours | mean m/s | max m/s | min m/s | hours < 0.145 m/s |
|---|---|---|---|---|---|
| era5land_native | 62 | 0.8 | 2.7 | 0.06 | 1 (1.6 %) |
| era5_025 | 62 | 1.16 | 2.33 | 0.2 | 0 (0.0 %) |
| best_match | 62 | 1.44 | 4.2 | 0.1 | 1 (1.6 %) |

Fire ended before the last weather hour:

| source | members | fire ended before the last weather hour | end frames |
|---|---|---|---|
| best_match | 30 | 18 | [15] |
| era5_025 | 30 | 0 | [] |
| era5land_native | 30 | 22 | [22] |

Share of grass (GR1) among cells with p >= 0.5 at the last overpass, primary source: no cell reaches p >= 0.5. Edge clipping (members whose burned cells touch the outer ring at the last overpass): {"era5land_native": 0, "era5_025": 0, "best_match": 0, "pooled": 0} of {"era5land_native": 30, "era5_025": 30, "best_match": 30, "pooled": 90}.

### E2024-155286 (CG)

Domain 10.14 km (338² cells), t0 2024-04-12 07:00:00 UTC, 62 weather hours, 4 overpasses. Fuel cells: 91: 0.0 %, 93: 4.1 %, 98: 3.6 %, 99: 1.1 %, 101: 7.6 %, 182: 83.7 % (101 GR1, 182 TL2, rest non-burnable). Steepest neighbour slope ratio 1.061 (slope factor at most 1.025).

Primary source, every overpass (reference: cumulative n/h VIIRS footprint):

| k | time UTC | h after t0 | model | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells | max p |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 04-12 19:46 | 12.77 | simulation (ERA5-Land, primary) | 0.812 | 0.249 | 0.000 | n/a | 0.000 | 0.000 | 0 | 482 | 0.267 |
| 0 | 04-12 19:46 | 12.77 | baseline (a) proximity | 0.994 | 0.419 | 0.234 | 0.244 | 0.849 | 3.475 | 1675 | 482 | 1.000 |
| 0 | 04-12 19:46 | 12.77 | baseline (b) circle, final area | 0.932 | 0.212 | 0.234 | 0.242 | 0.876 | 3.616 | 1743 | 482 | 1.000 |
| 1 | 04-14 07:53 | 48.88 | simulation (ERA5-Land, primary) | 0.895 | 0.295 | 0.238 | 0.289 | 0.572 | 1.976 | 1261 | 638 | 1.000 |
| 1 | 04-14 07:53 | 48.88 | baseline (a) proximity | 0.983 | 0.337 | 0.215 | 0.244 | 0.641 | 2.625 | 1675 | 638 | 1.000 |
| 1 | 04-14 07:53 | 48.88 | baseline (b) circle, final area | 0.825 | 0.162 | 0.215 | 0.242 | 0.661 | 2.732 | 1743 | 638 | 1.000 |
| 2 | 04-14 20:23 | 61.38 | simulation (ERA5-Land, primary) | 0.938 | 0.300 | 0.171 | 0.252 | 0.348 | 1.379 | 2174 | 1576 | 1.000 |
| 2 | 04-14 20:23 | 61.38 | baseline (a) proximity | 0.978 | 0.312 | 0.184 | 0.301 | 0.320 | 1.063 | 1675 | 1576 | 1.000 |
| 2 | 04-14 20:23 | 61.38 | baseline (b) circle, final area | 0.663 | 0.112 | 0.190 | 0.305 | 0.337 | 1.106 | 1743 | 1576 | 1.000 |
| 3 | 04-14 20:48 | 61.8 | simulation (ERA5-Land, primary) | 0.906 | 0.280 | 0.163 | 0.252 | 0.314 | 1.246 | 2174 | 1745 | 1.000 |
| 3 | 04-14 20:48 | 61.8 | baseline (a) proximity | 0.974 | 0.300 | 0.173 | 0.301 | 0.289 | 0.960 | 1675 | 1745 | 1.000 |
| 3 | 04-14 20:48 | 61.8 | baseline (b) circle, final area | 0.647 | 0.103 | 0.180 | 0.305 | 0.304 | 0.999 | 1743 | 1745 | 1.000 |

Wind-source sensitivity at the last overpass:

| source | members | AUC | AP | IoU @0.5 | precision | recall | area ratio | sim cells | obs cells |
|---|---|---|---|---|---|---|---|---|---|
| simulation (ERA5-Land, primary) | 30 | 0.906 | 0.280 | 0.163 | 0.252 | 0.314 | 1.246 | 2174 | 1745 |
| sim, ERA5 0.25° (sens.) | 30 | 0.960 | 0.266 | 0.187 | 0.235 | 0.479 | 2.041 | 3561 | 1745 |
| sim, best_match (sens.) | 30 | 0.905 | 0.263 | 0.180 | 0.257 | 0.376 | 1.461 | 2549 | 1745 |
| sim, pooled 90 (secondary) | 90 | 0.961 | 0.299 | 0.178 | 0.249 | 0.384 | 1.543 | 2692 | 1745 |

Member level at the last overpass (single runs, no thresholding):

| source | median burned cells | IQR | member IoU mean / median | area ratio median |
|---|---|---|---|---|
| best_match | 2701 | 2694-2712 | 0.202 / 0.194 | 1.55 |
| era5_025 | 3685 | 3672-3695 | 0.207 / 0.203 | 2.11 |
| era5land_native | 2338 | 2336-2342 | 0.195 / 0.186 | 1.34 |

Wind in the replay window (m/s):

| source | hours | mean m/s | max m/s | min m/s | hours < 0.145 m/s |
|---|---|---|---|---|---|
| era5land_native | 62 | 1.4 | 2.17 | 0.36 | 0 (0.0 %) |
| era5_025 | 62 | 1.75 | 2.71 | 0.73 | 0 (0.0 %) |
| best_match | 62 | 1.5 | 3.32 | 0.3 | 0 (0.0 %) |

Fire ended before the last weather hour:

| source | members | fire ended before the last weather hour | end frames |
|---|---|---|---|
| best_match | 30 | 0 | [] |
| era5_025 | 30 | 0 | [] |
| era5land_native | 30 | 0 | [] |

Share of grass (GR1) among cells with p >= 0.5 at the last overpass, primary source: 0.0 % of 2174 cells. Edge clipping (members whose burned cells touch the outer ring at the last overpass): {"era5land_native": 0, "era5_025": 0, "best_match": 0, "pooled": 0} of {"era5land_native": 30, "era5_025": 30, "best_match": 30, "pooled": 90}.


## 4. Both baselines and the harness metric

- (a) proximity has no wind, fuel or physics, yet its AUC is 0.956-0.980 at the last overpass because the observed footprint sits around the ignition point; the simulation, whose footprints are shifted by the 500 m jitter and lengthened by the fastest fuel patches, has AUC 0.75-0.91.
- (b) circle of the final area is information-advantaged (it knows the final area) and, with a binary score, has a low AUC (0.55-0.73) and an IoU of 0.06-0.30 at the last overpass.
- NextPass-style target (cells newly detected at overpass k+1, domain within r_max = 2,855.9 m of the footprint at k, `score_footprint.score` unmodified except `load_domain`). Counts of pairs where the primary simulation beats the baseline (pairs with an undefined AUC, because only one class is present, are excluded):

| incident | pairs with defined AUC | simulation (ERA5-Land) AP > proximity AP | AP > circle AP | AUC > proximity AUC |
|---|---|---|---|---|
| E2024-131853 | 4 | 2/4 | 3/4 | 1/4 |
| E2024-135332 | 6 | 1/6 | 3/6 | 1/6 |
| E2023-084925 | 5 | 0/5 | 3/5 | 0/5 |
| E2024-155286 | 3 | 2/3 | 3/3 | 2/3 |

Positives per pair are 1-8 cells in D of 176-312 cells, so each pair is noisy; the table is a count, not a significance test.

## 5. The earlier check and the baselines

Old check (500 m logic, corrected to 463.31 m), E2024-135332 only, median-area primary member, fully burned domain, and a one-cell cross through the ignition:

| shape | old check IoU (463.31 m pixels, clip rule) | pixels predicted / kept | new IoU vs cumulative VIIRS footprint | new AP | new AUC |
|---|---|---|---|---|---|
| simulation_median_area_member | 0.0 | 29 / 1 | 0.029 | 0.015 | 0.536 |
| fully_burned_domain | 0.0225 | 533 / 12 | 0.012 | 0.012 | 0.500 |
| cross_through_ignition | 0.0 | 54 / 0 | 0.012 | 0.013 | 0.506 |

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
