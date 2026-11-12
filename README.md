# TerraWatch dashboard

The product of TerraWatch: early warning and response for forest fires in India, for forest departments. It forecasts where a fire is likely tomorrow, sorts satellite detections into real fires and false ones, follows the fires that are burning, and puts the next action in front of a person. What the whole project is: the [root README](../README.md).

Roles share one application and one sign-in: **Ranger** (field crew, range officer), **Control Room** (operator, incident commander), **Admin**, and **Citizen** (a secondary input: reports and notices).

Rule: software suggests, people decide. A model never verifies, assigns, dispatches or announces. Anything that becomes an action goes through a person into an ordinary check. The incident ladder (Signal, Report, Verified, Responding, Contained, Closed) is how a check is handled once someone opens it. The product rules are in `docs/PRODUCT_RULES.md`; `docs/PROJECT_OVERVIEW.md` describes the check workflow and the screens.

## What is in it

| Part | What it shows or does | Where |
|---|---|---|
| Fire forecast | Tomorrow's chance of a fire detected in each 55 km area, a level (none 0 %, moderate 10 %, high 30 %, extreme 60 %), what is usual for the week, places to look, suggested actions, and yesterday's record. Ranger card (today and tomorrow) and control-room board. | `backend/app/routers/area_forecast.py`, `features/forecast`; the daily job in `forecast/` |
| Satellite | Every VIIRS detection, sorted into likely fire, unconfirmed, known heat source and outside forest, with the reason in words. Nothing is hidden; groups can be switched on. | `routers_ext/feeds.py`, `services/hotspot_quality.py`, `features/ops/SatellitePage.tsx`, `features/ops/satelliteGroups.ts`; `forecast/live/post_hotspot_quality.py` |
| Active fires | Fires built from the detections (linked at 1 km and 36 h): size, looks, growth, the side it grew toward, nearest named places, who is on it. A board ordered by who needs attention, a fire page with a replay, a ranger list. Send a crew (a check in the queue), warn villages, mark handled, out or not a forest fire. | `routers/active_fires.py`, `services/active_fires.py`, `services/places.py`, `features/fires` |
| Past fires | The spread outlook checked against what burned: four archived fires and the result on every 2025 test fire. Not for live work. | `routers/fire_spread.py`, `features/outlook`, `features/firespread`; runs come from `../fire-spread` |
| Stations | Lookout stations: one sentence per station (smoke against its own normal and its neighbours, haze, fog, sound repeats, silence), a map layer, a Network view for maintenance, a panel on the ranger card, one alert per check. | `routers_ext/stations.py`, `services/station_rules.py`, `features/stations`; hardware in `../node-firmware`, `../gateway-firmware` |
| Checks and field work | A check (from a fire, a station, a report or a phone call) is verified, assigned and closed with a reason; rangers accept, visit and record what they find, also offline. | `routers/operations.py`, `workflow.py`, `features/ops`, `features/field`, `features/incidents` |
| Notices | Official notices written by one person and approved by a second. | `routers_ext/notices.py` |
| Citizen reports and community | Citizens may send reports (place, time, photos) and read notices and the community. A secondary input. | `features/citizen`, `features/community`, `routers/citizen.py` |

Retired: the old fire risk map of four relative bands and the scenario planner (what-if simulator). `/app/whatif` and `/ops/fire-spread` redirect to Past fires.

Not built yet: a live "where it may spread next" for active fires, a growth chance, alerts when a fire grows or comes near a village (`../docs/23-active-fires-redesign.md`).

## Run locally

Create local environment files from the checked-in examples and keep credentials out of the repository:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d          # PostGIS on port 55432
```

Backend (terminal 1):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://resq:resq@localhost:55432/resq uvicorn app.main:app --reload --port 8000
```

Frontend (terminal 2):

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Local accounts for the roles are created by a script that generates new passwords on every run. Run it only against the loopback database:

```bash
cd backend
.venv/bin/python scripts/seed_dev_accounts.py --confirm-local
cat .dev-credentials          # ignored by git, mode 600
```

It creates a Citizen, a Ranger and a Control Room account (the citizen account is only needed to try the secondary report flow). Use `/citizen/login` for Citizen and `/staff/login` for Ranger or Control Room; the server picks the permitted workspace after sign-in.

## Forecast and detection data

Two jobs fill the product, both in GitHub Actions (setup, secrets and the state release: `forecast/README.md`).
- **Daily forecast** (`daily-forecast.yml`, 11:40 UTC): fetches fire history and weather, scores every forest cell with five XGBoost seeds, calibrates the scores into chances, builds the 0.5 degree areas and posts them to `POST /api/area-forecast/runs` (and the cell run to `forecast_runs` and `cell_scores`). The forecast pages show "stale" when the newest run is old. Replay days shipped with the code (`backend/app/area_forecast_data`) are what a read-only deployment shows. The control-room Fire forecast board opens on the **Archive (demo)**: six demo **scenes** (one state on one day: Odisha 10 Mar, Assam 4 Mar, Tamil Nadu 10 Mar, Karnataka 5 Feb, Uttarakhand 18 Feb, Chhattisgarh 24 Apr 2025), served by `GET /api/area-forecast/archive/dates` (with `scenes` and `typical`) and `/archive/{date}`. A scene is small enough to read: the map zooms to the state, and the page says what the forecast got right and wrong there (areas rated High or Extreme that had a fire, fires rated lower = missed, rated areas with no fire = false alarms). They were chosen by `wildfire-ignition-forecasting/scripts/16_archive_pick.py scenes` for agreement (precision and recall of at least 0.7, with at least one miss and one false alarm so both kinds of difference show); the page also says how a typical active day of 2025 did (62 % of High or Extreme areas had a fire, 80 % of areas with a fire were rated High or Extreme). The forecast is drawn on the forest cells the model scored (shaded by the level of their 55 km area) with the fires actually detected as red diamonds; forest cells alone and the 55 km outlines are switchable. The control-room Map has the same **Demo (archive)** mode with the same scenes. A live forecast never carries the detected-fire fields. Detections are per forest square (about 10 km), not exact points. The map's ignition-risk layer replays the same final model: `backend/models/risk` is written by `wildfire-ignition-forecasting/scripts/17_risk_replay_bundle.py` (five-seed mean on the 2025 test year, 7,148 forest cells, 17 states including all of the north-east; the older 2023 to 2024 bundle for six states is kept beside it as `models/risk_legacy_2023_2024`; `backend/models/` is not in git, so rebuild it on each machine). In the demo the forecast is drawn on the forest cells the model scored, shaded by their area's level; the forest cells also show on their own (no rating, no fire), and the 55 km area outlines are optional. The Map and the forecast board can limit fire squares and risk cells to the more forested ones (forest land 50% or more, 80% or more; every scored cell has at least 20%). Pin a replay day with `RISK_FORECAST_DATE=2025-03-18` when there is no live run. The control-room Map has the same **Demo (archive)** mode, with the forecast boxes and the fires switchable and its own key. Switch to **Live** with the buttons, or build with `VITE_FORECAST_VIEW=live` to open on live. A live forecast never carries the detected-fire fields. Detections are per 0.5 degree area, not exact places.
- **Hotspots** (`hotspots.yml`, every 3 h): ingests FIRMS detections, scores each one and posts its group to `POST /api/feeds/hotspots/quality`. Until the quality job has run, a detection has no group and is shown as unconfirmed.

Active fires are computed from `resq_hotspots` and `resq_hotspot_quality` when the page is read (cached for a minute); marks are kept in `resq_fire_marks`. Tables are created by `backend/app/schemas_ext/` (each module is idempotent and runs at start).

## Past fires data

The backend serves, read-only, the run folder written by `../fire-spread/scripts/62_outlook_run.py` (`events.json`, `<event>_48h.geojson`, burned and places files, `skill.json`). The shipped run is in `backend/app/fire_spread_data/`; a newer one in `backend/runtime_data/fire_spread/` (or `FIRE_SPREAD_DIR`) wins. Access: range officer, control room operator, incident commander. Every response carries the note that this is a ranking.

## Tests

```bash
cd backend && pytest                       # backend suite (needs PostgreSQL, see docs/)
cd frontend && npm run test:unit           # palette check and unit tests
cd frontend && npx playwright test         # browser tests (forecast, fires, stations, satellite, map, field, ops, languages, PWA, ...)
cd frontend && npm run build && npm run budget && npm run i18n
```

Limits to know: the live camera and compass were tried on a desktop browser only, not on a real phone (`docs/WHERE_IS_IT.md`); the fire-evidence assessor is experimental and switched off by default (`docs/fire_evidence_integration.md`).

## More

`docs/ARCHITECTURE.md` (structure), `docs/WHERE_IS_IT.md` (where each feature lives), `docs/STATIONS_DESIGN.md`, `docs/FORECAST_PRODUCTION_PLAN.md`, `docs/FOREST_BOUNDARY_LAYERS_PLAN.md`, `docs/SCIENTIFIC_VALIDATION_GATE.md`.
