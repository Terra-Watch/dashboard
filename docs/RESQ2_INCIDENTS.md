# RESQ-2: event-based test set, investigation

Stage RESQ-2, investigation only. Branch `resq2/incident-investigation` (off `fix/sim-overlay-and-pipeline`). No simulator or UI change, no download, no model scored. Written 2026-10-11.
Machine-readable: `results/resq2_incident_candidates.csv` (6,347 candidates, 15 proposed), `results/resq2_events_all.csv` (22,254 events), `results/resq2_similipal_offset.json`, `results/resq2_summary.json`, `results/resq2_mcd64a1_download_sizes.json`. Code: `scripts/resq2/`.

## 0. Answer

**Yes, a believable event-based set can be built from data already on this machine, and the incident list below is it.** Three findings change earlier work, in order of importance:

1. **The Similipal demo is in the wrong place.** `validate_mcd64a1.py` and the runner place MCD64A1 pixels with a 500 m step; the product's pixels are 463.31 m (tile width 1,111,950.52 m / 2400, read from the HDF `StructMetadata`). The 10 burned pixels of 2024-03-31 are at **22.463 N, 86.849 E, 75 km north-east of the demo point** (21.868 N, 86.501 E). VIIRS has 27 detections within 2 km of the true pixels (see section 2). The staged land cover and DEM (centred on the demo point) and the "March 2024 observed" claim in `SpreadPage.tsx` all refer to the wrong place. The burn is 2.15 km2 (215 ha), not 250 ha.
2. **The earlier IoU carried no information** (section 5), and the demo comparison was not even geographically meaningful.
3. **Weather is better than assumed, but not enough alone.** Local monthly GFS exports cover Jan-Jun and Nov-Dec of 2019-2024 (all of this programme's candidates except 0.7 %), at hourly resolution for valid hours 06-17 UTC only, spatially averaged over 5x5 pixels (section 4). Night hours must be filled from another source or by interpolation.

Items that I could not verify are in section 7.

## 1. Incident candidates

### Method (fixed before looking at any simulation)

- **Detections:** `~/wildfire-data/raw/_staging_firms`, VIIRS S-NPP (`N`) and NOAA-20 (`N20`) standard processing, regions `main` + `south`, 2022-2025 files so events crossing New Year are whole. 5-day files, no gaps and no overlaps 2019-2025 (checked per satellite and region). Duplicates on (lat, lon, date, time, satellite) removed. Only `type 0` (presumed vegetation fire) is used; type 2 (static source, 254,716 rows in 2023-2024) and type 3 (offshore, 4,748) are dropped. **Every confidence class is kept and counted**; the research filter (`configs/domain.yaml`: `confidence_keep: [n, h]`) would drop 267,495 of 1,187,875 type-0 detections (22.5 %), all `l`.
- **Area:** a detection counts if it lies within 7.1 km of a research-grid forest cell (the 17,764 cells of the model table, tree fraction >= 0.20) of OD, CG, TS, MP, MH or JH; the state is the nearest such cell's. **This is a forest-cell filter, not an administrative boundary**, and it removes areas the model table does not contain (for example Similipal's core: no model cell within 29 km, section 2).
- **Events:** space-time connected components, link if <= 2 km on the ground and the time scaled at 2 km per 3 days. Kept if >= 5 detections and first detection in 2023 or 2024: 22,254 events (OD 5,576, CG 4,109, MP 4,096, MH 3,853, TS 2,494, JH 2,126).
- **Per event:** first overpass (satellite + date + day/night), ignition pixel = medoid of first-overpass detections, detection and overpass counts, footprint extent (diameter of the convex hull of detections grown by half a pixel, local azimuthal-equidistant frame), previous detections within 5 km in the 3 days before ("quiet"), 5 km forest-cell flag, MCD64A1 tile and, where the tile is local, matched burned area.
- **Ignition time:** the first detection is an upper bound on the ignition time; 8 of the 15 proposed events were first seen at night (02:00 IST), so ignition was probably the previous afternoon.

### Ranking and proposal rules

- Candidate: >= 3 overpasses, >= 2 overpasses with >= 3 detections, extent 1-20 km, >= 8 detections (6,347).
- Score = 2.0 overpass richness (min(overpasses with >= 3 detections, 8)/8) + 1.5 ignition clarity (quiet 3 days; first-overpass spread <= 1 km) + 1.5 extent fit (1 for 3-12 km, 0.6 for 1-3 or 12-20) + 1.0 forest cell + 1.0 share of n/h detections + 0.5 local weather. No simulation output enters it.
- Proposed: forest cell, >= 3 overpasses with >= 3 detections, extent 3-20 km, duration <= 10 d, both satellites, local weather month, apparent growth from the ignition <= 5 km/day (this screen for multi-ignition complexes was **added after** the first pass; it removed 10 events and did not change the proposal), greedy by score, <= 3 per state, <= 8 per year, >= 30 km apart.
- Scores saturate (the 15 proposed lie between 7.34 and 7.48; the maximum is 7.5), so the order among them is a tie-break on detections and **should not be read as quality**. 2,546 events are eligible; the proposal is the first 15 under the caps.

### Proposed incidents

| # | id | state | ignition lat, lon | first detection (UTC / IST) | det (n+h / all) | overpasses (≥3 det) | extent km | duration d | forest 5 km cell | WorldCover at pixel | MCD64A1 tile | domain km (cells) | demo | paper-2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | E2023-081873 | OD | 19.1537, 84.1941 | 2023-03-05 20:36 / 02:06 | 103/105 | 20 (14) | 11.0 | 9.0 | yes | not local | h25v07 | 21 (700²) | — | yes |
| 2 | E2023-078506 | OD | 19.6163, 83.9415 | 2023-03-03 19:34 / 01:04 | 45/47 | 14 (8) | 4.2 | 4.0 | yes | not local | h25v07 | 8 (266²) | yes | yes |
| 3 | E2023-073104 | OD | 20.1916, 82.8242 | 2023-02-23 19:32 / 01:02 | 80/84 | 15 (10) | 10.6 | 6.0 | yes | not local | h25v06 | 17 (566²) | — | yes |
| 4 | E2023-076907 | JH | 23.9566, 86.3719 | 2023-03-01 19:18 / 00:48 | 49/52 | 13 (8) | 8.1 | 6.0 | yes | 10 tree | h25v06 | 14 (466²) | — | yes |
| 5 | E2024-179444 | CG | 21.9301, 82.9254 | 2024-12-12 07:15 / 12:45 | 45/48 | 12 (8) | 10.0 | 7.0 | yes | not local | h25v06 | 16 (533²) | — | yes |
| 6 | E2023-078467 | CG | 23.4034, 83.5717 | 2023-03-03 20:21 / 01:51 | 60/65 | 16 (9) | 10.4 | 6.0 | yes | not local | h25v06 | 21 (700²) | — | yes |
| 7 | E2023-100317 | CG | 23.0020, 83.7492 | 2023-04-11 19:51 / 01:21 | 48/52 | 17 (8) | 9.6 | 8.0 | yes | not local | h25v06 | 18 (600²) | — | yes |
| 8 | E2024-137188 | MP | 22.8252, 77.7226 | 2024-03-10 20:28 / 01:58 | 71/79 | 23 (12) | 9.3 | 6.0 | yes | not local | h25v06 | 16 (533²) | — | yes |
| 9 | E2023-078274 | JH | 22.4374, 85.3222 | 2023-03-03 07:53 / 13:23 | 83/94 | 26 (9) | 11.6 | 9.5 | yes | 10 tree | h25v06 | 23 (766²) | — | yes |
| 10 | E2023-072491 | JH | 22.2293, 85.9403 | 2023-02-22 07:21 / 12:51 | 44/50 | 18 (9) | 9.0 | 7.5 | yes | unreadable | h25v06 | 18 (600²) | — | yes |
| 11 | E2024-133629 | TS | 17.8584, 80.3187 | 2024-02-26 07:52 / 13:22 | 87/102 | 15 (12) | 6.0 | 7.0 | yes | not local | h25v07 | 12 (400²) | yes | yes |
| 12 | E2024-131853 | TS | 19.2026, 78.6032 | 2024-02-16 20:11 / 01:41 | 43/51 | 18 (8) | 5.9 | 7.5 | yes | not local | h25v07 | 11 (366²) | yes | yes |
| 13 | E2024-146565 | MP | 22.6798, 78.5640 | 2024-03-31 07:16 / 12:46 | 79/94 | 21 (12) | 9.7 | 5.5 | yes | not local | h25v06 | 19 (633²) | — | yes |
| 14 | E2024-162538 | MP | 22.4318, 80.1904 | 2024-04-25 08:14 / 13:44 | 42/50 | 13 (8) | 7.5 | 7.5 | yes | not local | h25v06 | 13 (433²) | — | yes |
| 15 | E2024-135332 | MH | 19.9516, 78.7126 | 2024-03-05 07:53 / 13:23 | 52/62 | 19 (8) | 5.2 | 5.5 | yes | not local | h25v07 | 9 (300²) | yes | yes |

Columns: det = detections (nominal+high / all confidences); overpasses = distinct satellite-day-night passes (passes with >= 3 detections); forest = ignition inside a research-grid forest cell (5 km); "not local" = the WorldCover tile is not on disk; domain = side of the square domain and cells per side at 30 m (section 3). Per-incident needs are in the `needs` column of the CSV.

State mix: OD 3, CG 3, JH 3, MP 3, TS 2, MH 1; 2023: 8, 2024: 7; Feb-Apr except one December. Candidates are overwhelmingly in the Feb-May season (22,254 events: Mar 2023 3,871, Apr 2024 4,378).

### Similipal reference (not proposed)

`E2024-146537` (true location, section 2): first detection 2024-03-30 07:35 UTC (13:05 IST); 15 detections (10 n/h), 5 overpasses (3 with >= 3), extent 5.2 km, 2 days; MCD64A1 matched 2.15 km2 = all 10 pixels. WorldCover at the ignition pixel is 40 (cropland), it is **not** in a forest cell, the state is **JH by nearest cell** (the West Bengal border is close; unverified), and it is not in Similipal. It ranks 5,585 of 6,347 and is not eligible. Keep it as a reference/negative control with the one MCD64A1 scar that is on disk, not as a forest-fire test. Three neighbouring clusters (E2024-146528, -146534, -147477) belong to the same complex.
The fire that is in the Similipal core on 2024-03-31 to 04-02 is small: two clusters of 6 and 15 detections, 3 overpasses each, 3-4 km, and MCD64A1 maps no burned pixel within 15 km of it in March-May 2024.

## 2. Why VIIRS shows nothing within 5.8 km of the "Similipal" MODIS cluster

**Cause: the MODIS pixels were placed with the wrong pixel size.** Nothing is wrong with the VIIRS side. Checked in `scripts/resq2/similipal_viirs_offset.py` (output `results/resq2_similipal_offset.json`):

| Check | Result |
|---|---|
| Pixel size | HDF `StructMetadata`: UL x 8,895,604.157, LR x 10,007,554.677 over `XDim=2400` gives **463.313 m**. `validate_mcd64a1.py:38-39` and `:62` use 500 m. The demo origin 21.867894 N, 86.500688 E is exactly the position that 500 m step gives for pixel (row 1808, col 61), so it was taken from that calculation. |
| Position error | Same row/column (1807-1809, 59-65): 21.867 N, 86.503 E with 500 m; **22.463 N, 86.849 E** with 463.3 m. Centroid shift 75.3 km. The 500 m step overstates the offset from the tile corner by 7.9 %, up to 88 km at the far edge. |
| VIIRS vs pixels | With 500 m positions: nearest detection 4.9-7.6 km per pixel, 0 within 2 km. With true positions: 0.1-0.93 km per pixel (median 0.53), **27 detections within 2 km** (18 nominal, 6 low, 3 high, all type 0). |
| Dates and times | First detection 2024-03-30 07:35 UTC (S-NPP); 31 March: 6 (07:16 S-NPP) + 10 (07:48 NOAA-20); 1 Apr 1; 3 Apr 4 + 4; 4 Apr 1. MCD64A1 burn date 91 = 2024-03-31, pixel uncertainty 1-2 days, QA 3. Consistent: a day-level offset of at most 1 day. |
| Projection | Sinusoidal, R = 6,371,007.181 m, tile origin from the HDF metadata: the repo's tile origin and radius are right; only the 500 m step is wrong. |
| Confidence filter | At the true location the research filter [n, h] keeps 21 of 27 detections and drops 6 low-confidence ones; it does not hide the event. At the demo point it makes no difference: there are no detections within 2 km at all. |
| Other filters | 0 detections of type 2 or 3 within 2 km. The staged files have no coverage gap (5-day files continuous). The "5.8 km, low confidence, 2024-04-01 07:27 UTC NOAA-20" detection is at 21.889 N, 86.449 E: a real fire in Similipal's core (the demo point is inside Similipal), 75.9 km from the MODIS cluster. |

So the 5.8 km was the distance from a fire in one place to a coordinate calculated for another. Fixing the pixel size in `validate_mcd64a1.py` and re-centering the demo is a code change and is out of scope here; it is the first item in `docs/sim_followups.md`.

## 3. Domain size and Cell2Fire run time

Square domain, 30 m cells, side = max(6, ceil(extent + 2 x margin)) km with margin = max(2 km, 0.5 x extent), centred on the footprint bounding box (not the ignition): the observed footprint is a lower bound of what burned after the last overpass, and the ignition is usually not central. The CSV also carries a tight side (`domain_tight_side_km` = extent + 4 km).

| | min | median | max |
|---|---|---|---|
| Proposed domain side | 8 km (266 x 266 = 70,756 cells) | 16 km (533²) | 23 km (766² = 586,756) |
| Tight domain | 8 km | 12 km | 16 km |

**Run time (estimate, not measured at scale):** the only measurement is the existing 40 x 40 (1,600 cells), 48 h run: the 49 `ForestGrid` files are written within 0.097 s (file times in `docs/sim_diagnosis/repro`). Cell2Fire cost is roughly linear in cells and hours, so about 0.1 s x (cells/1,600) x (hours/48): **4 s (70,756 cells) to 37 s (586,756 cells) per 48 h**, about 3 min worst case for a 9-day event. Output per run: one CSV frame per hour of about 2 bytes/cell, 11-16 MB per 48 h at 10-12 km. Input preparation (10 m land cover to 30 m majority, DEM) is a few seconds per incident with windowed reads. The weather horizon is the limit, not compute: events last 4-9 days and the model can only be compared up to the days with forcing.

## 4. Inputs inventory

| Input | Local | Needed per incident | Source and reachability | Size |
|---|---|---|---|---|
| VIIRS 375 m detections | **yes**, 2019-2025, S-NPP + NOAA-20, 622 MB in `~/wildfire-data/raw/_staging_firms` | none | FIRMS area API (reachable, needs MAP_KEY: a FIRMS key is named in `backend/.env`; not read) for NOAA-21, not staged | 0 |
| MCD64A1 burn scar | h26v06 only (24 months, 114 MB) | tiles h25v06, h25v07 (14 of 15 proposed), plus h24v06/h24v07/h26v07 for the whole candidate set | LAADS `ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MCD64A1` (reachable; listing returns sizes; file download needs an Earthdata token: a key is named in `backend/.env`, value not read). `e4ftl01.cr.usgs.gov` returned 404 from here. | **15 incidents: 11 files, 29.4 MB.** All candidate tiles x 24 months (excluding h26v06): 120 files, 254.6 MB |
| Land cover / fuel | one tile, `N21E084` (CG/JH/OD east), **damaged**: 285 of 1,296 internal blocks are zero-filled (same byte size as the remote file, 127,991,194; same result with two rasterio builds) | 9 WorldCover tiles for the 15 incidents (N15E078, N18E078, N18E081, N18E084, N21E075, N21E078, N21E081, N21E084, N24E084) | AWS `esa-worldcover` COG (reachable; HEAD 200, range GET 206) | **Whole tiles about 128 MB each, 1.15 GB: above the 500 MB limit; not downloaded.** Windowed range reads: well below 1 MB (23 km at 10 m is at most 9 blocks of about 0.1 MB) per incident |
| DEM | SRTM N21E086 only | 17 Copernicus GLO-30 tiles (1 degree) for the 15 domains | AWS `copernicus-dem-30m` COG (reachable; HEAD 200) | Whole tiles about 45 MB each, 0.77 GB (above 500 MB: not downloaded); windowed reads about 1-2 MB per incident |
| Weather (resolution below) | **yes**, `~/wildfire-results-backup/improve/in_season/exports_gfs00/gfs00_{2019..2024}_{01-06,11,12}.csv`, 48 files, 804 MB; 1,165 pixels (research forest pixels only) | 7 monthly files for the 15 incidents | local; the same product was exported from Earth Engine `NOAA/GFS0P25` (gcloud account; not run) | the 7 files: 122 MB (already local) |
| Hourly weather outside 06-17 UTC | no | 3-8 days per incident | Open-Meteo archive API (reachable, 200), CDS ERA5-Land (reachable; key named in `.env`, not read), NOAA GFS AWS (`noaa-gfs-bdp-pds`, reachable, hourly f000-f120, GRIB2) | Open-Meteo: tens of KB per incident; GFS GRIB2 byte-range: several MB per variable-hour |
| Fuel parameters | no | Indian fuel models | `wild-fire-simulation/fuel/evidence/indian_runtime_readiness.md`: `INDIAN_RUNTIME = BLOCKED` for every region/class | n/a |

### What weather resolution is truly there

The user note "GFS in the repo is 6-hourly day-ahead" is not what the files contain. Verified in `imagery/gfs_ee.py` and `gfs_ee_00.py` (wildfire-research) and in the CSV:

- **Run and lead:** the 00 UTC run of day D-1, valid hours 00-23 UTC of day D = forecast hours 24-47 (`creation_ms` of the first row is 2023-12-31 00:00 UTC for day 2024-01-01). It is a **day-ahead forecast, not an analysis**.
- **Hourly values only for 06-17 UTC** (`*_h06 ... *_h17`, 12 values = 11:30-22:30 IST), plus the daily min, max, mean and sum of all 24 hours. No hourly value exists for 18-05 UTC.
- **Spatial support:** each value is the **5 x 5 pixel mean of 0.25 degree pixels (about 1.25 degrees, 140 km)**, sampled at 0.25 degree pixel centres from a list of 1,165 pixels; the nearest pixel centre to the 15 proposed ignitions is 0.2-14.3 km away (median 10.2 km).
- **Scaling:** temperature, u, v, precipitation x 100; relative humidity x 10.

For a run beginning at the first overpass and lasting 48 h this means three daily rows (D, D+1, D+2), 36 hourly values, and 36 hours of gap, with the fire's night-time behaviour in the gaps. Interpolation to document and test before use: (i) T and RH: fit a diurnal cosine through the 12 hourly values anchored at the daily min/max and place the minimum/maximum at 23-24 UTC/08-09 UTC; (ii) wind: linear in (u, v) between `h17` of day D and `h06` of day D+1, limited to the daily min/max of u and v; (iii) precipitation: zero outside the observed hours unless the daily sum exceeds the 12-hour sum. Because a 5x5 average cannot represent valley wind, the recommended route for the validation set is hourly point data (Open-Meteo or ERA5-Land) with the GFS slice kept as the sensitivity case. The runner's simulator `S` reads only wind speed and direction (report section 3), so humidity and temperature are not used unless the model changes.

## 5. Validation design (documented only)

**What the earlier IoU got wrong** (`validate_mcd64a1.py`, `docs/sim_diagnosis/validator_sensitivity.json`):

- It compared a footprint in one place with pixels at another: both were put on a grid with the same wrong 500 m step, so row/column overlap looked self-consistent while the real burned pixels were 75 km away.
- The domain (2.4 MODIS pixels across) sets the score: a fully burned square scored 0.727, a cross-shaped footprint 0.750, the simulation 0.636. The simulated shape did not matter.
- Observed pixels were kept only if they were in the predicted set or within 2 pixels of it (`validate_mcd64a1.py:105`): the observed set was clipped to the prediction.
- One monthly 500 m product (no hours, no perimeter), forced with weather of the wrong month and place, no baseline, one event.

**Design for the incident set**

1. **Reference data per incident:** (a) successive VIIRS overpass footprints C_1, C_2, ... (each satellite pass) from the incident table; (b) the MCD64A1 scar: pixels in the tile-month files with burn date within the first/last detection +- 8 days (the product's date uncertainty is 1-2 days in the Similipal case), at true 463.31 m geometry; both from data selected before any simulation.
2. **Simulation:** start from C_1 (the first-overpass pixels) at its overpass time, force with event-date hourly weather at the ignition pixel, run to the last overpass +24 h; take the burned set at each overpass time t_k.
3. **Per-overpass hit rate:** of the n/h detections newly seen at overpass k+1 that are not in C_k, the fraction inside the simulated set at t_(k+1), with a one-VIIRS-pixel tolerance (0.375 km). Report with the number of cells in the evaluation domain D (cells within r_max of C_k; r_max about 2.7-3.0 km in the NextPass folds), so a large predicted footprint cannot win alone.
4. **IoU against the final scar:** rasterise the simulated final burned set onto the 463 m MCD64A1 grid with a >= 50 % area-fraction rule and compare with the scar; also report precision, recall and the **area ratio** (simulated area / scar area) because an IoU of 0.6 is possible with the area wrong by a factor of 2. Add a band for burn-date uncertainty and a +-1 pixel shift.
5. **Proximity baseline:** score each cell in D by minus its distance to C_k (no model); report the same metrics. The simulation has to beat this to add value. A uniform "burn everything in D" and a "round blob grown at the median rate" baseline are cheap additions.
6. **Scoring script:** `/Users/kireeti/Desktop/Projects/NextPass/nextpass/scripts/score_footprint.py` (read, not run). Input CSV: `pair_id, ix, iy` and optionally `score` on the **375 m grid with ix = floor(x/375), iy = floor(y/375) in the region's UTM zone** (EPSG:32643/32644/32645). With a score column it returns AUC, AP, top-10 % capture and recall at 2n; without it the rows are the predicted burned set and it returns precision, recall, F1, IoU on D. Target y = cell newly detected (high/nominal) at overpass k+1 and not in C_k (label level A, FIRMS points; unobserved cells cannot be removed). **Limit:** D comes from `nextpass/cache/labels/domain_superset.parquet` (4,503 pair_ids of three regions: similipal_tr, melghat_tr, nallamala_combined_tr) and `results/r_max_per_fold.csv`; pair_ids that are not in it are dropped. The RESQ incidents are not in that cache, so their D rows must be built with NextPass's own pipeline (`s1_pairs.py`, `s2_labels.py`, `domain.py`) or re-implemented to the same rule, before the script can score them.
7. **Selection independence:** the 15 are fixed by the rule above, not by fit. Report all 15 including failures, and keep the sealed 2025-2026 files out.

## 6. What each is usable for

| Use | Incidents | What it needs before it can run |
|---|---|---|
| **(a) Believable demo replay** | E2023-078506 (OD, 8 km domain), E2024-135332 (MH, 9 km), E2024-131853 (TS, 11 km), E2024-133629 (TS, 12 km); runs of 4-10 s per 48 h; 4.2-6.0 km extents, 8-12 overpasses with >= 3 detections | Windowed WorldCover and Copernicus DEM for the domain (a few MB), hourly weather for the night gap, the local gfs00 monthly file, 11-29 MB MCD64A1 if the scar is shown; a fuel crosswalk that is still unvalidated, so the replay must be labelled uncalibrated; and the overlay must use the true pixel size. |
| **(b) Paper-2 validation set** | all 15 above; add the next eligible events to reach the planned 10+ per season if some fail the data check | MCD64A1 tiles (11 files, 29.4 MB for these 15; 254.6 MB for every candidate tile-month), windowed land cover and DEM for 9 + 17 tiles, hourly weather for 7 months, domain rows for the scorer, the proximity baseline, and a decision on Indian fuel parameters (BLOCKED today). The demo and the validation set must use different incidents if the demo is tuned. |
| Not usable | E2024-146537 (Similipal reference) | Not forest at the ignition pixel (WorldCover 40, no forest cell), only 5 overpasses; keep as a negative control and as the MCD64A1 location test. |

## 7. Could not verify

- **State labels** are nearest research-grid forest cell, not an administrative layer. No boundary file is on disk. Events near state borders (and the Similipal reference, JH vs West Bengal) need a boundary check.
- **Forest at the ignition pixel**: known for 3 of 15 (tile N21E084; 1 of them unreadable). The rest rely on the 5 km tree-fraction flag. Windowed WorldCover reads (a few MB total) would settle it; not done because the brief said no downloads.
- **Damaged tile**: the zero-filled blocks may come from an interrupted copy; I did not re-download (128 MB) to confirm.
- **Event clustering** (2 km, 3 days) can merge separate ignitions and split one fire (the Similipal complex split into four). The 5 km/day growth screen removed 10 candidates only. Multi-ignition cannot be ruled out without the footprint maps.
- **Burn scars** exist locally for h26v06 only; the proposed events' scars are unseen. The scar-area of an event comes from VIIRS (hull area) until the tiles are fetched.
- **Run times** are linear extrapolations from one 1,600-cell run; Cell2Fire was not run on a large grid.
- **GFS valid-time convention** is read from the export code, not re-verified against the Earth Engine collection; the u/v sign convention was not re-checked here.
- **LAADS listing** gives file sizes; no granule was downloaded or opened, and the Earthdata/FIRMS/CDS keys named in `backend/.env` were not read or tested.
- **NextPass pairs for RESQ incidents:** I did not check whether any proposed incident coincides with an existing NextPass cluster (similipal_tr, melghat_tr, nallamala_combined_tr, indravati_tr), which would give ready-made domain rows.
- **Cell2Fire fuel model**: the WorldCover to fuel crosswalk is unvalidated and Indian runtime is BLOCKED in the fuel evidence; this does not change which incidents are usable, but it limits what the replay can claim.

## Reproduce

```
python3 scripts/resq2/build_incident_candidates.py   # about 80 s -> results/resq2_events_all.csv
python3 scripts/resq2/rank_incidents.py              # -> results/resq2_incident_candidates.csv
python3 scripts/resq2/similipal_viirs_offset.py      # -> results/resq2_similipal_offset.json
python3 scripts/resq2/mcd_download_sizes.py          # LAADS listings only
```
Use the system `python3` (numpy, pandas, scipy, pyproj, pyhdf, rasterio).
