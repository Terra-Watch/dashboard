# RESQ prototype gap analysis

## Executive assessment

RESQ currently demonstrates the application flow, archived ignition-risk records, a MapLibre map, patrol and incident shells, and a Cell2Fire spread animation. The spread runner and MCD64A1 comparison now execute with real downloaded Earth-observation data.

It is not yet a real operational wildfire system. The current outputs are suitable for a clearly labeled development demonstration and engineering tests, not for dispatching crews or declaring that a fire will spread in a particular direction.

The main gap is not the map UI. It is the end-to-end evidence chain:

```text
observed conditions -> ignition risk -> confirmed ignition -> calibrated fuels/weather
-> spread forecast -> observed perimeter -> measured validation -> operational alert
```

Several links in that chain are currently archived, proxy-based, incomplete, or disconnected.

## Current end-to-end flow

### 1. Choose a forecast date

The UI restricts demonstration dates to 2023–2024. The map requests archived risk records from the backend.

Current limitation: the available Bar v3 replay is an archived validation subset, not a complete forest-cell forecast for all six states. It is not a newly generated daily wall-to-wall forecast.

### 2. Display ignition risk

The map displays risk bands: Low, Moderate, High, and Very high. Bands are relative rankings among the records available for that day.

Current limitation: no deployable A-prime model bundle and complete input-building pipeline has been established in this application. The displayed replay must not be described as a live operational prediction.

### 3. Select an ignition area

The user can select a displayed point or run the staged Similipal development case.

Current limitation: a high-risk cell is not an observed ignition. The system does not yet connect a forecast cell to a confirmed satellite or field detection with a reliable timestamp.

### 4. Run spread simulation

The backend runs Cell2Fire using a 40×40 grid and 49 image frames, then displays the frames through a MapLibre canvas source.

Current limitation: the current scenario uses uncalibrated fuel proxies, staged terrain, and repeated weather forcing. It is a possible footprint demonstration, not a calibrated forecast of actual fire behavior.

### 5. Compare with observed burned area

The app can compare the final simulation with MCD64A1 burned-area pixels at the MODIS 500 m scale.

Current limitation: MCD64A1 is monthly. It cannot verify the exact hour-24 or hour-48 perimeter. The current March 2024 comparison is a development-only spatial check and uses January weather forcing, so its overlap value is not an operational accuracy score.

## What is working

- React, TypeScript, Vite, PWA shell, and mobile-first application layout.
- FastAPI service structure and JWT login with roles.
- Postgres/PostGIS integration structure.
- MapLibre open basemap without a map API key.
- Risk bands instead of raw model probabilities in the UI.
- Canvas-source spread animation rather than polygon animation.
- Chronological frame ordering and monotonic burned-cell checks.
- Real MCD64A1 download and spatial comparison command.
- Empty states for unavailable layers and incomplete coverage.
- Explicit development disclaimers in the spread workflow.

## Mistakes corrected so far

### Frame ordering bug

Simulation files were sorted lexicographically, producing playback order `0, 1, 10, 11, ... 2`. The visual footprint appeared to shrink and grow. Frames are now sorted by numeric hour.

### Unsupported accuracy implication

An overlap value could be mistaken for a validated forecast score. The UI and documentation now identify the comparison as development-only and state that MCD64A1 does not validate hourly timing.

### MODIS resolution mismatch

The simulation grid is 30 m while MCD64A1 is 500 m. The comparison now aggregates the simulation to the MCD64A1 grid before calculating overlap.

### Geographic extent mismatch

The first demo location had no observed burned-area pixels in the same extent. The current development case uses a 2024 observed MCD64A1 location, while still keeping the weather limitation explicit.

### Demo data versus operational data

Archived replay records and the Cell2Fire scenario were initially easy to mistake for a complete operational forecast. The product must continue to label archived, staged, proxy, and unavailable data separately.

## Data still missing or insufficient

### A. Ignition-risk data

Needed:

- Complete forest-cell master grid for Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, and Jharkhand.
- Stable cell geometry and cell identifiers.
- Forest mask and forest-cell count verified from the source grid.
- Daily weather history and forecast data for every cell.
- GFS lookup tables with documented spatial and temporal alignment.
- Static features: land cover, elevation, slope, aspect, roads, settlements, protected areas, and human-access variables.
- VIIRS/MODIS fire-history tokens through the day before the forecast date.
- Exact normalization statistics and feature schemas.
- Confirmed deployable A-prime checkpoints for 2023 and 2024, or approval for a new model run.
- The original fold/date exclusion manifest so no model is evaluated on dates used for training.

Without these, RESQ cannot generate a trustworthy daily score for every forest cell.

### B. Ignition confirmation

Needed:

- Near-real-time VIIRS and MODIS active-fire feeds.
- Detection confidence, acquisition time, satellite, and quality flags.
- Duplicate-cluster logic for multiple detections of the same fire.
- Cloud, smoke, industrial heat, agricultural burn, and false-alarm filters.
- Field confirmation workflow with photographs, GPS, officer identity, and timestamp.
- A clear distinction between predicted ignition risk, satellite detection, and verified incident.

Currently these concepts exist in the UI but are not connected to a complete live ingestion and verification process.

### C. Spread-model inputs

Needed:

- Complete Indian fuel raster for each simulation region.
- A validated crosswalk from Indian vegetation classes to Rothermel fuel parameters.
- Fuel load, fuel depth, fuel moisture, and canopy measurements from Indian field plots or an accepted calibrated dataset.
- Weather observations and forecasts at the ignition date and location, including wind speed, wind direction, temperature, humidity, and precipitation.
- Terrain elevation, slope, and aspect with a documented vertical and horizontal reference system.
- Water, roads, settlements, firebreaks, and protected-area boundaries.
- A reproducible input package with version, source date, resolution, and missing-value rules.

The current demo has SRTM, ESA WorldCover, and GFS-derived development inputs, but the fuel conversion and weather extension are not validated for Indian fire behavior.

### D. Observed fire perimeters

Needed for validation:

- At least 10 independent Indian incidents from 2023–2024.
- Confirmed ignition coordinates and start times.
- Perimeters at approximately 24 and 48 hours where available.
- Sentinel-2 or Landsat burn-scar interpretation for higher-resolution perimeter checks.
- MCD64A1 as a monthly, coarser supporting reference.
- Incident closure date and final burned area.
- Cloud and image-availability records.

MCD64A1 alone cannot establish when a perimeter existed during a 48-hour simulation.

## Model and scientific weaknesses

### What “ignition” means in RESQ

In the product, an ignition means the beginning of a detectable fire event within a forest cell during the forecast period. It does not mean that the entire cell will burn, that a fire has already been confirmed, or that the model knows the exact ignition coordinate.

The current archived Bar v3-style records are closer to short-term fire-occurrence or active-fire proximity predictions than a complete independent ignition simulator. They should be interpreted as:

> “This forest cell ranks higher or lower than other available cells for fire occurrence under the available inputs.”

They should not be interpreted as:

- a probability that a fire will start at a precise point;
- a confirmed fire detection;
- the time an ignition will begin;
- the cause of ignition;
- the expected burned area;
- a prediction that the cell will be fully consumed.

The product must therefore keep three states separate:

```text
ignition risk forecast -> satellite or field detection -> verified incident
```

Only the third state should launch an operational spread estimate. A high-risk cell without a detection is a patrol priority, not an incident.

### Ignition-model weaknesses

1. **Target ambiguity.** The original target and archived records do not yet establish a clean distinction between a new ignition, an active-fire detection, a nearby fire, and a burned-area observation. These events have different meanings and must not be combined silently.

2. **No exact ignition time.** A daily band cannot establish whether ignition occurred in the morning, afternoon, or overnight. Spread initialization therefore needs a separately observed detection time.

3. **No exact ignition location.** A forest-cell prediction ranks an area. It does not identify the first burning pixel. The incident workflow needs a satellite coordinate or field GPS point.

4. **Detection and ignition are not equivalent.** A satellite can detect an already-burning fire after it started, miss a small or obscured fire, or observe agricultural and industrial heat. The model output cannot be treated as ground truth without verification.

5. **Strong class and observation bias.** Reported and satellite-observed fires are easier to obtain near roads, populated areas, and clear skies. Remote, small, cloud-covered, or short-lived fires are under-observed. A model can learn observation patterns rather than ignition causes.

6. **Fire-history leakage risk.** Recent VIIRS/MODIS detections can be useful predictors, but detections after the forecast cutoff must never enter the input. They can also cause the system to predict continuation near an existing fire rather than a new ignition.

7. **Spatial leakage risk.** Nearby cells and repeated observations from the same fire can appear in both training and validation unless fire events, dates, and spatial neighborhoods are split carefully.

8. **Season and region transfer risk.** A model fitted on one set of states, seasons, sensors, or vegetation conditions may rank cells poorly in another state or season. The six-state product needs region-wise coverage and holdout evaluation.

9. **No calibrated decision meaning.** Relative bands are appropriate for patrol ranking, but they do not provide a calibrated chance of ignition. The UI must keep bands and raw model scores separate.

10. **No causal explanation.** A driver such as hot/dry weather is an association from the model inputs, not proof that weather caused the ignition. Driver text must remain advisory and avoid causal claims.

11. **No negative-event confirmation.** A cell with no satellite detection is not necessarily a cell with no fire. Cloud, smoke, revisit time, spatial resolution, and sensor sensitivity create false negatives.

12. **No operational alert threshold yet.** “Very high” is a daily rank band. It is not automatically an alert. Alerts need a separate policy using band, detection confidence, persistence, protected-area context, and officer confirmation.

### Required ignition-model fixes

- Define the prediction target in one sentence and encode it in the dataset manifest.
- Store event IDs so multiple detections of one fire are not treated as independent ignitions.
- Apply a strict cutoff: all inputs must be available before the forecast issue time.
- Separate new-fire prediction from active-fire continuation.
- Validate separately for remote forests, protected areas, agricultural edges, and urban/industrial areas.
- Record satellite coverage and cloud quality so missing observations are not treated as negatives.
- Evaluate by independent incident and date, not only by randomly sampled cell-day rows.
- Keep the UI language as “priority/risk band” until calibrated ignition probabilities are independently established.
- Require a confirmed detection or field report before starting spread simulation.

### Ignition risk is not spread prediction

The ignition-risk model estimates which forest cells are relatively more likely to have an ignition or nearby fire occurrence. It does not provide an ignition time, fireline, fuel state, or perimeter. The spread model must begin only after a detection or field-confirmed ignition is available.

### The current demo is not India-calibrated

The Cell2Fire run uses proxy fuel parameters and repeated weather inputs. The result can show software behavior and a possible footprint, but the direction and area are not yet trustworthy for field decisions.

### Current validation is not independent

The development case is centered near an observed burned-area location. That is useful for integration testing but can overstate performance if the ignition is chosen after looking at the observation. Independent incidents must be selected before running the simulation.

### Resolution and timing are inconsistent

The simulation uses 30 m cells and hourly frames. MCD64A1 is approximately 500 m and monthly. A valid comparison must use a common grid and must not claim hourly timing from monthly data.

### Weather is not event-specific

The current development scenario repeats an available January 2024 GFS profile. Real validation requires the weather sequence for the actual incident date and location.

### No uncertainty estimate

The current UI shows one footprint. A real prototype should show a range of possible footprints from weather uncertainty, fuel uncertainty, and model parameter uncertainty. It should not show a single deterministic boundary as certain.

## Required real-prototype plan

### Phase 1: data and reproducibility

1. Freeze the master grid, forest mask, cell IDs, and spatial reference.
2. Create a versioned feature contract for every ignition-risk input.
3. Recover or retrain the confirmed A-prime models with exact configuration and fold exclusions.
4. Implement `build_day` by reusing the research input builders without modifying the research repository.
5. Run parity checks against stored validation predictions before any wall-to-wall forecast.
6. Import daily risk bands into PostGIS with source, model version, issue time, and coverage metadata.

### Phase 2: detection-to-incident workflow

1. Ingest VIIRS/MODIS detections with quality and acquisition metadata.
2. Cluster duplicate detections.
3. Link detections to forecast cells and nearby incidents.
4. Require officer confirmation before treating a detection as an incident.
5. Store the confirmed ignition point, start time, confidence, and evidence.

### Phase 3: calibrated spread prototype

1. Build complete fuel and terrain rasters for one pilot landscape first.
2. Obtain event-specific weather observations and forecasts.
3. Calibrate fuel and moisture parameters against independent incidents.
4. Run an ensemble of spread scenarios rather than one fixed run.
5. Produce image/canvas frames and a final footprint with provenance metadata.
6. Show uncertainty and unavailable states explicitly.

### Phase 4: independent validation

For each incident, record:

- forecast issue time;
- ignition source and confidence;
- weather source and version;
- fuel and terrain versions;
- predicted 24-hour and 48-hour footprints;
- observed perimeter source and acquisition time;
- common comparison grid;
- overlap, missed area, excess area, area ratio, and directional error.

Use a locked set of incidents that is not used for tuning. Report aggregate results across incidents, not only the best case.

### Phase 5: operational hardening

- Data freshness monitoring and failed-ingestion alerts.
- Job queue for forecasts and simulations.
- Retry and idempotency for satellite imports.
- Audit logs for model, data, user, and incident changes.
- Role enforcement for admin, officer, and viewer.
- PostGIS indexes and spatial query limits.
- Offline incident queue reconciliation.
- Backups and restore testing.
- Observability for API errors, job duration, stale data, and missing coverage.
- Physical mid-range phone test for map playback and battery impact.
- Production deployment with secrets kept outside the repository.

## Definition of “real prototype”

RESQ can be called a real prototype when all of the following are true:

- A complete forecast can be generated for every forest cell in the pilot region.
- The exact model and feature versions are recorded for every forecast.
- An observed detection can become a verified incident without manual database edits.
- A verified incident can launch a spread job with event-specific weather and calibrated fuels.
- The output is shown as hourly image/canvas frames with uncertainty and provenance.
- At least 10 independent incidents have been evaluated with a locked protocol.
- The system reports unavailable data instead of filling gaps with synthetic values.
- Forest officers can use the result without seeing research-only metrics or raw model scores.
- Every operational action is auditable.

## Current honest status

```text
Application shell:                 working
Archived risk replay:              working, incomplete coverage
Live full-grid ignition forecast:  not ready
Satellite detection ingestion:     not connected end to end
Verified incident workflow:        partial
Spread animation:                  working as a demo
India-calibrated spread forecast:  not ready
MCD spatial comparison:            working as development validation
24/48-hour perimeter validation:   not established
Production operations:             not ready
```

The next highest-value work is to establish one complete pilot region with exact event weather, calibrated fuel inputs, independent observed perimeters, and a reproducible validation set before expanding to all six states.
