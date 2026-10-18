# 01. Findings and lessons from the first study

Sources: `docs/simulation/RESULTS_DEV.md`, `docs/RESQ5_RESULTS.md`, `results/resq6/failure_mode_investigation_20261015/`, `docs/SCIENTIFIC_VALIDATION_GATE.md`, `docs/sim_followups.md`. Numbers below were re-checked against those files.

## What the first study found

- Development set, 4 incidents, 8 scorable cells (24 h and 48 h): **0 wins, 1 tie, 7 losses** for Cell2Fire against the better of two baselines (margin ±0.05 AP). The gate (6 of 8) failed. The test pool of 11 was never opened.
- Mean AP over the 8 cells: Cell2Fire 0.309, proximity baseline 0.479, wind-elongated baseline 0.450. Cell2Fire had the lowest Brier (0.0077) and the lowest AP.
- Direction handling is correct: 8 of 8 synthetic cardinal-wind runs spread downwind, opposite directions mirror, repeats are bit-identical. A direction bug is **not** the explanation.
- 6 h and 12 h could not be scored: no qualifying VIIRS overpass.

## Why it lost, as far as the evidence goes

The failure-mode investigation says temporal lag is a *plausible contributor, not a sufficient explanation*, and that a Cell2Fire physics defect is **not confirmed**. What is established:

| Issue | Evidence | Effect |
|---|---|---|
| Truth is detections, not a perimeter | Target is a cumulative union of VIIRS active-fire pixels | Not a burned-area map; unobserved cells are not known negatives |
| No valid-observation mask | No cloud or coverage mask | Cannot separate "not burned" from "not seen" |
| Stale targets | Observations lag the horizon by 10 to 35 h in 7 of 8 cells | Score mixes model error with timing error |
| Scored cells already burning | Cumulative target includes the ignition neighbourhood | Proximity baselines get those cells for free |
| Weak, coarse wind | Median about 1.2 m/s; ERA5-Land is about 9 km | Little to elongate; terrain wind unresolved |
| Physics ignores dryness | `FuelModelSpain.cpp` ROS is a function of wind only; temperature and RH are dead fields | No moisture or season effect |
| Indian fuels unmodelled | WorldCover mapped to TL2 and GR1 only | Crude fuel behaviour |
| Ignition mismatch | E2024-135332 centroid distance 787 m and 1,136 m | Wrong start point for that incident |
| Tiny sample | 4 dev incidents | Cannot support any accuracy claim either way |

## What the literature adds

- Even published next-day deep-learning forecasts are modest at pixel level (an Australian VIIRS study reports F1 near 0.29), and the authors caution that predictability is not proof of real-world accuracy. See 09_references.
- FIRMS-type products miss most small Indian fires (one Central India study: under 20% of Landsat-mapped burned area; an Uttarakhand assessment: about 5.6% of incidents). Labels are biased toward larger, longer forest fires.
- The strongest operational idea is to assimilate the observed perimeter and correct spread-rate and wind inputs, not to run from the ignition point.

## Lessons that change the design

1. Start from the **latest observed front**, not from ignition.
2. Score **new growth only**, with a **valid-observation mask**.
3. Use **many events**, split so that no region/time leaks between train and test.
4. Put the **simple strong baselines first**, including the fire's own recent advance.
5. Choose metrics that are robust to label noise and to how rare fires are, and report uncertainty at the **event** level.
6. Treat the physics simulator as **one candidate**, not the plan.
7. Validate on **forecast** weather, not only reanalysis, or the skill is overstated.

## Carry-over list (open items from `docs/sim_followups.md` that still matter)

| # | Item | Where it lands |
|---|---|---|
| 0 | MCD64A1 pixel size is 463.31 m, not 500 m | Only if MCD64A1 is used (file 03) |
| 1 | Domain too small (1.2 km vs 250 ha burn) | Domain rule in file 06 |
| 2 | Event-date hourly weather from the ignition pixel | Weather pipeline (file 03) |
| 3 | 10+ incidents chosen from VIIRS clusters before simulating | Event construction (file 03) |
| 4 | Proximity baseline on identical overpass pairs | Baselines (file 04) |
| 5 | Slope handling and barriers (tests c and d2 failed) | Physics candidate (file 05) |
| 6 | Ensemble burn probability | Candidate models (file 05) |
