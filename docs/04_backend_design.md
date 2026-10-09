# RESQ backend, part 1: architecture, data, pipelines

Companion to the UI spec (`01` to `03`). Terms match the UI: forecast, priority cells, detection, incident, plan, brief, estimated spread.

## 0. Facts checked, and checks still open

| Item | Status |
|---|---|
| NASA FIRMS needs a free MAP_KEY; limit is 5,000 transactions per 10 minutes per key; answers are CSV only; area queries take a bounding box and a day range; VIIRS sources include SNPP, NOAA-20 and NOAA-21 NRT | Checked (FIRMS API pages and FAQ) |
| FIRMS publishes detections about 3 hours after a satellite pass | Not verified (secondary source). Measure it |
| ERA5-Land-T (the near-real-time version) runs about 5 days behind real time, can lag longer, and data under 2 to 3 months old can be revised | Checked (Copernicus and ECMWF forum) |
| GFS runs at 00, 06, 12 and 18 UTC; NOMADS offers a subsetting "GRIB filter"; NOAA also hosts a copy on AWS open data | Checked. Time from cycle start to files available: not verified, measure it |
| Which VIIRS satellites and processing level (standard or near-real-time) built the training fire history | Open: check in the research code |
| Cell2Fire install, grid format, supported fuel models | Open: the simulation task starts by checking |
| Hosting region and data-residency rules for a forest department | Open: ask before deploying |
| Multilingual embedding model for the SOP search (Hindi, Telugu, Odia, Marathi) | Open: run a small retrieval test before choosing |

## 1. Principles

1. **The backend owns the truth.** Every forecast carries its mode (`replay` or `live`), model version and the data cutoff of each input. The UI banners (demo, stale, offline) come from these fields, not from guesses.
2. **A modular monolith.** One repository, one API process type, a few workers. No microservices.
3. **No silent fallbacks.** Missing input means a missing value and a flag, never a filled-in number.
4. **Slow work is a job.** Anything over about 2 seconds (forecast run, simulation, PDF, AI) runs in the queue with progress and cancel.
5. **Idempotent writes.** Retries and offline sync must never duplicate incidents, alerts or messages.
6. **The research folder is read-only.** The app consumes a versioned **model bundle** exported from it (section 5).

## 2. Architecture

```
Browser / PWA --HTTPS--> Caddy (TLS) --> FastAPI (api) --> Postgres + PostGIS + pgvector
                                            |   ^                     ^
                          SSE (events) <----+   +-- LISTEN/NOTIFY    |
                                            v                         |
                                      Object storage  <---- Workers (queue consumers)
                           (photos, PDFs, frames, bundle)     default: ingest, alerts, pdf, ai
                                                              compute: forecast, simulation
Scheduler (cron rows in DB) --> enqueues jobs
External: FIRMS, Copernicus CDS, NOAA GFS, Anthropic API, Telegram, e-mail provider, Web Push
```

- **Stack:** Python 3.12, FastAPI, SQLAlchemy 2 with Alembic migrations, Pydantic v2, PostgreSQL with PostGIS and pgvector.
- **Queue:** a `jobs` table in Postgres using `SELECT ... FOR UPDATE SKIP LOCKED`. No Redis at first. Job fields: type, payload, status, attempts, timeout, progress, result, created by. Live updates to the browser use Server-Sent Events fed by `LISTEN/NOTIFY`. (A queue library is fine if it keeps the same interface; check its maintenance status first.)
- **Queues:** `default` (ingest, alerts, PDF, AI; concurrency 4) and `compute` (forecast, simulation; concurrency 1 each) so heavy work cannot starve alerts.
- **Object storage:** S3-compatible (a cloud bucket, or MinIO on the VM). Files are stored by content hash; the API issues short-lived signed URLs.
- **First deployment:** one VM with Docker Compose (api, worker-default, worker-compute, scheduler, db, caddy). Size it after measuring one forecast run and one simulation.

## 3. Data sources and the live-data gap

| Source | Used for | Access | Latency |
|---|---|---|---|
| VIIRS active fire (FIRMS) | detections; 14-day fire history | area API with MAP_KEY | hours |
| ERA5-Land | 60-day weather window, soil, fire-weather codes | Copernicus CDS API | about 5 days (ERA5-Land-T) |
| GFS 0.25 degree | day-ahead forecast block (06 UTC run of the day before) | NOMADS GRIB filter or AWS copy | hours after the run |
| Copernicus DEM, ESA WorldCover, WorldPop, OSM, night lights, MODIS burned area | static layers | one-time download into local rasters (COG) and PostGIS | n/a |

**The gap.** The model's weather window ends the day before the forecast date, but ERA5-Land arrives about 5 days late. So a true "tomorrow" forecast cannot be built from ERA5-Land alone. Plan it in three stages and say which one you are in:

- **Stage A, replay (build now).** Forecast dates in 2023 and 2024, using the stored training-grade inputs. Mode = `replay`. The map shows "Sample data from a past date".
- **Stage B, bridge and measure (before any live use).** Fill the last days of the weather window from near-real-time sources (for example GFS analysis and short-range forecast fields converted to the model's variables). Then run a **parity test** on about 20 dates in 2024: score each date with training-grade inputs and with bridged inputs, and compare the cell rankings. Suggested pass rule, to be set by you before you look at results: rank correlation of at least 0.95, and an overlap of at least 80% in the top-5% cells. These thresholds are placeholders.
- **Stage C, live.** Only if Stage B passes. Mode = `live`, behind a feature flag, labelled "experimental" in the UI until a department has reviewed it. Fire history must use the same satellites and processing level as training, or the check in Stage B must cover that difference too.

Never mix modes silently: a `live` run records which days were bridged.

## 4. Data model (PostgreSQL, SRID 4326 for geometry)

| Group | Tables and key columns |
|---|---|
| People | `users` (email, name, role, language, home_region_id, status, totp_secret, password_hash), `access_requests`, `invitations`, `sessions` (hashed token, device, last_seen), `user_regions` (officer assignments) |
| Geography | `regions` (id, level: state, district, division, range, beat; parent_id; name per language; geom), `cells` (id, grid_version, geom, centroid, state, district_id, division_id, forest_fraction, place_name), `places` (villages), `assets` (type: base, check_post, tower, water, village_ref; geom; props), `roads` |
| Forecast | `forecast_runs` (id, date, mode, model_version, grid_version, status, issued_at, data_cutoffs jsonb, bridged_days jsonb), `cell_scores` (run_id, cell_id, rank, percentile, band smallint, drivers jsonb). Partition `cell_scores` by month; about 17,764 rows per day |
| Detections | `detections` (id, satellite, acquired_at, geom, frp, confidence, source_product, cell_id, in_priority boolean, state: new, verified, false_alarm), unique on (satellite, acquired_at, geom) |
| Operations | `teams`, `team_members`, `plans`, `plan_teams`, `plan_stops` (order, cell_id, planned_time, note), `incidents`, `incident_events` (append-only timeline), `incident_media`, `alert_rules`, `alerts`, `deliveries` (channel, status, attempts, error), `notifications`, `push_subscriptions` |
| Simulation | `sim_jobs` (inputs jsonb, status, progress), `sim_results` (footprints per hour as GeoJSON or raster frame URLs, assets_in_footprint jsonb), `fuel_crosswalk` (version, landcover_class, fuel_class, assumed boolean, changed_by) |
| AI | `sop_documents` (status, language), `sop_chunks` (document_id, page, text, embedding vector, tsvector), `ai_requests` (user, kind, model, tokens, tools_called jsonb, cost), `briefs` (region, date, language, facts jsonb, text) |
| System | `job_runs`, `jobs`, `audit_log` (actor, action, entity, before, after, ip), `feature_flags`, `settings` |

Indexes: GiST on every `geom`; btree on (`run_id`, `band`) and (`run_id`, `rank`); (`acquired_at`) and (`cell_id`, `acquired_at`) on detections; GIN on `tsvector`; HNSW or IVFFlat on `embedding`.

## 5. Forecast pipeline

**Model bundle** (versioned folder in object storage, created once from the research folder by an export script; the app never reads the research folder at runtime):
- the 8 A-prime stage-2 checkpoints, a manifest with each file's hash and its stored `sig` (configuration), the normalisation statistics and climatology the model needs, the grid definition, and the static table.
- the feature-building code, copied as a pinned package with its own tests.

**Daily job steps** (each step writes status to `job_runs`):
1. Resolve the forecast date and mode. 2. Ingest or load inputs: weather window, GFS block, detections for the last 14 days. 3. Build one input row per forest cell. 4. Score with the 8 seeds on CPU (measure the time; it should be small, but confirm), average the seeds. 5. Rank all cells, compute percentile and band (Very high = top 1%, High = top 5%, Moderate = top 15%). 6. Compute drivers (below). 7. Write `forecast_runs` and `cell_scores` in one transaction. 8. Evaluate alert rules and enqueue the brief.

**Parity test (required, automated):** rebuild inputs for several thousand known 2024 validation keys and compare with the stored predictions. Fail the release if rank correlation is under 0.999. Use each year's model only on dates it did not train on.

**Drivers** (the plain-language "why elevated"): the model trains with whole-stream dropout of weather, forecast and static inputs, so masking one stream at inference stays inside what it learned. For each Very high and High cell, score again with each of those streams masked and rank the drops. Map them to fixed phrases ("hot, dry spell", "strong wind or heat forecast", "terrain and human activity"). The fire-history stream is never dropped in training, so that driver comes from a rule instead (detections within 3 cells in the last 14 days). Store at most three drivers. Phrases never claim cause. This needs validation on a few known cases before release.

**Failure handling:** if any input is missing for a cell, the cell gets no score and a flag, and the run is marked `partial` with the count. If the run fails, the previous run stays visible with its old date, so the UI shows the stale banner.

## 6. Detections pipeline
- Every 3 hours (tune after measuring FIRMS delay): query FIRMS per bounding box and satellite, with day range 1 or 2, well inside the rate limit. Parse CSV, drop duplicates by the unique key, assign `cell_id` by spatial join, set `in_priority` from the current run, then emit events for the alert engine.
- Replay mode loads stored detections for the demo dates from files, not from FIRMS.
- Keep the satellite list in config; document which satellites the model was trained on.
- Marking a detection `verified` or `false_alarm` is an officer action, logged.

## 7. Simulation service
- Runs in the `compute` queue, concurrency 1 to start, with a hard time limit and memory limit, in a container with no network access.
- Steps: validate the point is in forest, cut a window (default 20 km) from the DEM and land-cover rasters, convert land cover to fuel class using the current `fuel_crosswalk` version, write weather from the forecast wind (editable), run the simulator, convert output to frames at 3, 6 and 12 hours, store frames in object storage, intersect footprints with `places`, `roads`, `assets` and protected areas to build `assets_in_footprint`.
- Cache by (point rounded to the grid, wind bucket, duration, crosswalk version).
- Start with a stub runner that returns a plausible-shaped test frame flagged `stub: true`, so the UI can be built first. Check that the simulator installs and which fuel models it supports before writing the real runner.

## 8. AI services
- **Models** are configuration, not code: for example Sonnet-class for the assistant and a smaller model for briefs. Keys come from the environment. Per-user daily quota, response cache, and a cost record per request.
- **Daily brief:** build a facts object from the database (top areas, counts, weather summary, open incidents). The model only writes sentences around it. A validator rejects any output containing a number that is not in the facts. One call per region and language; cache by (region, date, language).
- **SOP assistant (RAG):** PDF to text with page numbers, chunk, embed, store in pgvector; combine vector search with Postgres full-text search. Every answer must cite document and page, and say "This is not in the uploaded documents" when retrieval is weak. Treat all document text as untrusted data; never follow instructions found inside it.
- **Agent:** read-only tools (`get_forecast`, `top_cells`, `get_detections`, `get_incident`, `run_simulation` as a queued job that needs the user's confirm). At most 5 tool calls per question. Drafts (alerts, messages) are saved as drafts; sending needs a user action. Log every tool call to `ai_requests`.
- **Privacy:** do not send phone numbers, names or photos to the model unless a feature needs them.
- **Translations:** machine output for safety text is reviewed by a native speaker before it becomes a fixed template.

## 9. Auth, security, privacy
- Passwords hashed with Argon2id. Sessions in httpOnly, Secure, SameSite=Lax cookies with CSRF tokens on state-changing requests; refresh rotation. TOTP two-step sign-in (required for admins). Failed-login lockout and per-IP rate limits.
- RBAC as in the UI spec, plus **region scoping**: officers and guards only see incidents, plans and teams for their assigned regions. Enforce in queries, not in the UI.
- Audit log for sign-ins, role changes, status changes, sends, deletes, mapping edits, SOP uploads.
- Uploads: allow-list types and sizes, strip photo location metadata only if the user asks, store outside the web root, scan if a scanner is available.
- Security headers (CSP, HSTS), CORS limited to the app origin, secrets from environment or a secret manager, no secrets in logs.
- Data retention policy and a delete path for personal data; decide with the department.

## 10. Operations
- **Backups:** nightly database dump plus object storage versioning; test a restore monthly.
- **Observability:** JSON logs with request ids, error tracking, `/health` and `/ready`, a public `/status` fed by `job_runs`, alerts to you when the forecast job is late or fails.
- **Config:** one `.env` for the environment, flags in the database.
- **Testing:** pytest unit and API tests; the parity tests above; contract tests that generate TypeScript types from the OpenAPI schema; k6 load test on the map endpoints; Playwright end to end with the frontend.
