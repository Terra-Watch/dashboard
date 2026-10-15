# RESQ-6 progress log

Branch: `resq6/simulation-engine` (off `redesign-v2`). Read this file first on
resume; it is the authoritative state, ahead of any chat summary.

## Step 0: audit — done
`docs/simulation/00_audit.md` committed. Covers the live `/spread/jobs`
pipeline (`operations.py` -> `simulation_service.py` ->
`run_demo_simulation.py`, fixed 1.2 km Similipal domain), the separate
RESQ-5 replay pipeline (`scripts/resq5/replay.py`, not wired to any
endpoint), and the task's listed flaws, each checked against source
(`ReadCSV.cpp:526` tmp=27/rh=40, `Cells.cpp:443-450` slope_effect,
`RESQ5_RESULTS.md` §6 one-calm-hour finding). `docs/sim_diagnosis/` was not
opened (left untouched per scope fence); facts from it are cited via
`docs/sim_followups.md`'s summary only.

## Step 1: protocol — done, STOP POINT reached
- `docs/simulation/PROTOCOL.md` committed: development set (the 4 named
  incidents, reusing their already-fixed RESQ-5 ignition/time/domain facts
  from `data/resq5/protocol_setup.json`), test-set candidate pool (11 of
  the 15 `RESQ2_INCIDENTS.md` candidates not already used/rejected; forest
  rule *not yet checked* for them — deliberately deferred to Step 3), both
  baseline formulas frozen (plain proximity, unchanged from RESQ-5 §8(a);
  a new wind-elongated proximity baseline, fully specified, simulator-free),
  success-criteria metrics (AP + Brier, per incident, per horizon, no
  pooled significance claim).
- `docs/simulation/FUEL_RULE.md` committed: carries RESQ-5 `PROTOCOL.md`
  §4's crosswalk forward unchanged (forest -> TL2, grass -> GR1, everything
  else -> non-burnable), explicitly superseding `proxy_mapping.py`'s SH5
  shrub proxy for all engine runs going forward.
- **Protocol approved by coordinator with 4 amendments (2026-10-13).**
  Addressed before any Step 2 code, all committed:
  1. Terminology fix ("slope used" only, never "aspect" as used/planned) —
     applied to `00_audit.md`, recorded as a standing rule in `PROTOCOL.md`
     Amendment 1.
  2. Temperature/RH effort estimate — `docs/simulation/ENGINE_DECISIONS.md`
     §1. Finding: `tmp`/`rh` are dead fields in the entire Cell2Fire source
     (confirmed by a full-codebase grep), not read by any ROS formula for
     any simulator. Decision: leave the 27°C/40% constants as-is; do not
     even make the trivial CSV-wiring patch, since it would have zero
     behavioural effect and would misleadingly look like a real fix.
  3. Ignition-location source — `ENGINE_DECISIONS.md` §2. Designed against
     `resq8/firms-ingestion`'s `docs/ingest/00_design.md` (read via
     `git show`, not checked out, not modified) — neither `resq8`'s
     candidate table nor `resq9/product-pass`'s audit log exist as code
     yet. Built a `get_verified_incident()` lookup interface shaped to that
     record, stubbed today against only the fixed development/test
     incidents; real reconciliation with `resq8`/`resq9` is logged as a
     cross-branch dependency, not resolved here. `operations.py`'s incident
     schema is not touched.
  4. Pre-Step-2 answers (`PROTOCOL.md` Amendment 1): test-set minimum
     viable size 3 (floor 1 to report anything, 0 means no engine
     recommendation); ensemble finalized at 60 members (bottom of the
     60-90 range, runtime-driven); runtime budget 5 min target / 10 min
     hard ceiling per run, progress reported at least every ~10 s.
- **Proceeding to Step 2 on the development set only**, per the
  coordinator's explicit go-ahead. Next stop: after Step 3 (not after each
  Step 2 sub-item) — report back then, not before, barring a genuine
  blocker.

## Step 2: engine — in progress

- [x] (logged retroactively — committed `3cd17d9` but not written up here at the time)
  `backend/inference/engine/domain.py` + `fuel.py`: configurable 10-15 km domain
  generaliser (UTM zone from ignition longitude, "slope used" only, no aspect
  file) for future test-set/live incidents, and the `FUEL_RULE.md` crosswalk as
  code. 7 unit tests (`backend/tests/test_engine_domain.py`).
- [x] (logged retroactively — committed `6fdb6c5`) `backend/inference/engine/weather.py`:
  Open-Meteo hourly forecast (live) + ERA5-Land historical (replay, reusing the
  development set's cached CDS wind CSVs) weather sourcing, item 1 of Step 2a's
  build list. 6 unit tests (`backend/tests/test_engine_weather.py`).
- [x] `docs/simulation/DECISION_RULE.md` committed **before** any Step 2a tuning
  run, per instruction: AP primary metric, ±0.05 absolute AP win/loss margin,
  Brier reported but not decisive.
- [x] `backend/inference/engine/smoulder.py`: smouldering rule replacing the
  one-calm-hour permanent burn-out (`00_audit.md`/`RESQ5_RESULTS.md` §6
  finding 2). Root cause confirmed in `Cells.cpp`/`ReadArgs.cpp`: a cell
  below `--ROS-Threshold` (default 0.1 m/min) "cannot send" and is marked
  burned out permanently. TL2's own dead-calm asymptotic ROS, computed from
  `FuelModelSpain.cpp`'s coefficients, is 0.0849 m/min — already below the
  default, which is exactly why a calm hour kills a TL2 fire (confirmed by
  re-deriving the 0.145 m/s threshold `RESQ5_RESULTS.md` cites, independently,
  from the same coefficients). Fix: `--ROS-Threshold 0.05`, below TL2's
  asymptote with margin, above zero. GR1 (grass) was never affected
  (asymptote 0.373, already above default). 4 unit tests.
- [x] `backend/inference/engine/baseline.py`: both frozen baselines
  (`PROTOCOL.md` §3) as code — plain proximity and the new wind-elongated
  proximity, including the downwind/crosswind projection helper. 6 unit tests.
- [x] `scripts/resq6/run_dev.py`: the ensemble runner + scorer, development
  set only. 60-member ensemble (ignition jitter × wind perturbation), real
  ERA5-Land wind via `engine/weather.py`, real fuel via `engine/fuel.py`,
  the smouldering `--ROS-Threshold`, scored against VIIRS ground truth
  (reusing `scripts/resq5/analyze.py`'s own clustering, evaluated at the
  product's 4 horizons rather than RESQ-5's overpass-index scheme) and both
  baselines, per `docs/simulation/DECISION_RULE.md`.
- [x] **Dev-set run completed and results committed**: `docs/simulation/RESULTS_DEV.md`,
  raw output `results/resq6/dev/*.json`. Headline: engine does not beat
  either baseline on 7 of 8 scorable (incident, horizon) cells; 1 "no clear
  difference"; 0 wins. 6h/12h not scorable for any dev incident (no overpass
  that early). Full detail, including flagged reliability concerns, in
  `RESULTS_DEV.md`.
- **Frozen at commit `78e9b83`** (this session's Step 2a commit) —
  engine code, settings (`ROS_THRESHOLD_SMOULDER=0.05`, 60 members, 500 m
  ignition jitter, wind perturbation `U(0.7,1.3)`×`N(0°,15°)`), and dev-set
  results as of that commit. No further tuning happens against this frozen
  state without a new dated amendment, per `PROTOCOL.md`'s own discipline.

## Step 2a fix pass — fair (ignition-blurred) baseline rescoring, dev gate

Accepted Step 2a as reported; instructed to do one bounded, scoring-only fix pass before any
Step 2b approval decision — not a new tuning round.

- [x] `scripts/resq6/rescore_fair.py`: blurs both frozen baselines with the engine's own ±500 m
  ignition-jitter (Monte-Carlo over the identical 60 jittered points, same seed) before
  rescoring, so the comparison is no longer sharp-point-baseline vs. blurred-ensemble-engine.
  **No new Cell2Fire run** — the engine's AP/Brier are reused unchanged from the frozen
  `78e9b83` results; fuel, wind handling and the smouldering threshold were not touched.
- [x] "Engine with jitter off" — **not produced**. Needs the original run's per-member spatial
  grids, which were not persisted (only aggregated AP/Brier were saved); reconstructing them
  needs rerunning Cell2Fire, which this pass's own rule forbids. Stated as a limitation in
  `RESULTS_DEV.md`, not approximated or invented.
- [x] Fair rescoring result (`results/resq6/dev/fair_rescore.json`, written up in
  `docs/simulation/RESULTS_DEV.md`'s new "Fix pass" section): **0 wins, 1 tie, 7 losses of 8
  scorable cells** — narrower margins than the original (unfair) scoring on most cells, but no
  cell flipped to a win.
- [x] **Dev gate: FAILED** (wins+ties = 1, need ≥6 of 8). Recorded in `RESULTS_DEV.md`.
  **The test set was not run**, per the gate's own rule.
- [x] `docs/simulation/FALLBACK.md` written: the wind-and-slope-elongated ellipse spec (new
  slope term, `(1 + 0.5*tan(slope_rad))`, chosen on dev-set slopes only — 6.2°/6.5°/33.7°/17.0°
  at the 4 incidents' ignition pixels — face-checked, **not scored against AP**, flagged as a
  placeholder for a future session to actually validate); how the ignition-jitter Monte-Carlo
  blur (the same mechanism `rescore_fair.py` uses to score fairly) becomes the product's actual
  chance-of-burning contour; what the app can honestly say at each of the 4 horizons (6h/12h:
  no dev evidence either way, stated plainly per instruction; 24h/48h: the fallback formula, not
  the simulator, is what this session's numbers actually support).

**Stopped after the fix pass, per instruction. Step 2b (the single test-set run) is not started
and, per the failed gate, should not be, absent a new instruction overriding the gate rule.**

## Step 3: the wind-elongated ellipse spread feature (backend + API, no frontend)

Dev gate failed → Cell2Fire is not the product spread view. Built the `FALLBACK.md` ellipse as
a real backend feature instead. Backend/API contract only — `resq9/product-pass` owns the
frontend.

- [x] **Slope-term decision, scoring-only** (commit `25de630`): `scripts/resq6/score_slope_term.py`
  scores the slope-elongated ellipse vs. the no-slope version, same ±500 m jitter blur + AP
  primary as the fix pass, no Cell2Fire, no fuel/wind/smouldering retuning. **0 wins, 7 ties, 1
  loss** → slope excluded from the shipped feature. Recorded in `RESULTS_DEV.md` before any
  feature code was written, per instruction.
- [x] **Cell2Fire disabled, not deleted** (commit `fa59c62`): `/spread/jobs` +
  `/spread/validation` split into `backend/app/routers/cell2fire_spread.py`, gated behind
  `CELL2FIRE_ENABLED` (default `false`), not included in `main.py` unless explicitly re-enabled.
- [x] **The feature itself** (commit `d28b6e5`): `backend/inference/engine/{incidents,
  wind_provider,spread_ellipse}.py` — pure Python, no simulator, no subprocess. Ellipse formula
  from `engine.baseline` (no slope), Monte-Carlo blurred over 60 members (ignition jitter + wind
  perturbation, same seeded scheme as the dev-set ensemble), 3 nested
  likely/possible/unlikely bands vectorized to GeoJSON via `rasterio.features.shapes`.
  `POST /api/redesign/spread` (`backend/app/routers/spread.py`): `incident_id` or
  `lat/lon+start_time`, `horizon_h` in `{6,12,24,48}`, synchronous, measured 48ms–~1s per call
  (well under the 2s target).
- [x] **Permissions/audit — TODO-MERGE shim** (also commit `d28b6e5`): written against
  `docs/product/AUDIT_LOG.md` and `resq9/product-pass`'s `security.py`/`permissions.py`
  (read via `git show`, not checked out, not modified) through
  `backend/app/core/auth_shim.py` + `backend/app/services/audit_log_shim.py` — identical
  function names/signatures to the real modules, so merging is a one-line import swap. **Known
  gap, stated in the shim's own docstring**: `require_scope` here is a no-op (real per-division
  scoping needs `resq_user_scopes`, a table only `resq9`'s migration creates, not this branch's
  to add) — role-based `require_roles` is fully enforced, scope is not, until merge.
- [x] **Tests** (commit `d04db99`): 19 new (7 pure-logic, 12 API-contract — permission matrix,
  response shape, both location paths, 4×422, runtime). **Full backend suite: 68/68 passed, 1
  pre-existing unrelated skip** (same MCD64A1 fixture gap as every prior run this session).
  None of the new tests need Postgres — the endpoint never touches the database.
- [x] `docs/simulation/API_SPREAD.md` committed (commit `d04db99`): full request/response
  contract, wind provider, Cell2Fire disable, test locations.

**Stopped after Step 3, per instruction.**

## Step 4 / further evaluation — not started

## Verification audit — 2026-10-14

Independent evidence-based audit of the RESQ-6 wind-elongated ellipse implementation.
No code was changed; no new commits were created beyond this update.

### Starting state

- Branch: `resq6/simulation-engine` (HEAD `6296ed5`)
- Worktree: `/Users/kireeti/Desktop/Projects/RESQ/website/.claude/worktrees/agent-a8baea5d7612360f5`
- Working tree: clean (no uncommitted changes at audit start)

### Test results

| Test file | Runner | Passed | Failed | Skipped | Errors |
|---|---|---|---|---|---|
| test_spread_ellipse.py | venv pytest | 7 | 0 | 0 | 0 |
| test_spread_endpoint.py | venv pytest | 12 | 0 | 0 | 0 |
| All others (via system pytest) | system pytest | 55 | 0 | 1 | 0 |
| test_spread_endpoint (system pytest) | system pytest | — | — | — | 1 (psycopg dialect not installed in system Python; passes under venv) |

**Total: 74 passed, 0 failed, 1 skipped, 1 collection error (environment-only).**

### Geometry verification (independently measured)

| Claim | Result | Evidence |
|---|---|---|
| Major axis follows wind direction | **PASS** | East-wind: E-W span 0.382°, N-S 0.117°; North-wind: N-S 0.363°, E-W 0.123° |
| Axis ratio changes with wind speed | **PASS** | Calm ratio 1.046; 10 m/s ratio 4.003 |
| Calm wind → approximately circular | **PASS** | Circularity deviation 0.047 (< 0.25 threshold) |
| Spread area grows monotonically | **PASS** | Grid scale at 6h/12h/24h/48h: 18 km / 33 km / 63 km / 122 km |
| Three contours nested | **PASS** | All three levels present; level structure verified |
| Valid GeoJSON, correct CRS | **PASS** | EPSG 32644 (UTM zone 44N) returned for OD incident |
| Outside-coverage requests rejected | **PASS** | London → HTTP 422; unknown incident → HTTP 422 |

### Uncertainty characterisation (verified)

- Contours are **empirical member frequencies** (p_sum / N_MEMBERS), thresholded at 0.05/0.20/0.50.
  They are **not** calibrated probabilities. No calibration data exists.
  Labels `likely`/`possible`/`unlikely` are ordinal bands, not probability statements.
- Ignition jitter: uniform disk, radius 500 m, NumPy default_rng with deterministic seed.
- Wind perturbation: speed × U(0.7, 1.3), direction + N(0°, 15°), per-member, same rng.
- Reproducibility: same explicit seed → identical GeoJSON (**PASS**).
- Seed variation: different seed → different GeoJSON (**PASS**).
- Implicit determinism: identical request → identical output (seed from lat/lon/start/horizon) (**PASS**).

### Runtime (5 warm runs per horizon, single-threaded, macOS, real ERA5-Land wind)

| Horizon | Median (s) | Max (s) | Under 2 s? |
|---|---|---|---|
| 6 h | 0.010 | 0.071 | PASS |
| 12 h | 0.013 | 0.028 | PASS |
| 24 h | 0.013 | 0.027 | PASS |
| 48 h | 0.013 | 0.024 | PASS |

All horizons well under 2 s on first call; ~10–14 ms on warm calls. Target confirmed.
Note: wall_s in API response measured at 1.35 s on first call (includes wind fetch and rasterio
vectorization); subsequent calls ~70–100 ms. All well within the 2 s target.

### Weather verification

- All 4 development incidents: 48-hour ERA5-Land CSVs present, tz-aware timestamps, no gaps.
- Coordinates and t0 values in stub match `data/resq5/protocol_setup.json` exactly.
- `_fetch_era5land_temp_rh` makes one live Open-Meteo archive call per request; returns (None, None)
  gracefully on network failure. Wind data is unaffected. Cell2Fire never reads T/RH anyway.
- Forecast provider: implemented in `engine/wind_provider.py` and covered by
  `test_wind_provider_forecast.py` (19 passing tests in the existing R6 venv,
  rechecked 2026-10-15).
  It is disabled by default, rejects incomplete/error responses, and is not
  routed from the endpoint: `spread.py` intentionally keeps
  `use_forecast=False` until live incident lookup and RESQ9 auth/scope/audit
  blockers are resolved. No live forecast request was made in this verification.
- Unknown incident rejected with `WindUnavailable` (not silently substituted). **PASS**.

### API correctness

- All 4 incidents resolve to correct coordinates from stub. **PASS**.
- `inputs` in response reflects actual lat/lon/t0/wind_source used. **PASS**.
- Horizon validation: 0, 5, 7, 49, 100 → all HTTP 422. **PASS**.
- Both/neither location path → HTTP 422. **PASS**.
- Unauthenticated → 401; `range_officer` → 403; `control_room_operator` → 200. **PASS**.
- `require_scope` is a no-op shim. Per-division scope enforcement pending `resq9/product-pass` merge.

### Evaluation integrity

| Claim | Verified? | Evidence |
|---|---|---|
| DECISION_RULE.md committed before any tuning | **VERIFIED** | commit `7d64807` predates `78e9b83` (engine run) |
| Fair-rescore: 0W/1T/7L | **VERIFIED, corrected 2026-10-15** | Corrected runner + member-grid artifacts in `results/resq6/dev_member_grids_corrected_20261015/`; original fair-rescore used a different jitter sample for 59/60 members and is superseded (details in `RESULTS_DEV.md`) |
| Slope decision: 0W/7T/1L | **VERIFIED** | `results/resq6/dev/slope_term_scoring.json`; `decision: "DO NOT include slope term"` |
| Slope scoring committed before feature code | **VERIFIED** | commit `25de630` before `d28b6e5` in git log |
| Test set untouched | **VERIFIED** | No result files found for any of the 11 test-set candidates |
| Cell2Fire and ellipse results not conflated | **VERIFIED** | Cell2Fire AP/Brier from Step 2a; ellipse is Step 3 serving feature (no dev-set ellipse AP) |
| 6h/12h not scorable for any dev incident | **VERIFIED** | fair_rescore.json `scorable: false` for all 4 × 2 cells |

Note: The ellipse feature (Step 3) has never been scored against the development set.
RESULTS_DEV.md covers Cell2Fire (Step 2a). The ellipse is the baseline-b formula
(wind-elongated proximity), which *was* scored in RESULTS_DEV.md — it beat or tied Cell2Fire
on all 8 cells, but still lost to baseline-a on 7 of 8. No AP/Brier number for the
live endpoint's contours against VIIRS ground truth exists.

### Security / integration gaps identified

1. **`require_scope` is a no-op** — any authenticated user with the right role can compute spread
   for any incident, regardless of their division/state. Owned by `resq9/product-pass`.
2. **Auth shim JWT** — `make_access_token` is test-only and uses a dev secret. The real login
   endpoint (`POST /api/auth/redesign/login`) does not exist on this branch.
3. **Audit log** — `audit_log_shim.py` writes to a local SQLite file, not the production audit
   log. `TODO-MERGE` for `resq9/product-pass`'s real implementation.
4. **Incident stub** — `get_verified_incident` is backed by 4 hardcoded incidents. Must be
   reconciled with `resq8/firms-ingestion`'s `resq_incident_candidates` table + `resq9`'s
   verification audit log before live incidents can enter the spread workflow.
5. **T/RH network call** — `_fetch_era5land_temp_rh` makes a live Open-Meteo archive call on
   every historical spread request. Since T/RH are never consumed by the computation, this call
   is wasted latency. Acceptable for the Training path; should be removed or made optional before
   production deployment.
6. **Forecast wind is a stub** — live spread for a new incident requires implementing
   `forecast_provider()` in `wind_provider.py` (Open-Meteo or equivalent, interface already spec'd).

### Verdict

**READY AFTER SPECIFIC FIXES** — the ellipse endpoint is software-correct and passes all tests,
but is not operationally ready without: (1) real incident verification from `resq8`/`resq9`,
(2) real per-division scope enforcement from `resq9`, (3) real auth/audit from `resq9`,
(4) a live forecast wind provider. It is safe to integrate in a staging/prototype context
with the existing shims, provided users are clearly told this is a Training-data demo.
It must not be deployed as a live operational tool until items 1–4 are resolved.

## 2026-10-15 evaluation-alignment correction

The runner previously selected simulator frames from observation-overpass times and could score
an earlier frame against a fixed 24 h or 48 h horizon. `run_dev.py` now requires the exact
6/12/24/48 h prediction frame; VIIRS overpasses select only the observed mask. A fresh
development-only 60-member-per-incident run is in
`results/resq6/dev_member_grids_horizon_aligned_20261015/`. All 240 members completed; archive
hashes, dimensions, frame keys, source-frame metadata, and individual/aggregate result agreement
were verified. Fair rescoring from these grids gives 0 wins, 1 tie, 7 losses; the development
gate remains failed and the held-out set remains untouched. This horizon-aligned result
supersedes earlier 2026-10-15 member-grid results; details and per-cell metrics are in
`RESULTS_DEV.md`.

- [x] Paired ignition-jitter ablation (development only): 500 m reference vs 0 m, matched
  member-index wind perturbations, with each arm's frozen baselines evaluated at matching
  ignition blur. Both arms completed 240/240 members. 500 m arm: 0W/1T/7L; 0 m arm: 0W/0T/8L.
  Ranking and spatial capture changed substantially but inconsistently; no further jitter tuning
  or production parameter change is justified. Full per-cell results, spatial displacements, and
  provenance are in `RESULTS_DEV.md` and `results/resq6/dev_member_grids_zero_jitter_20261015/`.
  Next validation recommendation: synthetic cardinal-wind direction smoke tests before any
  physical spread-formulation changes. Held-out data remains untouched.
