# 05. Candidate models, in the order they are tried

Each model must beat the previous one on the frozen primary metric to be worth its added complexity. Each has an **entry condition**: if it is not met, skip it.

## Tier 0: baselines (file 04)

Persistence, own-advance extrapolation, wind ellipse from the front, climatology, distance decay. These are also the product fallback.

## Tier 1: empirical growth model (first real candidate)

**Idea:** learn the distribution of how far and in which direction a fire advances over the gap, from features, with no physics.

- **Target:** advance distance by 8 or 16 bearing sectors (or the full probability surface), as quantiles.
- **Model:** gradient-boosted trees with quantile loss (and monotone constraints where physics is clear, for example advance non-decreasing in wind along the sector). Chosen because it is small-data friendly, auditable and fast; a neural net is not justified at this sample size.
- **Features:**
  - Wind speed and direction (forecast archive, plus reanalysis variant), and the component of wind along each sector.
  - Slope along each sector and aspect, terrain ruggedness.
  - Land-cover class and share in each sector.
  - Dryness: VPD, days since rain, temperature, RH, month.
  - Time of day of the earlier and later pass, and the gap in hours.
  - Fire state: front length, detection count, mean and maximum FRP, previous advance distance and direction (where available).
- **Calibration:** isotonic regression or conformal intervals on a held-out calibration split; report reliability and envelope coverage.
- **Entry condition:** Phase 0 gate G0 passed.

## Tier 2: self-calibrated spread (physics-informed, light)

**Idea:** keep a simple spread-rate model, and let each fire's own recent advance set its scale. This is a small version of the perimeter-assimilation idea in the literature.

- Spread model: elliptical (Anderson/Richards form) from wind and slope, with a **per-fire rate multiplier** estimated from the advance between the previous two passes, shrunk toward a fuel-class prior from the training split.
- Uncertainty: perturb wind speed and direction, the multiplier and the front position; run an ensemble (order of 60 members, as before); calibrate the resulting probabilities.
- Compared directly with Tier 1 and B1.
- **Entry condition:** Tier 1 shows that wind or slope features carry real signal (feature importance and an ablation, reported); otherwise there is nothing for a physical model to add.

## Tier 3: Cell2Fire (research candidate only)

- Run **from the observed front**, not from the ignition point, with the existing fork and with the open items from `docs/sim_followups.md` handled: larger domain, event-date weather, slope decision, ensemble.
- Add a per-fire rate multiplier as in Tier 2 so it is not handicapped by uncalibrated fuel parameters.
- Evaluated under exactly the same protocol and baselines. Not shipped unless it beats Tier 1 and Tier 2 on the frozen primary metric.
- Runs as a queued job if ever shipped (file 07).
- **Entry condition:** Tier 2 beats Tier 1, which would be evidence that physics helps; or an explicit owner decision to keep it as research.

## Tier 4: data assimilation (later)

An ensemble Kalman or similar filter that updates rate multipliers and wind corrections from each new pass, as published for FARSITE. Only worth building if Tier 2 shows the multiplier matters and enough multi-pass events exist.

## What is deliberately excluded

- A deep neural network trained on US datasets and applied to India. Different fire regime; label quality differs. Could be used later as a pre-trained feature extractor, evaluated as zero-shot, if the study is extended.
- Full Rothermel or FARSITE reimplementation. Not justified by the evidence so far.
- Any tuning of baseline constants after seeing results.

## Sanity checks before any real data

1. **Synthetic checks** (re-use `docs/sim_diagnosis`): direction, symmetry, determinism, boundary handling.
2. **Public-data reproduction** (optional): run the harness on a public next-day fire dataset to confirm the scoring code reproduces published behaviour. Not a claim about India.
3. **Leakage test:** shuffle the pass order within events; skill should collapse to the baseline. If it does not, there is leakage.
