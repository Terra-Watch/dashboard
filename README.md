<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/brand/logo-on-dark.svg">
  <img src="frontend/public/brand/logo.svg" alt="TerraWatch" height="64">
</picture>

# TerraWatch dashboard

The web application of [TerraWatch](https://github.com/Terra-Watch): forest fire forecast, spread outlook and monitoring for India's forest departments.

[**Live site**](https://terra-watch-tawny.vercel.app) &nbsp;·&nbsp; [Product rules](docs/PRODUCT_RULES.md) &nbsp;·&nbsp; [Architecture](docs/ARCHITECTURE.md) &nbsp;·&nbsp; [Where is it](docs/WHERE_IS_IT.md)

<img alt="React 19" src="https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
<img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white">
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-0F172A?logo=tailwindcss&logoColor=38BDF8">
<img alt="MapLibre GL" src="https://img.shields.io/badge/MapLibre_GL-396CB2?logo=maplibre&logoColor=white">
<img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white">
<img alt="PostGIS" src="https://img.shields.io/badge/PostgreSQL_+_PostGIS-4169E1?logo=postgresql&logoColor=white">
<img alt="Playwright" src="https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white">
<img alt="PWA" src="https://img.shields.io/badge/PWA-offline-5A0FC8?logo=pwa&logoColor=white">

<img src="docs/readme/map.png" alt="The control-room map for Odisha on 10 March 2025: forest cells shaded by forecast level, detected fires as diamonds, and the legend" width="94%">

<sub>The control-room map in demo mode: the forecast issued for 10 March 2025 over Odisha, with the fires the satellite detected that day.</sub>

</div>

---

One application and one sign-in for four roles: **Ranger** (field crew, range officer), **Control Room** (operator, incident commander), **Admin**, and **Citizen** (a secondary input: reports and notices). It runs in English, Hindi and Odia, and the ranger pages work offline.

> **The rule the whole product follows:** software suggests, people decide. A model never verifies, assigns, dispatches or announces. Anything that becomes an action goes through a person into an ordinary check.

## What you see

### Fire forecast

<table>
<tr>
<td width="56%" valign="top"><img src="docs/readme/board.png" alt="The forecast board for Odisha, 10 March 2025"></td>
<td width="44%" valign="top">

Tomorrow's chance of a detected fire in each 55 km forest area, as a level with the places to look, what is usual for the week, suggested actions and yesterday's record.

The banner on this archived day reads: 41 areas rated High or Extreme, 31 of them had a fire, 2 fires were rated lower (missed), 10 rated areas had no fire (false alarms).

<img src="docs/readme/levels.png" alt="Share of area-days with a detected fire per level in 2025: None 0.7%, Moderate 17.2%, High 41.5%, Extreme 80.7%">

`backend/app/routers/area_forecast.py` · `frontend/src/features/forecast` · the daily job in `forecast/`

</td>
</tr>
</table>

### Past fires: the spread outlook

<table>
<tr>
<td width="44%" valign="top">

For a burning fire, the forest cells within 8 km ranked in three bands for the next one to two days, with the people, villages and roads in each band, checked against what the satellite later saw burned.

Across 244 test fires of 2025 a typical fire burned 1.9 km², and the top band covered 75% of it. Choosing the nearest cells first covered 50%.

It shows archived fires. It is a ranking of where, not a forecast of when.

`backend/app/routers/fire_spread.py` · `frontend/src/features/outlook` · runs come from [fire-spread-model](https://github.com/Terra-Watch/fire-spread-model)

</td>
<td width="56%" valign="top"><img src="docs/readme/past.png" alt="The Past fires page: a fire near Bussapur, Telangana, with three bands, what burned, and the people and villages in each band"></td>
</tr>
</table>

### Everything else

| Part | What it shows or does | Where |
|---|---|---|
| **Satellite** | Every VIIRS detection, sorted into likely fire, unconfirmed, known heat source and outside forest, with the reason in words. Nothing is hidden; groups can be switched on. | `routers_ext/feeds.py`, `services/hotspot_quality.py`, `features/ops/SatellitePage.tsx` |
| **Active fires** | Fires built from detections (linked at 1 km and 36 h): size, growth, the side it grew toward, nearest named places, who is on it. A board ordered by who needs attention, a fire page with a replay. Send a crew, warn villages, mark handled, out or not a forest fire. | `routers/active_fires.py`, `services/active_fires.py`, `features/fires` |
| **Stations** | One sentence per lookout station (smoke against its own normal and its neighbours, haze, fog, sound repeats, silence), a map layer, a Network view for maintenance. | `routers_ext/stations.py`, `services/station_rules.py`, `features/stations` |
| **Checks and field work** | A check (from a fire, a station, a report or a phone call) is verified, assigned and closed with a reason. Rangers accept, visit and record what they find, also offline. | `routers/operations.py`, `workflow.py`, `features/ops`, `features/field` |
| **Notices** | Official notices written by one person and approved by a second. | `routers_ext/notices.py` |
| **Citizen reports and community** | Reports with place, time and photos; notices; community spaces. | `features/citizen`, `features/community`, `routers/citizen.py` |

Retired: the old four-band fire risk map and the what-if simulator. `/app/whatif` and `/ops/fire-spread` redirect to Past fires.

## How the data flows

```mermaid
flowchart LR
  subgraph JOBS["GitHub Actions"]
    D["daily-forecast.yml<br/>11:40 UTC"]
    H["hotspots.yml<br/>every 3 h"]
  end
  FIRMS["NASA FIRMS"] --> H
  FIRMS --> D
  WX["Weather: ERA5-Land, GFS"] --> D
  D -- "POST /api/area-forecast/runs" --> API
  H -- "POST /api/feeds/hotspots/quality" --> API
  GW["LoRa gateway"] -- "station_bridge.py" --> API
  SP["fire-spread run folder"] --> API
  API["FastAPI"] <--> DB[("PostGIS")]
  API --> WEB["React PWA"]
  WEB --> R["Ranger"]
  WEB --> C["Control room"]
  WEB --> Z["Citizen"]
```

- **Daily forecast.** Fetches fire history and weather, scores every forest cell with five XGBoost seeds, calibrates the scores into chances and builds the 0.5 degree areas. The forecast pages show "stale" when the newest run is old.
- **Hotspots.** Ingests FIRMS detections, scores each one and posts its group. Until the quality job has run, a detection has no group and is shown as unconfirmed.
- **Active fires** are computed from the detections when the page is read (cached for a minute).
- **Demo (archive).** A read-only deployment shows six archived scenes, one state on one day of 2025 (Odisha 10 Mar, Assam 4 Mar, Tamil Nadu 10 Mar, Karnataka 5 Feb, Uttarakhand 18 Feb, Chhattisgarh 24 Apr), with what the forecast got right and wrong. A live forecast never carries the detected-fire fields.

Setup, secrets and details of the jobs: [`forecast/README.md`](forecast/README.md). The models themselves: [wildfire-ignition-forecasting](https://github.com/Terra-Watch/wildfire-ignition-forecasting).

## Tech stack

| Layer | What |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query, React Router 7, Motion |
| Maps | MapLibre GL, PMTiles, Protomaps basemap, H3 |
| Languages | i18next: English, Hindi (Devanagari), Odia |
| Offline | Service worker and web manifest (PWA); field records are queued and a retry is stored once |
| Backend | FastAPI, SQLAlchemy 2, psycopg 3, PyJWT, Argon2, web push |
| Database | PostgreSQL with PostGIS |
| Geo and imagery | shapely, pyproj, h3, Pillow, OpenCV |
| Tests | pytest (662 tests), Playwright with axe-core (130 browser tests), unit tests, bundle budget and i18n checks |
| Deploy and jobs | Vercel, Docker Compose for local PostGIS, GitHub Actions for the two data jobs |

## Run locally

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

Local accounts are created by a script that generates new passwords on every run. Run it only against the loopback database:

```bash
cd backend
.venv/bin/python scripts/seed_dev_accounts.py --confirm-local
cat .dev-credentials          # ignored by git, mode 600
```

It creates a Citizen, a Ranger and a Control Room account. Use `/citizen/login` for Citizen and `/staff/login` for Ranger or Control Room; the server picks the permitted workspace after sign-in.

<details>
<summary><b>Model files and replay data</b></summary>

- `backend/models/` is not in git; rebuild it on each machine. The map's risk layer replays the final model: `backend/models/risk` is written by `wildfire-ignition-forecasting/scripts/17_risk_replay_bundle.py` (five-seed mean on the 2025 test year, 7,148 forest cells, 17 states).
- Pin a replay day with `RISK_FORECAST_DATE=2025-03-18` when there is no live run. Build with `VITE_FORECAST_VIEW=live` to open on the live view instead of the archive.
- Replay days shipped with the code are in `backend/app/area_forecast_data`. The demo scenes were chosen by `wildfire-ignition-forecasting/scripts/16_archive_pick.py scenes`.
- The Past fires page serves, read-only, the run folder written by `fire-spread/scripts/62_outlook_run.py`. The shipped run is in `backend/app/fire_spread_data/`; a newer one in `backend/runtime_data/fire_spread/` (or `FIRE_SPREAD_DIR`) wins.
- Tables are created by `backend/app/schemas_ext/`; each module is idempotent and runs at start.

</details>

## Tests

```bash
cd backend && pytest                       # needs PostgreSQL, see docs/
cd frontend && npm run test:unit           # palette check and unit tests
cd frontend && npx playwright test         # forecast, fires, stations, satellite, map, field, ops, languages, PWA
cd frontend && npm run build && npm run budget && npm run i18n
```

## Safety and privacy

- Access is limited by state and community on the server, and every state change is written to an audit log.
- Official notices need two people: one writes, one approves.
- Emergency numbers, thresholds and retention periods come from configuration, never from built-in defaults.
- Stored photos have their location data removed; faces in public copies are blurred.
- A missing dot on a map is never evidence that there is no fire, and the views say so.

## Known limits

- The spread outlook is not live: it shows archived 2025 fires. A live "where it may spread next" for active fires is planned in the docs, not built.
- The camera and compass were tried on a desktop browser only, not on a real phone.
- The fire-evidence assessor for citizen photos is experimental and switched off by default ([docs](docs/fire_evidence_integration.md)).
- `npm run budget` currently fails: the bundle is over its size budget.

## More

[`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) (the check workflow and the screens) · [`docs/STATIONS_DESIGN.md`](docs/STATIONS_DESIGN.md) · [`docs/STATIONS_BRIDGE_SETUP.md`](docs/STATIONS_BRIDGE_SETUP.md) · [`docs/FORECAST_PRODUCTION_PLAN.md`](docs/FORECAST_PRODUCTION_PLAN.md) · [`docs/SCIENTIFIC_VALIDATION_GATE.md`](docs/SCIENTIFIC_VALIDATION_GATE.md)

---

<sub>Part of <a href="https://github.com/Terra-Watch">TerraWatch</a>: <a href="https://github.com/Terra-Watch/wildfire-ignition-forecasting">forecast</a> · <a href="https://github.com/Terra-Watch/fire-spread-model">spread outlook</a> · <a href="https://github.com/Terra-Watch/acoustic-ml">sound classifier</a> · <a href="https://github.com/Terra-Watch/node-firmware">station</a> · <a href="https://github.com/Terra-Watch/relay-firmware">relay</a> · <a href="https://github.com/Terra-Watch/gateway-firmware">gateway</a> · <a href="https://github.com/Terra-Watch/terrawatch-datasets">datasets</a>. Basemap and places © OpenStreetMap contributors. Protected-area names: UNEP-WCMC and IUCN (2026), Protected Planet: WDPA and WD-OECM, protectedplanet.net. Forest boundaries and divisions: FSI and Survey of India.</sub>
