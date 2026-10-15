# Proposed observational validation protocol — approval required

This proposal does not alter the frozen RESQ6 benchmark and does not authorize scoring. Keep onset prediction (DMM) distinct from conditional spread (Cell2Fire). No DMM-to-Cell2Fire bridge or independently observed initial perimeter is established by the local inventory.

## Proposed sequence

1. **Freeze the question and origin.** Name the target as either detected active-fire presence, newly detected cells, or physical burned-area spread. Record `t0` and whether it is actual ignition, first detection, or a protocol proxy. Current `t0` is a constructed origin (first selected detection minus 12 hours, floored), not a verified ignition time.
2. **Keep nominal horizons.** Retain 6/12/24/48 h prediction frames. Associate each target with its actual acquisition/burn-date interval; record signed horizon-minus-observation lag. Do not interpolate or substitute a later observation. Score a horizon only under an owner-approved maximum-age rule; otherwise mark it unavailable, not negative.
3. **Represent uncertainty explicitly.** For VIIRS, retain source acquisition time to its stated minute precision, platform/pass, confidence, footprint metadata and association rule. For MCD64A1, preserve ordinal burn day and `Burn Date Uncertainty` as an interval/uncertainty field. Do not turn it into a point timestamp or assign it to a 6/12/24/48 h bin until an owner-approved product interpretation exists.
4. **Align space once, reproducibly.** Record source CRS, affine transform, cell/pixel dimensions, domain boundary rule and exact coordinate operation. For MCD64A1, first compare at native sinusoidal pixels or use an approved area-overlap mapping into EPSG:32644; do not nearest-neighbor paint 463 m values into many 30 m cells and count them as independent observations. For VIIRS, either preserve the current 375 m key mapping or approve a documented footprint-aware alternative using scan/track dimensions. Never assume nominal resolutions imply aligned grids.
5. **Use three-valued observation state.** Per reference time/cell, distinguish positive, confidently negative, and unknown/unobserved. Exclude unknown from binary metrics. A negative requires an adequate, quality-valid observation opportunity and no positive under the frozen event rule. Preserve source fill/water/QA/special-condition codes; cloud, invalid, and missing observations must not become zero. Publish positive/negative/unknown denominators and coverage maps.
6. **Select metrics by target.** For independently mapped physical burned area, report area overlap (IoU/Dice), commission/omission area, boundary-distance summaries, and area bias on valid common support. For VIIRS detection agreement only, AP and Brier may describe ranking/probability against valid observed detection opportunities; label them as detection metrics, not perimeter accuracy. Do not mix these into the historical official score.
7. **Report uncertainty.** Retain per-pixel burn-date uncertainty, spatial resolution/registration uncertainty, event-association uncertainty, and observation-age lag. Report sensitivity only to pre-approved interpretations; do not pick whichever produces a better score.
8. **Aggregate without dominance.** Publish every incident × horizon cell. Do not pool all pixels across incidents as the primary result. If an aggregate is desired, obtain approval for a case-balanced summary and its uncertainty method; pixels and ensemble members are not independent incidents.
9. **Use independent references for physical spread.** Highest-value evidence is a time-stamped incident perimeter or burn progression from an authoritative mapping source, with known acquisition times, CRS, source/quality, uncertainty, and full domain coverage. A suitable high-resolution pre/post Sentinel-2 or Landsat product may help delineate scars, but scene timing/cloud/valid masks and event attribution must be verified. MCD64A1 can be a coarse contextual cross-check, not exact hourly truth.
10. **Keep DMM separate.** Evaluate onset location/time against independently validated ignition/onset references. Only then define the initial condition passed to Cell2Fire; do not attribute DMM onset error to conditional spread error.

## Explicit owner approvals needed before official comparison

- Target semantics: active-fire detection, cumulative detected presence, newly detected spread proxy, or physical burned area/perimeter.
- Authoritative forecast origin and event-association/pre-origin rule.
- Maximum observation age, treatment of observations after a horizon, and missing-horizon policy.
- Interpretation of MCD64A1 ordinal burn date and uncertainty; QA codes and valid-observation requirements.
- Definition/source of valid negatives and unknown-cell exclusion.
- Spatial support, source footprint treatment, CRS transform, resampling/area aggregation, and boundary inclusion.
- Metric denominators and primary metrics for each target; whether and how any incident-level aggregate is used.
- Acceptance threshold/gate for any new benchmark; do not inherit or change the old gate implicitly.
- Data-use/licensing approval for any future reference acquisition or redistribution.

No owner identity is named here because none was established by the inspected project material. Until these approvals and suitable data exist, the official benchmark and its failed development gate remain unchanged; held-out evaluation stays prohibited.
