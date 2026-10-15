# Next experiment recommendation

## Recommendation: a pre-registered independent-perimeter alignment study, not another simulator tuning run

The saved-grid investigation does not establish that temporal lag alone explains the low AP, nor does it confirm a Cell2Fire physics defect. It does establish a target-semantics problem (cumulative active-fire detections versus simulated burned area), absent valid-observation masks, and an ignition/target mismatch in E2024-135332. The existing MCD64A1 data are too coarse and temporally uncertain to arbitrate these causes. Additional synthetic wind tests would not answer this real-case observation question.

The highest-value discriminating study is one development-only case with an independently mapped, georeferenced fire perimeter/progression at a defined initial time and at the existing 24h and 48h targets, with acquisition timestamps, valid/unknown coverage, spatial uncertainty, and licensing provenance. Before examining scores, the owner must approve forecast-origin semantics, maximum observation age, spatial mapping and unknown-cell rules. Then compare the already-saved Cell2Fire probability/footprint to that perimeter on common valid support. Keep DMM/onset evaluation separate; use a known/prescribed initial perimeter so conditional spread is not confounded with uncertain onset. Do not rerun or tune Cell2Fire for this study.

This design separates:

- stale-target effects, by using actual timestamped perimeter snapshots and reporting horizon lag;
- target-semantics effects, by comparing model burned area to burned-area perimeter rather than thermal detections;
- observation-coverage effects, by excluding unknown cells under an approved mask;
- onset/initialization effects, by conditioning on an explicitly known initial state.

If such a reference cannot be acquired for a development case, no existing local artifact can resolve physical spread error; continue only with labeled descriptive analyses, not new official scores. The current scorer/manifest `ignition_jitter_radius_m` incompatibility should be repaired as a separate reproducibility task before the next CLI-based score reproduction, without weakening its validation.
