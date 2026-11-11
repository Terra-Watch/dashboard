# Forecast model in production: inputs, server and UI plan

Status: PROPOSED, 2026-10-30. Nothing here is built yet. Decisions that need the owner are collected in section 10.

Audience: the engineers who build it and the owner who approves it.

## 1. What we are putting into production

The next-day forest fire detection study (nine models, 41 input channels, temporal split) gave us a model family and a frozen protocol. Production serves one model from that family and shows its output on the Control Room map. It replaces the archived replay layer that exists today.

What the output means, and the only way the UI may describe it:

- For every forest cell, a score for "a fire detection in this forest cell tomorrow".
- The map shows the cell's **rank** for the day and a **band**. It does not show a probability unless the owner decides so (section 10).
- It is a ranking aid for where to look first. It is not a fire prediction and not an observed fire.
- Forest cells only (cells that pass the forest-land rule). Every other place has no forecast and must say so.

Which model: the study found no model clearly ahead. On the 2025 test the tabular boosted-tree model and the sequence model were level at the top, and the graph and attention models matched the convolutional-recurrent baseline. So the choice is made on running cost and on the blind-state results, not on a one-point difference. Recommendation: serve the boosted-tree model (CPU only, tiny, fast, easy to explain) and keep one neural model scoring in the background for comparison. The choice is a setting in the model bundle, not code (section 3).

## 2. Rule for the whole change: nothing hard-coded

Today the layer is tied to one old model by name, by a fixed state list, by fixed years and by fixed band cut-offs. None of that may remain. Everything that describes a model comes from the model bundle's manifest and from the database.

| Today | Replace with |
|---|---|
| The old model's name in module names, API fields, run records, env var names, tests, demo data and docs | a neutral module name (`risk_model`), and the `model_id` and `model_version` read from the manifest |
| A fixed set of state codes | the states listed in the grid manifest, filtered by the user's scopes |
| Fixed years the replay data may be read for | the dates a run exists for, read from the database |
| Band cut-offs written in two places (1 %, 5 %, 15 %) | `bands` in the manifest, applied in one function, returned to the client with each run |
| "archived validation subset" coverage text | coverage computed per run: cells scored out of cells in the grid, and the list of missing states |
| Env vars named after the old model | `RISK_MODEL_*` and `RISK_FORECAST_*`, read in one settings module |
| Landing-page snapshot and demo cases with the old model's name | generated from the current run's manifest at build time, or removed |

Check before merging: search the repository for the old model's name, for the state-code list, and for the numbers 0.01, 0.05 and 0.15 near the word band. The search must return nothing outside the changelog.

## 3. The model bundle

One folder per released model, pinned by hash. The server and the daily job read only this.

```
risk-model-<id>-<version>/
  manifest.json      model_id, model_version, created, frozen_config_hash, study_ref,
                     label ("forest detection on the next UTC day"), grid_version,
                     states[], channel_names[41] in order, scaler (mean, sd),
                     calibration (method, fitted on, date), bands[{name, top_share}],
                     min_input_coverage, max_input_age_hours, licence_notices[]
  model.<ext>        the trained model file (one per seed if an ensemble is served)
  calibration.<ext>  isotonic map fitted on the validation year
  cells.parquet      cell_id, lat, lon, state, forest_land_frac, static channels
  parity_cases.npz   inputs and expected scores for 200 cell-days (golden test)
  SHA256SUMS
```

- The bundle is stored privately (the private model repo or the project bucket), fetched by hash, and never committed to git.
- Switching the served model is a change of `RISK_MODEL_BUNDLE` and a new run. Rolling back is the old value.
- The training code that made the bundle stays in `wildfire-ignition-forecasting`. Production only loads it.

## 4. Production inputs

The model reads 41 channels per cell and day: 33 observed and 8 from the weather forecast. Training used archived sources. Several of those are not available fast enough for a daily forecast, so each channel needs a live source and a check that it behaves like the training source.

| Group | Channels | Training source | Live source | Age at forecast time | Risk and handling |
|---|---|---|---|---|---|
| Fire history and detections | days with fire in 7 and 30 days, days since last fire, history flag, and their forest-only versions | VIIRS 375 m active fire, standard processing | The same product in near-real-time, both satellites | about 3 hours | Near-real-time and standard processing differ slightly. Measure the difference on a month of overlap before go-live. |
| Weather, observed | max and mean temperature, minimum humidity proxy, vapour pressure deficit proxy, wind, rain today, rain over 7, 14, 30 days, days since rain, soil moisture | ERA5-Land | **Open problem.** ERA5-Land arrives about 5 days late | 5 days | Section 4.1. |
| Vegetation | NDVI and its age in days | MODIS 16-day composite | same product, latest composite | up to about 2 weeks | The "age in days" channel already exists, so a stale value is an input the model has seen. Keep it honest: compute age from the real composite date. |
| Calendar | day of year (sine, cosine) | computed | computed | 0 | none |
| Land cover | forest, shrub, grass, crop fractions, and the neighbour-ring non-forest and crop shares | WorldCover 2021 | same, built once | static | Rebuild only when the grid version changes. |
| Terrain and people | elevation, slope, population density, distance to roads | Copernicus DEM, WorldPop, OpenStreetMap | same, built once | static | Population and roads get a yearly refresh task. Roads data carries share-alike terms (section 9). |
| Forest boundary | forest-land fraction of the cell | reserved and survey forest layers | same, built once | static | Version it with the grid. |
| Weather forecast | 8 channels from the 06 UTC global forecast run, hours 18 to 42: temperature max and mean, humidity minimum, vapour pressure deficit, wind mean, gust, rain, soil moisture, plus the model-upgrade flag | 0.25 degree global forecast archive | the same product from the public open-data bucket | the 06 UTC run is out by about 10 UTC | Pulling only the needed fields and hours by byte range keeps each day to a few hundred MB. |

### 4.1 The observed-weather gap

The model was trained on reanalysis weather that is five days old by the time it exists. A forecast for tomorrow needs weather up to today. There are three ways to bridge it, and the plan is to test them in this order, on a month where both exist:

1. Use the forecast model's own analysis and early hours for the observed weather channels, and a satellite rain product with a short delay for rain totals.
2. Use the latest reanalysis day available and carry the missing days forward from option 1, and record those days in the run (`bridged_days` already exists in the run table).
3. Retrain the model on the live-style inputs. This is the fallback if the parity test fails. It costs a new study run and is a bigger decision.

Go-live rule: option 1 or 2 is accepted only if the scores built from live-style inputs correlate with scores built from the archive on the same days at a level the owner signs off (proposed starting point: rank correlation of at least 0.95 per day, top 1 % overlap of at least 70 %). These numbers are placeholders for the owner to set before the test, not after.

### 4.2 Missing data

- Per cell and channel: if an input is missing, the cell is not scored. It is not filled with zero.
- Per run: if fewer than `min_input_coverage` of cells have all inputs, the run is marked `partial` and the UI says which states are missing. If a whole source is stale beyond `max_input_age_hours`, the run is marked `stale` and is not shown as current.
- Each run records the cut-off time of every source (`data_cutoffs`) and any bridged days.

## 5. The daily job

A scheduled job, not the web API. The API stays small and the model never runs inside a request.

Runs once a day, around 11:00 UTC (after the 06 UTC forecast run is out), as a scheduled GitHub Actions workflow. It can be moved to any scheduler later because it is one command.

1. Resolve the forecast date (tomorrow, UTC) and the bundle.
2. Fetch inputs: detections since the last run, observed weather, latest vegetation composite, the forecast fields. Each fetch writes its cut-off time and a row count to the run log.
3. Build the 41 channels in the manifest's order. Apply the manifest's scaler.
4. Score every forest cell. Calibrate. Rank. Apply the manifest's bands.
5. Write one `live` run to `forecast_runs` and the scores to `cell_scores` in one transaction. A run is visible only when `status = complete`.
6. Run the checks (section 8). If any fail, write the run as `failed` or `partial` and notify the owner. The previous complete run stays on the map with its date shown.
7. Keep the previous runs. Never overwrite a day.

Retries: each fetch retries three times with a back-off. The job as a whole can be re-run for a date and gives the same run (upsert on date, mode and model version, as today).

## 6. Server changes

Database (extend what exists, do not replace it):
- `forecast_runs` already has `mode` (`replay` or `live`), `model_version`, `grid_version`, `status`, `data_cutoffs` and `bridged_days`. Add `model_id`, `bundle_sha256`, `coverage` (cells scored, cells in grid, missing states), `bands` (the cut-offs used) and `checks` (results of section 8).
- `cell_scores` keeps rank, percentile and band. Add `score_calibrated` only if the owner approves showing probabilities (section 10).
- Add `risk_input_log` (run id, source, cut-off, rows, status) so input health can be shown and audited.
- Store `top_drivers` per cell only if the explanation work in section 7.4 goes ahead.

API (`backend/app/routers/risk.py`):
- `GET /api/risk/status`: the latest complete run per mode, its date, age, status, coverage, model id and version, and the bands. This is what the UI uses to decide what to show.
- `GET /api/risk/geojson` and `/api/risk/daily`: take a date and an optional run mode, return the best complete run for it. The response carries `run`, `bands` and `coverage`, so the client never guesses a label.
- Replace the fixed model string in responses with the run's `model_id`.
- Keep role gating and state scoping exactly as now. Keep the on/off switch, renamed with the generic prefix, and keep "disabled" returning an explicit 403.
- Cache the latest geojson per run id for a few minutes. Cells are about 7,700, so the payload is small.

Configuration (one settings module, all names generic):
`RISK_FORECAST_ENABLED`, `RISK_MODEL_BUNDLE`, `RISK_FORECAST_MAX_AGE_HOURS`, `RISK_FORECAST_MIN_COVERAGE`. Production keeps the layer off until the gates in section 8 pass.

Job and storage:
- The job writes with a database role that can insert into the forecast tables only. The API role reads them.
- Secrets (data-source tokens, database write URL) live in the scheduler's secret store, never in the repository, never in logs.
- The bundle is fetched with a read-only token.

## 7. UI changes

### 7.1 Map layer (Control Room)
- Layer name stays "Ignition-risk ranking". The legend text comes from the API: "Model output, not observed fire. Relative ranking of forest cells for <forecast date>." The model name is never in the legend.
- A small status chip on the layer: "Forecast for 31 Oct, issued 11:20 UTC" or "Stale: last run 2 days ago". Colour is never the only signal; the chip has text and an icon.
- Band names, colours and the "high only" filter read the bands from the run. If the cut-offs change, the UI follows without a release.
- Cells outside coverage are drawn with a neutral hatch and the legend entry "No forecast". States missing from a partial run are listed under the legend.

### 7.2 Date and history
- Date control with today's forecast as the default, and earlier days from stored runs. The control disables days without a complete run.
- After the day has passed, an optional overlay of the day's actual detections, so staff can see how the ranking did. It is clearly labelled as past data.

### 7.3 Cell details
Click a cell: place name, state, rank and band, the forecast date, forest-land share, and the last fire detection in the cell. If probabilities are approved, show the calibrated value as a range with a short sentence about what it means. No "will burn" wording anywhere.

### 7.4 Explanations (phase 3, optional)
Per-cell "what pushes this up": fire in the last week, dry spell, wind, temperature. For the tree model this is cheap to compute at scoring time and store as `top_drivers`. The study found fire history is the input that matters most, so a driver list will often read "recent fire nearby". That is true and useful, but the text must say so plainly. Skip this phase if it cannot be shown in plain language.

### 7.5 Admin and status page
A staff-only page "Forecast status": run history with status, coverage and age, each source's last cut-off, bridged days, which model bundle is live, and the check results. It is how someone notices a stale feed before the Control Room does.

### 7.6 Wording, access and accessibility
- All new strings go through the existing translation helper with an English default.
- Visible to the same roles as now. Citizens and rangers do not see the layer unless the owner decides otherwise (section 10).
- The layer works with keyboard and screen reader: the cell list view (top cells by rank) is available as a table next to the map.

### 7.7 Remove
- The landing-page snapshot data and demo cases built from the old model's output.
- Any copy that names the old model.

## 8. Checks before it is shown, and while it runs

Before go-live (all must pass):
1. **Golden test.** The bundle's parity cases reproduce their stored scores to float tolerance, in the job's environment.
2. **Live-vs-archive parity.** A month where live-style inputs and archive inputs both exist: the section 4.1 thresholds hold.
3. **Silent run.** The job runs daily for at least four weeks with the layer off for users. Each day's scores are stored. Afterwards compare with what was actually detected: top-share recall and AUPRC against the study's 2025 numbers, per state, and for the blind states separately. A clear drop is investigated before exposure.
4. **Load and size.** Job finishes inside its time limit. Geojson payload and map draw time are acceptable on a mid-range phone and a throttled connection.
5. **Access tests.** Role and state scoping tests, the disabled switch, and a run that is `partial`, `stale` and `failed`.

While running:
- The job fails loudly: any failed check writes the run as not complete, keeps the previous run on screen with its date, and sends a message to the owner.
- Weekly: compare predictions with the detections that followed and append the numbers to the status page.
- Monthly: re-check input parity and the band shares (the share of cells in each band should match the manifest).

Honest limits to show in the UI help text and the status page:
- It ranks forest cells. It does not say a fire will start or where it will spread.
- Performance was measured on the 2025 test year, and it was lower in states the model never trained on. Take the figures from the paper's results file when this text is written; do not type them by hand.
- The fire season in the study was concentrated in spring. Outside the main season the number of detections is small and the ranking is less informative.

## 9. Licences and notices the live product must carry

The same data sources as the dataset release apply (fire detections, reanalysis, vegetation index, forecast, land cover, terrain, population, roads, forest boundaries). Put the notices in the map's attribution panel and the status page, read from the manifest's `licence_notices`. The road-distance input uses OpenStreetMap data with share-alike terms; check what that means for the stored cell table before it is published or shared.

## 10. Decisions needed from the owner

1. Which model is served and which one runs alongside for comparison.
2. Show only rank and band, or also a calibrated probability.
3. The parity thresholds in section 4.1, before the test is run.
4. How the observed-weather gap is handled if options 1 and 2 fail: retrain on live-style inputs or stay on the archive replay only.
5. Who sees the layer: Control Room only (as now), or also rangers.
6. Where the bundle and the daily job run (project bucket and GitHub Actions are the proposal; any machine that can run one command works).
7. Who gets the failure messages and how quickly someone must react.
8. Whether the past-day overlay and the per-cell explanations (7.2, 7.4) are in the first release.

## 11. Order of work

| Phase | What | Done when |
|---|---|---|
| 0 | Remove hard-coded names, states, years and bands (section 2); move settings into one module; tests still pass | repository search returns nothing; replay layer works as before |
| 1 | Bundle format and loader; golden test; scoring from archived inputs to a `live`-mode run in a test database | bundle scores match the study's stored scores |
| 2 | Input fetchers and the daily job; run log; checks; failure handling | a full day runs end to end on a schedule and writes a complete run |
| 3 | Server: new columns, status endpoint, generic responses; UI: status chip, bands from API, date control, coverage hatch, admin status page | all new tests pass; layer off in production |
| 4 | Silent run of four weeks; parity and recall report | owner signs off on the report |
| 5 | Switch the layer on for Control Room; weekly review begins | status page shows healthy runs for a week |
| 6 | Optional: probabilities, explanations, past-day overlay, second model alongside | each approved separately |

Not in scope: new model training, changing the label, neighbour features, anything for the hardware nodes, and showing the forecast to the public.

## 12. Who uses this, and what to build next (2026-11-01)

Status first. Built and deployed or in review: the live scoring job (daily, in the cloud), the forecast layer with its status line, satellite detections stored every 3 hours, a Satellite page with cluster alerts, animated wind on the map. What is missing is the link between these pieces: each layer answers a question nobody asked in that form.

### 12.1 Users and their decisions

| User | Decision they make | What they need from the forecast |
|---|---|---|
| Control Room operator | Which signal or report to look at first; whom to assign | Which signals are probably real; where to worry first today |
| Incident commander | Where to put people and what to warn on a fire that is burning | Where it will spread in 12 to 24 hours: wind, risk, people and roads downwind |
| Ranger / field crew | Where to go first; what to expect | A short ranked list for their area; works with poor signal |
| Citizen / community member | Whether to be careful today; where to report | One plain word for their place and what to do |
| Admin / department lead | Staffing, budget, whether to trust the tool | Whether yesterday's forecast was right; season trends |
| Public demo audience | Understand the project | A clear story, not operations detail |

What the model is good for (state it in the product): about 98 % of next-day fire cells already have a detection in a neighbouring cell in the past week, and skill in quiet areas is modest. The forecast says where active fire is likely to continue or spread, not where a fire will start.

### 12.2 Proposed order of work

| # | Feature | For | Why now | Done when |
|---|---|---|---|---|
| 1 | Daily briefing per state (also sent to the alert feed): top 10 risk areas, new satellite clusters, risk cells downwind of an active fire, expected rain and wind shifts | Operators, commanders | Replaces opening five layers to answer one question | A briefing exists for each state with staff, built from the day's run and detections |
| 2 | Satellite cluster to incident in one step: create a report, assign the nearest ranger, mark the signal handled | Operators | Detections cannot be acted on from where they appear | One click from a cluster creates an incident with the cluster's position |
| 3 | Spread watch on an open incident: wind, risk cells 10 to 20 km downwind, nearest communities | Commanders | The spread planner has the pieces; it is not connected to the live data | The incident page shows downwind risk with the current wind |
| 4 | "Did it work?" panel: yesterday's forecast against what burned (data already collected daily in verification.csv) | Admins; trust for everyone | The only honest answer to "is it any good" | A page shows recall in the top 1, 5 and 10 % of cells per day and per week |
| 5 | Ranger patrol list: ranked cells to visit tomorrow in their area, opens on the map, cached offline | Rangers | The field app has no use of the forecast | The list is available with no signal after one sync |
| 6 | Plain fire-danger word for a place (Low, Moderate, High, Very high) from the risk rank and weather | Citizens | Citizens cannot read ranks | One word and one sentence on the citizen home page; never a probability |

Not recommended: more map layers (humidity, lightning and so on). They add clutter without changing a decision.

### 12.3 Notes on what was just built

- The wind animation comes from one cached request for all of India (a 12 by 12 grid, 30 minute cache). An earlier version followed the selected region, which left most of the country without wind and drew a visible rectangle; the flow now extends past the grid edge so it has no border. Spacing is about 2.8 degrees, so small features such as a local wind shift are not shown.
- The Satellite page lists forest-cell detections by default; crop-stubble fires outside forest land dominate the feed in autumn.
- Cluster alerts: 5 or more detections in one 0.1 degree forest cell within 6 hours, once per cluster per day, to the staff of that cell's state. Raise `CLUSTER_MIN` if a fire season floods people.
