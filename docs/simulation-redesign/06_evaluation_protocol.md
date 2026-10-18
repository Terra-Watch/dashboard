# 06. Evaluation protocol and pre-registration

This file is the template for the frozen protocol. A copy with every blank filled in is committed **before** the first score is computed. After that, only a dated, signed amendment changes anything, and amendments never follow a look at held-out results.

## 1. Splits and leakage controls

| Rule | Detail |
|---|---|
| Unit of replication | The **event**, never the pixel or the pass pair |
| Split key | By event, with spatial blocks (for example state or district) and by year, so neighbouring fires and the same fire season do not sit on both sides |
| Sets | Train, calibration, validation (for model choice), test (opened once) |
| Test set | Opened **once**, after the protocol and all models are frozen. Results reported whatever they are |
| No peeking | No threshold, feature, cluster rule or baseline constant is changed after seeing validation or test results of the thing it affects |
| Leakage test | Shuffled-order and shifted-time controls (file 05) must collapse skill to baseline |
| Feature time | Every feature uses only information available at forecast time. Forecast weather uses the issue time, not later analysis |
| Repeated fires | Events within a stated distance and time window are grouped and kept on the same side of the split |

## 2. Statistics

- Primary comparison: paired difference per event versus the best baseline, event-block bootstrap (resample events, with spatial blocks) for the interval.
- Report per-event results in a table; do not pool away failures.
- Multiplicity: one primary metric and one primary horizon. Everything else is labelled secondary.
- Report effect sizes and intervals first. A p-value alone is not a result.
- State the number of independent events and the number excluded, with reasons.

## 3. Pre-registration checklist (fill before scoring)

- [ ] Product question and horizons (file 02, section 4)
- [ ] Study years, regions, fire types in scope
- [ ] Event clustering rule and parameters
- [ ] Valid-observation mask rule and the treatment of unknown cells
- [ ] Lattice, CRS, domain margin rule
- [ ] Baseline definitions and constants (B0 to B4)
- [ ] Primary metric, margin, interval method, minimum events (from Phase 0 variance)
- [ ] Supporting metrics and the stratification variables
- [ ] Split rule, random seeds, group definition
- [ ] Weather sources, forecast issue-time rule, reanalysis-only flag
- [ ] Candidate models, hyperparameter search space and budget, how validation picks among them
- [ ] Calibration method and what counts as a calibration pass
- [ ] Acceptance rule and the exact wording each outcome allows (file 04, section 5)
- [ ] Named person who signs the freeze, and the date

## 4. Mapping to the validation gate (`docs/SCIENTIFIC_VALIDATION_GATE.md`)

| Gate | How this plan meets it |
|---|---|
| A. Software execution | Run records with command, return code, timing, isolated workspace |
| B. Output integrity | Hashes of inputs and outputs in the dataset and run manifests |
| C. Reproducibility | Fixed seeds, pinned environment, repeat runs compared by hash |
| D. Geospatial correctness | CRS and lattice recorded; synthetic and real alignment checks; mask handling |
| E. Physical input validity | Input provenance per case; reanalysis vs forecast labelled |
| F. Forecast skill | The frozen protocol above, on independent events |
| G. Operational readiness | Phase 4: monitoring, limits, rollback, authorisation, end-to-end test |

## 5. Reporting

Publish with each result: dataset manifest, protocol version, code commit, per-event table, strata, calibration plots, the list of excluded events, the negative results, and the limits of what the data can support (label omission for small fires, reanalysis vs forecast, event count).
