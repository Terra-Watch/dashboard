# 10. Backend contract

Read `00_audit.md` §1 backend section first. Screen-driven: one subsection per screen, naming the endpoint(s) it needs, response shape, caching, and offline behaviour. Marks what's kept from the current FastAPI app vs what's new.

## Today (`/today`)

- **Endpoint:** `GET /risk/geojson?target={date}` — **exists** (`backend/app/routers/risk.py`), keep.
- **Response:** GeoJSON FeatureCollection of risk cells, band + rank + drivers per cell. Today's router returns a dict; confirm/extend the schema to guarantee `band`, `rank`, `total_cells`, `drivers[]` fields the Cell panel needs (per `docs/02_screens.md` §5, still valid content requirements).
- **Caching:** cache per date client-side (TanStack Query, 24h staleTime — a day's forecast doesn't change intra-day); server should mark explicitly in the response whether a date is "archived replay" or "live" (today, nothing is live — see `00_audit.md` — so this field should currently always say `archived`, not be omitted).
- **Offline:** last successfully fetched date's GeoJSON cached in IndexedDB/service worker; `OfflineBanner` shows the cached date's timestamp.

## Watch (`/watch`, `/watch/:detectionId`)

- **New endpoints needed:** `GET /detections` (queue, sorted by age/overlap), `GET /detections/{id}`, `POST /detections/{id}/verify`, `POST /detections/{id}/dismiss`. None of these exist today — `operations.py` has `/incidents` and `/alerts` but no detections-queue endpoint.
- **Data source:** the existing per-incident `viirs_detections.csv` files are a demo dataset, not a live feed; a real build needs a VIIRS/FIRMS ingestion job (noted as a gap in `docs/05_prototype_gap_analysis.md` §B) — until that exists, this endpoint should serve the 4 demo incidents' detections as explicitly labeled sample data, not pretend to be live.
- **Caching:** short staleTime (minutes), this is the most time-sensitive screen.
- **Offline:** read-only degrade with `OfflineBanner`; this is a desk role, full offline support is not required (see `03_flows.md`).

## Field (`/field`, `/field/:taskId`)

- **New endpoints needed:** `GET /field/tasks` (assigned verification tasks), `POST /field/tasks/{id}/verify` (multipart: photo + note + GPS + timestamp).
- **Offline sync model:** client-side queue (IndexedDB) of pending submissions; service worker background sync retries `POST` on reconnect; each queued item tracked by the `SyncQueue` component's states (queued/syncing/synced/failed). This is new work — nothing in `operations.py` today handles offline-queued multipart submissions with retry.
- **Caching:** task list and its map tiles/boundaries must be fetched and cached *before* going offline (explicit "download for offline" affordance, akin to `docs/02_screens.md` §14's "Offline data" settings concept, scoped down to just the assigned task here).

## Incidents (`/incidents`, `/incidents/:id`)

- **Endpoints:** `GET /incidents`, `POST /incidents`, `GET /incidents/{id}`, `PATCH /incidents/{id}/status` — **exist** (`operations.py`), keep, but currently backed by dev-seeded data only; needs a real write path from Watch's verify action.
- **New:** the verify action in Watch should be what actually calls `POST /incidents` (today nothing calls it from a detection-verification flow).

## Incident scenario (`/incidents/:id/scenario`)

- **Endpoint:** `POST /spread/jobs` — **exists**, keep the shape (lat/lon/duration in, status/frames out per `SpreadPage.tsx`), but **extend**: must accept a `wind_source` parameter (`era5land_native` | `era5_025` | `best_match`) and must return, alongside the sim frames, the two baseline overlays (proximity disc, circle-of-final-area — only for replay, not live since it needs the final area) and the assumptions payload (fuel crosswalk note, weather note, terrain note) so the frontend never has to hardcode those strings.
- **For the 4 replay incidents specifically:** results are already fully precomputed in `results/resq5/<incident>/` (`burn_count_*.npz`, `observed_footprints.npz`, `summary.json`, metrics CSVs) — serve these as **static files via a new read-only endpoint** (e.g. `GET /replay/{incident_id}`) rather than re-running Cell2Fire on every page load.
- **Caching:** live scenario runs are not cached (each run is explicit, user-triggered); replay data is static and can be cached aggressively (it will not change).
- **Offline:** scenario running requires connectivity (stated plainly in the UI per `06_simulation_ui.md`); a last-viewed scenario result can be cached read-only.

## Replay (`/replay`, `/replay/:incidentId`)

- **New endpoint:** `GET /replay/{incident_id}` returning the full per-overpass metrics table (AUC/AP/IoU/precision/recall/area ratio, sim vs both baselines), wind-source sensitivity table, and the "honest conclusions" text — sourced directly from `results/resq5/<incident>/*.csv`/`.json` and `docs/RESQ5_RESULTS.md`, not recomputed or re-derived differently.
- **Caching:** static, cache indefinitely (invalidate only on a new deploy/data update).
- **Offline:** small payload, safe to pre-cache for offline viewing (useful for a reviewer without reliable signal).

## Auth / roles

- **Exists:** `POST /login`, JWT, three dev-seeded roles (admin/officer/viewer) in `backend/app/main.py`/`auth.py`. **Open decision** (see `04_information_architecture.md`): whether the pilot/demo build needs real authenticated roles mapped to this redesign's five user types, or whether a client-side `RoleSwitcher` (no auth change) is sufficient for now. If real roles are needed, the existing admin/officer/viewer model needs remapping to officer/operator/field-crew/commander/reviewer, which is a schema change, not just a frontend one.

## Explicitly deferred (not part of this contract)

- `operations.py`'s `/plans`, `/plans/{id}/route`, `/alerts/rules`, `/admin/overview`, `/reports/summary`, `/notifications` — real endpoints, but no screens in this redesign's scope use them yet (per `04_information_architecture.md`, teams/plans/admin are out of scope). Leave them as-is; do not build new UI against them without a separate scoping pass.
