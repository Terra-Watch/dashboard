# What-if fire spread simulation: plan

Status: plan and first build. Branch `feat/fire-whatif-simulation` (from `origin/main` at `a1ac62a`).

## What this is, and is not
An interactive, deterministic **what-if** simulation for planning, training and demonstration in the Control Room: place an ignition, set wind, see how a fire could grow over real terrain, and which villages, roads and water points it reaches and when. It is **not** a forecast, uses **no probabilities**, and never changes incident status, priority, dispatch or visibility. Fixed on-screen wording: **"What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels."**

Replaces the earlier forecasting and baseline research track for the purposes of the demo. That research (`docs/simulation-redesign/`) stays as the record; this plan does not depend on it.

## Why this design
- Evidence reviewed (`docs/simulation-whatif/REFERENCES.md`): minimum travel time (MTT, Finney) is the standard fast method for terrain-aware spread; no open-source in-browser implementation exists; standard Rothermel fuel models are not validated for Indian forests and tend to over-predict; fuel mapping dominates accuracy; hindcasts start better from observed fire points than from one ignition point.
- Therefore: implement MTT ourselves in TypeScript so it runs live in the browser, keep the fire-behaviour model simple and documented, label spread rates uncalibrated, and add an honest hindcast report.

## Model (v1)
Grid 30 m (about 10 km square for the demo), 16-neighbour Dijkstra over **travel time**.
- Per cell inputs: elevation (slope, aspect), fuel class, blocked flag (water, bare rock, user fire line).
- Head rate of spread: `R = R0(fuel) x windFactor x slopeFactor`. Wind and slope combine as vectors into one effective head direction and effective wind speed (Rothermel).
- Shape: ellipse with the ignition at the rear focus, length-to-breadth from the effective wind (Anderson 1983, reusing `features/scenarios/engine/ellipse.ts` so the units note stays in one place). Rate along direction phi from the head: `R(phi) = R x (1 - e) / (1 - e cos phi)`.
- Output: arrival time per cell (hours). The fire at time t is `arrival <= t`. Fronts are contours.
- Not modelled, and said so in the UI: spotting, crown fire, fuel-moisture change, diurnal wind change (v1 uses constant wind with optional scheduled shift), suppression and crews.

Fuel table (v1, **assumptions, uncalibrated**): classes mapped from ESA WorldCover (tree cover, shrub, grass, crop, built-up, bare, water) with base rates and wind sensitivity in `fuels.ts`, each with a short source note. Calibration against observed Indian spread is a later step (see Phase 4).

## Data
Per demo area, prepared once by `scripts/whatif/prepare_area.py` into `frontend/public/whatif/<area>/`:
- Elevation: Copernicus GLO-30 (open). Fuel: ESA WorldCover 10 m (open). Villages, roads, water: OpenStreetMap (open, attribution kept).
- Resampled to a 30 m grid in the local UTM zone. Stored as small binary rasters plus `manifest.json` (georeference, sizes, sources, licences, SHA-256). Target under 5 MB per area.
- Any location works by running the script with a new centre; no engine change.

## Interfaces (fixed so engine, data and UI can be built in parallel)
```ts
// frontend/src/features/scenarios/whatif/types.ts
interface Grid { width:number; height:number; cellSizeM:number; elevationM:Float32Array; fuel:Uint8Array; blocked:Uint8Array }
interface Wind { speedKmh:number; fromDeg:number }                 // midflame, constant or scheduled
interface WindSchedule { steps: { atHour:number; wind:Wind }[] }   // piecewise constant, sorted
interface Ignition { col:number; row:number }                       // one or more, or a start front (cells)
interface SimInput { grid:Grid; ignitions:Ignition[]; wind:Wind|WindSchedule; maxHours:number; fireLines?:Uint8Array }
interface SimResult { arrivalH:Float32Array /* Infinity = not reached */; maxHours:number; reachedCells:number; engine:string }
function simulate(input: SimInput): SimResult
function frontAt(result: SimResult, grid: Grid, hours: number): Uint8Array  // burned mask
function arrivalAtPoints(result, grid, points:{id:string; col:number; row:number}[]): {id:string; hours:number|null}[]
```
UI (Control Room, Scenario tab): map layer with ignition click, time slider and play, wind controls, fire-line drawing, at-risk table (asset, hours to reach), up to three side-by-side wind cases, fixed disclaimer.

## Phases and tests
1. **Engine** (this build): `whatif/` module with unit tests: flat uniform grid reproduces the analytic ellipse within a stated tolerance; zero wind gives a circle; fire moves downwind; uphill faster than downhill; blocked cells and fire lines stop spread; water never burns; results deterministic; 400x400 grid under about 1.5 s; arrival times monotone along paths.
2. **Data**: `prepare_area.py` with tests on synthetic rasters, then the Similipal area (about 10 km), with provenance.
3. **UI**: Scenario tab layer, controls, at-risk table, screenshots for the deck.
4. **Check against real fires** (separate report, honest): 3 to 5 documented fires, start from satellite fire points, compare area, direction, farthest reach and arrival time; calibrate fuel multipliers on our observed Indian spread; compare our engine to pyretechnics or ELMFIRE on shared synthetic cases (reference answers only; no code copied, licences are EPL-2.0).

## Rules
- Deterministic: same input, same output. No random numbers.
- Wording: "what-if", "could reach", never "will". No "forecast", "prediction" or probability language.
- No effect on incidents, alerts, priority, dispatch or the public map. Saving a scenario writes a timeline note only, as the current Scenario tab does.
- Licences: reference implementations (ELMFIRE, pyretechnics, EPL-2.0; ForeFire, GPL-3.0) are used only to compare outputs.
