# TerraWatch dashboard

The web application of TerraWatch, a wildfire operations platform for India. It connects the people who see a fire, the people who decide what to do, and the people who go to the place. Three roles share one application and one sign-in: **Citizen**, **Ranger** (field crew, range officer) and **Control Room** (operator, incident commander). Languages: English, Hindi, Odia. Installable on a phone.

Product rules, the confidence ladder (Signal, Report, Verified, Responding, Contained, Closed) and the screens are in `docs/PROJECT_OVERVIEW.md` and `docs/PRODUCT_RULES.md`.

## What is in it

| Part | What it shows or does | Where |
|---|---|---|
| Reports | Citizens report smoke or fire with the live camera, place and time; staff verify, assign, and close with a reason | `frontend/src/features/citizen`, `incidents`, `operations`; `backend/app/routers/citizen.py`, `operations.py`, `workflow.py` |
| Field | Rangers accept, visit and record what they find, also offline; roster of who is free | `features/field` |
| Notices and community | Official notices written by one person and approved by a second; moderated community posts | `routers_ext/notices.py`, `features/community` |
| Satellite signals | VIIRS hotspots from FIRMS near the fires; rangers see only their own community | `routers_ext/feeds.py`, `hotspots_near.py`, `services/ingest.py` |
| Fire risk map | Next-day fire risk for every forest cell, in four ranked bands (Low, Moderate, High, Very high), from a daily cloud job | `backend/app/routers/risk.py`, `forecast/` |
| Fire spread | Where an active fire is most likely to burn next within 24 h and 48 h, ranked in bands within 8 km of the fire; a ranking, not a calibrated probability and not wind-driven | `backend/app/routers/fire_spread.py`, `features/firespread`; runs come from `../fire-spread` |
| Stations | Field stations (air quality, position, sound alerts) as seen through the gateway | `routers_ext/stations.py`, `features/stations`; hardware in `../node-firmware`, `../gateway-firmware`, `../relay-firmware` |
| Scenario planner | How far a fire could reach under numbers a planner types | `routers_ext/scenarios.py`, `features/scenarios` |

Not built yet: a layer for known heat sources (industry, kilns, mines) and a detection-quality score on satellite signals (`../docs/15-known-heat-sources-plan.md`, `../docs/16-detection-quality-design.md`).

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

Local accounts for the three experiences are created by a script that generates new passwords on every run. Run it only against the loopback database:

```bash
cd backend
.venv/bin/python scripts/seed_dev_accounts.py --confirm-local
cat .dev-credentials          # ignored by git, mode 600
```

It creates a Citizen, a Ranger and a Control Room account. Use `/citizen/login` for Citizen and `/staff/login` for Ranger or Control Room; the server picks the permitted workspace after sign-in.

## Fire risk data

The map reads the tables `forecast_runs` and `cell_scores` through `/api/risk/geojson` and `/api/risk/status`; the map shows "stale" after 36 hours without a new run. The daily job (`forecast/`, GitHub Actions at 11:40 UTC) fetches fire history and weather from open sources, scores every forest cell with the model bundle and imports the run; setup, secrets and the state release are in `forecast/README.md`. For a local run, point `RISK_MODEL_BUNDLE` in `backend/.env` at a bundle, or load one archived day with `cd backend && python -m inference.import_replay <YYYY-MM-DD>` (needs `grid/cells.geojson` in the bundle).

## Fire spread data

The backend serves, read-only, the files written by `../fire-spread/scripts/34_score_active.py`. Copy a run folder (`events.json`, `<event>_<24|48>h.geojson`, `<event>_pixels.geojson`) and `skill.json` into `backend/runtime_data/fire_spread/`, or set `FIRE_SPREAD_DIR`. Access: range officer, control room operator, incident commander; rangers see only fires in their community. Every response carries the note that this is a ranking.

## Tests

```bash
cd backend && pytest                       # backend suite (needs PostgreSQL, see docs/)
cd frontend && npm run test:unit           # palette check and unit tests
cd frontend && npx playwright test         # browser tests (citizen report, map, field, ops, languages, PWA, ...)
cd frontend && npm run build && npm run budget && npm run i18n
```

Limits to know: the live camera and compass were tried on a desktop browser only, not on a real phone (`docs/WHERE_IS_IT.md`); the fire-evidence assessor is experimental and switched off by default (`docs/fire_evidence_integration.md`).

## More

`docs/ARCHITECTURE.md` (structure), `docs/WHERE_IS_IT.md` (where each feature lives), `docs/STATIONS_DESIGN.md`, `docs/FORECAST_PRODUCTION_PLAN.md`, `docs/FOREST_BOUNDARY_LAYERS_PLAN.md`, `docs/SCIENTIFIC_VALIDATION_GATE.md`.
