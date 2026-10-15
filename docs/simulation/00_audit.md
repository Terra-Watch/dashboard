# RESQ-6: audit of the current spread-simulation pipeline

Branch `resq6/simulation-engine` (off `redesign-v2`). Read-only audit, no code
changed in this step. Written 2026-10-13.

Scope: what `POST /spread/jobs` actually runs today, what the separate RESQ-5
replay research pipeline already improved on it but never got wired to an
endpoint, and the concrete flaws both still have. `docs/sim_diagnosis/` was
deliberately not opened in this audit (out of scope, left untouched); where a
fact originates there, this document cites `docs/sim_followups.md`'s summary
of it instead, not the source report.

## 1. The live endpoint's pipeline, as it runs today

`POST /api/spread/jobs` (`backend/app/routers/operations.py:135`) is the only
endpoint behind the historical `/spread/jobs` contract:

1. `SpreadRequest` (`backend/app/contracts/schemas.py:46`) takes `latitude`,
   `longitude`, `duration_hours` (1-48). No incident reference, no wind-source
   choice, no verification check of any kind.
2. `validate_spread_request` -> `inference.simulation_domain.locate_ignition`
   (`backend/inference/simulation_domain.py`) rejects a point outside a
   **fixed 40 x 40 cell, 30 m domain (1.2 km x 1.2 km)** centred on one
   hard-coded point, `ORIGIN_LATITUDE/LONGITUDE = 21.867894, 86.500688`
   (Similipal). Every request, regardless of where the user actually clicks,
   runs the same domain; the lat/lon only pick which of the 1,600 cells is
   "ignited" inside that fixed box.
3. `run_simulation` (`backend/app/services/simulation_service.py`) shells out
   synchronously (`subprocess.run`, 120 s timeout, no progress, no job id,
   blocks the request) to `backend/inference/run_demo_simulation.py`.
4. That script:
   - Builds fuel from one ESA WorldCover GeoTIFF staged for the Similipal
     point only (`runtime_data/simulation_demo/landcover/...tif`), majority
     class over a 3x3 window of 10 m pixels, mapped through
     `proxy_mapping.py`'s `WORLDCOVER_TO_CELL2FIRE` table (includes an SH5
     "shrubland" proxy that the later RESQ-5 crosswalk deliberately dropped).
   - Builds elevation from one staged Copernicus-style GeoTIFF, computes
     slope and aspect with `np.gradient` and writes `slope.asc`/`saz.asc` —
     but see §2 below: the simulator binary's `S` path never reads either
     file.
   - Builds weather from **one row of a January 2024 GFS CSV**
     (`gfs00_2024_01.csv`), the first 12 daytime hours (06-17 UTC) of one
     Maharashtra-region pixel, **repeated to fill however many hours were
     requested** (`_weather_rows`, comment: "one 12-hour daytime profile
     repeated"). It is not the weather of the ignition date, the ignition
     pixel, or the requested location at all.
   - Runs the unmodified Cell2Fire binary once, `--nsims 1`, seed 42, no
     ensemble.
   - Writes one PNG frame per hour and a `manifest.json`; the manifest sets
     `"production_eligible": false` and states the disclaimer honestly.
5. The router wraps the manifest in a response that already carries an
   honest `"status": "development_demo"` message — this part is not
   overclaiming, it is simply not a real simulation of the requested place.

There is no notion anywhere in this path of a "verified incident": any
lat/lon inside the 1.2 km Similipal box is accepted, verified or not.

## 2. The separate, more rigorous pipeline that is *not* wired to any endpoint

`scripts/resq5/replay.py` + `docs/RESQ5_PROTOCOL.md` (frozen protocol,
`results/resq5/<incident>/`) is a materially better pipeline, built for
research replay of 4 historical incidents, never connected to
`/spread/jobs` or any other live route:

- Per-incident domain sized to the VIIRS cluster bounding box + 3 km
  (10.14-11.64 km across for the 4 incidents) — bigger and
  incident-specific, but still *derived from the known final cluster*, not a
  general "configurable box around a live ignition point" (the final extent
  of a live incident is exactly what's unknown).
- Real per-incident ESA WorldCover + Copernicus GLO-30 DEM windows (already
  fetched and stored under `data/resq5/<id>/`), slope and aspect computed
  the same way as the old pipeline.
- Three real wind sources per incident, hourly, from the true ignition pixel
  and event dates: ERA5-Land native 0.1° (primary), ERA5 0.25°, and
  Open-Meteo `best_match` (sensitivity). All historical/reanalysis, fetched
  via CDS/Open-Meteo archive APIs — reachability re-checked in this audit:
  `api.open-meteo.com` returns 200, CDS (`cds.climate.copernicus.eu`)
  returns 200, a `~/.cdsapirc` credential file exists on this machine.
- A documented, fixed fuel crosswalk (`RESQ5_PROTOCOL.md` §4): WorldCover
  10/95 (forest) -> TL2, 30/100 (grass) -> GR1, every other class ->
  non-burnable. Deliberately simpler than `proxy_mapping.py` (no shrub
  proxy).
- A real ensemble: 30 ignition-point jitters (500 m disc) x 3 wind sources =
  90 runs per incident, parallelised 7-wide, 8-15 s per member.
- Burn-probability outputs (`burn_count_*.npz`, member count per cell per
  overpass), scored against VIIRS footprints and two baselines
  (`RESQ5_RESULTS.md`).

This is the pipeline `docs/redesign/10_backend_contract.md` and
`backend/app/routers/redesign.py` (`GET /api/redesign/incidents/{id}/scenario`,
`GET /api/redesign/replay/{id}`) already serve from — but only as **static,
precomputed files** for the 4 fixed demo incidents (`redesign_data.py`
reads `results/resq5/<incident>/*.npz`/`*.csv` at request time; no job runs,
no new incident can ever be simulated through it). It is a read-only replay
viewer, not a simulation job system, and it is a separate router from
`/spread/jobs`.

## 3. Known flaws, checked against both pipelines

- **Single/binary fuel type.** Both pipelines ultimately reduce every
  landcover class to "burns like TL2", "burns like GR1", or "does not burn".
  No canopy, fuel load, or moisture layer exists anywhere;
  `wild-fire-simulation/fuel/evidence/indian_runtime_readiness.md` records
  `INDIAN_RUNTIME = BLOCKED` (cited in `docs/sim_followups.md`, not
  re-verified here beyond confirming the file path is referenced
  consistently across RESQ-3/4/5 docs).
- **Constant T/RH.** Confirmed directly in the Cell2Fire source read for
  this audit: `ReadCSV.cpp:526` — `float ws = 0, waz = 0, tmp = 27, rh = 40;`
  — temperature and relative humidity are literal constants in the code
  path simulator `S` uses; nothing in `Weather.csv` can change them, in
  either pipeline.
- **Slope used, but barely; aspect is computed and never used.** Both
  pipelines compute an aspect raster (`saz.asc`, via `np.gradient`) and write
  it to disk alongside slope, but confirmed directly in `Cells.cpp` for this
  audit: the only terrain term the simulator reads at all is
  `slope_effect(elev_i, elev_j, cellsize) = 1 + 0.023322*ps + 0.00013585*ps^2`
  (`Cells.cpp:443-450`, applied at `:786-793`), a function of the raw
  elevation difference between two neighbouring cells — this is the slope
  term, and it is the only terrain input the simulator binary ever reads.
  Aspect is written to a file that nothing downstream opens; it is not a
  second, smaller terrain effect, it is **not read at all**. RESQ-5's own
  measurement (`RESQ5_RESULTS.md`, "slope factor at most 1.6%") found even
  the slope effect negligible on the four replayed incidents' terrain.
  **Terminology going forward (per coordinator amendment, 2026-10-13): this
  project says "slope used" only. "Aspect" is never described as used,
  planned to be used, or part of a "slope and aspect" pair anywhere in
  RESQ-6's own docs, code comments, or commit messages from this point on —
  the aspect raster may continue to be computed as an inert by-product of
  the existing DEM-processing code, but is never implied to affect the
  simulation.
- **One calm hour ends the fire.** Confirmed in `RESQ5_RESULTS.md` §6
  finding 2: for E2023-084925 under the primary ERA5-Land wind, 22 of 30
  ensemble members stop permanently at the single hour the wind drops below
  0.145 m/s (the TL2 head-rate threshold), and never resume even though
  later hours have wind again. This is a hard behaviour of the runner's ROS
  threshold (`ROSThreshold` 0.1 m/min, cited in `RESQ4_SPREAD_TEST.md`), not
  something either pipeline works around today.
- **Small domain.** The live endpoint's domain is fixed at 1.2 km x 1.2 km
  regardless of request. RESQ-5's domain is larger (10-12 km) but is sized
  from the *already-known* final VIIRS cluster extent, which is not
  available for a live, still-unfolding incident; neither pipeline has a
  general "configurable N km box around a live ignition point" the way a
  real incident-commander tool needs.
- **Coarse wind.** The live endpoint's wind is a single 12-hour profile from
  one ~140 km-footprint, 5x5-pixel-averaged GFS CSV row, repeated regardless
  of requested duration or date. RESQ-5's wind is materially better (hourly,
  real dates) but still only reanalysis-grid resolution (ERA5-Land 0.1° ≈
  11 km, ERA5 0.25° ≈ 28 km); none resolves ridge-valley wind, and nothing
  in either pipeline uses a genuine hourly forecast product for a live,
  not-yet-happened horizon — RESQ-5 is historical replay only.
- **Ignition assumed exact.** The live endpoint ignites exactly the
  requested cell, one run. RESQ-5 jitters ignition *place* across 30
  members but never ignition *time*; both treat a single ignition hour (for
  RESQ-5, "first detection - 12 h", itself an assumption) as ground truth
  for every member.
- **No async job model.** `/spread/jobs` returns `202 Accepted` in its HTTP
  status code but the handler is fully synchronous — the client blocks on
  the subprocess call (120 s timeout) and gets the complete result in one
  response. There is no job id, no progress endpoint, no caching, and no
  runtime budget tracking. RESQ-5's replay script runs offline, outside any
  HTTP request, with no job/progress concept either.
- **No incident-commander-shaped outputs.** Neither pipeline produces
  arrival-time contours, a stated main-spread direction, or a list of
  which settlements/roads/water points fall inside a probability band.
  RESQ-5 produces per-cell burn probability and scores it against
  observations; `redesign.py` renders that as a probability-band grid and
  baseline circles, nothing more.

## 4. What this audit could not check

- `docs/sim_diagnosis/` was not opened, per the task's scope fence; facts
  attributed to it here are taken from `docs/sim_followups.md`'s summary,
  not re-derived from the original report.
- Did not run Cell2Fire or either pipeline in this step (audit is read-only,
  per Step 0's instruction); the `tmp=27, rh=40` and `slope_effect` claims
  were verified by reading the C++ source directly, not by executing it.
- Did not check whether the WorldCover/Copernicus DEM COG buckets or
  Open-Meteo/CDS endpoints are reachable from wherever this app is actually
  deployed in production — only that they are reachable from this
  development environment right now (`esa-worldcover.s3.eu-central-1`,
  `copernicus-dem-30m.s3.eu-central-1`, `api.open-meteo.com`,
  `cds.climate.copernicus.eu` all returned HTTP 200 to a direct curl at time
  of writing).
- Did not check the FIRMS/Earthdata/CDS credential *values* named in
  `backend/.env` (RESQ-2's own stated rule, carried forward: reachability
  checked, keys not read).
- Did not check whether a "verified incident" concept with a persisted
  location exists anywhere today in a form `/spread/jobs` could consume —
  `backend/app/routers/operations.py`'s `/incidents` table
  (`resq_incidents`) has no latitude/longitude field at all;
  `backend/app/routers/redesign.py`'s triage store
  (`triage_actions`/`detection_id`) has verify/dismiss/escalate actions tied
  to the 4 fixed demo incidents' detections, not to arbitrary live
  coordinates. Reconciling these is Step 2 engineering, not re-derived here.
