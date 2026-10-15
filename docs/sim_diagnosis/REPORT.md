# RESQ spread simulation: why it does not look right

Read-only diagnosis, 2026-10-11. Working tree `/Users/kireeti/Desktop/Projects/RESQ/website` (branch HEAD `acc86de`). Everything written is inside this untracked folder `docs/sim_diagnosis/`; `git status` shows only `?? docs/sim_diagnosis/`. No app source, config, data or document was changed. Paths below are relative to the website root unless they start with `/`.

**Stop conditions.** The runner runs locally (section 8), no synthetic test needed a repository file to change, and no credentials are in tracked files. One note on credentials: `backend/.env` exists in the working tree (untracked, listed in `.gitignore:5`, never in any commit: `git log --all -- backend/.env` is empty, and `git grep` for secret-like assignments in the 144 tracked files finds none). It holds named keys for CDS, Google credentials, FIRMS, Earthdata and Hugging Face; values were not printed. I read the stop rule as covering committed credentials and continued; if you meant any credential file in the folder, the report ends here for that reason and you can disregard sections 2 to 9.

## Summary

The Cell2Fire binary does what it is told: the output is deterministic, monotonic, in the right compass direction for the wind it receives, and reproduces bit for bit (section 8). The picture looks wrong because of what it is given and how it is shown:

1. The domain is 1.2 km x 1.2 km (144 ha, 2.4 MODIS pixels across). The fire reaches the domain edge at hour 12 and fills 89 % of it by hour 48, so the footprint is a blob clipped by a square. The observed burn is 250 ha spread over 3.5 km.
2. The weather is not the event's weather: first row of a January 2024 file (pixel in Maharashtra, about 1,400 km away), date 2024-01-01 against an observed burn on 2024-03-31, one 12-hour daytime profile repeated four times.
3. The fuel grid is one fuel: 1,598 of 1,600 cells are TL2 (a proxy chosen by land-cover class), and the model's spread rate depends only on wind speed and fuel.
4. The map layer is stretched 1.21 x 1.29 against the real grid and is about 10 pixels wide at the map's initial zoom.
5. The MCD64A1 "IoU" cannot tell a good footprint from a bad one: a fully burned square scores 0.73, higher than the simulation's 0.64.

## Step 1: Where things are

| Item | Path | Modified |
|---|---|---|
| Spread runner | `backend/inference/run_demo_simulation.py` | 2026-10-09 17:48 |
| Fuel crosswalk | `backend/inference/proxy_mapping.py:3-15` | 2026-10-09 17:06 |
| Input preparation (land cover, DEM, slope, aspect) | `backend/inference/prepare_demo_inputs.py` | 2026-10-09 17:48 |
| Scenario written for Cell2Fire | `backend/runtime_data/simulation_demo/scenario/` (`fuels.asc`, `elevation.asc`, `slope.asc`, `saz.asc`, `Weather.csv`, `Ignitions.csv`, `Data.csv`, `spain_lookup_table.csv`) | 17:48 |
| Land cover | `.../landcover/worldcover_similipal_demo.tif` (240 x 360 px) | 17:48 |
| DEM, slope, aspect | `.../terrain/{elevation,slope,aspect}_similipal_demo.tif` (72 x 108 px) | 17:48 |
| Weather source | `.../weather/gfs00_2024_01.csv` (36,115 rows, 1,165 pixels, days 19723 to 19753 = 2024-01-01 to 2024-01-31) | 17:01 |
| Ignition | `scenario/Ignitions.csv` (`Year,Ncell` = `1,821`), constants `run_demo_simulation.py:27-31` | 17:48 |
| Cell2Fire frames | `.../run/Grids/Grids1/ForestGrid0..48.csv` | 17:48 |
| Frame to PNG | `run_demo_simulation.py:119-135` -> `frontend/public/simulation/similipal-demo/frame-00..48.png` + `manifest.json` | 17:48 |
| Frame to map | `frontend/src/components/SimulationCanvas.tsx` (23 lines) | 17:48 |
| Page and API | `frontend/src/features/operations/SpreadPage.tsx`, `backend/app/routers/operations.py:133-149`, `backend/app/services/simulation_service.py` | 17:48, 17:34 |
| MCD64A1 comparison command | `backend/inference/validate_mcd64a1.py` (`--month YYYY-MM`) | 17:49 |
| MCD64A1 tiles | `backend/runtime_data/mcd64a1/<yyyy-mm>/MCD64A1.A….h26v06.061….hdf` (24 months, 2023-01 to 2024-12) | 17:31 to 17:49 |
| Binary and source | `/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire` (Mach-O arm64, built 2026-09-24 23:53), sources in the same folder | 2026-09-24 |
| Second exporter | `backend/inference/export_simulation_demo.py` (writes a 4-frame "benchmark" with another location into the same public folder) | 16:48 |

## Step 2: Domain and grid

| Quantity | Value | Evidence |
|---|---|---|
| Grid | 40 x 40 cells of 30 m | `run_demo_simulation.py:27-28` |
| Physical size | 1,200 m x 1,200 m = 144 ha | computed |
| MODIS 500 m pixels across | 2.4 | 1,200 / 500 |
| Observed event | MCD64A1 2024-03, Burn Date 91 (2024-03-31), 10 connected pixels = 250 ha, extent 3 pixel rows x 7 pixel columns (about 1.5 km x 3.5 km) | `images/mcd64a1_vs_domain.png`; read from `MCD64A1.A2024061.h26v06.061.2024134021235.hdf` |
| Contains the whole burn? | **No.** The domain is smaller than the burn by area (144 against 250 ha) and by extent; the burn extends 1.7 to 2.2 km east of the ignition pixel centre, the domain 0.6 km. | same image |
| Simulated fire at the edge | **Yes, from hour 12**: edge cells burned 0 at h11, 9 at h12, 99 at h48 of 156 edge cells; 1,424 of 1,600 cells (89 %, 128 ha) at h48 | `analysis_metrics.json`, `images/burned_area_and_extent.png`; `run/Grids/Grids1/ForestGrid*.csv` |
| The April file | MCD64A1 2024-04 has 2 pixels within 1 km and 24 within 25 km with DOY 92 to 110, so the event continues across the month boundary | `mcd.py` output (scratch), `validate_mcd64a1.py --month 2024-04` |

Geographic registration of the inputs (`scripts/verify_grid.py`, `grid_verification.json`): both rasters are EPSG:4326; the 3 x 3 majority of the 10 m land cover covers 1,033 m (E-W) x 1,106 m (N-S), the DEM window 1,148 m x 1,229 m, against the nominal 1,200 m. So fuel and elevation are 11 % different in size and are offset by up to about 60 m (2 cells) at the edges; the pixels are also not square on the ground (land cover 8.6 x 9.2 m, DEM 28.7 x 30.7 m) and the code treats them as 10 m and 30 m (`run_demo_simulation.py:54-62`). Row 0 is north in both rasters and in the ASC files, so there is no vertical flip. The staged `fuels.asc` and `elevation.asc` reproduce from the rasters exactly.

## Step 3: Weather

| Check | Finding | Evidence |
|---|---|---|
| File and range | `gfs00_2024_01.csv`, 31 days, hourly columns `h06..h17`. The preparation script calls it "GCS GFS 00Z January 2024" (`prepare_demo_inputs.py:71`); the CSV does not state the time zone or valid-time convention of the 12 columns, and the runner labels them 06:00 to 17:00 | header of the CSV; `run_demo_simulation.py:94-98` |
| Which row | **`rows[0]` only**: pixel 10110281, day 19723 (2024-01-01) | `run_demo_simulation.py:97` |
| Where is that pixel | 19 grid cells, all in Maharashtra, mean 19.7 N 72.8 E (about 1,400 km from Similipal), by `imagery/gfs_cell_pixel.csv` and `/Users/kireeti/wildfire-data/processed/grid.csv`. The pixel of the research grid's cell nearest to the origin (23 km away) is 10670273. | `scripts/weather_pixel_check.py`, `weather_pixel_check.json` |
| Extension | 12 hourly values repeated `index % 12` over 48 rows, so one 12-hour profile is repeated 4 times, whatever hours of the day it represents; datetime strings all say `2024-01-01` | `run_demo_simulation.py:109-113`; `scenario/Weather.csv` |
| Variables given to Cell2Fire | only `WS` and `WD` (columns 2 and 3). For simulator `S` the reader sets temperature 27 and humidity 40 constants and ignores every other column | `ReadCSV.cpp:526`, `:543-547`; temperature and humidity are never read from the file |
| Wind speed unit | km/h in Cell2Fire (the length-to-breadth term converts with `1000/3600`); the runner converts m/s x 3.6 | `FuelModelSpain.cpp:2274-2283`; `run_demo_simulation.py:103`. GFS values are stored x100 (`u10_h06 = -27`, `v10_h06 = -254`); the CSV does not record the scale. /100 gives a median wind of 1.8 m/s, p99 4.9 m/s: plausible. Not verified against the export code. |
| Direction convention | Input WD is where the wind comes FROM; the reader adds 180 and converts to a mathematical angle. The runner writes the meteorological "from". Verified by synthetic test (b): wind from the west spreads east. | `ReadCSV.cpp:543-544`; `Cells.cpp:680-693`; `run_demo_simulation.py:104`; `synthetic_results.json` |
| Precision | `std::stoi` truncates the direction to whole degrees (6.068 -> 6) | `ReadCSV.cpp:543` |
| Height | the 10 m GFS wind is used as the driver of the spread rate; no midflame adjustment | `run_demo_simulation.py:101-103` |
| Date mismatch | forcing 2024-01-01 against an observed burn on 2024-03-31 (90 days); the file contains no March day. The UI text says so (`SpreadPage.tsx:14`), the number it reports is still displayed. | `docs/05_prototype_gap_analysis.md:48` |

Wind in the file for the runner's pixel (km/h, from-degrees, h06 to h17): 9.2/6, 10.6/346, 11.7/335, 13.0/330, 13.9/325, 14.5/324, 14.3/327, 12.5/335, 11.4/344, 10.3/352, 9.5/358, 9.5/360. For the nearest-cell pixel on the same day: 7.3/36, 6.3/35, 5.4/39, 4.8/42, 4.1/54, 4.5/91, 5.2/104, 4.7/112, 3.8/124, 2.9/156, 3.1/196, 4.5/223. The two disagree in speed (about 2x) and in direction (from NNW against from NE rotating to SW), so the simulated drift to the south is an artifact of the pixel choice.

## Step 4: Fuels

Crosswalk (`backend/inference/proxy_mapping.py:3-15`; default for any other class: 99 = NB9, `run_demo_simulation.py:61`):

| WorldCover class | Cell2Fire code | Flag |
|---|---|---|
| 10 tree cover | 182 TL2 (broadleaf litter) | one fuel for all forest; Similipal dry deciduous Sal is not distinguished from any other tree class; "UNVALIDATED_DEVELOPMENT_PROXY" (`:17`) |
| 20 shrubland | 145 SH5 | proxy |
| 30 grassland | 101 GR1 | proxy |
| 40 cropland | 93 NB3 non-burnable | arbitrary: cropland and agricultural residue do burn in this region |
| 50 built-up | 91 NB1 | ok as non-burnable |
| 60 bare/sparse | 99 NB9 | ok |
| 70 snow/ice | 92 NB2 | ok |
| 80 water | 98 NB8 | ok |
| 90 herbaceous wetland | 99 NB9 | arbitrary |
| 95 mangroves | 182 TL2 | arbitrary |
| 100 moss/lichen | 101 GR1 | arbitrary |
| 0 (outside raster, `fill_value=0`) | 99 NB9 via `.get(..., 99)` | not used here (0 boundless cells), but would silently become a barrier |

In the window only classes 10 and 30 occur; the fuel grid is 1,598 x 182 and 2 x 101 (`analysis_metrics.json`, `scenario/fuels.asc`). Non-burnable codes act as barriers when they are 4-connected lines (test d passes). No canopy base height, bulk density or fuel moisture is given (`No cbd.asc file, filling with NaN`, `repro/stdout.txt`). The fuel raster and DEM share a CRS and row order but not a footprint (section 2).

## Step 5: Terrain

- Slope and aspect are computed with `numpy.gradient` on the 30 m spacing, then `int()` truncated into the ASC files (`run_demo_simulation.py:62-64`, `:39`). Aspect uses `atan2(-gx, gy)`, which is the downslope compass azimuth for a north-up array: correct as an aspect.
- Slope unit is degrees (min 1, mean 16.6, max 38).
- **For simulator `S` the slope and aspect rasters are not used for the spread rate.** `ps` and `saz` are read into `Data.csv` and only printed for `S` (`Cells.cpp:649`, `:1014-1015`); they enter the calculation only in the Canadian model (`FuelModelFBP.cpp:453`, `:591`, `:632`). Terrain acts only through `slope_effect(elev_i, elev_j, cellsize)` on the elevation difference of neighbouring cells (`Cells.cpp:443-450`, applied at `:786-793`). That function gets the difference as a ratio (rise over 30 m). For the staged DEM it ranges 0.977 to 1.023 (`analysis_metrics.json`: `slope_effect_as_coded`), that is, at most about 2 % faster or slower. The synthetic test (c) confirms it.
- The same coefficients applied to a percent slope would span about 0.03 to 4.7 (`slope_effect_if_percent`). I could not find in the fork whether the intended input unit is percent; unverified.

## Step 6: Ignition

| Hop | Value | Evidence |
|---|---|---|
| UI form | `latitude`/`longitude` text fields, default 21.867894 / 86.500688 | `SpreadPage.tsx:12` |
| API | the coordinates are only a gate: `abs(lat-21.867894) < 0.2 and abs(lon-86.500688) < 0.2`; they are not passed to the runner. `duration_hours` (default 12, `schemas.py:49`) is not read either; the runner always writes 48 rows. | `operations.py:136-143` |
| Runner | fixed `CENTER_ROW = CENTER_COL = 20`, `Ncell = 20*40+20+1 = 821` | `run_demo_simulation.py:29`, `:115`; `Ignitions.csv` |
| Cell | row 20, column 20, 0-based from the top-left, 1-based row-major `Ncell`. Frame 0 has exactly this cell burned (`ForestGrid0.csv`). The cell centre is 15 m south-east of the exact centre of the 40 x 40 array. | `analysis_metrics.json` |
| What the coordinate is | the centre of the MODIS burned pixel at 21.867894 N 86.500688 E (offset inside the pixel 0.250 km, 0.250 km), not an observed ignition point | `analysis_metrics.json:ignition_offset_inside_modis_pixel_km` |
| CRS and flips | The ASC header writes `xllcorner` and `yllcorner` in degrees (origin minus 0.005) together with `cellsize 30` in metres (`run_demo_simulation.py:34-37`); I found no use of the header's corner values in `DataGenerator.cpp` (no match for `xllcorner`), so the location is carried only by the constants. No y-flip, no off-by-one found. | `images/basemap_overlay.png` |

Overlay of the ignition cell on the OpenStreetMap basemap the app uses: `images/basemap_overlay.png` (nine z15 tiles in `basemap/`).

## Step 7: Output and map display

- **Frame to hour:** `ForestGrid<k>` is written at each weather period boundary; the run has 48 weather rows of 60 min and `max time periods: 2880` = 48 x 60 one-minute fire periods (`repro/stdout.txt`; `ReadArgs.cpp:355-363`: `--Fire-Period-Length` is in minutes and is capped by `MinutesPerWP`; `Cell2Fire.cpp:2290`). Frame k is the state after k hours; frame 0 is the ignition. The page's label "hour k / 48" is consistent.
- **Monotonic:** the burned set at k is contained in the set at k+1 for all 48 steps; counts 1, 2, 10, 23, 43, 70, 101, 141, ... 1,424. Grid values are only 0 and 1 (`analysis_metrics.json`). The public PNGs match the ForestGrids exactly.
- **Frame order:** numeric sort in the runner (`run_demo_simulation.py:129`), PNG names zero-padded (`SimulationCanvas.tsx:17`).
- **Rate of spread per direction (m/min, farthest burned cell centre in a 45-degree sector, before clipping):**

| direction | N | NE | E | SE | S | SW | W | NW |
|---|---|---|---|---|---|---|---|---|
| h0-6 | 0.17 | 0.24 | 0.53 | 0.90 | 0.79 | 0.42 | 0.26 | 0.19 |
| h0-12 | 0.17 | 0.28 | 0.49 | 0.86 | 0.84 | 0.54 | 0.26 | 0.19 |

The head rate (0.8 to 0.9 m/min toward S and SE) equals the TL2 formula at 9 to 14 km/h (0.79 to 1.18 m/min, coefficients `FuelModelSpain.cpp`), i.e. the engine follows its formula. By hour 24 the south, east and south-east extents are clipped by the domain (607 m, 806 m), so later rates are lower bounds. The final centroid is 47 m south of the ignition.

- **Georeferencing in MapLibre:** `SimulationCanvas.tsx:10-11` places the canvas on `origin +/- 0.007 deg`, corner order top-left, top-right, bottom-right, bottom-left, with the frame as a north-up image. The orientation matches the data (row 0 north). The extent is the problem:

| | East-west | North-south |
|---|---|---|
| true grid | 1,200 m | 1,200 m |
| drawn extent | 1,446 m | 1,548 m |
| scale factor | **1.205** | **1.290** |

So the fire is drawn 20 % too wide and 29 % too tall, and anisotropically (ratio 1.07). The map starts at zoom 9 (`SpreadPage.tsx:14`, `initialViewState`), where one pixel is about 142 m, so the whole overlay is about 10 pixels across. The 40 x 40 PNG is scaled to a 512 x 512 canvas with default smoothing (`SimulationCanvas.tsx:12`, `:17`), and fully transparent black pixels blend into the burned colour, which gives dark soft edges. Corner order was not exercised in a real MapLibre instance; the figures use my own placement of the same corners (`images/georeference_overlay.png`, `images/basemap_overlay.png`).

## Step 8: Synthetic sanity tests

The same binary and command line as `run_demo_simulation.py:144` were run on synthetic 40 x 40, 30 m inputs under `synthetic/<test>/` (inputs `scenario/`, outputs `run/`, log `stdout.txt`). The runner itself was not executed, because it writes into the repository. A copy of the real scenario was run in `repro/` and its ForestGrid0, 12, 24, 48 and `Data.csv` are byte-identical to the repository's. Pass criteria were written in `scripts/synthetic_tests.py` before the runs. Fuel is GR1 (101) for the four main tests so that the no-wind cases spread; the production fuel TL2 is below the spread threshold without wind.

| Test | Inputs | Result | Pass? | What a fail implies |
|---|---|---|---|---|
| (a) uniform fuel, flat, no wind | GR1, elevation 500, WS 0, 12 h | burned 225 cells; extents 247 m (axes) and 255 m (diagonals), max/min 1.03 | **PASS** | |
| (b) same, wind from the west | WS 3 km/h, WD 270, 4 h | 408 cells; east 510 m, west 240 m, east/west 2.13, centroid east of ignition | **PASS** | |
| (c) tilted plane, no wind | 20 degrees rising to the north, 12 h | north 270 m, south 242 m, ratio 1.12 (criterion >= 1.25) | **FAIL** | slope has almost no effect in this model path (about +0.9 % per cell), so terrain and DEM quality are irrelevant to the footprint; real fire spreads faster upslope |
| (d) line of non-burnable cells | NB3 column at x = 26, wind from west, 6 h | fire reaches the column; 0 cells on or beyond it | **PASS** | |
| (d2) supplementary: diagonal line | one-cell-thick diagonal NB3 line | 382 cells burned on the far side | **FAIL** | thin oblique non-fuel lines (roads, streams) do not stop spread in 8-neighbour propagation; only orthogonal or thicker barriers do |
| s1 supplementary: TL2, no wind | production fuel | 1 cell (spread rate 0.085 m/min is below `ROSThreshold 0.1`, `ReadArgs.cpp:255`) | information | calm hours stop the fire entirely |
| s2 supplementary: TL2, 10 km/h from west | | east/west 2.25 | information | |

The runner's wind conversion gives 270, 0, 90 and 180 for winds from the west, north, east and south respectively (`synthetic_results.json:runner_conversion`). Figure: `images/synthetic_tests.png`.

## Step 9: Validation reference

- **What MCD64A1 can show:** burn extent at 500 m with a burn day within a month; no hours, no perimeters (`validate_mcd64a1.py:1-4`; `docs/05_prototype_gap_analysis.md:143`). The 2.4-pixel domain means any footprint touches 1 to 11 pixels.
- **Aggregation:** every burned 30 m cell flags the whole 500 m pixel it falls in (`validate_mcd64a1.py:53-63`, sinusoidal mapping with `R = 6371007.181`; the pixel shear of about 0.55 at this longitude is handled correctly), and observed pixels are then kept only if they are in the predicted set or within 2 pixels of its smallest row and column (`:105`).
- **Sensitivity** (`scripts/validator_sensitivity.py`, `validator_sensitivity.json`, with the validator's own functions):

| Footprint | Cells | MODIS pixels flagged | IoU |
|---|---|---|---|
| simulated hour 48 | 1,424 | 10 | 0.636 |
| ignition cell only | 1 | 1 | 0.125 |
| whole domain burned | 1,600 | 11 | **0.727** |
| 8 x 8 block in the NW corner | 64 | 2 | 0.400 |
| cross shape through the ignition | 79 | 7 | **0.750** |

The score is a function of the domain size, not of the fire. The reported 0.636 for 2024-03 therefore carries no accuracy information. The comparison month is chosen in `SpreadPage.tsx:13` (`2024-03`) against January weather.

- **FIRMS/VIIRS:** staged raw VIIRS files exist in `/Users/kireeti/wildfire-data/raw/_staging_firms/` (SNPP and NOAA-20, 5-day files; columns `acq_date`, `acq_time`, `satellite`, `confidence`, `frp`, `latitude`, `longitude`). For 2024-03-30 to 2024-04-03 they hold 24 detections within 25 km of the origin (21 within 10 km, 1 within 6 km: 2024-04-01 07:27 UTC, NOAA-20, 5.8 km, low confidence), so successive-overpass footprints for this case are mostly not at the burned pixels. Nearest-detection distance and the MODIS cluster do not agree; I did not resolve why.
- **Footprint scoring script:** `/Users/kireeti/Desktop/Projects/NextPass/nextpass/scripts/score_footprint.py` (2026-09-30). It scores a predicted footprint or score map against the cells newly detected at overpass k+1 over a domain D of terrain-valid cells within `r_max` of the current footprint C_k, with input CSV `pair_id, ix, iy[, score]` on a 375 m UTM grid; outputs AUC, AP, top-10 % capture, recall at 2n, or precision, recall, F1, IoU. It is not in the RESQ repository.
- **Proximity baseline needs:** the current footprint C_k at an overpass (VIIRS detections gridded to 375 m), candidate cells inside `r_max`, score = decreasing function of distance to C_k (for example minus the distance), the same `pair_id` structure, and the same D. The simulation would be compared by rasterising its cells to the same grid and giving them the same CSV form (with the Cell2Fire frame at the overpass time as the predicted set). That needs the event's overpass times and a simulation domain that covers C_k plus `r_max`, which the 1.2 km grid does not.

## Step 10: Ranked root causes

| # | Cause | Evidence | Severity | Minimal fix | Data? |
|---|---|---|---|---|---|
| 1 | Domain too small for the event: 144 ha, fire at the edge by h12, 89 % filled; observed burn 250 ha over 3.5 km | `run_demo_simulation.py:27-28`; `images/frames_mosaic.png`, `images/mcd64a1_vs_domain.png`; edge counts in `analysis_metrics.json` | Critical: the output is a clipped blob; the area and the shape are set by the grid | enlarge the domain to cover the observed burn plus margin (at least 6 km) or use coarser cells; re-crop land cover and DEM (both tiles are local) | code, plus the existing tiles |
| 2 | Weather not the event's: `rows[0]`, Maharashtra pixel, 2024-01-01 against 2024-03-31, 12 daytime hours repeated | `run_demo_simulation.py:97-113`; pixel check above; `Weather.csv` | Critical: wind is the only driver of this spread model, drift direction and rate are arbitrary | select the pixel from the ignition location and the day from the event date; do not repeat the day | new data: GFS for March 2024 (file holds January only); selection is code |
| 3 | One fuel and no moisture: 1,598 of 1,600 cells TL2, arbitrary class crosswalk, no canopy, humidity and temperature constants | `proxy_mapping.py:3-15`; `scenario/fuels.asc`; `ReadCSV.cpp:526` | High | an Indian fuel and canopy layer and fuel-moisture inputs; at least validate the crosswalk | new data (fuel, canopy) |
| 4 | Terrain ignored by the model path: slope effect within about 2 %, `slope.asc`/`saz.asc` unused | `Cells.cpp:443-450`, `:649`; test (c) FAIL (as coded 1.0085 upslope; 2.03 if the same ratio were a percent); `analysis_metrics.json` | High for "does it respond to terrain" | decide whether the intended unit is percent and fix in the fork, or drive the spread rate with a physical model (the fork has a `--ros-override-file` hook, `Cells.cpp:~600-720`; not tested here) | code in the fork |
| 5 | Overlay stretched 1.205 x 1.29 and tiny at the initial zoom | `SimulationCanvas.tsx:10-11`; `SpreadPage.tsx:14`; `images/georeference_overlay.png` | Medium (visual distortion of every frame) | derive the extent from `grid.rows * cell_size_m` with the metric degree conversion; zoom to the extent | code only |
| 6 | Validation metric uninformative; month and weather mismatched; observed set clipped by a hack | `validate_mcd64a1.py:53-63`, `:105`; `validator_sensitivity.json`; `SpreadPage.tsx:13-14` | High for any accuracy claim | score against a footprint or perimeter at an overpass time with a baseline (see step 9), not against a monthly 500 m product | new data: observed perimeters or overpass footprints |
| 7 | The user's coordinates and duration are ignored; the ignition is the centre of a burned MODIS pixel | `operations.py:136-143`; `run_demo_simulation.py:29`, `:115` | Medium | pass the coordinates and duration through; derive the Ncell from the coordinate | confirmed ignition coordinates and time |
| 8 | Staging and pipeline hygiene: `rasterio` and Pillow missing from `backend/requirements.txt` and `backend/.venv`, so the API path that runs the script with `sys.executable` fails (`_build_grid` is called unconditionally, `run_demo_simulation.py:141`, `:43-48`); a second exporter writes a different 4-frame manifest into the same public folder (`export_simulation_demo.py:7-18`); `Data.csv` latitude and longitude are Cell2Fire's hard-coded Banff values 51.621244 / -115.608378 (`DataGenerator.cpp:691`, `:694`; unused by simulator `S`, used by the Canadian model); the API reports `georeferenced: false` (`operations.py:142`) while the UI places it on the map | as cited | Low to medium | declare dependencies, remove or guard the second exporter | code only |

**Fixes that are code-only:** 1 (domain, using local tiles), 5, 7 (pass-through), 8, and the pixel and date selection part of 2. **Fixes that need new data:** weather for the event date (2), fuel and canopy (3), observed perimeters or overpass footprints and ignition time (6, 7). **Fix in the simulator:** 4.

## Gaps and things I could not verify

- Not run in a real MapLibre instance (no browser session): corner order and rendering are reproduced by my own placement.
- The scale (x100) of the GFS wind columns is inferred from magnitudes, not read from the export code.
- Whether the GFS pixel containing the Similipal point is 10670273 is inferred from the nearest research-grid cell 23 km away (`grid.csv` is a reconstructed file per the research notes); the 0.25 degree pixel containing the origin was not computed from the GFS geometry.
- Intended unit of `ps` in `slope_effect` (ratio or percent) not found in the fork or its docs.
- The Spain model coefficients' wind height and units were not checked against the literature.
- Why VIIRS shows no detections at the MODIS burned cluster (nearest 5.8 km) was not resolved; the observed event is not independently confirmed.
- The interpreter that generated the staged files is not recorded; `rasterio` is in `~/.pyenv/versions/3.10.13` and `/Users/kireeti/wildfire/.venv`.
- Fire-behaviour realism against field observations was not assessed: no observed perimeter exists in the repository.
- OSM tiles were fetched once (9 tiles, z15, with a descriptive User-Agent) for the overlay; no other network access, no credentials used.
- Scratch computations for the MCD64A1 cluster were run with the backend's `pyhdf` and are reproduced in `mcd_window_2024_03.npy` and `analysis_metrics.json`.

## Files in this folder

`REPORT.md`; `images/` (`burned_area_and_extent.png`, `frames_mosaic.png`, `georeference_overlay.png`, `basemap_overlay.png`, `mcd64a1_vs_domain.png`, `synthetic_tests.png`); `scripts/` (`analyze_run.py`, `synthetic_tests.py`, `validator_sensitivity.py`, `verify_grid.py`, `basemap_overlay.py`); `synthetic/` (inputs, outputs, logs of tests a, b, c, d, d2, s1, s2); `repro/` (copy of the real scenario and its reproduced run); `basemap/` (OSM tiles); `analysis_metrics.json`, `synthetic_results.json`, `validator_sensitivity.json`, `grid_verification.json`, `mcd_window_2024_03.npy`, `weather_pixel_check.json`.
