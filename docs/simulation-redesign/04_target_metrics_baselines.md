# 04. Target, metrics, baselines and the decision rule

Everything in this file is to be **frozen before any model is scored**.

## 1. Target

For a forecast case (front at pass k, front at pass k+1):

- Lattice: fixed 375 m grid aligned to the VIIRS projection, in a metric CRS (UTM zone of the event). Domain: the previous front plus a margin set from the largest plausible advance in the gap (rule fixed in the protocol, not tuned per event).
- **Scored cells**: valid-observation cells that were **not** detected at pass k.
- **Label**: detected at pass k+1.
- **Unknown cells** (cloud, no coverage, outside swath): excluded, reported as a share.

Why this differs from before: the old target included cells already burning, which let a "stay near the ignition" baseline score well without forecasting anything.

## 2. Metrics

One primary, the rest supporting. The primary is chosen because it is calibrated, comparable across fires of different size, and has a natural reference.

| Role | Metric | Why |
|---|---|---|
| **Primary** | **Brier skill score** against the best baseline, on scored cells, with event-block bootstrap intervals | Proper score; a skill score against a strong reference is interpretable; not driven by how rare burning is the way raw AP is |
| Supporting | AP and AP lift over prevalence | Ranking quality at the top of the list; report lift, never compare raw AP across folds |
| Supporting | **Advance distance error (km)** and **bearing error (degrees)** per event | Robust to a few-pixel label; what a dispatcher reads |
| Supporting | **Area efficiency**: share of true new detections captured inside the top x km2 of the forecast, x in {1, 5, 20} | The operational question: how small an area covers most of the risk |
| Supporting | **Reliability diagram** and expected calibration error | Whether "50%" means 50% |
| Supporting | **Fractions Skill Score** at 1, 2 and 3 pixels, with the random-forecast reference (Antonio and Aitchison) | Tolerates small position error; reference reported so the number can be read |
| Supporting | Coverage of the 50% and 80% envelopes | Whether the stated uncertainty is honest |
| Context | Prevalence, event size, gap hours, wind speed, land cover | For stratified reporting |

Change of primary metric from the first study (AP) is deliberate and recorded here: the first study's AP included already-burning cells and was prevalence-sensitive. Old results stay reported as they were. This is a new study, not a re-scoring.

## 3. Baselines (all run on the same lattice, mask, times and cases)

| Id | Baseline | Definition |
|---|---|---|
| B0 | Persistence | No growth: p = 0 for scored cells, ranked by distance to the front for rank metrics |
| B1 | Own-advance extrapolation | Use the front's advance between the previous two passes (distance and direction) to extend it over the next gap. Needs events with at least three passes |
| B2 | Wind ellipse from the front | The frozen wind-elongated proximity formula, applied from the current front instead of the ignition point. Constants as in `docs/simulation/PROTOCOL.md` section 3(b): 1000 m base, 12 h reference, elongation 1.0 per m/s |
| B3 | Climatology | Advance distribution by month and land-cover class, from the training split only |
| B4 | Isotropic distance decay | The old proximity map from the front, as the floor |

Rule: no candidate model is reported as "good" unless it beats the **best of B0 to B4 case by case**, not only the average of them.

## 4. Decision rule (to be written with numbers in the frozen protocol)

For each candidate model M and horizon:

1. Compute the paired per-event difference in Brier skill versus the best baseline.
2. Compute the event-block bootstrap interval for the mean difference.
3. **Win** if the interval's lower bound is above the pre-stated margin; **loss** if the upper bound is below minus the margin; otherwise **tie**.
4. M passes the gate only if it wins on the primary metric and does **not** lose on calibration (reliability) or on envelope coverage.
5. Strata (forest vs grass, wind terciles, fire size terciles) are reported, not used to rescue a failed overall result.

The margin and the minimum number of events come from the Phase 0 variance estimate, not from a convention.

## 5. What a pass allows us to say

| Result | Allowed wording |
|---|---|
| Model beats best baseline, calibrated, enough events | "Spread outlook. On N events the outlook was better than a no-growth or wind-only guide by X (CI). Not validated outside these regions." |
| Ties baselines | "Indicative envelope." Ship the simplest baseline that ties |
| Loses | Do not ship the model. Keep the indicative envelope |
