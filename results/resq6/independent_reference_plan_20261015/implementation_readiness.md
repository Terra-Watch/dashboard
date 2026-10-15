# Implementation readiness

Preparation only; no application, simulator or official benchmark code changed.

## Existing reusable work

- Exact-horizon development member grids/manifests: `results/resq6/dev_member_grids_horizon_aligned_20261015/`; use existing 24 h frame only after hash and metadata validation.
- `scripts/resq6/run_dev.py`: saved frame/output convention; do not run.
- `scripts/resq6/rescore_fair.py`: frozen benchmark helpers, but CLI rejects archived manifests missing `ignition_jitter_radius_m`. Do not bypass or fabricate it. The VIIRS method is not this independent-reference evaluator.
- `results/resq6/observational_validation_investigation_20261015/local_reference_inventory.json`: local VIIRS/MCD inventory and hashes; no local S2/Landsat/CLMS granule or event perimeter found.
- Temporal audit and failure-mode artifacts include time/score reproduction and geometry diagnostics. Current run-source hashes differ from some historical archive provenance, as already disclosed in the investigation.

## Work immediately feasible

1. Obtain D1–D10 owner responses and identify accountable owner.
2. After approval, run only metadata-level searches specified in acquisition manifest; log exact query, date, catalog, scene IDs and “no candidate” results. Do not fetch raster assets yet.
3. Verify reuse terms; obtain separate approval before acquisition.
4. Build a separate fail-closed importer/evaluator validating CRS, transform, UTC/time semantics, QA/valid mask, unknown handling, checksums and license metadata.
5. Store exploratory artifacts in a unique `results/resq6/independent_reference_<run-id>/`; do not amend benchmark.

## Tests required after approved reference exists

- Analytic CRS/affine alignment, north-up row orientation, vector/raster boundary cases.
- Cloud, smoke, no-data, saturation, outside-coverage cells remain unknown and never enter negative counts.
- Fractional/area mapping and no false 30 m precision from coarse pixels.
- UTC/time rejection for missing, ambiguous, daily-only or out-of-rule observations.
- Hand-calculated IoU/Dice/commission/omission/area-bias and zero-denominator cases on valid support.
- Uncertainty boundary handling, hash/provenance failure, mismatched grids rejected, no output after validation failure.
- Synthetic end-to-end raster/perimeter + unknown-mask fixture (tests evaluator only, not physical accuracy).
- Before/after hashes show all historical member grids and official results unchanged.

## Blockers

- No scene or perimeter availability is confirmed; no independent source is acquired.
- D1–D10 not approved, particularly target meaning, origin, time lag, valid/unknown policy, mapping and metrics.
- Local MCD has no positive pixels for selected case and is not exact-time truth; VIIRS is not independent.
- Standard scorer CLI rejects historical member manifests; any future reader must validate complete metadata, not bypass guard.
- No claim about physical spread accuracy follows from this prep.

This document authorizes no catalog query/API, download, raster derivation, simulation, score or publication. Immediate next action: owner review and approval for metadata-only screening.
