# Proposed two-stage evaluation protocol for RESQ6

This is a proposal for owner review, not an approved replacement for `docs/simulation/PROTOCOL.md`. Preserve the frozen official benchmark and its 0 wins / 1 tie / 7 losses as historical results. Do not alter its target, baseline, or ±0.05 AP decision rule retroactively.

## Stage 1 — DMM fire-onset prediction

Evaluate the DMM only for its stated task: one-day-ahead fire-onset forecasting. Use the paper's actual onset definition, sampling unit, labels, temporal split, and metrics once the exact paper and DMM implementation are available. Do not substitute Cell2Fire burn grids, VIIRS cumulative masks, or MCD64A1 burn dates for the paper's onset labels without a separately approved mapping. Report onset discrimination, calibration, event timing and location error only where those labels and definitions support them. Keep incident-level separation and prevent post-origin observations from entering predictors or threshold selection.

Current gap: no DMM code or DMM-to-Cell2Fire invocation was found in the inspected `backend/`, `scripts/`, or simulation integration contracts; `main_core(2).pdf` was not present at the supplied filename. Its exact input/output schema and onset-label meaning therefore remain unverified. No interface is invented here.

## Stage 2 — Cell2Fire conditional spread

### Primary scientific question

Given a specified ignition and environmental inputs, does Cell2Fire reproduce the subsequent measured spatial fire extent? This must be tested with physical fire perimeters/burned-area references. Current local inputs do not support the answer. Until such references exist, the existing simulation is demonstrable as a conditional model run, not a validated forecast.

### Recommended experiment once references are available

1. **Choose the conditioning mode before evaluation.** First evaluate prescribed ignition to isolate Cell2Fire conditional spread. Prescribe a documented ignition coordinate/time and initial condition; do not mix uncertainty in onset with conditional spread. A separate end-to-end experiment may later feed DMM output, but it must not replace the prescribed-ignition result.
2. **Freeze start time.** Record a physically interpretable ignition/start timestamp with timezone and source. The existing `t0` is a protocol proxy, 12 hours before first associated detection, not established ignition time. Do not silently call it observed ignition.
3. **Freeze horizons.** Retain product horizons 6/12/24/48 h only as forecast elapsed times. For each physical reference, record actual acquisition/valid time and offset from the nominal horizon. The acceptable age tolerance and no-observation behavior are owner decisions; never select a post-horizon reference or interpolate without a separately validated method.
4. **Reference and coverage.** Require a georeferenced initial and target perimeter or burned-area-change reference, per-pixel quality/validity and uncertainty, spatial resolution, timestamp, incident ID, and coverage boundary. Where reference is invalid/unobserved, mark cells unknown, not unburned. Positive/negative meanings must be defined for the chosen perimeter product.
5. **Grid alignment.** Preserve source reference geometry. Define a projected CRS and a common evaluation unit before scoring. Avoid upsampling a coarse burned-area product to 30 m and treating subpixel cells as independent observations. Report native reference resolution and mapping rule; perform sensitivity analysis only under a frozen plan.
6. **Metrics.** For polygon/perimeter references, report per incident/horizon area intersection-over-union or Dice, commission/omission area, and boundary-distance summaries (e.g., symmetric boundary distance/percentiles). Report uncertainty/coverage denominators and area bias. These are candidates, not acceptance thresholds. If using VIIRS only, report AP/Brier on valid covered cells as agreement with detections, not physical accuracy; this is not presently possible for all cells because coverage is missing.
7. **Comparators and decisions.** Keep any comparator definitions and acceptance rule pre-registered. The current AP ±0.05 rule belongs to the official development comparison and must not be silently repurposed as a physical-perimeter threshold. Report per incident/horizon; do not pool tiny incident counts or make significance claims.
8. **Reproducibility.** Archive raw references and quality masks, checksums, origin/ignition decisions, input rasters/weather, derived ASC grids, exact per-member weather/ignition inputs, simulator binary and lookup hashes, command line, source revision, runtime versions, raw outputs, rasterization code, scoring code, and report. Existing historical source hash and member-weather omissions must be closed for exact simulation replay.

## VIIRS-only supplementary evaluation

If owners approve a separate detection-agreement target, use incident-linked cumulative n/h detections at their true acquisition timestamps; require an approved maximum age and leave missing horizons unscored. Positive cells are detections. A negative must have documented valid observation opportunity through the target time and no qualifying detection. Cloudy, unobserved, ambiguous, or missing cells are unknown and excluded from binary AP/Brier denominators. Publish positive/negative/unknown counts and coverage maps. Current 6/12 h cases remain unscorable; most 24/48 h targets are stale. Do not describe these metrics as burned-area/perimeter accuracy.

## Separating the two stages in an eventual pipeline

Report at least three distinct error sources:

- **Onset occurrence:** whether/when an onset occurs (DMM task, with DMM's own labels).
- **Onset location:** spatial error or uncertainty of the DMM-predicted ignition relative to an independently defined ignition reference.
- **Conditional spread:** Cell2Fire's footprint error given a fixed, known ignition and environmental inputs.

Only after those are separately characterized should an end-to-end result combine DMM onset probability/location uncertainty with Cell2Fire's conditional spread ensemble. The combination must propagate onset probability and ignition-location uncertainty rather than treating a DMM point estimate as certain. No DMM-to-Cell2Fire contract exists in inspected code: input coordinate/time schema, probability threshold or sampling rule, no-onset path, uncertainty distribution, environmental-source handoff, and attribution/reporting contract all require owner approval.

## Required owner decisions

- What physical quantity is the intended target: active-fire detection agreement, burned-area change, or mapped fire perimeter?
- What defines the forecast origin/observed ignition, especially for pre-detection time and E2023-084925's separate pre-origin detections?
- What target-age rule and missing-horizon behavior are acceptable? No number is proposed here.
- Which reference source, product version, coverage/quality semantics, uncertainty, and spatial unit establish valid positives, negatives, and unknowns?
- How should coarse reference pixels be compared to the 30 m simulation grid without pseudoreplication?
- Which Stage 2 metrics and acceptance criteria will be frozen before the new evaluation?
- Is and when is a DMM-predicted ignition supplied to Cell2Fire, and how are onset probability, ignition-location uncertainty, no-onset cases, and model-attribution reported?
- Who owns approval? No individual or role was identifiable from the inspected documents.

Until these are resolved and appropriate references are available, do not run a new scored physical-accuracy evaluation and do not access held-out incidents.
