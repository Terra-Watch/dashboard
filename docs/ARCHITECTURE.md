# Architecture

Updated 2026-11-11. For what the product is, see the root README; for components and data flow, `../../docs/01-scope-and-architecture.md`.

**Frontend** (`frontend/`): React, Vite, TypeScript, Tailwind, MapLibre GL with a self-hosted PMTiles basemap, TanStack Query, i18next (English, Hindi, Odia). A PWA with three workspaces: `/ops` (control room), `/field` (ranger), `/citizen` (secondary). Navigation has at most seven items; on a phone the bar shows four and puts the rest under More, with the primary Capture button in the middle for rangers. Features live in `src/features/<name>`: `forecast`, `fires`, `stations`, `outlook` and `firespread` (Past fires), `ops`, `field`, `incidents`, `citizen`, `community`, `map`.

**Backend** (`backend/app`): FastAPI and SQLAlchemy on PostgreSQL. Routers in `routers/` (incidents and workflow, risk, area forecast, fire spread, active fires) and `routers_ext/` (feeds and hotspots, stations, notices, bearings and others). Services in `services/` hold the logic that does not touch the database and is tested alone (`active_fires.py`, `station_rules.py`, `places.py`, `hotspot_quality.py`). Tables are created at start by the idempotent modules of `schemas_ext/`. Access is default-deny and scoped by state and community; the audit log is written in the same transaction as the action.

**Jobs** (`forecast/`, `.github/workflows/`): the daily forecast (11:40 UTC) and the hotspot ingest and quality job (every 3 h). They post to the backend with a shared secret (`X-Ingest-Token`). File-based runs (area forecast, Past fires) are read from `runtime_data/<name>/` and fall back to the copy shipped in `backend/app/<name>_data/`.

**Auth:** short-lived access tokens with refresh rotation, CSRF on writes, role checks per route, scoped data.

**Tests:** backend unit and route tests (the Postgres-backed ones need a database), frontend unit tests (`npm run test:unit`) and Playwright with axe accessibility checks.
