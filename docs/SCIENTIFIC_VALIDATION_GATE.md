# TerraWatch scientific validation and release gate

Status: local software execution is demonstrated; geospatial and scientific
forecast validity are not established. This document separates those claims so
a successful simulator process is not mistaken for a validated forecast.

## Gate definitions and current evidence

| Gate | Evidence required before making the claim | Current evidence and status |
|---|---|---|
| A. Software execution | Record the executable, exact argv, actual subprocess return code/stdout/stderr, start/end or elapsed time, timeout, fresh isolated workspace, expected output schema and frame sequence. The execution record must be derived from the actual process result. | **Demonstrated for two local six-hour runs only.** The reports identify the Cell2Fire executable and command; the runner emits its `CompletedProcess` result and the verifier parses that record. Both exited 0, did not time out, and produced seven hourly frames. This is not evidence of forecast skill or a production service. |
| B. Output integrity | Hash every input and every output, record sizes and workspace-relative paths, require exact expected public outputs, validate schemas/values, and retain a manifest. | **Matching-run integrity demonstrated with a scope caveat.** Reports A/B contain 24 hashed artifacts apiece and their relative-path/hash maps match. The current verifier now requires the exact public frame/manifest inventory, checks binary grid values and manifest/grid agreement, and hashes produced outputs. The older reports did not record verifier/source/runtime hashes, and their temporary output workspaces were cleaned; the preserved reports cannot retroactively prove a full independent artifact inventory or code identity. |
| C. Reproducibility | Preserve immutable input, executable, code, runtime, command, seed/configuration, and output hashes. Repeat in a fresh workspace; explain any nondeterministic output differences. | **Partial.** The two reports have matching hashes for WorldCover, DEM, GFS CSV, lookup table, Cell2Fire binary, and all recorded outputs. They used seed 42 and the same six-hour configuration. Reports lack hashes for runner/verifier/source code and Python/runtime environment, so strict reproducibility is not yet established. Future reports from the strengthened verifier include code and runtime provenance. |
| D. Geospatial correctness | State CRS from authoritative metadata; establish affine/grid origin, dimensions, resolution, extent, row/column orientation, coordinate ordering, ignition placement, raster alignment/resampling, and frame-to-ground consistency. Verify with known coordinates and round trips. | **RESQ-5 grid conventions cross-checked; demo placement remains approximate.** RESQ-5 declares EPSG:32644, 30 m cells, north-to-south rows and west-to-east columns. For all four available cases, raster-array dimensions match protocol dimensions and the projected ignition agrees with its declared cell. The current 40×40 demo grid is a separate local grid and must not be overlaid on RESQ-5 arrays without reprojection/resampling. Its ASC writer expresses geographic-degree origins with a 30 m cell size, which is not a coherent georeferenced ASCII transform; the simulator ignores those origin values and the preview placement is approximate. This is not analysis-grade georeferencing. |
| E. Physical input validity | Inputs must match event, location, time, units and resolution; document source and every transformation. Fuel, terrain, ignition and weather assumptions must be independently justified for the intended ecosystem and period. | **Not established for historical Indian hindcasts.** The local demo stages ESA WorldCover 2021 v200, SRTM 1-arc-second elevation and a January 2024 GFS CSV. The runner uses a fixed demo ignition and repeats a 12-hour wind profile; it is not event-matched weather. WorldCover classes are mapped to Spanish Cell2Fire fuel models with `UNVALIDATED_DEVELOPMENT_PROXY`; temperature/RH are fixed by the simulator's S mode. RESQ-5 likewise labels its Spanish fuel crosswalk uncalibrated. These inputs demonstrate execution, not locally validated fire behavior. |
| F. Forecast skill | Compare forecasts against independent, time-aligned observed burned perimeters/areas with frozen labels, metrics, baselines and thresholds. Account for observation error, spatial/temporal uncertainty and event-level dependence. Keep calibration and evaluation data separate. | **Failed for the current RESQ-6 development benchmark; no held-out evidence.** The corrected horizon-aligned benchmark has 0 wins, 1 tie and 7 losses in its eight scorable incident/horizon cells; its frozen development gate requires at least 6 wins-or-ties. The held-out set remains untouched. The RESQ-5 protocol uses cumulative nominal/high-confidence VIIRS active-fire detections as a detection footprint, not a perimeter. Absence of a detection is not evidence of unburned area. MCD64A1 monthly burned-area timing is not a precise 24/48-hour perimeter and was not accepted as the primary truth. |
| G. Operational readiness | Verified event-matched inputs, validated forecast skill, explicit uncertainty/provenance, guarded failure behavior, monitoring, resource limits, security, rollback and authorization; verify end-to-end in the intended deployment. | **Not ready.** The demo manifest says `production_eligible: false`; `/api/spread/jobs` remains guarded with HTTP 503. Local execution does not authorize or enable operations. |

## Independent validation protocol required before forecast claims

1. **Freeze the question and events first.** Publish event inclusion/exclusion
   rules, region/ecosystem coverage, incident identifiers, ignition-location
   source and uncertainty interval, forecast origin (`t0`) rule, and horizons
   before inspecting evaluation outcomes. Do not substitute an event after
   seeing its score.
2. **Use independent reference perimeters.** Prefer field-verified or
   authoritative high-resolution burned-area perimeters with acquisition time,
   CRS, positional accuracy and completeness metadata. Keep VIIRS detections,
   cumulative detection footprints, simulated burn probabilities and simulated
   extents as distinct products. Do not call a VIIRS footprint a perimeter or
   treat its unobserved cells as known negatives. Do not use monthly MCD64A1
   dates as exact hourly/daily truth. Do not calibrate on the same reference
   observations later presented as independent validation.
3. **Align time honestly.** Record the reference acquisition interval and
   forecast valid time. Compare like times where possible. If no observation
   exists at a horizon, mark it unscorable; if the nearest earlier observation
   is used for a separately labelled sensitivity, publish the lag and do not
   present it as contemporaneous truth. Preserve ignition-time uncertainty and
   assess it without selecting the value that maximizes the score.
4. **Define spatial matching and masks before scoring.** Select a suitable
   projected metric CRS, fixed cell size/origin/extent, rasterization rule,
   boundary inclusion rule and positional-tolerance sensitivity in advance.
   Verify every source transform and row/column convention. Define valid-data
   masks from reference coverage; cloud, missing acquisitions and uncovered
   regions are unknown, not negatives. Report edge/domain truncation and
   excluded cells explicitly.
5. **Report complementary measures per event and horizon.** For probability
   surfaces report AP/PR, Brier score and reliability/calibration diagnostics;
   for a predeclared binary extent threshold report intersection-over-union,
   precision, recall and area ratio. Also report footprint capture and spatial
   displacement with units. Give event-level uncertainty intervals using an
   appropriate spatial/event-block method; grid cells are not independent
   replicates. Do not pool away per-event failures or make significance claims
   unsupported by the event sample.
6. **Freeze fair baselines and the decision rule.** Run every baseline on the
   same domain, valid mask, observation time, spatial tolerance and forecast
   origin. Freeze baseline definitions, primary metric, margins, missingness
   rules and acceptance threshold before evaluation. Report each event/horizon
   result and both probability and extent behavior; do not retune on held-out
   outcomes.
7. **Enforce a leakage firewall.** Use development events for iteration only.
   Hash and freeze code, inputs, model settings, scoring code and thresholds
   before opening held-out labels. One authorized held-out evaluation is
   performed only after the development gate passes and the evaluation plan is
   approved. Any subsequent tuning requires a new independent holdout.

The existing RESQ-6 rule (absolute AP comparison margin of 0.05 and at least
6 of 8 development cells wins-or-ties) is specific to that frozen benchmark.
It is not a general operational release threshold. Any new independent
evaluation requires owner-approved thresholds fixed before its outcomes are
seen; none are invented here.

## Current run evidence

The preserved reports are:

- `results/simulation-verification/cell2fire-6h-final-a-20261016.json`
- `results/simulation-verification/cell2fire-6h-final-b-20261016.json`

Both record successful isolated local executions (exit code 0; runner-reported
Cell2Fire durations 0.039 s and 0.031 s; seven frames; burned-cell sequence
`[1, 2, 10, 23, 43, 70, 101]`). Each has 24 output hash entries, and the
workspace-relative output hashes match across runs. Workspaces were cleaned;
the reports and hashes are retained, but the old report records do not provide
runner/runtime hashes. The current verification code has been strengthened
for future runs; no run was repeated for this document.

The RESQ-6 development benchmark evidence currently resides in a separate,
read-only worktree (`.claude/worktrees/agent-a8baea5d7612360f5`, branch
`resq6/simulation-engine`, HEAD
`4650cc599d4476bdc29cedcc1d05b7ab3cf28334`), not in this checkout's versioned
scientific-results tree. Its authoritative horizon-aligned record is
`docs/simulation/RESULTS_DEV.md` with `fair_rescore.json` under
`results/resq6/dev_member_grids_horizon_aligned_20261015/`. It reports 0
wins/1 tie/7 losses, including E2024-131853 24 h AP delta −0.0702268788.
Six- and twelve-hour cells had no qualifying VIIRS overpass. This is evidence
of a failed development comparison, not evidence about the untouched test set.
The historical benchmark was neither changed nor copied into this checkout.

## Current implementation references and next gate

- Input construction and provenance: `backend/inference/prepare_demo_inputs.py`,
  `backend/inference/proxy_mapping.py`,
  `backend/inference/run_demo_simulation.py`.
- Isolated execution and artifact verification:
  `backend/inference/verify_demo_simulation.py` and
  `backend/tests/test_simulation_verification.py`.
- RESQ-5 grid/observation assumptions: `docs/RESQ5_PROTOCOL.md`,
  `docs/RESQ5_RESULTS.md`, `data/resq5/protocol_setup.json`, and
  `scripts/resq5/analyze.py`.
- Operational boundary: `backend/app/routers/operations.py` and
  `backend/tests/test_simulation_pipeline.py`.

The smallest scientifically meaningful next step is not parameter tuning: it
is to obtain an independently sourced, time-stamped perimeter dataset and
approve the event/time/mask/spatial protocol and thresholds before scoring it.
Until then, use “local software execution demo” rather than “validated
forecast.” Keep the guarded operational route disabled and do not run the
held-out RESQ-6 evaluation while its development gate is failed.
