# RESQ-3: pixel-size fix and inputs for four demo incidents

Branch `resq3/pixel-fix-and-inputs` (off `resq2/incident-investigation`). 2026-10-11. No simulator run, no model scored, nothing pushed. `backend/.env` was neither read nor printed.

## 1. Pixel bug (RESQ-2 item 0)

- **Cause (re-verified):** `validate_mcd64a1.py` placed MCD64A1 pixels with `(col + 0.5) * 500.0` (lines 38, 39) and `/ 500.0` (line 62). The HDF `StructMetadata.0` of `MCD64A1.A2024061.h26v06...hdf` gives UpperLeftPointMtrs x 8,895,604.157, LowerRightMtrs x 10,007,554.677, XDim 2400: pixel 463.3127 m. The demo origin 21.867894 N, 86.500688 E is exactly pixel (1808, 61) at 500 m.
- **Fix:** new `backend/inference/mcd64a1_geo.py` reads the tile grid from the file's own `StructMetadata` (tile name only as fallback) and provides `lonlat(rows, cols)` and `rowcol(lon, lat)`. `validate_mcd64a1.py` uses it for observed pixels and for mapping the simulation onto the tile; the `_tile_origin` helper and every 500 m constant are gone. `run_demo_simulation.py` and the API never used 500 m (the coordinates were the inherited error), so nothing changes there except wording. A search for `500` in `backend/` and `frontend/src/` finds no remaining pixel-size use.
- **Test:** `backend/tests/test_mcd64a1_geo.py` (6 tests). It places the ten DOY-91 pixels (rows 1807-1809, cols 59-65 of h26v06) at their true centroid 22.463 N, 86.849 E (tolerance 0.002 deg), asserts the pixel size 463.31 m, a row/col round trip, that the tile-name fallback matches the metadata, and (when the staged HDF is present) that `_mcd_pixels` returns >= 10 pixels at 22.46 N, 86.85 E. All backend tests: 15 pass (`backend/.venv/bin/python -m unittest discover -s backend/tests`); frontend unit tests 5 pass; `tsc -b` clean.
- **Effect on the demo:** `validate_mcd64a1.py --month 2024-03` now reports no observed burned pixels in the demo extent (it previously reported an IoU of 0.636 against pixels that are 75 km away).
- **Relabelled (the old demo is a synthetic uncalibrated example):** `SpreadPage.tsx` (intro text; the "Observed comparison" block and its API call are removed and replaced by a "No observed comparison" note), `MapPage.tsx` (button, notices), `docs/05_prototype_gap_analysis.md` (lines 5, 46, 48, 75, 79, 220, 224 corrected), the runner's manifest disclaimer and the tracked `manifest.json`. `docs/sim_diagnosis/REPORT.md` is untracked evidence and was not edited; its 500 m statements (250 ha, "2.4 pixels") are superseded by `docs/RESQ2_INCIDENTS.md` section 2.

## 2. Sources, credentials, and what stopped

No credential was used or read. Every source below was anonymous.

| Input | Source | Resolution | Notes |
|---|---|---|---|
| MCD64A1 tile files | Microsoft Planetary Computer blob copy (`modiseuwest/modis-061`), original HDF, anonymous container token from its public SAS API | 463.31 m, monthly | h25v07 serves all four incidents. All 4 distinct files (Feb and Mar 2023, Feb and Mar 2024; 7.79 MB) have the **same name and byte size as the LAADS listing** (`results/resq2_mcd64a1_download_sizes.json`). The LAADS archive itself needs an Earthdata login (it redirects to `urs.earthdata.nasa.gov`); that route was **not** used. |
| WorldCover 2021 v200 | AWS `esa-worldcover` COG, windowed range reads via GDAL `/vsicurl/` | 10 m | one window per incident (73-137 KB). No whole tile downloaded. |
| Copernicus GLO-30 DSM | AWS `copernicus-dem-30m` COG, windowed reads | 1 arc-second, 29 x 31 m | surface model (canopy included), not terrain |
| VIIRS detections | local staged FIRMS files (no network) | 375 m | box = domain + 3 km, first date -3 d to last date +3 d, all types and confidences kept |
| Hourly weather | Open-Meteo archive API, no key | ERA5-Land 0.1 deg for T/RH; ERA5 0.25 deg for wind | see below |

**Stopped / needs credentials:**
- **ERA5-Land 10 m wind (0.1 deg).** Open-Meteo's `era5_land` model returns nulls for every wind variable (checked; 48 of 48 values null in the probe). The native ERA5-Land wind is available only from the Copernicus CDS (`reanalysis-era5-land`, variables `10m_u_component_of_wind`, `10m_v_component_of_wind`, 2023-03-02..03-06, 2024-02-25..02-29, 2024-02-15..02-19 and 2024-03-04..03-08, one point each (the first two only if the rejected incidents are kept)). That needs a CDS account key (`~/.cdsapirc` or `CDSAPI_URL`/`CDSAPI_KEY`); a key is not available to me under the rules of this stage, so this item stopped. Wind is therefore ERA5 at 0.25 deg (about 28 km), 6.6-14.3 km from the ignition pixels.
- Nothing else needed a key. FIRMS (for NOAA-21) and Earthdata downloads were not required.

**Weather details (all four).** Request `latitude/longitude` = the CSV ignition pixel; `timezone=GMT`, `wind_speed_unit=ms`; hourly from 00:00 UTC of the day before the first-detection date to 23:00 UTC three days after (120 values); no nulls, hourly step verified, nothing interpolated or filled. Values are instantaneous hourly reanalysis. The API snaps to the grid cell and returns its coordinates (stored in each `weather_*.json` together with the request URL, units, and elevation). Relative humidity is returned by Open-Meteo; that it is derived from ERA5-Land dew point and temperature is not verified here. Coverage ends 23:00 UTC of D+3; these events last 4-7.5 days, so the later part of each event has no forcing in the files.

**Wind is weak and uncertain:** ERA5 gives first-detection+48 h mean wind of 1.2-2.7 m/s; the non-reanalysis `best_match` series differs (for example E2023-078506 mean 1.77 m/s, max 5.15 against ERA5 1.16 / 2.08, and a different direction at the same hour). A 0.25 deg value cannot represent ridge-valley flow; the forcing is a coarse regional wind, not the wind on the fire.

## 3. Results at a glance

| Incident | State | Domain | Ignition pixel class | Domain forest | VIIRS cluster (n, n/h, overpasses) | MCD64A1 scar | Status |
|---|---|---|---|---|---|---|---|
| E2023-078506 | OD | 8 km | **30 grassland** | 74.2 % | 47, 45, 14 | 10 px, 2.15 km², consistent | **rejected** |
| E2024-133629 | TS | 12 km | **40 cropland** | 60.2 % | 102, 87, 15 | 50 px, 10.7 km², not consistent | **rejected** |
| E2024-131853 | TS | 11 km | 10 tree cover | 57.6 % | 51, 43, 18 | none in the event window | kept; no scar |
| E2024-135332 | MH | 9 km | 10 tree cover | 50.3 % | 62, 52, 19 | 12 px, 2.58 km², partial | kept |

Note on domain size: the brief gave 9-12 km; the committed CSV has 8 km for E2023-078506 and the CSV value was used.

### Rejections and proposed replacements

The forest rule was applied literally to the 10 m pixel containing the ignition coordinate. It was not applied after, or because of, any simulation.

- **E2023-078506 (OD):** pixel class 30; 94 % of the 190 m disc is grassland, but 79 % of the 1 km disc and 74 % of the domain is tree cover and the nearest tree pixel is 149 m away: a forest-edge ignition. It is a borderline reject under the rule; the pixel rule decides.
- **E2024-133629 (TS):** pixel class 40; 99.5 % of the 190 m disc is cropland and only 26 % of the 1 km disc is forest: a clear reject (agricultural burn at a forest edge).

Next candidates from the committed ranking (`results/resq2_incident_candidates.csv`), taken in `rank_all` order among eligible, not already proposed, demo-sized (domain <= 12 km) and >= 30 km from the other proposed incidents, **not** chosen by any fit:

| Order | Incident | State | First detection (UTC) | Extent | Domain | MCD64A1 tile | Note |
|---|---|---|---|---|---|---|---|
| 1 | E2023-084925 | OD | 2023-03-10 19:51 | 6.3 km | 11 km | h25v07 | rank 15 of 6,347 |
| 2 | E2023-076569 | OD | 2023-03-01 06:50 | 5.4 km | 10 km | h25v07 | rank 34 |
| reserve | E2023-078410 (JH), E2024-155286 (CG), E2023-098685 (TS) | | | | 12, 9, 11 km | | ranks 42, 47, 55 |

Their ignition-pixel class is not yet known; the same pixel rule must be applied to them before any run. The first two are both in Odisha and 2023; if a state/year spread is wanted, take E2024-155286 (CG, 2024) instead, as a rule-based decision made before looking at anything.

## 4. Per incident

### E2023-078506 (OD) - **rejected** (class 30 grassland at ignition pixel)

Ignition 19.61632 N, 83.94147 E; first detection 2023-03-03 19:34 UTC (01:04 IST), last 2023-03-07. Domain 8 km square centred on the footprint box (19.6103 N, 83.9422 E); windows are the domain plus 0.5 km: W 83.8992, S 19.5698, E 83.9851, N 19.6507. Total 4.93 MB.

| File (`data/resq2/E2023-078506/`) | Size |
|---|---|
| `copernicus_dem_glo30_window.tif` | 318 KB |
| `fetch_report.json` | 4 KB |
| `input_checks.json` | 5 KB |
| `mcd64a1_burned_pixels_domain_plus_3km.csv` | 1 KB |
| `viirs_detections.csv` | 10 KB |
| `weather_best_match_sensitivity_not_reanalysis.csv` | 4 KB |
| `weather_best_match_sensitivity_not_reanalysis.json` | 7 KB |
| `weather_era5_wind_and_surface.csv` | 5 KB |
| `weather_era5_wind_and_surface.json` | 8 KB |
| `weather_era5land_temperature_humidity.csv` | 4 KB |
| `weather_era5land_temperature_humidity.json` | 6 KB |
| `worldcover_2021_window.tif` | 73 KB |
| `mcd64a1/MCD64A1.A2023032.h25v07.061.2023102030746.hdf` | 2.33 MB |
| `mcd64a1/MCD64A1.A2023060.h25v07.061.2023132021740.hdf` | 2.16 MB |

**Forest check (WorldCover 2021 v200, 10 m).** Class at the ignition pixel: **30 (grassland)** -> **reject**. Domain classes: 10 tree cover 74.2%, 20 shrubland 0.1%, 30 grassland 21.1%, 40 cropland 4.4%, 50 built-up 0.1%, 60 bare/sparse 0.0%; forest (10, 95) 74.2 % of 790,508 pixels. Context (not the rule): within 190 m tree cover 2.5%, grassland 94.4%, bare/sparse 3.1%; within 1 km forest 78.9 %; nearest tree pixel 0.149 km. DEM (Copernicus GLO-30 DSM, 29.1 x 30.9 m): 290 to 1170 m, 1017 m at the ignition pixel.

**VIIRS.** 91 type-0 detections in the box (domain + 3 km, first date -3 d to last date +3 d); the 2 km / 3 d cluster rule recovers **47 detections (45 n/h), 14 overpasses**, equal to the committed CSV (47); first 2023-03-03 1934 UTC, last 2023-03-07; centroid [19.612, 83.9413]; extent 4.2 km.

**Scar vs VIIRS (MCD64A1, true 463.31 m georeferencing).** 10 burned pixels (2.15 km²) with burn dates 2023-03-02 to 2023-03-13 (median uncertainty 2 d); scar centroid [19.6025, 83.9554], VIIRS centroid [19.612, 83.9413], offset **1.82 km**; scar bbox 7.66 x 4.17 km (E-W x N-S) against VIIRS 3.59 x 3.85 km; 71.1 % of n/h detections within 1 km of a scar pixel centre, 70.0 % of scar pixels within 1 km of a detection; scar area / VIIRS hull area 0.2; first burn date minus first detection -1 d; rule verdict: **consistent**.

**Weather (point 19.6163 N, 83.9415 E).** 120 hourly values from 00:00 UTC of the day before the first-detection date to 23:00 UTC of three days after it; no nulls; hourly step verified. Temperature/RH from ERA5-Land cell [19.599998, 83.899994] (4.7 km from the ignition, 0.1 deg). Wind from ERA5 cell [19.5, 84.0] (14.3 km, 0.25 deg). First detection to +48 h: wind mean 1.16 m/s, max 2.08 m/s, minimum RH 24 %, maximum T 31.0 C. The non-reanalysis `best_match` series (kept as sensitivity only) gives wind mean 1.77 m/s, max 5.15 m/s, minimum RH 13 %.

### E2024-133629 (TS) - **rejected** (class 40 cropland at ignition pixel)

Ignition 17.85841 N, 80.31866 E; first detection 2024-02-26 07:52 UTC (13:22 IST), last 2024-03-04. Domain 12 km square centred on the footprint box (17.8533 N, 80.2996 E); windows are the domain plus 0.5 km: W 80.2383, S 17.7949, E 80.3609, N 17.9118. Total 4.14 MB.

| File (`data/resq2/E2024-133629/`) | Size |
|---|---|
| `copernicus_dem_glo30_window.tif` | 642 KB |
| `fetch_report.json` | 4 KB |
| `input_checks.json` | 5 KB |
| `mcd64a1_burned_pixels_domain_plus_3km.csv` | 7 KB |
| `viirs_detections.csv` | 29 KB |
| `weather_best_match_sensitivity_not_reanalysis.csv` | 4 KB |
| `weather_best_match_sensitivity_not_reanalysis.json` | 7 KB |
| `weather_era5_wind_and_surface.csv` | 5 KB |
| `weather_era5_wind_and_surface.json` | 8 KB |
| `weather_era5land_temperature_humidity.csv` | 4 KB |
| `weather_era5land_temperature_humidity.json` | 6 KB |
| `worldcover_2021_window.tif` | 120 KB |
| `mcd64a1/MCD64A1.A2024032.h25v07.061.2024100025301.hdf` | 1.86 MB |
| `mcd64a1/MCD64A1.A2024061.h25v07.061.2024134020338.hdf` | 1.44 MB |

**Forest check (WorldCover 2021 v200, 10 m).** Class at the ignition pixel: **40 (cropland)** -> **reject**. Domain classes: 10 tree cover 60.2%, 20 shrubland 0.1%, 30 grassland 12.3%, 40 cropland 27.0%, 50 built-up 0.1%, 60 bare/sparse 0.0%, 80 water 0.2%; forest (10, 95) 60.2 % of 1,759,905 pixels. Context (not the rule): within 190 m tree cover 0.4%, grassland 0.1%, cropland 99.5%; within 1 km forest 25.7 %; nearest tree pixel 0.14 km. DEM (Copernicus GLO-30 DSM, 29.4 x 30.9 m): 192 to 682 m, 354 m at the ignition pixel.

**VIIRS.** 254 type-0 detections in the box (domain + 3 km, first date -3 d to last date +3 d); the 2 km / 3 d cluster rule recovers **102 detections (87 n/h), 15 overpasses**, equal to the committed CSV (102); first 2024-02-26 0752 UTC, last 2024-03-04; centroid [17.8563, 80.2984]; extent 5.95 km.

**Scar vs VIIRS (MCD64A1, true 463.31 m georeferencing).** 50 burned pixels (10.73 km²) with burn dates 2024-02-27 to 2024-03-12 (median uncertainty 1 d); scar centroid [17.8592, 80.2756], VIIRS centroid [17.8563, 80.2984], offset **2.43 km**; scar bbox 13.05 x 14.83 km (E-W x N-S) against VIIRS 5.77 x 5.74 km; 86.2 % of n/h detections within 1 km of a scar pixel centre, 50.0 % of scar pixels within 1 km of a detection; scar area / VIIRS hull area 0.52; first burn date minus first detection 1 d; rule verdict: **not consistent (see numbers)**.

**Weather (point 17.8584 N, 80.3187 E).** 120 hourly values from 00:00 UTC of the day before the first-detection date to 23:00 UTC of three days after it; no nulls; hourly step verified. Temperature/RH from ERA5-Land cell [17.900002, 80.30002] (5.0 km from the ignition, 0.1 deg). Wind from ERA5 cell [17.75, 80.25] (14.1 km, 0.25 deg). First detection to +48 h: wind mean 2.68 m/s, max 3.77 m/s, minimum RH 31 %, maximum T 33.7 C. The non-reanalysis `best_match` series (kept as sensitivity only) gives wind mean 2.37 m/s, max 3.61 m/s, minimum RH 30 %.

### E2024-131853 (TS) - forest check passed; **no MCD64A1 scar** for the event

Ignition 19.20262 N, 78.60316 E; first detection 2024-02-16 20:11 UTC (01:41 IST), last 2024-02-24. Domain 11 km square centred on the footprint box (19.2005 N, 78.5909 E); windows are the domain plus 0.5 km: W 78.5338, S 19.1466, E 78.6479, N 19.2545. Total 4.03 MB.

| File (`data/resq2/E2024-131853/`) | Size |
|---|---|
| `copernicus_dem_glo30_window.tif` | 540 KB |
| `fetch_report.json` | 4 KB |
| `input_checks.json` | 4 KB |
| `mcd64a1_burned_pixels_domain_plus_3km.csv` | 1 KB |
| `viirs_detections.csv` | 9 KB |
| `weather_best_match_sensitivity_not_reanalysis.csv` | 4 KB |
| `weather_best_match_sensitivity_not_reanalysis.json` | 7 KB |
| `weather_era5_wind_and_surface.csv` | 5 KB |
| `weather_era5_wind_and_surface.json` | 8 KB |
| `weather_era5land_temperature_humidity.csv` | 4 KB |
| `weather_era5land_temperature_humidity.json` | 6 KB |
| `worldcover_2021_window.tif` | 137 KB |
| `mcd64a1/MCD64A1.A2024032.h25v07.061.2024100025301.hdf` | 1.86 MB |
| `mcd64a1/MCD64A1.A2024061.h25v07.061.2024134020338.hdf` | 1.44 MB |

**Forest check (WorldCover 2021 v200, 10 m).** Class at the ignition pixel: **10 (tree cover)** -> pass. Domain classes: 10 tree cover 57.6%, 20 shrubland 5.6%, 30 grassland 12.2%, 40 cropland 23.6%, 50 built-up 0.4%, 60 bare/sparse 0.2%, 80 water 0.4%; forest (10, 95) 57.6 % of 1,490,872 pixels. Context (not the rule): within 190 m tree cover 99.0%, shrubland 1.0%; within 1 km forest 97.2 %; nearest tree pixel 0.002 km. DEM (Copernicus GLO-30 DSM, 29.2 x 30.9 m): 216 to 473 m, 362 m at the ignition pixel.

**VIIRS.** 81 type-0 detections in the box (domain + 3 km, first date -3 d to last date +3 d); the 2 km / 3 d cluster rule recovers **51 detections (43 n/h), 18 overpasses**, equal to the committed CSV (51); first 2024-02-16 2011 UTC, last 2024-02-24; centroid [19.2004, 78.5915]; extent 5.91 km.

**Scar vs VIIRS (MCD64A1, true 463.31 m georeferencing).** no burned pixel in the event window (±8 days of first/last detection) within the domain + 3 km; 8 pixels exist with burn date 2024-03-05, 18 days after the first detection and 10 days after the last, about 7 km north-north-east of the cluster centroid.

**Weather (point 19.2026 N, 78.6032 E).** 120 hourly values from 00:00 UTC of the day before the first-detection date to 23:00 UTC of three days after it; no nulls; hourly step verified. Temperature/RH from ERA5-Land cell [19.200005, 78.600006] (0.4 km from the ignition, 0.1 deg). Wind from ERA5 cell [19.25, 78.5] (12.1 km, 0.25 deg). First detection to +48 h: wind mean 2.01 m/s, max 3.2 m/s, minimum RH 23 %, maximum T 34.6 C. The non-reanalysis `best_match` series (kept as sensitivity only) gives wind mean 1.49 m/s, max 3.89 m/s, minimum RH 21 %.

### E2024-135332 (MH) - forest check passed; MCD64A1 scar partial

Ignition 19.95163 N, 78.71265 E; first detection 2024-03-05 07:53 UTC (13:23 IST), last 2024-03-10. Domain 9 km square centred on the footprint box (19.9694 N, 78.7206 E); windows are the domain plus 0.5 km: W 78.6728, S 19.9245, E 78.7684, N 20.0144. Total 3.83 MB.

| File (`data/resq2/E2024-135332/`) | Size |
|---|---|
| `copernicus_dem_glo30_window.tif` | 374 KB |
| `fetch_report.json` | 5 KB |
| `input_checks.json` | 5 KB |
| `mcd64a1_burned_pixels_domain_plus_3km.csv` | 1 KB |
| `viirs_detections.csv` | 12 KB |
| `weather_best_match_sensitivity_not_reanalysis.csv` | 4 KB |
| `weather_best_match_sensitivity_not_reanalysis.json` | 7 KB |
| `weather_era5_wind_and_surface.csv` | 5 KB |
| `weather_era5_wind_and_surface.json` | 8 KB |
| `weather_era5land_temperature_humidity.csv` | 4 KB |
| `weather_era5land_temperature_humidity.json` | 6 KB |
| `worldcover_2021_window.tif` | 92 KB |
| `mcd64a1/MCD64A1.A2024032.h25v07.061.2024100025301.hdf` | 1.86 MB |
| `mcd64a1/MCD64A1.A2024061.h25v07.061.2024134020338.hdf` | 1.44 MB |

**Forest check (WorldCover 2021 v200, 10 m).** Class at the ignition pixel: **10 (tree cover)** -> pass. Domain classes: 10 tree cover 50.3%, 20 shrubland 4.6%, 30 grassland 13.8%, 40 cropland 31.0%, 50 built-up 0.2%, 60 bare/sparse 0.0%, 80 water 0.1%; forest (10, 95) 50.3 % of 1,003,043 pixels. Context (not the rule): within 190 m tree cover 99.9%, shrubland 0.1%; within 1 km forest 82.6 %; nearest tree pixel 0.002 km. DEM (Copernicus GLO-30 DSM, 29.1 x 30.9 m): 263 to 459 m, 387 m at the ignition pixel.

**VIIRS.** 101 type-0 detections in the box (domain + 3 km, first date -3 d to last date +3 d); the 2 km / 3 d cluster rule recovers **62 detections (52 n/h), 19 overpasses**, equal to the committed CSV (62); first 2024-03-05 0753 UTC, last 2024-03-10; centroid [19.9712, 78.7195]; extent 5.24 km.

**Scar vs VIIRS (MCD64A1, true 463.31 m georeferencing).** 12 burned pixels (2.58 km²) with burn dates 2024-03-08 to 2024-03-09 (median uncertainty 1 d); scar centroid [19.9632, 78.7241], VIIRS centroid [19.9712, 78.7195], offset **1.01 km**; scar bbox 1.88 x 2.32 km (E-W x N-S) against VIIRS 4.16 x 4.42 km; 57.7 % of n/h detections within 1 km of a scar pixel centre, 100.0 % of scar pixels within 1 km of a detection; scar area / VIIRS hull area 0.17; first burn date minus first detection 3 d; rule verdict: **not consistent (see numbers)**.

**Weather (point 19.9516 N, 78.7126 E).** 120 hourly values from 00:00 UTC of the day before the first-detection date to 23:00 UTC of three days after it; no nulls; hourly step verified. Temperature/RH from ERA5-Land cell [20.0, 78.70001] (5.5 km from the ignition, 0.1 deg). Wind from ERA5 cell [20.0, 78.75] (6.6 km, 0.25 deg). First detection to +48 h: wind mean 1.96 m/s, max 3.36 m/s, minimum RH 28 %, maximum T 36.6 C. The non-reanalysis `best_match` series (kept as sensitivity only) gives wind mean 2.47 m/s, max 4.7 m/s, minimum RH 22 %.

## 5. Could not verify

- **The ignition pixel is a medoid of VIIRS detections** with 375 m footprints and geolocation of a few hundred metres; the 10 m WorldCover class at one pixel is therefore noisy. The rule was applied as written; the 190 m and 1 km context is reported beside it. E2023-078506 would pass on neighbourhood share and fails on the pixel.
- **WorldCover 2021 accuracy** for these hills is not assessed; class 10 is "tree cover", not "dry deciduous forest".
- **ERA5-Land wind** is missing (CDS key needed); ERA5 wind at 0.25 deg stands in. Whether Open-Meteo's ERA5-Land RH is derived from dew point, and its elevation handling of temperature, were not verified.
- **Scar vs cluster**: MCD64A1 is a monthly 463 m product with a 1-2 day date uncertainty, here compared with sparse 12-hourly 375 m detections. The scar of E2024-135332 (12 pixels) covers 17 % of the VIIRS hull and was dated 3 days after the first detection; the cause (small low-intensity burn, missed burn, or a cluster larger than the burn) was not resolved. For E2024-131853 the only mapped burn is 18 days after the first detection, about 7 km away; I did not check the March 2024 file for a re-burn at the cluster itself.
- **Domain geometry:** the DEM and WorldCover windows are WGS84 rasters at ~29 x 31 m and ~9 x 9.3 m pixels (not square); no resampling to a 30 m grid was done in this stage.
- **A leftover probe file** `data/resq2/_probe/t.hdf` (an HTML sign-in page that the Earthdata redirect returned when I tested whether LAADS allows anonymous download) could not be removed: the sandbox blocked the deletion. It is not committed; delete it by hand.
- Run times, fuel crosswalk and everything about the simulator are as in `docs/RESQ2_INCIDENTS.md`; nothing was run.

## Reproduce

```
python3 scripts/resq3/fetch_inputs.py     # network: PC STAC/SAS, AWS COGs, Open-Meteo
python3 scripts/resq3/check_inputs.py     # writes data/resq2/<id>/input_checks.json
```
