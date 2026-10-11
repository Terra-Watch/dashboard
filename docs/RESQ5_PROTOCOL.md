# RESQ-5 replay protocol

**Status: fixed on 2026-10-11, committed before any replay was run.** Changes are allowed only as a dated amendment at the end of this file that states what changed and why. Branch `resq5/replay-protocol-and-results`.

Purpose: replay four accepted incidents with the Cell2Fire simulator **as it is**, and compare the result with observed VIIRS footprints and with two baselines that do not use the simulator. The fuel is uncalibrated, the ROS curve is a fixed Spanish empirical curve, and nothing is tuned.

Facts relied on (re-verified in this stage): `ReadCSV.cpp:526` sets `tmp = 27, rh = 40`; for simulator `S` the temperature and humidity columns are not read (lines 543-547 read only wind speed `DF[i][2]` and direction `DF[i][3]`, direction through `std::stoi`, so whole degrees, then +180 mod 360); `Cells.cpp:443-450` `slope_effect = 1 + 0.023322 ps + 0.00013585 ps^2` with `ps = (elev_j - elev_i)/cellsize`, applied at `Cells.cpp:786-793`; `FuelModelSpain.cpp:2251-2262` `ROS = 1/(p1 exp(-p2 w) + p3)`, w in km/h (RESQ-4).

## 1. Incidents

| | |
|---|---|
| Replayed | E2024-131853 (TS), E2024-135332 (MH), E2023-084925 (OD), E2024-155286 (CG) |
| Not replayed | E2023-078506 and E2024-133629 (rejected by the forest rule in RESQ-3). Not to be substituted. |

All four are reported whatever they show. No incident is dropped or substituted after results are seen.

MCD64A1 scars: reported only where the RESQ-3/4 check verdict is "consistent". By that rule none of the four qualifies (E2024-131853 and E2024-155286 have no scar in the event window; E2024-135332 is "not consistent"; E2023-084925 is excluded because its pixels are dated before the first detection and its extent differs). Scars are therefore **not** used as a scoring reference. E2024-135332's partial scar is used only in the old-check demonstration in section 8, labelled partial.

## 2. Observation (the reference)

- Detections: the event's VIIRS cluster as fixed in RESQ-2/3 (type 0, 2 km / 3 day link rule), from `data/resq2/<id>/viirs_detections.csv`.
- Primary reference: **nominal and high confidence (n, h)** detections only. Secondary (reported, never the headline): all confidence classes.
- A detection occupies the cell of the absolute 375 m grid of the UTM zone (EPSG:32644, `ix = floor(x/375)`, `iy = floor(y/375)`, as in NextPass `common.py`). The observed footprint at time t is the union of those cells for detections with time <= t (cumulative).
- On the 30 m simulation grid a cell is observed if its centre lies in an observed 375 m cell.
- **Overpass** = one (satellite, calendar date, day/night) group with at least one n/h detection in the cluster; its time is the median detection time in that group, floored to the minute. Passes with no detection are not observable and are not listed. Overpasses used = those with 0 < hours after t0 <= 72.

## 3. Ignition

- Point: the **medoid of the first-overpass detections** of the cluster, i.e. the CSV `ign_lat, ign_lon` used since RESQ-2 (interpretation of "VIIRS cluster medoid"; not the medoid of all detections).
- Ignition time t0 = first detection time (any confidence) - 12 h, floored to the hour (UTC). For night first detections this is the previous afternoon; for day first detections it is the previous evening/night, and the rule is applied the same way.
- Ensemble: 30 ignition points uniformly distributed over a disc of radius 500 m around the medoid (`numpy.random.default_rng(seed)`, `r = 500 sqrt(u1)`, `theta = 2 pi u2`), seed per incident given in the table below, the same 30 points for all weather sources. The cell containing the jittered point is ignited. **No relocation**: if that cell is non-burnable the member has an empty footprint and stays in the ensemble.

## 4. Fuel (fixed rule, no per-incident choice, uncalibrated)

From ESA WorldCover 2021 v200 (the 10 m window already stored). For every 30 m cell, nine 10 m samples at offsets (-10, 0, +10) m east and north of the cell centre are taken by nearest pixel, and the majority class is the cell class (ties to the lower class number, as `numpy.bincount().argmax()` in the runner).

| WorldCover class | Cell2Fire code | Fuel |
|---|---|---|
| 10 tree cover | 182 | TL2 |
| 30 grassland | 101 | GR1 |
| 40 cropland | 93 | non-burnable |
| 50 built-up | 91 | non-burnable |
| 60 bare/sparse | 99 | non-burnable |
| 80 water | 98 | non-burnable |
| any other class (20 shrubland, 70, 90, 95, 100) | 99 | non-burnable (unmapped = non-burnable; deliberately not the runner's SH5 proxy) |

This crosswalk differs from `proxy_mapping.py` for classes 20, 90, 95 and 100 and is used only here. **The fuel is uncalibrated**: TL2 and GR1 are stock Spanish models chosen by land-cover class; there is no canopy, fuel load, moisture or Indian parameterisation (`INDIAN_RUNTIME = BLOCKED`).

## 5. Weather

- **Primary: native ERA5-Land** hourly u10/v10 at the ignition pixel (CDS, 0.1 degree, nearest cell; `weather_era5land_native_wind.csv`).
- **Sensitivity 1: ERA5 0.25 degree** wind (`weather_era5_wind_and_surface.csv`, Open-Meteo `era5`). **Sensitivity 2: `best_match`** (`weather_best_match_sensitivity_not_reanalysis.csv`; not a reanalysis).
- Weather row i (i = 0 .. rows-1) is the hour starting t0 + i h. Rows = ceil(hours from t0 to the last used overpass), at most 72. Nothing is smoothed, edited, interpolated or filled.
- Exactly what the runner and binary do: `Weather.csv` columns `Instance, datetime, WS, WD, FireScenario`; WS = speed in m/s x 3.6 (km/h), floored at 0.1 km/h; WD = meteorological "from" bearing in degrees, truncated to whole degrees by the reader and then rotated by 180 degrees; **temperature fixed at 27 C and relative humidity at 40 % for simulator S, whatever the weather files say**; precipitation and other columns unused; `--scenario 1`.

## 6. Terrain

Copernicus GLO-30 DSM window (stored), bilinear-sampled at each 30 m cell centre, written as integer metres exactly as the runner writes elevation; slope and aspect are computed from it with `numpy.gradient` as in the runner and written, **but the simulator uses only the elevation difference of neighbouring cells** through `slope_effect` above (the slope and aspect rasters are not used on the `S` path). At a slope ratio of 0.36 (20 degrees) the factor is 1.0084, i.e. less than 1 %; terrain therefore has almost no effect on the footprint. This is a stated limitation. The DSM includes canopy height.

## 7. Domain, duration, and runs

Square domain on the 30 m grid in EPSG:32644 containing every 375 m detection cell of the full cluster (all dates, all confidences) plus 3 km each side; side rounded up to whole 30 m cells, centred on the cluster bounding box. Duration from t0 to the last used overpass, at most 72 h. Simulator, binary and command line are the runner's: `Cell2Fire --sim S --ignitions --nsims 1 --grids --final-grid --Fire-Period-Length 1.0 --weather rows --nweathers 1 --output-messages --scenario 1 --seed 42` (no ROS override, no threshold change).

| Incident | State | Ignition (lat, lon) | First detection (UTC) | Ignition time t0 (UTC) | Domain (UTM 44N) | Cells | Cluster bbox km | Weather rows (h) | Jitter seed |
|---|---|---|---|---|---|---|---|---|---|
| E2024-131853 | TS | 19.20262, 78.60316 | 2024-02-16 20:11:00 | 2024-02-16 08:00:00 | 11.25 km square, west edge 240938 m E, north edge 2130375 m N | 375 x 375 = 140,625 | 4.88 x 5.25 | 72 | 5001 |
| E2024-135332 | MH | 19.95163, 78.71265 | 2024-03-05 07:53:00 | 2024-03-04 19:00:00 | 10.14 km square, west edge 256492 m E, north edge 2214758 m N | 338 x 338 = 114,244 | 4.12 x 4.12 | 50 | 5002 |
| E2023-084925 | OD | 19.32648, 83.93716 | 2023-03-10 19:51:00 | 2023-03-10 07:00:00 | 11.64 km square, west edge 800618 m E, north edge 2145945 m N | 388 x 388 = 150,544 | 5.62 x 3.75 | 62 | 5003 |
| E2024-155286 | CG | 19.12243, 80.89992 | 2024-04-12 19:46:00 | 2024-04-12 07:00:00 | 10.14 km square, west edge 483555 m E, north edge 2119508 m N | 338 x 338 = 114,244 | 3.0 x 4.12 | 62 | 5004 |

Ensemble: 30 ignition jitters x 3 weather sources = **90 runs per incident, 360 in total**, fixed seeds, no reruns.

Overpass times (fixed now):

**E2024-131853** (6 overpasses used of 16 with n/h detections in the cluster; the rest fall after t0 + 72 h or before t0):

| k | Overpass (satellite, day/night) | Time (UTC) | Hours after t0 | n/h detections |
|---|---|---|---|---|
| 0 | N 2024-02-16 N | 2024-02-16 20:11:00 | 12.18 | 2 |
| 1 | N20 2024-02-16 N | 2024-02-16 21:00:00 | 13.0 | 1 |
| 2 | N 2024-02-17 D | 2024-02-17 07:22:00 | 23.37 | 1 |
| 3 | N20 2024-02-17 D | 2024-02-17 08:12:00 | 24.2 | 1 |
| 4 | N20 2024-02-18 N | 2024-02-18 20:23:00 | 60.38 | 5 |
| 5 | N20 2024-02-19 D | 2024-02-19 07:34:00 | 71.57 | 4 |

**E2024-135332** (7 overpasses used of 17 with n/h detections in the cluster; the rest fall after t0 + 72 h or before t0):

| k | Overpass (satellite, day/night) | Time (UTC) | Hours after t0 | n/h detections |
|---|---|---|---|---|
| 0 | N20 2024-03-05 D | 2024-03-05 07:53:00 | 12.88 | 1 |
| 1 | N 2024-03-05 D | 2024-03-05 08:43:00 | 13.72 | 1 |
| 2 | N20 2024-03-05 N | 2024-03-05 20:23:00 | 25.38 | 2 |
| 3 | N20 2024-03-06 D | 2024-03-06 07:34:00 | 36.57 | 2 |
| 4 | N 2024-03-06 D | 2024-03-06 08:24:00 | 37.4 | 2 |
| 5 | N20 2024-03-06 N | 2024-03-06 20:04:00 | 49.07 | 1 |
| 6 | N 2024-03-06 N | 2024-03-06 20:54:00 | 49.9 | 1 |

**E2023-084925** (8 overpasses used of 15 with n/h detections in the cluster; the rest fall after t0 + 72 h or before t0):

| k | Overpass (satellite, day/night) | Time (UTC) | Hours after t0 | n/h detections |
|---|---|---|---|---|
| 0 | N20 2023-03-10 N | 2023-03-10 19:51:00 | 12.85 | 1 |
| 1 | N20 2023-03-11 D | 2023-03-11 07:02:00 | 24.03 | 4 |
| 2 | N 2023-03-11 D | 2023-03-11 07:54:00 | 24.9 | 7 |
| 3 | N20 2023-03-11 N | 2023-03-11 19:32:00 | 36.53 | 7 |
| 4 | N 2023-03-11 N | 2023-03-11 20:24:00 | 37.4 | 3 |
| 5 | N 2023-03-12 D | 2023-03-12 07:35:00 | 48.58 | 1 |
| 6 | N 2023-03-12 N | 2023-03-12 20:05:00 | 61.08 | 8 |
| 7 | N20 2023-03-12 N | 2023-03-12 20:54:00 | 61.9 | 1 |

**E2024-155286** (4 overpasses used of 9 with n/h detections in the cluster; the rest fall after t0 + 72 h or before t0):

| k | Overpass (satellite, day/night) | Time (UTC) | Hours after t0 | n/h detections |
|---|---|---|---|---|
| 0 | N20 2024-04-12 N | 2024-04-12 19:46:00 | 12.77 | 3 |
| 1 | N 2024-04-14 D | 2024-04-14 07:53:00 | 48.88 | 1 |
| 2 | N 2024-04-14 N | 2024-04-14 20:23:00 | 61.38 | 6 |
| 3 | N20 2024-04-14 N | 2024-04-14 20:48:00 | 61.8 | 4 |

## 8. Metrics

For each incident, each used overpass time t_k, and each weather source (primary ERA5-Land 30 members; sensitivity ERA5 0.25 degree 30 members; `best_match` 30 members; pooled 90 members as secondary):

- **Simulated state at t_k**: the frame (burned/not burned) after floor(hours since t0) hours; if the fire has ended earlier, the last frame. **Burn probability** p(cell) = fraction of members with the cell burned.
- **Probability metrics**: AUC (ROC) and AP (average precision) of p against cell membership in the observed cumulative footprint, over all cells of the domain (scikit-learn `roc_auc_score`, `average_precision_score`).
- **Footprint metrics at p >= 0.5** ("ensemble mean footprint"): IoU, precision, recall, area ratio = simulated cells / observed cells. If the footprint is empty: IoU 0, recall 0, area ratio 0, precision reported as n/a.
- **Secondary**: member-level IoU and area ratio (mean, median, quartiles over members); all-confidence reference; per-hour wind speed series and the number of hours with wind below 0.145 m/s (TL2 head ROS < 0.1 m/min, no spread); fraction of members whose burned cells touch the outer ring of the domain (edge clipping).
- **Headline comparison** (fixed): at the last used overpass, simulation (primary source) vs each baseline on (i) AP and (ii) IoU at p >= 0.5. "Beats" means strictly higher. The fraction of overpass times at which it is higher is also reported. No pass/fail threshold is defined.

**Baselines (no simulator, no fitting):**

- **(a) Proximity**: p(d) = exp(-d / 1000 m), d = distance from the **nominal** (un-jittered) ignition point to the cell centre. Footprint at 0.5 is the disc d <= 693 m. Same time-independent map at every overpass.
- **(b) Circle of the final observed area**: a disc centred on the nominal ignition point with area equal to the observed cumulative n/h footprint at the last used overpass (30 m cells x 900 m^2). Binary score (1 inside, 0 outside); same disc at every overpass. It uses the final area, which the simulation does not know; it is an information-advantaged baseline.

**Harness metric (NextPass-style, secondary).** `score_footprint.py` needs its cached domain (4,503 pair ids of other regions; none of these incidents) and scores the **newly detected cells at overpass k+1**, not the cumulative footprint, so it cannot be fed the primary metrics. It is used for the secondary metric by building the same domain rule as NextPass `domain.py` for each consecutive pair k to k+1 (C_k = n/h cells up to k; D = 375 m grid cells with 0 < distance to C_k <= r_max = 2,855.9 m, the `geo` fold value; y = detected at k+1 and not in C_k; no terrain-validity mask), setting its `load_domain` to return that D, and calling its `score()` with the cell score = mean burn probability of the 30 m cell centres inside each 375 m cell at t_(k+1). The primary metrics are implemented in this project's code (scikit-learn, same formulas as the harness).

**The earlier mistake (old check).** `validate_mcd64a1.py` compared sets of 500 m MODIS pixels, kept only observed pixels inside or within 2 pixels of the predicted set, and was applied on a domain 2.4 pixels wide, so the score depended on the domain, not the fire: a fully burned domain scored IoU 0.727 and a cross shape 0.750 against the simulation's 0.636 (`docs/sim_diagnosis/validator_sensitivity.json`, produced with the 500 m geometry). In this stage the same logic is applied (with the corrected 463.31 m georeferencing) to E2024-135332 using the median-area primary member's final footprint, a fully burned domain, and a one-cell-wide cross through the nominal ignition cell spanning the domain, and the new metrics are computed for the same three shapes. Whatever ordering results is reported; the old check is shown only to explain why baselines are required.

## 9. Outputs and reporting

Outputs are written only under `results/resq5/`: per-incident burn-probability rasters (`.npy`, one per source and overpass time, plus domain georeferencing), footprints, member summaries, metric tables (CSV/JSON) and `docs/RESQ5_RESULTS.md`. Run failures are reported with the exact error and the other incidents continue. No run is repeated to improve a score. All metrics, baselines, wind-source sensitivity, night-hour and edge-clipping checks are reported for all four incidents.

Expectation recorded before running (not a criterion): TL2 head rates are 0.2-1.0 m/min at these winds and zero below 0.145 m/s, so burned areas are expected to be small relative to the observed footprints; with ignition jitter of 500 m the cell probabilities will be low and the p >= 0.5 footprint may be empty; the proximity and circle baselines may match or beat the simulation.

## Amendments

**Amendment 1 (2026-10-11, before any replay run): raster windows.** Sections 4 and 6 say the WorldCover and DEM windows "already stored" are used. A coverage check showed that the RESQ-3/4 windows (cut for the earlier 9-12 km CSV domains) do not cover the protocol domain for E2024-135332 and E2024-155286 (corners missing by up to 0.0022 degrees, about 240 m). The windows were therefore re-read for all four incidents from the same sources by the same method (anonymous COG range reads: ESA WorldCover 2021 v200 and Copernicus GLO-30), covering the protocol domain plus 0.5 km (`scripts/resq5/fetch_windows.py`, stored in `data/resq5/<id>/`). Nothing else changes: no rule, class mapping, domain, weather or metric is altered.
