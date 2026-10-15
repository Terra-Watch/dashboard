# API contract: `POST /api/redesign/spread`

RESQ-6 Step 3. Backend + API contract only — no frontend. The response's GeoJSON `level` keys
(`likely`/`possible`/`unlikely`) are keys, not display copy; wording belongs to the
`resq9/product-pass` track. Synchronous, target <2 s, no job queue. This replaces the Cell2Fire
path (`/spread/jobs`, `cell2fire_spread.py`) as the product's spread view — that path failed its
development-set gate (`docs/simulation/RESULTS_DEV.md`, `docs/simulation/FALLBACK.md`) and is
disabled by default (`CELL2FIRE_ENABLED=false`).

## Auth

`Authorization: Bearer <access token>`. Allowed roles: `control_room_operator`,
`incident_commander`, `admin` — same role set the existing `/api/redesign/incidents/{id}/scenario`
endpoint uses. Written against `docs/product/AUDIT_LOG.md` / `resq9/product-pass`'s
`security.py`/`permissions.py` contract via a thin local `TODO-MERGE` shim
(`backend/app/core/auth_shim.py`) — swap the import at merge time, no call-site change needed.
Every call writes one audit-log entry (`action="spread_computed"`, `entity_type="incident"`)
through `backend/app/services/audit_log_shim.py` (also `TODO-MERGE`).

## Request

```json
{
  "incident_id": "E2023-084925",           // OR latitude+longitude+start_time, never both
  "latitude": 19.3,
  "longitude": 83.9,
  "start_time": "2023-03-10T07:00:00Z",
  "horizon_h": 24                           // one of 6, 12, 24, 48
}
```

- `incident_id`: resolved via `backend/inference/engine/incidents.get_verified_incident` —
  today, the 4 fixed development/Training incidents only (`data/resq5/protocol_setup.json`);
  unknown id → `422`.
- `latitude`/`longitude`/`start_time`: for a point not tied to a known incident id. Resolved via
  `incidents.nearest_covered_incident` — within 0.05° of a known incident's ignition point **and**
  inside that incident's cached weather window. Outside both → `422` ("outside supported
  coverage"), never a silent nearest-match guess.
- `horizon_h` outside `{6,12,24,48}` → `422`.
- Providing both or neither of the two location paths → `422`.

## Response (200)

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      {"type": "Feature", "properties": {"level": "likely"}, "geometry": {"type": "Polygon", "...": "..."}},
      {"type": "Feature", "properties": {"level": "possible"}, "geometry": {"...": "..."}},
      {"type": "Feature", "properties": {"level": "unlikely"}, "geometry": {"...": "..."}}
    ]
  },
  "inputs": {
    "incident_id": "E2023-084925",
    "latitude": 19.32648, "longitude": 83.93716,
    "start_time": "2023-03-10T07:00:00+00:00",
    "horizon_h": 24,
    "wind_source": "era5land_native (cached CDS wind, data/resq2/E2023-084925; Open-Meteo archive era5_land T/RH)",
    "wind_speed_ms": 0.52,
    "wind_direction_deg": 295.0
  },
  "grid": {"cell_size_m": 142.3, "side_cells": 161, "epsg": 32644},
  "wall_s": 0.048
}
```

- `geojson.features[].properties` is `{"level": ...}` only — no metrics, no probability values,
  no copy. Nothing else is in a feature's properties.
- `inputs` carries exactly what the UI needs for an assumptions panel: which wind source, its
  mean speed/direction over `[start_time, start_time+horizon_h]`, and the resolved start time —
  so the product-pass track can render "Based on {wind_source}, {wind_speed_ms} m/s from
  {wind_direction_deg}°" without this endpoint owning any copy itself.
- `grid` is diagnostic (lets a caller sanity-check resolution); not required by the UI.

## Method

Pure Python, no Cell2Fire, no subprocess (`backend/inference/engine/spread_ellipse.py`):
`engine.baseline.wind_elongated_proximity` (the frozen `PROTOCOL.md` §3(b) formula, **no slope
term** — `docs/simulation/RESULTS_DEV.md`'s Step 3 scoring round found it did not win on more
cells than the no-slope version), Monte-Carlo blurred over 60 members combining ±500 m
ignition-position jitter and per-member wind perturbation (speed ×U(0.7,1.3), direction
+N(0°,15°) — identical scheme to `scripts/resq6/run_dev.py`'s dev-set ensemble), then digitized
into 3 nested bands (`p≥0.5` likely, `0.2≤p<0.5` possible, `0.05≤p<0.2` unlikely) and vectorized
to polygons via `rasterio.features.shapes` (same pattern `redesign_data.py` already uses for
probability bands), reprojected to WGS84.

Deterministic: identical request → identical output (seed derived from
`(lat, lon, start_time, horizon_h)`, or pass `seed` explicitly in code for a fixed test value).

## Wind provider

`backend/inference/engine/wind_provider.get_wind(...)`:
- **Stored/ERA5 (implemented, default)**: reuses `engine.weather.fetch_era5land_historical`'s
  cached CDS data for the 4 Training incidents.
- **Forecast (stub)**: `use_forecast=True` raises `WindUnavailable` — `TODO`, not implemented;
  no new external dependency or network call added this step. Config switch:
  `RESQ_FORECAST_WIND_ENABLED` (env var, default `false`).

## Cell2Fire

Code kept intact at `backend/app/routers/cell2fire_spread.py` (the old `/spread/jobs` +
`/spread/validation`), not mounted by `main.py` unless `CELL2FIRE_ENABLED=true`
(`backend/app/core/config.py`). Removed from the default API surface per the dev-gate failure.

## Tests

`backend/tests/test_spread_ellipse.py` (pure logic): wind elongation direction, calm-wind
near-circular shape, area grows with horizon, level nesting, determinism, runtime <2 s.
`backend/tests/test_spread_endpoint.py` (API contract): permission matrix, response shape, both
location paths, all four `422` cases (bad horizon, both/neither location path, unknown incident,
point outside coverage), runtime <2 s end-to-end.
