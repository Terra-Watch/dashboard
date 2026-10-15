# RESQ6 development failure-mode investigation

Date: 2026-10-15. Scope: four development incidents only. No held-out data were opened; no data were downloaded; no Cell2Fire run, parameter tuning, label change or benchmark change was performed.

## Baseline and reproduction

The official development result remains **0 wins, 1 tie, 7 losses**. The scorer's `score()` helper recomputed engine AP/Brier from all hash-verified saved member archives and the current selected cumulative VIIRS masks. `blurred_baseline()` recomputed both frozen baselines with the existing local cached ERA5-Land wind and 500 m/60-point blur. All six values per scored cell (engine AP/Brier, baseline A AP/Brier, baseline B AP/Brier) matched `temporal_alignment_audit_20261015/official_score_reproduction.json` within 1e-12 in all eight cells. No external data request occurred.

The full `rescore_fair.py --member-grid-dir ...` command was attempted once and stopped before scoring: current CLI validation requires `ignition_jitter_radius_m` in each archive manifest, but the historical manifests lack that field. The helper-level reproduction used the implementation's scoring functions without editing/bypassing the CLI guard. The metrics and original baseline calls are in `per_incident_diagnostics.json`.

| Incident | h | Engine AP | Best frozen baseline AP | Δ AP | Engine Brier | Call | Obs lag before horizon |
|---|---:|---:|---:|---:|---:|---|---:|
| E2024-131853 | 24 | 0.508 | 0.578 | −0.070 | 0.00238 | LOSS | 0.63 h |
| E2024-131853 | 48 | 0.332 | 0.535 | −0.203 | 0.00499 | LOSS | 23.80 h |
| E2024-135332 | 24 | 0.042 | 0.142 | −0.100 | 0.00369 | LOSS | 10.28 h |
| E2024-135332 | 48 | 0.063 | 0.128 | −0.065 | 0.03005 | LOSS | 10.60 h |
| E2023-084925 | 24 | 0.261 | 0.887 | −0.626 | 0.00093 | LOSS | 11.15 h |
| E2023-084925 | 48 | 0.430 | 0.600 | −0.170 | 0.01124 | LOSS | 10.60 h |
| E2024-155286 | 24 | 0.366 | 0.492 | −0.126 | 0.00307 | LOSS | 11.23 h |
| E2024-155286 | 48 | 0.465 | 0.492 | −0.027 | 0.00536 | TIE | 35.23 h |

6 h and 12 h frames exist and were examined descriptively, but no qualifying VIIRS target exists at those horizons; no accuracy score was calculated there.

## Evidence by failure mode

### Temporal alignment

The observation used for each official score is before its nominal simulation horizon; seven gaps are 10.28–35.23 h, and one is 0.63 h. This direction and magnitude are directly supported by the audited acquisition timestamps. Their effect on AP is not isolated: there is no approved maximum observation age, and the near-aligned 131853/24 h comparison still loses by 0.070 AP. Thus temporal misalignment is a confirmed protocol limitation and plausible contributor, **not a sufficient established explanation**.

### Spatial target semantics and direct mismatch

The target is a cumulative union of VIIRS type-0 nominal/high active-fire detection cells. Detections are projected and assigned through global-origin 375 m keys to 30 m model-cell centers. It is not an observed burned perimeter or a 30 m burn scar. The saved label mask and simulator grid share the same domain shape/30 m lattice, but the label's underlying spatial support is coarser and detection-based. No cloud/clear-view/valid-observation mask exists, so target-false cells cannot be interpreted as known unburned.

The direct descriptive diagnostics show 24/48 h probability-centroid distances of **223–553 m** for three cases, but **787 m/1,136 m** for E2024-135332. The fraction of total predicted probability falling within positive VIIRS cells is **5.7–38.6%** among the eight comparisons. These are map relationships, not perimeter accuracy metrics. E2024-135332 has 312/1,131 positive target cells while the median simulated member has 598/5,108 burned cells at 24/48 h; the incompatible time/semantics preclude treating this as a validated area overprediction.

### Conditional initialization versus DMM onset

The simulator is conditional on one prescribed ignition coordinate from `protocol_setup.json`, perturbed by the saved ensemble procedure; it does not consume a DMM onset prediction. Therefore DMM onset error is not directly part of these conditional-run scores. Initial-condition/target alignment remains relevant: the prescribed ignition cell lies outside both selected E2024-135332 VIIRS masks and inside the other six masks. This does not establish whether the coordinate, event association, or mask is wrong. There is no DMM output/bridge in these artifacts to quantify onset error.

### Simulated footprints, growth and variability

All 240 saved member archives passed manifest SHA-256 and exact-frame checks. Across all four horizons, burned-cell counts grow between consecutive saved frames; no member loses cells in any adjacent transition. Per-frame cell counts, area, centroid, edge contact, member disagreement and transition IoU are in `footprint_descriptives.json`.

At 24 h, median member footprint ranges from **107 to 598** 30 m cells; at 48 h it ranges from **1,217 to 5,108**. Every incident/horizon has 58–60 unique member masks (out of 60). Only three members touch the domain edge, all E2024-135332 at 48 h; this is a localized potential truncation issue, not a general explanation for all eight cells. E2023-084925 shows a very wide member-size range (24 h 69–1,556 cells; 48 h 483–5,120), while the small E2024-155286 48 h observed mask (482 positives) contrasts with a 1,334-cell median simulation. These patterns identify cases for further reference/input review but establish no cause.

### Simulator and input pipeline

The completed synthetic cardinal-wind test already verifies north/east/south/west downwind direction, north-up row orientation and deterministic repeats on a uniform synthetic grid. It was not rerun. No reversed-wind or grid-axis defect is established. Prior audits documented and corrected historical runner defects in jitter indexing and exact-horizon frame selection; the current archives report exact 6/12/24/48 frames.

There is a remaining reproducibility caveat: the archived `recovery_provenance.json` hashes for `run_dev.py` and `rescore_fair.py` differ from current files, and member manifests omit jitter radius and per-member weather perturbation values. Static WorldCover/DEM, cached ERA5-Land weather and fuel mapping are documented in source/audits, but the archive does not establish every historical member input sufficiently to isolate fuel, terrain or incident-specific weather errors. No simulator/input defect was confirmed.

## Conclusions

- **Is temporal alignment the only explanation?** Not established; it is unlikely to be the only relevant issue because the target is semantically different from a perimeter and lacks coverage validity, and the near-aligned cell also loses. None of these observations proves causal contribution.
- **Is target-semantic mismatch independently important?** Yes, as a confirmed interpretation/validity limitation: detection cells and unknown non-detections are not a physical burned-area truth set.
- **Is onset-location error confounded with spread?** The DMM prediction is absent; simulations are conditional on prescribed, jittered points. DMM error cannot be measured here, though one case's prescribed ignition is outside its selected detection mask.
- **Evidence of simulator/input defect?** None confirmed in current spread physics or the tested wind convention. Historical runner corrections are documented. Three 48 h members touch one case's domain edge; investigate domain sufficiency before making claims for those members.
- **What remains unanswerable?** Actual perimeter/area accuracy, valid negatives, temporal causal effect, DMM onset error, and exact historical member-input replay.
- **Highest-value next step:** acquire/approve one time-stamped independent perimeter progression with coverage/uncertainty metadata, freeze temporal and spatial rules, and compare existing saved simulations conditionally from a known initial state. Details are in `next_experiment.md`.

## Reproducibility and scope

`analyze_failure_modes.py` reproduces diagnostics using saved artifacts only. Input/member hashes and generated report hashes are in `provenance_manifest.json`. JSON parsing, focused unit tests, compilation and `git diff --check` are recorded there. The official 0/1/7 benchmark and its gate are unchanged; held-out evaluation remains prohibited.
