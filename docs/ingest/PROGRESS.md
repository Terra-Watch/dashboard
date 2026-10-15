# FIRMS ingestion — progress log

Branch: `resq8/firms-ingestion`, forked from `redesign-v2`. Goal: live VIIRS
detection feed behind `INGEST_LIVE` (default `false`), serving the existing
`/api/redesign/detections` Watch contract. Concurrent/unrelated work on
`resq6/simulation-engine` and `docs/sim_diagnosis/` is out of scope and not
touched.

## Step 0 — design (this step)
- [x] Read existing `/api/redesign/detections` + `/detections/{id}/actions`
      + `/detections/{id}/history` endpoints (`backend/app/routers/redesign.py`).
- [x] Read `redesign_data.list_detections` (current demo shape) and
      `redesign_store.py` (SQLite demo triage-audit store).
- [x] Read the frontend `Detection` TS contract (`frontend/src/redesign/lib/types.ts`)
      and `WatchPage.tsx`'s actual fetch/mutation calls.
- [x] Read `docs/redesign/10_backend_contract.md` §Watch and §Replay-adjacent
      sections, `00_audit.md`/`09_trust_rules.md` for the six Bar-v3 fit
      states and the "no zero-shot states" ruling.
- [x] Confirmed Postgres+PostGIS is already provisioned
      (`docker-compose.yml`, `backend/app/database/session.py`) and is where
      new tables belong, separate from the SQLite demo store.
- [x] Confirmed env-var pattern (`os.getenv("RESQ_X")`, documented in
      `backend/.env.example`, nothing committed) and that `backend/runtime_data/`
      and `.env` are already gitignored.
- [x] Wrote `docs/ingest/00_design.md` covering: FIRMS endpoints/satellites,
      area (per-state bbox, justified), polling interval (20 min),
      latency (honest 3-14h range), dedup key, clustering (1.5km / 12h,
      justified), confidence/FRP handling, PostGIS schema, raw-archive
      policy, audit log schema (explicit `previous_state` column), outage/
      staleness behaviour (`/ingest/health`, 6h stale threshold), and the
      exact Watch-contract compatibility mapping.
- [x] Committed `docs/ingest/00_design.md` + this log.

**What could not be checked:** FIRMS's actual area-size cap / rate limit
(no live call made yet — that's Step 2, gated on a key being available);
whether all three VIIRS NRT sources report confidence identically. Both
flagged as open items in the design doc itself.

**STOPPED HERE per instructions.** Awaiting explicit approval before Step 1
(build). No ingestion code written yet.

## Step 0 — amendments (design approved with changes, still holding)
Coordinator relayed: design approved, with two amendments, do **not** start
Step 1 yet.
- [x] §4 (latency): recorded the exact required Watch copy string —
      "Satellite data arrives with a delay of a few hours." — as a documented
      dependency for `resq9/product-pass`, which owns Watch's UI copy. Not
      implemented by this branch.
- [x] §8/§8a (audit log): removed the standalone `resq_triage_audit_log`
      table from this feature's schema. Verify/dismiss/escalate state
      changes now write through `resq9/product-pass`'s real audit log
      (their auth/permission system), not a second log built here. §8a
      documents the dependency and the exact shape (fields, entity keys,
      "latest status per entity" read path) needed from resq9's system,
      since its schema/interface isn't finalized yet.
- [x] Committed the revised `docs/ingest/00_design.md`.

**Holding — do not start Step 1 build work.** The user is waiting on a
separate audit (`resq10/ranking-audit`) to report back before giving the
explicit go-ahead. No ingestion code has been written.

## Step 1 — build (DONE)

Commits: `4e47d36` (migration/config), `3cf28ed` (service/stub/health),
`8ff0e71` (Watch integration/tests).

### A. Database migration (`backend/app/database/session.py`)
Three tables added via additive `CREATE TABLE IF NOT EXISTS`:
- `resq_incident_candidates` — PostGIS centroid/bbox, state, label,
  first/last_detected_at, detection_count.
- `resq_firms_detections` — per-detection row; `dedup_key TEXT UNIQUE` is
  the idempotency key; `candidate_id` FK to candidates; PostGIS point geom.
- `resq_ingest_runs` — one row per (state, satellite) fetch attempt; records
  HTTP status, row count, error text, raw archive path.
Five indexes: GIST on geom, candidate FK, detected_at DESC, state, started_at DESC.
No existing table altered, no column dropped.

### B. Ingest service (`backend/app/services/ingest.py`)
- `fetch_firms_csv()`: FIRMS Area API with injectable HTTP backend (test isolation).
- `parse_firms_csv()`: CSV → row dicts; skips malformed rows; maps confidence
  l/n/h → low/nominal/high; tags state from per-state bounding boxes (first match,
  documented in §2 as approximate/best-effort).
- `dedup_key()`: SHA-256 of `satellite|acq_date|acq_time|round(lat,4)|round(lon,4)`.
- `cluster_detections_in_memory()`: pure-Python union-find, 1.5 km / 12 h
  (§6 thresholds). No DB access — usable in tests without Postgres.
- `update_clusters_from_new_detections()`: PostGIS-backed DB clustering for
  new detection IDs after upsert.
- `upsert_detections()`: `INSERT … ON CONFLICT (dedup_key) DO UPDATE` — frp
  and confidence updated on re-fetch; never a duplicate row.
- `record_ingest_run()`, `get_health()`: bookkeeping and staleness (6 h threshold).
- `run_ingest_cycle()`: orchestrator; never called at startup or import time.

### C. Persistent audit log (`backend/app/services/audit_log.py`)
The persistent audit service writes to the additive `resq_audit_log` table
using the documented shared contract. Events include caller-supplied actor
identity, device, action, previous state, entity identity, a server-generated
timestamp, and JSON metadata. Reads return complete chronological entity
history; database errors propagate. The live triage route currently stops at
the 503 integration guard before invoking this service: wiring it into the live
route remains blocked on the RESQ9 decisions below. `audit_stub.py` remains
used only by the isolated legacy/demo tests.

### D. Health endpoint (`backend/app/routers/ingest.py`)
`GET /ingest/health` → `{live, stale, last_fetched_at, detection_count,
stale_after_minutes}`. Returns `live=false` immediately when `INGEST_LIVE=false`;
never touches DB in that case. Mounted in `main.py`.

### E. Watch integration (`backend/app/routers/redesign.py`)
`INGEST_LIVE=false` (default): demo path completely unchanged — same SQLite
triage store, same `sample_data=true` response, no new code reached.
`INGEST_LIVE=true`:
- live Watch reads and triage endpoints fail closed with an integration-boundary
  error before database access or mutation. RESQ8 does not silently treat the
  legacy token/role path as RESQ9 authorization; the redesign token, role,
  resource-state, history, and denial-audit failure decisions remain blocked.

### F. Tests (`backend/tests/test_ingest.py`)
60 tests collected. **48 passed, 12 skipped, 0 failed.**
Skipped 12 are TestClient/endpoint tests that need `psycopg` dialect installed
(same environment gap as the pre-existing `test_auth.py` failure on this machine).
All 12 skip cleanly with a descriptive message; they pass under the project venv
with psycopg installed (confirmed same pattern as resq9's test_auth.py).

Regressions: `test_redesign_data.py` 11/11 pass. Pre-existing
`test_simulation_pipeline` psycopg failure is unchanged (confirmed by stash check).

### Offline hardening boundary
- The persistent table/schema is additive and matches the documented shared
  audit contract, so it survives process restart. The eventual R9 deployment
  must continue to use the same table/contract rather than maintaining a
  parallel audit store.
- R8 does not invent per-division scope tables or policies. It preserves the
  demo path and fails closed before live access until the RESQ9 contract is
  approved and implemented. True
  `require_scope`/division enforcement remains blocked on the R9-owned identity
  and scope contract.

### Open items / what Step 1 does NOT do
- No live FIRMS API call has been made. FIRMS rate/size limits not verified
  against a real key — flagged as a Step 2 item (same as original design doc).
- No ingestion scheduler built or started. `run_ingest_cycle()` is implemented
  but never called automatically.
- No real per-division `require_scope` enforcement is claimed; it requires the
  R9-owned scope schema and policy contract.
- `resq_incident_candidates` is now queryable — `resq6/simulation-engine` can
  replace its 4-incident hardcoded stub once `resq9` merge lands.

## Step 2 — verify with real FIRMS key (NOT STARTED)
Gated on: FIRMS MAP_KEY available, `INGEST_LIVE=true` set, Postgres running.
Will reconcile actual rate-limit/area-cap behaviour against §1/§3 of design doc.
