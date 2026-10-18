# 07. Product integration

Applies only to what passes its gate. Until then the product keeps the current behaviour and wording.

## 1. Today (verified in the repository at `a1ac62a`)

- **Scenario tab**, Control Room only, per incident at `/app/incidents/:id`. Shown only when `SCENARIO_PLANNER_ENABLED=true` and the incident has coordinates. The spread maths runs in the browser (`frontend/src/features/scenarios/engine/`). Saving writes a timeline note only.
- **Backend on this branch:** `POST /spread/jobs` returns 503 ("Spread examples are unavailable until each run has isolated output storage and approved access controls"), and `GET /spread/validation` serves an imported monthly check. **The wind-ellipse endpoint described in `docs/simulation/API_SPREAD.md` (`POST /api/redesign/spread`, `backend/inference/engine/spread_ellipse.py`) is not present in this tree.** I searched for it at `a1ac62a` and found no code. `docs/simulation/ENGINE_DECISIONS.md` records this as a cross-branch dependency still to reconcile. Reconciling it is therefore a Phase 4 task, not an assumption.
- **Demo path** `backend/app/services/simulation_service.py` runs a fixed demo simulation as a subprocess (`similipal-demo`); not an operational forecast.
- The Control Room map profile lists a `scenario` layer id. I found no code on this branch that draws a scenario on the main map (searched `features/ops/MapPage.tsx` and `features/map/MapView.tsx`).

## 2. Where compute should run

| Component | Cost | Placement |
|---|---|---|
| Wind-ellipse envelope from the front | Milliseconds to seconds | Synchronous endpoint, cached by (front hash, wind, horizon) |
| Tier 1 empirical model | Milliseconds per case | Synchronous endpoint |
| Tier 2 ensemble (about 60 members, Python) | Seconds | Synchronous with a time limit, or short background task |
| Cell2Fire (60 subprocess runs) | Tens of seconds to minutes | **Queued job** with a worker pool, progress, cancel, retries and a concurrency cap. Only if it ever passes its gate |
| Re-forecasting when a new satellite pass arrives | Batch | Background job triggered by ingestion, results stored |

Rule: do not put cheap work behind a queue, and do not run expensive work inside a web request.

## 3. API sketch (to be refined in Phase 4)

- `POST /api/forecast/spread` with incident id, forecast origin and horizon. Returns: model name and version, input provenance (pass time and source, wind source and issue time), probability surface (stored raster plus vector bands), advance summary (distance, bearing), envelope levels, calibration note, and the status "indicative" or "validated".
- `GET /api/forecast/spread/{id}/metrics` returns the skill statement for that model version (the numbers from the frozen study), so the UI can show them beside the map.
- Input validation, role check (Control Room and staff only), audit-log entry, and idempotent caching keyed by input hash.

## 4. UI

- Keep it on the **incident Scenario tab** first. Add a map layer toggle later, off by default, drawn with the contrast rules already agreed for risk layers (two-tone outline, semi-transparent fill, legend from tokens).
- Show uncertainty as nested envelopes (for example 50% and 80%), never a single crisp outline, and no animation.
- Always show: source and time of the last pass used, wind source and issue time, model and version, and the measured skill statement. If the pass is old, say so.
- Wording: "Indicative spread envelope" until Gate F passes; "Spread outlook" after, with the skill line.
- Offline and failure: show the last result with its time, or a plain message; never fabricate a forecast.

## 5. Monitoring and rollback (Gate G)

- Log every forecast with its inputs and the later observed front when one arrives (shadow scoring), so skill is tracked in production.
- Alert if rolling skill falls below baseline, if inputs go stale, or if a model version changes.
- A configuration flag switches any model back to the baseline envelope without a deploy.
- Resource limits on request size, ensemble size and queue depth.

## 6. Data flywheel

Add a field to the incident close-out: an optional final perimeter (drawn or uploaded) with time and method. These become the independent ground truth for later studies. Privacy and authorisation follow the existing audit rules.
