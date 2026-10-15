# RESQ-6 Integration contracts

This document records the exact interfaces required from the `resq9/product-pass`
and `resq8/firms-ingestion` branches before the spread endpoint can operate on
real, live incidents. It is the authoritative merge checklist for this branch.

**Until all four blockers below are resolved, the endpoint is safe for
Training/prototype use only — not for live incident operations.**

---

## Blocker 1 — Real authentication and role enforcement

**Owning branch:** `resq9/product-pass`

### What exists today (shim)

`backend/app/core/auth_shim.py` provides:

```python
def current_redesign_user(credentials) -> dict:
    """Decodes a JWT signed with RESQ_SECRET_KEY; extracts user_id and role."""

def require_roles(*roles: str) -> Dependency:
    """Returns a FastAPI Depends() that enforces role membership. Fully functional."""

def require_scope(user, state, *, entity_type, entity_id) -> None:
    """TODO-MERGE: NO-OP. Does NOT enforce per-division/state scope."""

def make_access_token(user_id, role) -> str:
    """TEST-ONLY: mints a JWT with the dev secret. Delete at merge."""
```

`require_roles` is real — it verifies the JWT and checks role membership.
`require_scope` is a **no-op stub**: any authenticated user with the right role
can compute spread for any incident in any state, regardless of their assigned
division or range.

### What is needed from resq9

```python
# backend/app/core/security.py  (resq9 owns this file)
def current_redesign_user(credentials: HTTPAuthorizationCredentials | None) -> dict:
    """Same signature. Must populate at minimum: user_id (int), role (str),
    scopes (list[str]) — where each scope is 'state:XX' or 'division:YY'."""

def require_roles(*roles: str):
    """Same signature. Already compatible."""

# backend/app/core/permissions.py  (resq9 owns this file)
def require_scope(user: dict, state: str, *, entity_type: str, entity_id: str) -> None:
    """Must raise HTTP 403 if the user's scopes do not include the incident's
    state. Consults resq_user_scopes table (resq9 migration)."""
```

### Merge action (this branch)

In `backend/app/routers/spread.py`, replace:
```python
from ..core.auth_shim import require_roles, require_scope
```
with:
```python
from ..core.security import require_roles, current_redesign_user
from ..core.permissions import require_scope
```

No other call-site changes are needed — the function signatures are identical.
Delete `backend/app/core/auth_shim.py` and `make_access_token` at merge time.

---

## Blocker 2 — Real audit logging

**Owning branch:** `resq9/product-pass`

### What exists today (shim)

`backend/app/services/audit_log_shim.py` writes to a local SQLite file
(`runtime_data/audit_log_shim.sqlite3`). Not the production `resq_audit_log` table.

```python
def write_audit_log(
    *, user_id: int, device_id: str | None, action: str,
    previous_state: str | None, entity_type: str, entity_id: str,
    metadata: dict | None,
) -> None: ...
```

### What is needed from resq9

```python
# backend/app/services/audit_log.py  (resq9 owns this file)
def write_audit_log(
    *, user_id: int, device_id: str | None, action: str,
    previous_state: str | None, entity_type: str, entity_id: str,
    metadata: dict | None,
) -> None:
    """Writes one row to resq_audit_log (Postgres). Same keyword signature."""
```

### Merge action (this branch)

In `backend/app/routers/spread.py`, replace:
```python
from ..services.audit_log_shim import write_audit_log
```
with:
```python
from ..services.audit_log import write_audit_log
```

Delete `backend/app/services/audit_log_shim.py` at merge time.

### Audit event emitted by the spread endpoint

```python
write_audit_log(
    user_id=user["user_id"],
    device_id=user.get("device_id"),
    action="spread_computed",
    previous_state=None,
    entity_type="incident",
    entity_id=incident_id,          # str
    metadata={
        "horizon_h": payload.horizon_h,
        "wind_source": wind.source,
        "lat": lat,
        "lon": lon,
    },
)
```

---

## Blocker 3 — Real verified-incident lookup

**Owning branch:** `resq8/firms-ingestion` + `resq9/product-pass`

### What exists today (stub)

`backend/inference/engine/incidents.py` has `get_verified_incident(incident_id)`
backed by 4 hardcoded development incidents from `data/resq5/protocol_setup.json`.
Any other ID returns `None` → HTTP 422.

### Actual RESQ8 schema (verified from resq8/firms-ingestion `8ff0e71`)

```sql
CREATE TABLE resq_incident_candidates (
    id                BIGSERIAL PRIMARY KEY,   -- integer, NOT text
    state             TEXT NOT NULL,
    label             TEXT NOT NULL,
    centroid          geometry(Point, 4326) NOT NULL,  -- PostGIS, NOT lat/lon columns
    bbox              geometry(Polygon, 4326) NOT NULL,
    first_detected_at TIMESTAMPTZ NOT NULL,
    last_detected_at  TIMESTAMPTZ NOT NULL,
    detection_count   INTEGER NOT NULL DEFAULT 0
);
```

**⚠ Schema discrepancies found** (previous INTEGRATION_CONTRACTS.md was a placeholder):

| RESQ6 expects | RESQ8 actual | Resolution needed |
|---|---|---|
| `id TEXT` (incident slug like "E2023-084925") | `id BIGSERIAL` (integer) | RESQ6 must use string cast: `str(id)` as incident_id |
| `centroid_lat FLOAT`, `centroid_lon FLOAT` | `centroid geometry(Point, 4326)` | Extract: `ST_Y(centroid)`, `ST_X(centroid)` |
| No such column | `label TEXT` | Available; can use for display, not required by the protocol |
| `first_detected_at TIMESTAMPTZ` | `first_detected_at TIMESTAMPTZ` | ✓ Direct match |
| `last_detected_at TIMESTAMPTZ` | `last_detected_at TIMESTAMPTZ` | ✓ Available; RESQ6 doesn't use it |
| `state TEXT` | `state TEXT` | ✓ Direct match |
| No such column | `detection_count INTEGER` | Available; not required by RESQ6 |

RESQ6's `_Location` dataclass also uses `t0_utc` and `weather_rows_hours` (for ERA5 wind
window selection) — these are NOT in `resq_incident_candidates`. For live incidents using
forecast wind (Blocker 4), `t0_utc` becomes `datetime.now(utc)` and `weather_rows_hours`
is no longer needed. The `_Location` dataclass will need to distinguish Training
(t0 from cached data) from Live (t0 = now) in its fields or the calling code.

### Actual RESQ9 audit log schema (verified from resq9/product-pass `d27ecf7`)

```sql
CREATE TABLE resq_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id      INTEGER REFERENCES resq_users(id),
    device_id    TEXT,
    action       VARCHAR(60) NOT NULL,   -- 'verify' | 'dismiss' | 'escalate' | ...
    previous_state TEXT,
    entity_type  VARCHAR(30) NOT NULL,   -- 'detection' or 'candidate'
    entity_id    TEXT NOT NULL,          -- string id of the detection or candidate
    metadata     JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX resq_audit_log_entity_idx ON resq_audit_log (entity_type, entity_id, occurred_at DESC);
```

### Exact SQL for get_verified_incident() replacement

A candidate is verified when the latest `resq_audit_log` entry for
`entity_type='candidate'` and `entity_id=str(candidate_id)` has `action='verify'`.

```sql
-- get_verified_incident(incident_id: str) -> _Location | None
-- incident_id here is str(resq_incident_candidates.id)

SELECT
    c.id,
    ST_Y(c.centroid)  AS latitude,
    ST_X(c.centroid)  AS longitude,
    c.state,
    c.label,
    c.first_detected_at
FROM resq_incident_candidates c
WHERE c.id = :candidate_id
  AND EXISTS (
      SELECT 1 FROM resq_audit_log a
      WHERE a.entity_type = 'candidate'
        AND a.entity_id   = :candidate_id_str
        AND a.action      = 'verify'
        AND a.occurred_at = (
            SELECT MAX(occurred_at) FROM resq_audit_log
            WHERE entity_type = 'candidate'
              AND entity_id   = :candidate_id_str
        )
  )
LIMIT 1
```

Or equivalently, using resq9's `get_latest_action()` helper:

```python
from app.services.audit_log import get_latest_action  # resq9

def get_verified_incident(incident_id: str) -> _Location | None:
    # incident_id is str(candidate_id)
    latest = get_latest_action("candidate", incident_id)
    if latest is None or latest.action != "verify":
        return None
    # Fetch geometry from DB
    with engine.connect() as db:
        row = db.execute(text(
            "SELECT ST_Y(centroid) AS lat, ST_X(centroid) AS lon, "
            "state, first_detected_at FROM resq_incident_candidates WHERE id=:id"
        ), {"id": int(incident_id)}).mappings().first()
    if row is None:
        return None
    return _Location(
        incident_id=incident_id,
        latitude=float(row["lat"]),
        longitude=float(row["lon"]),
        first_detected_at=row["first_detected_at"],
        t0_utc=row["first_detected_at"],   # Live: t0 = detection time, not fixed offset
        weather_rows_hours=48,              # Live: use maximum forecast window
        state=row["state"],
    )
```

### RESQ8 t0_utc gap

RESQ8's `resq_incident_candidates` has `first_detected_at` but no `t0_utc` column.
RESQ6's `_Location` uses `t0_utc` to select the ERA5 wind window. For live incidents:
- `t0_utc` will be `first_detected_at` (first VIIRS detection, consistent with RESQ-5 protocol).
- ERA5 wind is only available for the 4 cached Training incidents; live incidents must use
  forecast wind (Blocker 4).

This is an expected, documented gap — not a defect. The `weather_rows_hours` field in
`_Location` is only meaningful for the Training path; the Live path doesn't use it.

### Required interface (updated)

```python
# backend/inference/engine/incidents.py  (this branch owns this file)
def get_verified_incident(incident_id: str) -> _Location | None:
    """Query resq_incident_candidates filtered by latest audit-log action='verify'.
    Returns None if unknown, not verified, or if verification was dismissed.
    incident_id is str(resq_incident_candidates.id) — an integer cast to string."""
```

### Merge action (this branch)

Replace the hardcoded stub body of `get_verified_incident` with the DB query above.
Also remove `_SETUP` and `weather_rows_hours` from the Live path (they are
Training-only artifacts).

The `nearest_covered_incident` function must also be updated to query
`resq_incident_candidates` — but it remains Training-only (lat/lon path is not used
for Live incidents where an `incident_id` is always provided).

---

## Blocker 4 — Live forecast wind routing in the spread endpoint

**Owning this branch:** `backend/app/routers/spread.py`

**Status: Verified still deferred. Regression test added.**

The spread router always calls `get_wind(..., use_forecast=False)` — confirmed by
`tests/test_spread_integration_readiness.py::ForecastRoutingTests::test_get_wind_is_called_with_use_forecast_false`.
Setting `RESQ_FORECAST_WIND_ENABLED=true` in the environment does NOT change this
behaviour — the router does not read that flag; it is hardcoded. Training incidents
continue to succeed even if the env flag is set (verified by
`test_training_incident_succeeds_even_if_forecast_env_set_true`).

### What needs to change

```python
# backend/app/routers/spread.py  line ~58
# Current:
wind = get_wind(lat, lon, start_utc, hours=max(payload.horizon_h, 6),
                incident_id=incident_id, use_forecast=False)

# Required for live incidents:
use_live = incident_id is not None  # live path uses forecast; Training path uses ERA5
wind = get_wind(lat, lon, start_utc, hours=max(payload.horizon_h, 6),
                incident_id=incident_id,
                use_forecast=use_live and FORECAST_PROVIDER_ENABLED)
```

When `RESQ_FORECAST_WIND_ENABLED=false` (default), this is a no-op — the
Training path (ERA5 cached) is the only path that works. When enabled, live
incidents use Open-Meteo forecast; Training incidents still use ERA5.

This change is deliberately NOT made here because:
1. Live incident lookup (Blocker 3) must land first — routing to live forecast
   while the incident stub returns hardcoded Training coordinates would silently
   run a forecast over the wrong location.
2. End-to-end testing of the live path requires Blockers 1–3 to be resolved.

---

## Summary: files that change at merge time

| File | Change | Owner |
|---|---|---|
| `backend/app/routers/spread.py` | Replace 2 imports; add forecast routing | This branch |
| `backend/app/core/auth_shim.py` | **Delete** | This branch (after resq9 lands) |
| `backend/app/services/audit_log_shim.py` | **Delete** | This branch (after resq9 lands) |
| `backend/inference/engine/incidents.py` | Replace stub with DB query (see Blocker 3 exact SQL) | This branch (after resq8+resq9 land) |
| `backend/app/core/security.py` | Already exists on resq9 with matching signatures | `resq9/product-pass` ✓ |
| `backend/app/core/permissions.py` | Already exists on resq9 with `require_scope` | `resq9/product-pass` ✓ |
| `backend/app/services/audit_log.py` | Already exists on resq9 with `write_audit_log` | `resq9/product-pass` ✓ |
| DB migration: `resq_incident_candidates` | Already committed on resq8 (BIGSERIAL id, PostGIS centroid) | `resq8/firms-ingestion` ✓ |
| DB migration: `resq_audit_log` | Already committed on resq9 | `resq9/product-pass` ✓ |
| DB migration: `resq_user_scopes` | Already committed on resq9 | `resq9/product-pass` ✓ |

**Integration isolation tests (already passing):**
`backend/tests/test_spread_integration_readiness.py` — 11 tests covering:
- Forecast routing locked to use_forecast=False (Blocker 4 invariant)
- Mocked incident lookup produces valid GeoJSON (endpoint logic isolated from stub)
- Unknown/unverified incident returns 422
- WindUnavailable propagates as 422 (covers future live-path failure mode)

---

## What the spread endpoint can safely do today (Training path)

| Operation | Safe? | Notes |
|---|---|---|
| Resolve Training incident by ID | Yes | 4 hardcoded incidents only |
| Fetch ERA5-Land cached wind | Yes | No network call for wind |
| Compute ellipse contours | Yes | Pure Python, deterministic |
| Check role (control_room_operator / incident_commander / admin) | Yes | JWT enforced |
| Check per-division scope | No | Shim is no-op |
| Write audit log | Prototype only | SQLite, not production DB |
| Return GeoJSON with wind assumptions | Yes | Inputs panel accurately reflects actual wind used |

## What requires the blockers to be resolved (Live path)

| Operation | Blocked by |
|---|---|
| Accept a new live incident ID | Blocker 3 (resq8 + resq9) |
| Fetch real-time forecast wind | Blocker 4 (this branch, after Blocker 3) |
| Enforce per-division access | Blocker 1 (resq9) |
| Persist audit event | Blocker 2 (resq9) |
