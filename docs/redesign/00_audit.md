# 00. Audit (read-only)

Read-only pass over the repo as of branch `redesign-v2` (forked from `resq5/replay-protocol-and-results`, 10 commits ahead of `origin/main`). No code changed.

## 1. What exists

### Frontend (`frontend/`)
- Vite + React 19 + TypeScript. `maplibre-gl` + `react-map-gl/maplibre` for the map (key-free OSM raster tiles). PWA shell: `manifest.webmanifest`, `sw.js`, installable.
- Pages (`src/pages/`): `PublicPage`, `AuthPage`, `RequestAccessPage`, `DemoPage`, `MapPage`, `BriefPage`, `OperationsPage`, `SystemPage` (403/404/etc.), `ShellPage`, `InteractivePages`, `ForbiddenPage`.
- Feature pages (`src/features/operations/`): `IncidentsListPage`, `IncidentsPage`, `AlertsPage`, `AlertRulesPage`, `AdminPage`, `SettingsPage`, `ReportsPage`, `AssistantPage`, `SpreadPage`, `NotificationsPage`, `PlanListPage`, `PlanPage`.
- Components: `DemoMap`, `RiskLayer`, `MapControls`, `Contours`, `SimulationCanvas`, `RiskLegend`, `PriorityList`, `CellPanel`, `CommandPalette`, `Login`, `LandingSections`, `AsyncState`, `RouteErrorBoundary`, `DebugFps`.
- Tests: `tests/smoke.spec.ts` (Playwright), `unit/simulationGeometry.unit.ts`. Devdeps include `@playwright/test` and `@axe-core/playwright` — both installed, usable for Phase 2 a11y/screenshot work and for Phase 1 wireframe screenshots.
- **SpreadPage (`src/features/operations/SpreadPage.tsx`) is the current "incident simulation" screen.** It already states, in the UI copy, that the demo is "a synthetic, uncalibrated example at a point in Similipal, not an observed event", with "uncalibrated fuel proxies" and "a fixed wind profile... repeated". It takes a lat/lon + duration, POSTs to `/api/spread/jobs`, and renders a canvas-based burn animation with an hour scrubber (0..48) and an explicit "No observed comparison" empty state. This is honest but thin: no wind-source switch, no baseline overlay, no probability bands, no assumptions panel, no replay/evidence view against the real RESQ-5 numbers.
- `MapControls.tsx` already lists layer toggles for `risk, detections, incidents, boundaries, roads, villages` — only `risk` is wired to real data; the rest render with a "Unavailable" label. Basemap switch offers "Map" only; "Satellite" and "Terrain" are disabled placeholders.
- Two prior design-doc passes already exist at `docs/01_design_system.md` and `docs/02_screens.md` — a comprehensive but *aspirational* design system/sitemap for a full six-state, five-language, multi-role ops product (teams, plans, admin, assistant, etc.) that goes well beyond what the backend or data can currently support. Useful as a style/tone reference (the "survey sheet" visual language, risk ramp, vocabulary rules) but its scope (teams, routing, SOP library, assistant) is far ahead of this redesign's three-step scope and must not be implied as built.

### Backend (`backend/`)
- FastAPI (`backend/app/main.py`), lifespan creates Postgres/PostGIS and seeds dev users (admin/officer/viewer), JWT auth via `RESQ_SECRET_KEY`.
- Routers:
  - `auth.py`: `POST /login`, `POST /access-requests`, `POST /password-reset/request`.
  - `risk.py`: `GET /daily` (risk by date), `GET /geojson` (risk cells as GeoJSON by date).
  - `operations.py`: `/admin/overview`, `/reports/summary`, `/plans` (list/create), `/plans/{id}/route`, `/incidents` (list/create/get/patch status), `/alerts` (list/mark read), `/alerts/rules` (list/create), `/settings` (get/patch), `/spread/jobs` (POST, 202 — the only simulation trigger), `/spread/validation` (GET, by month), `/notifications`.
  - All of `operations.py` is scaffolding over dev-seeded data; no indication any of it is backed by real incident/plan/team records yet.
- `inference/`: the real Cell2Fire integration — `run_demo_simulation.py` (the Similipal synthetic demo), `prepare_demo_inputs.py`, `simulation_domain.py`, `proxy_mapping.py` (fuel crosswalk used by the demo/runner, **different** from the RESQ-5 protocol crosswalk in `docs/RESQ5_PROTOCOL.md` §4 — the protocol doc explicitly says its crosswalk "differs from `proxy_mapping.py`"), `mcd64a1_geo.py`, `validate_mcd64a1.py`, `export_barv3_replay.py` / `import_barv3_replay.py` (Bar v3 ignition-risk replay plumbing).
- `models/barv3/`: ignition-risk model artifacts (archived replay, per ARCHITECTURE.md and the gap analysis — not a live, wall-to-wall six-state forecast).
- Keep vs rebuild: the FastAPI app shape (routers, JWT, CORS) and the `inference/` Cell2Fire/MCD64A1 pipeline are solid and should be kept. `operations.py`'s plans/teams/alerts/admin endpoints are speculative scaffolding with no real data behind them yet — Phase 2 should treat them as deferred, not as a contract to honor now. The risk router's dev-seeded daily/geojson endpoints need a real contract driven by what Bar v3 replay data actually exists (archived subset, not all six states — see gap analysis).

**Exactly which model/pipeline backs `GET /api/risk/geojson` today, verified by reading `backend/app/barv3.py`:** it is the **Bar v3** ignition-risk model, read from a frozen archived-replay bundle (`models/barv3/bar3_replay_{2023,2024}.npz` + `cell_centers.csv`), not a newly run or "live" model — `daily_geojson()`/`daily_risk()` only index into this pre-saved array by day number and return the pre-computed ranks for that date; nothing is inferred at request time. This is the only ignition-risk model that exists in the repo; there is no separate "newer" model.

**State scope, verified by reading `backend/app/barv3.py` line 16 (`STATES = {"OD","CG","TS","MP","MH","JH"}`), `docs/ARCHITECTURE.md`, and `docs/05_prototype_gap_analysis.md`:** Bar v3 is scoped to exactly these six states (Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, Jharkhand) and nothing else. **No "two zero-shot states" exist anywhere in this codebase or its docs** — grepped for "zero-shot", "held-out state", "eight state" and found nothing. Do not invent a zero-shot-states claim for the Today screen. The correct, verifiable rule for Today is simpler than the 6+2 framing floated earlier in this project's chat: **inside the six listed states, show the rank/band from the archived replay; outside them (any other Indian state), show "Not validated here" instead of a risk value — full stop, no second tier.** `05_prototype_gap_analysis.md` §8 explicitly flags that a model fitted on these six states' seasons/sensors/vegetation may rank poorly elsewhere, which is the evidence basis for refusing to show a value outside them.

### Data on disk (ignition-risk / replay, verified by listing)
- `data/resq2/<incident>/`: VIIRS detections (`viirs_detections.csv`), ERA5-Land/ERA5-0.25°/best_match weather, Copernicus GLO-30 DEM window, ESA WorldCover 2021 window, MCD64A1 HDF granules + extracted burned-pixel CSVs, fetch/input-check reports. 6 incidents screened, 4 accepted (see RESQ4_SPREAD_TEST.md), 2 rejected.
- `data/resq5/<incident>/`: domain-cropped WorldCover + DEM windows (re-fetched per Amendment 1) for the 4 replayed incidents, plus `protocol_setup.json`.
- `results/resq5/<incident>/`: per-incident `metrics_by_overpass.csv`, `members.csv`, `nextpass_style.csv`, `burn_count_*.npz`, `observed_footprints.npz`, `summary.json` — the full 360-run replay output.
- `results/resq2_*`, `results/resq4_*`: incident candidate ranking, wind-source comparison, ROS formula/readout, spread matrix (synthetic uniform-fuel sweep).
- `backend/runtime_data/mcd64a1/`: monthly MCD64A1 HDF tiles 2023-01 through 2024-12 (one tile, `h26v06`, i.e. a single MODIS tile covering part of the demo region — not six-state coverage).
- `backend/runtime_data/simulation_demo/`: the Similipal synthetic demo's full Cell2Fire scenario folder (fuels.asc, elevation.asc, slope.asc, saz.asc, Weather.csv using a repeated Jan-2024 GFS profile, Ignitions.csv, spain_lookup_table.csv) plus its WorldCover/DEM rasters.

### Geo layer existence table

| Layer | Exists locally? | Source if obtainable | Licence note |
|---|---|---|---|
| VIIRS active-fire detections | **Exists** (4-6 incidents, `viirs_detections.csv`) | NASA FIRMS / LANCE VIIRS | NASA open data, no restriction, attribution expected |
| MCD64A1 monthly burned area | **Exists** (2023-2024, one+ MODIS tiles; per-incident burned-pixel CSVs) | NASA LP DAAC MCD64A1 | NASA open data |
| ESA WorldCover 2021 (fuel proxy) | **Exists** (per-incident 10 m windows, both resq2 9-12 km and resq5 domain-cropped) | ESA WorldCover | CC-BY 4.0, open |
| Copernicus GLO-30 DEM | **Exists** (per-incident windows, resq2 and resq5) | Copernicus / ESA | Open, free registration |
| ERA5-Land / ERA5 0.25° / best_match wind | **Exists** (3 sources per incident, hourly) | Copernicus CDS (ERA5-Land, ERA5), Open-Meteo (best_match) | CDS: free, Copernicus licence (attribution); best_match is a forecast blend, not a reanalysis — already flagged as a sensitivity-only source, not primary |
| Indian-specific fuel/fuel-moisture raster | **Missing**, blocked | `INDIAN_RUNTIME` evidence file records it as `BLOCKED` (RESQ4_SPREAD_TEST.md §5 option C) | N/A — no dataset identified yet |
| Admin boundaries (state/district/division) | **Missing** locally | Survey of India / Bhuvan (licensed, restricted), or OSM admin boundaries (open, coarser) | OSM boundaries are the only currently-open-source option without a separate licence check |
| Roads | **Missing** locally | OpenStreetMap | ODbL, open, attribution required |
| Water bodies | **Missing** locally | OpenStreetMap (surface water), or ESA WorldCover water class (already have the raster, unexploited) | OSM: ODbL. WorldCover water class: CC-BY 4.0, already on disk |
| Settlements / villages | **Missing** locally | OpenStreetMap places, or WorldCover built-up class (already on disk, unexploited) | Same as above |
| WorldPop population | **Missing** locally, never referenced in any script | WorldPop.org | CC-BY 4.0, open, not yet fetched |
| Protected areas | **Missing** locally | WDPA / Bhuvan | WDPA open with attribution; not yet fetched |
| Satellite basemap imagery | **Missing** / not evaluated | Mapbox Satellite (commercial), Esri World Imagery (free tier, licence terms apply), Bhuvan (Indian govt, usage terms not reviewed) | **No satellite basemap licence has been confirmed usable in this repo.** Flag as an open decision (see `07_maps.md`). |
| Light terrain/vector basemap | Used today (OSM raster tiles, key-free) | OSM raster (current), or Carto/Protomaps vector tiles (open) | Already in use, no licence issue found |

Everything above "Missing" is a real gap, not an oversight to paper over: the UI for admin boundaries/roads/villages/water must either be marked "Unavailable" (as `MapControls.tsx` already does) or built from the OSM/WorldCover sources named above — never invented.

## 2. What works today (carry forward)
- The three-step mental separation (ignition-risk forecast vs detection vs verified incident) is **already written into product rules and the gap-analysis doc** (`docs/05_prototype_gap_analysis.md` §"What 'ignition' means in RESQ") — this redesign enforces it in UI, it doesn't invent it.
- `PRODUCT_RULES.md`'s risk-band definitions (relative daily rank, top 1%/5%/15%) and footer line are real, current product rules — reuse verbatim.
- The RESQ-5 replay protocol and results are a complete, rigorous, already-written honesty dataset: exact AUC/AP/IoU numbers per incident per overpass, wind-source sensitivity, and an explicit "honest conclusions" section (RESQ5_RESULTS.md §6) that is close to ready-made UI copy for the replay/evidence screen.
- SpreadPage's existing disclaimer copy is a good base tone to extend, not discard.
- Backend route shape (FastAPI + JWT + role dependency) and the Cell2Fire/MCD64A1 inference pipeline are solid engineering to keep.
- `01_design_system.md`'s visual language (survey-sheet calm palette, risk ramp with hatch+outline for colour-blind safety, Lucide icons, Noto Serif/Sans for 5-language coverage) is strong work; this redesign's `08_design_system.md` builds on it rather than starting over, but narrows scope to the three-step product and adds the trust/replay components the brief requires.

## 3. What's missing or wrong for this redesign's scope
- No existing screen separates "today's forecast" from "detection triage" from "verified incident" as three *distinct, labeled* steps with a persistent step indicator — `MapPage`/`OperationsPage` blend these.
- No wind-source switch anywhere in the UI (RESQ-5 shows wind source changes the result more than anything else tested — RESQ5_RESULTS.md §6.2 — this must be a first-class control).
- No baseline overlay (proximity baseline, circle baseline) anywhere in the UI — the simulation is shown alone, which is exactly the overclaiming risk the brief prohibits.
- No assumptions panel surfacing the fuel/weather/terrain assumptions from RESQ5_PROTOCOL.md §4-6.
- No replay/evidence screen showing sim vs baseline vs VIIRS footprint with the real win/loss numbers.
- Forecast screens (`MapPage`/`BriefPage`) are not checked here for 24/48h horizon leakage from the spread feature, but the current `SpreadPage` offers a 12/24/48h *duration* selector for the "detection" demo flow, which under the new rule belongs only to a verified-incident scenario, not a detection-stage action — this needs re-gating in the IA.
- `docs/01_design_system.md`/`02_screens.md`'s sitemap (teams, plans, admin SOP library, assistant, five-language rollout) is far larger than the three-step product this brief defines; the new IA (`04_information_architecture.md`) scopes down to what's buildable now and marks the rest explicitly out of scope.

## 4. Backend keep/rebuild recommendation (detail in `10_backend_contract.md`)
- **Keep:** FastAPI app shape, JWT auth skeleton, `inference/` Cell2Fire pipeline, MCD64A1 validation tooling, the `results/resq5/` replay data as the backing store for the replay/evidence screen.
- **Rebuild/extend:** `risk.py` needs a real contract stating explicitly which cells/dates are archived-replay vs live (none are live today); `operations.py`'s `/spread/jobs` needs to accept a wind-source parameter and return baseline overlays, not just the sim frames; a new read-only endpoint set is needed to serve the frozen RESQ-5 replay results (metrics, baselines, footprints) to the replay/evidence screen — these are static files today, not an API.
- **Defer (out of scope for this redesign):** plans/teams/admin/alerts-rules/assistant — real but unbacked by data; do not build UI that implies they are live operational features yet.

## 5. Could not verify in this pass
- Whether the PostGIS database currently holds any seeded data beyond the three dev users (not inspected live, only route/model code read).
- Whether `INDIAN_RUNTIME` fuel work has progressed since the evidence file cited in RESQ4_SPREAD_TEST.md §5 — only the cited blocked status was found; no newer file exists in this repo.
- Licence terms for any satellite basemap provider — none evaluated against this project's hosting/attribution needs; treat as open until someone checks.
