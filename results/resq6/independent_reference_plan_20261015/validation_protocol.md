# Proposed single-case exploratory protocol (nominal 24 h)

Status: proposal; no owner approvals or independent reference yet. All outputs must be isolated from the official VIIRS benchmark.

## Question and case

Conditional on the existing prescribed initial point/state and saved inputs, compare the saved hour-24 Cell2Fire output with an independently observed, time- and coverage-documented perimeter or scar. First screening candidate is E2024-131853, selected before inspecting scores using event/initial-state provenance, domain and local reference metadata; preserve that sequence unless an outcome-blind exclusion reason is documented. DMM onset error is a separate question: the saved simulation does not consume a DMM prediction.

## Time

Protocol proxy origin is 2024-02-16 08:00 UTC; model t+24 is 2024-02-17 08:00 UTC. Do not call proxy time a verified ignition. Record reference acquisition/mapping start and end in UTC, original timezone, and signed/absolute lag to nominal target. Do not shift the saved frame, interpolate a daily product to an arrival time, or relabel a post-event scar as an exact 24 h perimeter. No numeric lag tolerance is established; owner approval is required. If the rule fails, no nominal-24h score.

## Spatial registration and labels

Freeze archived model grid: EPSG:32644, 30 m, 375×375 with exact saved transform/origin. Validate against member manifest. Preserve native source CRS, transform, resolution, geolocation/positional uncertainty and processing versions. Reproject vectors with recorded transformation. For raster references use area-overlap or other preapproved mapping; never upsample coarse burn products into falsely precise 30 m truth. Retain fractional overlap when supported. Any binary conversion rule must be approved before scores are viewed; uncertain boundary cells remain ambiguous. Report edge contact; outside-domain area is not unburned.

## Valid / unknown mask

Build source-specific AOI valid mask from actual data QA and coverage. S2: SCL/cloud probability if supplied, cloud/cirrus/shadow/snow/water/nodata and saturation semantics; Landsat: QA_PIXEL, QA_RADSAT, fill and MTL; authority perimeter: distinguish surveyed/covered region from unreported area. Record smoke/obscuration where known. Cloud, smoke, no-data, outside-scene, invalid-QA and unobserved cells remain unknown and are excluded from positive/negative scoring. Never silently assign unknown to unburned. Numeric coverage/cloud thresholds are owner decisions; absent approval, report descriptive coverage only.

## Metrics and uncertainty

On approved binary reference and valid support, report separately: IoU; Dice/F1; exact observed/predicted positive cell and area counts; omission area (observed not predicted / observed); commission area (predicted not observed / predicted); absolute and relative burned-area bias; centroid displacement with CRS/weighting. AP/Brier only if negatives are defensible, on valid cells only, with prevalence. No tuned threshold/calibration. Fractional/uncertain references require a preregistered area-weighted or interval method. Report acquisition lag, valid/unknown proportions, spatial distribution, positional uncertainty, ambiguous-boundary area, source quality and edge contacts. No pooling/significance claim for one incident.

## Falsification and artifact separation

Use toy fixtures with known transform/overlap, row orientation and unknown masks; assert unknown cells never count negative. Verify UTC parsing, source metadata and grid alignment fail closed. Validate saved member hashes, exact frame 24 and member count before/after. Do not use `rescore_fair.py` CLI while its provenance guard rejects legacy manifests; do not bypass it. Any future exploratory scorer must be separate, provenance-complete and owner-approved. Write to a unique `results/resq6/independent_reference_<run-id>/`; never alter official masks, scores, baselines, thresholds, `RESULTS_DEV.md` or gate.

## Stop criteria

No scoring if reference/source/time or event association is unverified, owner time rule is missing, valid mask is absent, unknown would become negative, grid metadata disagree, license is unclear, initial state is misunderstood, or source provenance is incomplete. Post-event comparison may be separately approved and described at actual time; it is not exact hour-24 accuracy.
