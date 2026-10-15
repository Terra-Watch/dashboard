# FIRMS live-detection ingestion — design (Step 0)

Branch `resq8/firms-ingestion`, forked from `redesign-v2`. Goal: a reliable live
VIIRS active-fire feed behind the existing Watch contract, gated by
`INGEST_LIVE` (default `false`), so demo data keeps shipping unchanged until
the user explicitly flips it.

This document is a design only. No ingestion code has been written yet (Step 1
is gated on explicit approval of this doc).

## What I read before writing this

- `backend/app/routers/redesign.py` — the current `/api/redesign/detections`,
  `/detections/{id}/actions`, `/detections/{id}/history` endpoints, and the
  `Watch`/`field/tasks` consumers of `list_detections()`.
- `backend/app/services/redesign_data.py::list_detections` — current demo
  shape: one detection per replay incident, fields
  `id, incident_id, source, state, label, detected_at, confidence, lat, lon, frp, sample_data`.
- `backend/app/services/redesign_store.py` — the existing SQLite demo store
  (`backend/runtime_data/redesign_demo.sqlite3`, gitignored) that persists
  `triage_actions` (detection_id, action, role, device_id, created_at) and
  derives "status" by taking the latest action per detection — **there is no
  explicit `previous_state` column today**, it's inferred by scanning history.
- `frontend/src/redesign/lib/types.ts::Detection` — the TS contract the Watch
  screen actually binds to: `id, incident_id, source ('VIIRS'|'field_report'),
  state, label, detected_at, confidence ('low'|'nominal'|'high'), status
  ('new'|'verify'|'dismiss'|'escalate'), lat, lon, frp?`.
- `frontend/src/redesign/pages/WatchPage.tsx` — confirms the client calls
  `GET /api/redesign/detections` and `POST /api/redesign/detections/{id}/actions`
  with `{action, role, device_id}`, and renders a `SampleDataBadge` driven by
  the response's `note`/`sample_data` fields.
- `docs/redesign/10_backend_contract.md` §Watch — explicitly says `/detections`
  today serves "the 4 demo incidents' detections as explicitly labeled sample
  data, not pretend to be live," and that a real build needs a VIIRS/FIRMS
  ingestion job — this is exactly that job.
- `docs/redesign/00_audit.md` / `09_trust_rules.md` — confirms the model's
  **six fit states** are Odisha (OD), Chhattisgarh (CG), Telangana (TS),
  Madhya Pradesh (MP), Maharashtra (MH), Jharkhand (JH) (`backend/app/barv3.py`
  `STATES` set), and that **no "zero-shot states" claim exists anywhere in
  this codebase** — that framing was explicitly rejected in `00_audit.md`.
  I'm flagging this because the task brief's area option ("six fit states plus
  Uttarakhand and Andhra Pradesh") uses states beyond the six Bar-v3 is fitted
  on. That is fine for *detection ingestion* — FIRMS detection coverage has
  nothing to do with Bar v3's risk-model fit — but I want it on record that
  Uttarakhand/Andhra Pradesh being in the ingestion area must never be read as
  those states being "validated" for the risk model. Watch and Today are
  different trust levels (`detection` vs `forecast`); this doc only touches
  the former.
- `backend/app/database/session.py` — confirms Postgres+PostGIS is already
  the real database (`CREATE EXTENSION IF NOT EXISTS postgis`, existing
  `cells`/`cell_scores` tables with `geometry(...)` columns and GIST indexes)
  and `docker-compose.yml` provisions `postgis/postgis:16-3.4`. This is a real,
  already-running dependency, not something I'm introducing.
- `backend/app/core/config.py`, `backend/.env.example`, `backend/app/barv3.py` —
  confirms the env-var pattern: plain `os.getenv("RESQ_X")`, documented in
  `.env.example`, no secrets committed.
- `backend/requirements.txt` — no HTTP client beyond what FastAPI/Starlette
  pull in transitively, no scheduler library (no APScheduler/Celery). `shapely`
  is already a dependency (useful for the clustering math).
- `.gitignore` — confirms `backend/runtime_data/` and `.env` are already
  ignored, so that's where raw archives and any local key file belong.

**What I could not check:** FIRMS's actual area-size cap and rate limit, since
I have not made a live call yet (that's Step 2, and only if a key is present).
I'm designing conservatively around NASA's documented numbers and will
reconcile against real response headers/errors in Step 2.

## 1. FIRMS endpoints and satellites

NASA FIRMS Area API, CSV flavor:

```
https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{WEST},{SOUTH},{EAST},{NORTH}/{DAY_RANGE}/{DATE}
```

Three sources, queried separately (the area API takes one source per call):

- `VIIRS_SNPP_NRT` — Suomi NPP
- `VIIRS_NOAA20_NRT` — NOAA-20
- `VIIRS_NOAA21_NRT` — NOAA-21

All three at 375 m nominal resolution, which is materially better than MODIS's
1 km — MODIS is intentionally excluded. `MAP_KEY` comes from
`RESQ_FIRMS_MAP_KEY` in the environment (see §9 below), never hardcoded or
logged.

Each poll cycle issues one request per (state-bbox × source) — see §2 for why
state-bbox rather than one big box — i.e. up to `8 states × 3 sources = 24`
requests per cycle. `DAY_RANGE=1` (FIRMS max granularity for NRT is per-day,
we always want "since last successful fetch," deduped against stored keys).

## 2. Area

**Decision: bounding box per state, not one combined box, with a `state`
field attached by which state-box matched.**

States in scope: the six Bar-v3 fit states (OD, CG, TS, MP, MH, JH) plus
Uttarakhand (UK) and Andhra Pradesh (AP), per the task brief. Approximate
bounding boxes (WGS84, degrees — adequate for a detection *area filter*, not
survey-grade):

| State | West | South | East | North |
|---|---|---|---|---|
| Maharashtra (MH) | 72.6 | 15.6 | 80.9 | 22.1 |
| Telangana (TS) | 77.2 | 15.8 | 81.1 | 19.9 |
| Andhra Pradesh (AP) | 76.8 | 12.6 | 84.8 | 19.9 |
| Odisha (OD) | 81.3 | 17.8 | 87.5 | 22.6 |
| Chhattisgarh (CG) | 80.2 | 17.8 | 84.4 | 24.1 |
| Madhya Pradesh (MP) | 74.0 | 21.0 | 82.8 | 26.9 |
| Jharkhand (JH) | 83.3 | 21.9 | 87.6 | 25.3 |
| Uttarakhand (UK) | 77.6 | 28.7 | 81.1 | 31.5 |

**Why per-state boxes over one bbox or a polygon filter:**

- A single bbox spanning MH→UK is ~15°×19° (~285 sq-degrees). NASA's FIRMS
  area API documentation caps requests at roughly 10°×10°; I have not verified
  this against a live call yet (no key confirmed available until Step 2), so
  I'm not betting the whole feed on an unverified limit. Per-state boxes are
  each well under 10°×10° (largest is MP at ~8.8°×5.9°), so they're safe
  regardless of the exact cap, and splitting also naturally keeps India
  outside the eight states (no detections from, say, Bihar or Gujarat) out of
  the feed without needing a precise polygon clip.
  - UK is also geographically disjoint from the other seven (which form one
    contiguous central-India belt) — merging it into one box would roughly
    double the queried area for no gain.
- A precise state-*polygon* filter (point-in-polygon against real admin
  boundaries) would be more accurate at borders, but there is no state
  boundary shapefile/GeoJSON anywhere in this repo today (checked: no
  `*state*bound*`, no `india` boundary GeoJSON). Adding one is its own scoping
  decision (licensing, source, maintenance) that the task brief didn't ask for
  and I'm not making unilaterally. Bounding boxes are an honest approximation:
  **a detection within ~tens of km of a state border may be tagged with the
  wrong neighboring state.** This is documented as a known limitation, not
  silently assumed away — the `state` field on a live detection is
  "best-effort, bbox-derived," not authoritative. It only affects display
  grouping, not the detection's real lat/lon or its presence in the feed.
- A detection that falls in more than one state's box (bbox overlap near
  shared borders) is tagged with the first matching state in the table order
  above; this is arbitrary at the margin and acceptable for display-only
  attribution.

## 3. Polling interval

**Every 20 minutes**, one scheduled cycle = 8 states × 3 sources = 24 requests.

Reasoning: FIRMS NRT data itself only refreshes a few times a day per point
(satellite revisit, see §4) — polling faster than that doesn't surface
anything new, it just spends rate-limit budget. NASA's documented key limit is
5,000 transactions per 10 minutes; 24 requests every 20 minutes is ~12
requests per 10-minute window, comfortably under that limit even accounting
for retries. 20 minutes is also short enough that staleness (§8) is detected
promptly without being so frequent that a transient FIRMS outage trips
backoff/retry constantly.

## 4. Expected latency (stated plainly)

This is **not** a real-time feed, and the UI/health endpoint must never imply
otherwise:

- Each VIIRS satellite revisits a given point on Earth roughly 1–2 times per
  day (polar sun-synchronous orbit); with three satellites (S-NPP, NOAA-20,
  NOAA-21) combined, a given point in the ingestion area gets on the order of
  3–6 overpasses per day, unevenly spaced — there can be multi-hour gaps
  between usable looks at any one location.
- On top of the overpass gap, NASA's NRT processing pipeline itself adds
  roughly **1–4 hours** from satellite observation to data being queryable
  via the Area API (NASA's own NRT SLA language is "within ~3 hours" but
  real-world latency reports vary and can occasionally be longer during
  provider-side delays).
- Combined, a realistic end-to-end latency from "fire ignites" to "appears in
  this feed" is **on the order of 3–14 hours**, not minutes, depending on
  overpass timing. A fire that ignites in the gap right after a satellite
  pass may not be visible until the next one, hours later.
- **Required Watch copy (dependency on `resq9/product-pass`):** this
  ingestion feature does not touch Watch's UI itself — `resq9/product-pass`
  owns the plain-language copy pass across the app, including Watch. The
  exact string `resq9` must use when it wires up the live-workspace Watch
  copy, derived directly from the latency numbers above, is:

  > **"Satellite data arrives with a delay of a few hours."**

  This is recorded here so that string doesn't drift from the actual
  measured/documented latency if `resq9` or anyone else revises it later —
  any future change to this wording should be checked against this doc's
  §4 numbers, not restated independently. I am not implementing this copy
  myself.

## 5. De-duplication key

FIRMS does not give detections a stable ID. Each CSV row is a single VIIRS
pixel detection at a point in time. Dedup key:

```
dedup_key = sha256(f"{satellite}|{acq_date}|{acq_time}|{round(lat,4)}|{round(lon,4)}")
```

- `satellite` is the FIRMS source string (`VIIRS_SNPP_NRT` etc.) — the same
  physical fire seen by two different satellites is **not** deduped against
  itself at this layer (that's what clustering in §6 is for); this key only
  prevents re-ingesting the *same* satellite's *same* pixel observation twice
  across overlapping polling windows.
- `acq_date` + `acq_time` (FIRMS's own fields, to-the-minute) plus
  `round(lat/lon, 4)` (~11 m precision, well under the 375 m pixel footprint)
  is specific enough that two genuinely different detections essentially
  never collide, while being stable across repeated fetches of the same
  underlying FIRMS row (FIRMS doesn't reorder or jitter these fields on
  re-query).
- Stored as a `UNIQUE` column; the fetcher always does an upsert
  (`INSERT ... ON CONFLICT (dedup_key) DO UPDATE SET frp=..., confidence=...,
  last_seen_at=now()`) rather than insert-or-skip, because FIRMS occasionally
  reprocesses/corrects `frp`/`confidence` for an already-published row and we
  want the corrected value, but never a second row for the same key. This is
  what makes the fetch idempotent (Step 1 requirement).

## 6. Clustering into candidate incidents

Nearby detections are grouped into an `incident_candidate` using
transitive (union-find) clustering, so a multi-day fire that gets re-detected
across many overpasses chains into one candidate instead of fragmenting:

- **Spatial window: 1.5 km.** VIIRS's nominal footprint is 375 m, with
  published geolocation accuracy of roughly ±150 m; a real, spreading fire
  front can also legitimately move several hundred meters to a kilometer
  between overpasses hours apart. 1.5 km is wide enough to absorb pixel
  geolocation jitter and a few hours of real fire-front movement without
  treating every re-detection of the same fire as a new incident, while still
  being tight enough that two genuinely separate fires a few kilometers apart
  in the same forest tract don't get silently merged into one.
- **Time window: 12 hours**, applied transitively against each cluster
  member's own detection time (not just the cluster's first detection) — so
  an ongoing fire that gets re-detected every ~4–6 hours (per §4) keeps
  chaining into the same candidate indefinitely, but a new detection at the
  same spot after a 12+ hour gap starts a **new** candidate rather than
  silently extending an old one. Reasoning: 12 hours comfortably spans the
  worst-case single-satellite revisit gap (so one missed overpass doesn't
  fracture an ongoing fire into two candidates) while still being short
  enough that a genuine re-ignition days later at the same coordinates is
  treated as its own event rather than quietly merged into history.
- Implementation: for each new/updated detection, find existing candidates
  with a member within 1.5 km AND within 12 hours of this detection's time;
  union if found (merging candidates if the new detection bridges two
  existing ones), otherwise create a new candidate. Candidate's
  `centroid`/`bbox`/`state`/`time_range`/`detection_count` are recomputed from
  current members on every change, not cached stale.
- A candidate's `label` is generated, not narrative: e.g.
  `"{state} — cluster since {first_detected_at date}"`. This is deliberately
  distinguishable from the demo data's human-written incident labels (the
  four RESQ-5 replay incidents keep their own hand-written labels) — live
  clusters must never look like they were authored with the same care/review
  as the curated demo incidents.

## 7. Confidence / FRP handling

- VIIRS confidence from FIRMS NRT is categorical: `l`/`n`/`h` (low/nominal/
  high) — same vocabulary the demo data already uses
  (`redesign_data.list_detections`), so no new confidence enum needed on the
  frontend contract.
- FRP (Fire Radiative Power, megawatts) is stored as-is, float, and used only
  as a **sort/severity signal** (e.g. default queue ordering, or a visual
  weight), never as a stand-alone validity signal. VIIRS/MODIS thermal
  anomaly detections have known false-positive sources (sun glint, hot
  industrial sites, reflective roofing) — FIRMS confidence already accounts
  for some of this, but not all. Consistent with the existing Watch copy
  ("Nothing here is a confirmed fire until someone verifies it"), low-
  confidence/low-FRP/single-pixel candidates are still surfaced, just
  deprioritized in default sort — never auto-dismissed by the ingestion job
  itself. Dismissal stays a human action through the audit log (§8a).

## 8. Storage schema (PostGIS)

New tables alongside the existing `cells`/`cell_scores` in the same Postgres
database (`backend/app/database/session.py`), following its naming
(`resq_*`) and style. Deliberately **separate from** the SQLite demo store
(`redesign_demo.sqlite3`) — the demo path is untouched by this feature.

**Ownership note (amendment, applied after design approval):** this ingestion
feature owns the FIRMS data model only — detections, clustering, dedup,
fetch bookkeeping. It does **not** own a standalone audit log. Verification
state changes (`verify`/`dismiss`/`escalate`) are, per the coordinator's
instruction, owned by `resq9/product-pass`'s real audit log, which is part of
their auth/permission system (timestamp, user, device, action, previous
state). The table `resq_triage_audit_log` originally proposed in this
section's first draft is **removed** — see §8a.

```sql
CREATE TABLE resq_firms_detections (
    id              BIGSERIAL PRIMARY KEY,
    dedup_key       TEXT UNIQUE NOT NULL,
    satellite       TEXT NOT NULL,              -- VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | VIIRS_NOAA21_NRT
    acq_date        DATE NOT NULL,
    acq_time        TEXT NOT NULL,               -- FIRMS HHMM, kept verbatim alongside detected_at
    detected_at     TIMESTAMPTZ NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lon             DOUBLE PRECISION NOT NULL,
    geom            geometry(Point, 4326) NOT NULL,
    confidence      TEXT NOT NULL CHECK (confidence IN ('low','nominal','high')),
    frp             DOUBLE PRECISION,
    state           TEXT NOT NULL,               -- best-effort bbox tag, see §2
    candidate_id    BIGINT REFERENCES resq_incident_candidates(id),
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX resq_firms_detections_geom_gist ON resq_firms_detections USING GIST (geom);
CREATE INDEX resq_firms_detections_candidate ON resq_firms_detections (candidate_id);

CREATE TABLE resq_incident_candidates (
    id                BIGSERIAL PRIMARY KEY,
    state             TEXT NOT NULL,
    label             TEXT NOT NULL,
    centroid          geometry(Point, 4326) NOT NULL,
    bbox              geometry(Polygon, 4326) NOT NULL,
    first_detected_at TIMESTAMPTZ NOT NULL,
    last_detected_at  TIMESTAMPTZ NOT NULL,
    detection_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE resq_ingest_runs (
    id            BIGSERIAL PRIMARY KEY,
    started_at    TIMESTAMPTZ NOT NULL,
    completed_at  TIMESTAMPTZ,
    state         TEXT NOT NULL,       -- which state-bbox
    satellite     TEXT NOT NULL,
    http_status   INTEGER,
    row_count     INTEGER,
    ok            BOOLEAN NOT NULL,
    error         TEXT,
    raw_archive_path TEXT              -- see §9
);

```

New detections default to `not_verified` (stored state); this maps to the
existing contract's `status: "new"` on the wire (see §10) — `not_verified`
is the internal name, `new` is what the frontend already knows how to render.

## 8a. Audit log — dependency on `resq9/product-pass`, not owned here

**Revised after design approval.** The first draft of this doc proposed a
standalone `resq_triage_audit_log` table. Per the coordinator's instruction,
that's wrong ownership: `resq9/product-pass` owns the real audit log for
verify/dismiss/escalate actions, as part of their auth/permission system
(timestamp, user, device, action, previous state). This ingestion feature
must write *through* that system, not build a second, competing audit trail.

This section documents the **dependency and the shape this feature needs**,
since `resq9`'s schema/interface is not finalized yet as of this writing:

- **What ingestion needs to call/write:** on a triage action for a live
  detection or candidate, record `{entity_type: 'detection'|'candidate',
  entity_id, action: 'verify'|'dismiss'|'escalate', previous_state, role,
  device_id, timestamp}` through resq9's audit log — the same fields this
  doc's earlier draft put in its own table, just written to resq9's store
  instead of a new one. `previous_state` must still be computed by the
  caller (whoever's handling the `POST /detections/{id}/actions` request)
  *before* applying the new state, since only the caller knows the prior
  value at that instant.
- **What ingestion needs to read back:** the *current* status of a live
  detection/candidate (to populate the `status` field in `GET /detections`,
  per §10) — i.e. "most recent action for entity X," equivalent to what
  `redesign_store.latest_status_by_detection()` does today for the demo
  path, but sourced from resq9's log instead of a local table. If resq9's
  audit log doesn't (yet) expose a cheap "latest status per entity" query,
  this feature will need either resq9 to add one or a local
  read-side cache that's still written by resq9's log as the source of
  truth — not decided yet, flagged as a Step 1 coordination item, not
  something I'm resolving unilaterally in this doc.
- **Entity identifiers:** resq9's audit log must be able to key on this
  feature's own id spaces (`detection.id` / `candidate_id` from §8), the
  same way it presumably already keys on incidents/plans elsewhere in the
  app. This is a naming/foreign-key contract to confirm with `resq9`
  directly before Step 1 build, not something this doc can finalize alone.
- **What this feature still owns:** the FIRMS data model itself —
  `resq_firms_detections`, `resq_incident_candidates`, `resq_ingest_runs`
  (§8) — plus the business rule that new detections start `not_verified`
  and that `frp`/confidence are never used to auto-change that state. Only
  the *recording* of state transitions moves to resq9's system.

## 9. Raw-response archive policy

Every fetch's raw FIRMS CSV body is archived to
`backend/runtime_data/ingest_raw/{source}/{fetched_at_iso}_{state}.csv`
(already-gitignored directory, never committed). `resq_ingest_runs.raw_archive_path`
points at it. Purpose: FIRMS gives no permalink for a past query, so this is
the only way to reproduce/debug "what did FIRMS actually return at time T."

Retention: kept 90 days, then pruned by a cleanup pass (part of the same
scheduled job, run once daily) — long enough to debug any issue reported
within a season, short enough not to grow unbounded on disk. This is a
policy choice, not something verified against any external requirement;
flagging it as a judgment call the user can override.

`RESQ_FIRMS_MAP_KEY` itself is read via `os.getenv("RESQ_FIRMS_MAP_KEY")`
(pattern matches `RESQ_MODEL_BUNDLE_DIR` etc. in `.env.example`/`barv3.py`),
never logged, never included in the raw archive filenames/content beyond
what FIRMS's own response contains (FIRMS responses don't echo the key back).

## 10. Mapping onto the existing Watch contract

`GET /api/redesign/detections` keeps its exact route and envelope shape
(`{sample_data, note, items}`), per `docs/redesign/10_backend_contract.md`
and the frontend's `DetectionsResponse`/`Detection` types — this is not a new
endpoint, it's the same one branching on `INGEST_LIVE`:

- **`INGEST_LIVE=false` (default):** `list_detections()` runs exactly as
  today — reads the 4 replay incidents' CSVs, `sample_data: true`. No new
  code path is reachable; this is Step 1's explicit test, not an assumption.
- **`INGEST_LIVE=true`:** queries `resq_firms_detections`/`resq_incident_candidates`
  instead, and shapes each row into the same `Detection` fields:
  - `id` → `det-{detection.id}` (string, same prefix convention as demo)
  - `incident_id` → `candidate-{candidate_id}` (a live cluster, not one of
    the 4 demo incident ids — these id spaces don't collide today since demo
    ids are the fixed RESQ-5 slugs)
  - `source` → `"VIIRS"` (field_report stays reserved for a future Field
    submission path, untouched here)
  - `state`, `label`, `detected_at`, `confidence`, `lat`, `lon`, `frp` → as
    stored
  - `status` → derived the same way the demo path already does it today
    (latest action for that detection from **`resq9/product-pass`'s audit
    log**, per §8a — not a local table — defaulting to `"new"` for
    `not_verified`) — **no new status value** is introduced; the frontend's
    `'new'|'verify'|'dismiss'|'escalate'` enum is unchanged.
  - `sample_data: false`, and `note` describes the live source + staleness
    state instead of the demo note string.
  - **Cold start:** if `INGEST_LIVE=true` but no fetch has ever succeeded yet,
    the endpoint returns `items: []`, `sample_data: false`, and a note saying
    live ingestion has no data yet — it must never fall back to serving demo
    rows under a live flag, since that would silently mislabel demo data as
    live.
- `POST /detections/{id}/actions` and `GET /detections/{id}/history` keep
  their routes/request shape; when the id resolves to a live detection they
  write/read through **`resq9/product-pass`'s audit log** (§8a) instead of
  the SQLite `triage_actions` table — not a new table of this feature's own.
  The `{action, role, device_id}` request body is already exactly what that
  audit log needs; this feature additionally computes `previous_state`
  before calling it, per §8a.
- New, additive-only endpoint: `GET /ingest/health` → `{last_success_at,
  detection_count, stale, stale_after_minutes}`. `stale = true` once
  `now - last_success_at > 360` minutes (6 hours) — chosen as a generous
  multiple (18×) of the 20-minute poll interval so transient single-cycle
  failures (one bad request, one timeout) never flip the flag, while a real
  multi-hour FIRMS outage or a broken key is caught well before it could be
  mistaken for "no fires right now." This endpoint is new surface, not a
  change to any existing contract.

## 11. Outage and staleness behaviour

- **Fetcher:** retries with capped exponential backoff within a single poll
  cycle (1m, 2m, 4m, 8m, cap at 8m, give up after 5 attempts and let the next
  scheduled 20-minute cycle try again) — a bad cycle never blocks the next
  one indefinitely.
- **Storage:** last successfully stored data is never overwritten or cleared
  by a failed fetch. `GET /detections` under `INGEST_LIVE=true` always serves
  whatever was last successfully stored, even if the most recent fetch(es)
  failed — it does not 500 because FIRMS is down.
- **Staleness surfaced, not hidden:** `/ingest/health`'s `stale` flag is the
  single source of truth for "is this feed current"; Step 1's UI wiring (not
  this doc) should show a staleness banner on Watch once `stale: true`,
  analogous to the existing `OfflineBanner` pattern already used elsewhere in
  the redesign (`docs/redesign/10_backend_contract.md`'s offline sections).
  I am not touching Watch's UI/copy in this design step.
- **Rate-limited response from FIRMS:** treated the same as any other failed
  attempt (retry/backoff, logged in `resq_ingest_runs.error`), not specially
  handled — if this proves too aggressive in Step 2's live check, I'll revisit
  the interval, not silently paper over repeated 429s.

## Open items / what I could not verify at design time

- FIRMS's exact area-size cap and transaction-rate limit — designed
  conservatively around NASA's published numbers; to be reconciled against
  real response behavior in Step 2 if a key is available.
- Whether VIIRS confidence is reported identically (categorical l/n/h) across
  all three NRT sources, or whether NOAA-20/21 differ from S-NPP in format —
  assumed identical based on the demo CSVs' existing `confidence` column
  convention; will verify from an actual live response in Step 2.
- No live network call has been made in writing this document — everything
  about FIRMS's request/response shape is from documentation and the
  existing demo CSVs' column conventions, not a request executed by me.
- **New, from the amendment round:** `resq9/product-pass`'s audit log
  schema/interface is not finalized as of this writing. §8a documents the
  shape this feature needs from it (entity type/id, action, previous_state,
  role, device_id, timestamp, plus a "latest status per entity" read path)
  but the actual integration can't be built until that interface exists or
  is confirmed stable — this is a cross-branch coordination dependency for
  Step 1, not something resolvable unilaterally in this doc.

## Status

Design approved by the user, **with two amendments applied in this
revision** (required Watch copy string in §4; audit log ownership moved to
`resq9/product-pass`, §8/§8a). **Still holding before Step 1** per explicit
instruction — the user is waiting on a separate audit (`resq10/ranking-audit`)
to report back before giving the go-ahead to build. No ingestion code has
been written.
