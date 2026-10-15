# RESQ-6 Step 2a — development-set results

**Development set only** (`E2024-131853`, `E2024-135332`, `E2023-084925`, `E2024-155286`). The
test-set candidates were not run, scored, or looked at while producing this document.
Per-incident, per-horizon reporting only — no pooling, no significance claim
(`docs/simulation/PROTOCOL.md` §4/§5); win/loss calls use `docs/simulation/DECISION_RULE.md`'s
frozen rule (±0.05 absolute AP against the better baseline), fixed before this run.

Metrics and baselines here are for this document and the repo's logs only — nothing here goes
into the product UI.

## What was run

60-member ensemble (frozen, `PROTOCOL.md` Amendment 1) per incident: ignition-position jitter
(500 m radius, same method/seed as RESQ-5) × per-member wind perturbation (multiplicative speed
factor `U(0.7, 1.3)`, additive direction offset `N(0°, 15°)`, applied uniformly across each
member's whole series). Weather: `engine/weather.py`'s ERA5-Land historical sourcing (cached
CDS wind). Fuel: `engine/fuel.py`'s `FUEL_RULE.md` crosswalk. Domain/ignition/t0: reused
unchanged from `data/resq5/protocol_setup.json`, per `PROTOCOL.md` §1 — not re-derived.
Smouldering: `--ROS-Threshold 0.05` (see `backend/inference/engine/smoulder.py` for the derivation
from `FuelModelSpain.cpp`'s own TL2 coefficients). Baseline (a) proximity and (b) wind-elongated
proximity: `engine/baseline.py`, exactly per `PROTOCOL.md` §3.

## Results

| Incident | Horizon | Obs. cells | AP engine | AP (a) proximity | AP (b) wind-elongated | Brier engine | Brier (a) | Brier (b) | Call |
|---|---|---|---|---|---|---|---|---|---|
| E2023-084925 | 6h / 12h | — | not scorable (no overpass by then) | | | | | | — |
| E2023-084925 | 24h | 144 | 0.137 | 0.916 | 0.893 | 0.0009 | 0.0109 | 0.0641 | **LOSS** (Δ−0.779) |
| E2023-084925 | 48h | 2343 | 0.440 | 0.601 | 0.519 | 0.0110 | 0.0117 | 0.1974 | **LOSS** (Δ−0.161) |
| E2024-131853 | 6h / 12h | — | not scorable | | | | | | — |
| E2024-131853 | 24h | 494 | 0.517 | 0.624 | 0.552 | 0.0024 | 0.0110 | 0.0981 | **LOSS** (Δ−0.108) |
| E2024-131853 | 48h | 638 | 0.464 | 0.573 | 0.438 | 0.0033 | 0.0110 | 0.2523 | **LOSS** (Δ−0.109) |
| E2024-135332 | 6h / 12h | — | not scorable | | | | | | — |
| E2024-135332 | 24h | 312 | 0.056 | 0.208 | 0.137 | 0.0027 | 0.0148 | 0.1159 | **LOSS** (Δ−0.152) |
| E2024-135332 | 48h | 1131 | 0.040 | 0.154 | 0.095 | 0.0140 | 0.0176 | 0.2819 | **LOSS** (Δ−0.113) |
| E2024-155286 | 6h / 12h | — | not scorable | | | | | | — |
| E2024-155286 | 24h | 482 | 0.213 | 0.419 | 0.373 | 0.0038 | 0.0140 | 0.1218 | **LOSS** (Δ−0.206) |
| E2024-155286 | 48h | 482 | 0.457 | 0.419 | 0.394 | 0.0053 | 0.0140 | 0.2920 | no clear difference (Δ+0.038) |

8 of 8 scorable (incident, horizon) cells: **7 losses, 1 no-clear-difference, 0 wins**, by this
document's own pre-registered rule. The engine does not beat either frozen baseline on the
development set as built in this session.

## Runtime

| Incident | Members ok | Wall time (7 workers) | Mean per-member |
|---|---|---|---|
| E2023-084925 | 60/60 | 97.2 s | 11.3 s |
| E2024-131853 | 60/60 | 85.1 s | 9.9 s |
| E2024-135332 | 60/60 | 63.4 s | 7.4 s |
| E2024-155286 | 60/60 | 78.5 s | 9.2 s |

All four well inside the 5-minute target and 10-minute ceiling (`PROTOCOL.md` Amendment 1).
0 member errors across 240 runs.

## What looks unreliable (flagged, not hidden)

1. **6 h and 12 h are not scorable for any of the 4 development incidents** — none has a VIIRS
   overpass that early (earliest is 12.85 h for `E2023-084925`). Half the product's four
   standard horizons have **zero development-set evidence**, in either direction, for this
   engine. This is a real gap in what Step 2a can claim, not a rounding issue — it should be
   stated plainly in any future product copy or decision, not inferred from the 24h/48h numbers.
2. **The AP/Brier directions disagree on 7 of 8 scorable cells**: the engine's Brier score is
   *better* (lower error) than both baselines almost everywhere, while its AP is *worse*
   (worse ranking) almost everywhere. This is consistent with the engine predicting low
   probability almost everywhere in the domain (which keeps squared error small against a
   mostly-zero ground truth) while failing to concentrate enough of that probability on the
   *correct* cells (which is what AP measures and the baselines, built from a single fixed
   ignition point with no jitter, do well by construction at small/early footprints). This is a
   plausible, source-traceable explanation — not a confirmed root cause — and is exactly the
   kind of asymmetry `DECISION_RULE.md`'s "report both, don't resolve the disagreement" rule
   exists for.
3. **`E2023-084925`'s 24 h loss is unusually large** (Δ−0.779, the worst of the 8 cells) against
   the smallest observed footprint (144 cells). A plausible, specific driver: the ensemble's 500 m
   ignition-position jitter necessarily smears probability mass over a wider area than a single
   fixed point, which is a severe AP penalty precisely when the true footprint is still small and
   tight — baseline (a) has no such jitter and wins AP almost by construction at this horizon.
   This is a property of comparing a jittered ensemble against an unjittered point baseline at an
   early horizon, not a verified code defect, and is flagged rather than fixed by, e.g., shrinking
   the jitter radius to chase this one number (`PROTOCOL.md` §5: baselines and the jitter method
   are not re-tuned after seeing a result).
4. **Wind speeds at these incidents are low** (0.52–0.72 m/s mean over the scored windows) —
   exactly the regime the smouldering fix (`smoulder.py`) targets, and exactly where RESQ-5
   found the old one-calm-hour bug. The smouldering fix is confirmed *active* (0 member runtime
   errors, fire continues spreading past calm hours — e.g. `E2023-084925` reaches 4189 burned
   cells by its last available frame in a single-member diagnostic run, not a handful), but this
   result does not by itself show the fix *improved* accuracy — only that it changed behavior
   from "permanently extinguished" to "something that keeps spreading," which these numbers show
   still does not out-rank the baselines.

## What this result does and does not say

This is Step 2a's development-set result for the engine **as built in this session** — a first,
working, non-crashing ensemble with the smouldering fix and wind-elongated baseline in place, not
a tuned or final engine. Per `PROTOCOL.md` §5, the development set is for iteration; nothing here
is re-tuned against the test set, and this document does not claim the engine generalizes or
fails to generalize beyond these 4 incidents. It does say, plainly, that this build does not beat
either frozen baseline on 7 of the 8 scorable development-set cells, by the margin fixed in
`DECISION_RULE.md` before this run.

## Fix pass: fair (ignition-blurred) baseline rescoring

**Scoring-only — no new Cell2Fire run.** The comparison above gives the point baselines an
unfair advantage at small/early footprints: the engine's probability map is already blurred by
its own ±500 m ignition-position jitter (part of the frozen ensemble), while baselines (a) and
(b) used a single, sharp, un-jittered ignition point. This pass applies the *same* 500 m
ignition-jitter blur to both baselines — Monte-Carlo averaged over the identical 60 jittered
ignition points (same seed) the engine's own ensemble already used — before rescoring, so
neither side gets a sharp-vs-blurred advantage for free. The engine's own AP/Brier numbers are
**reused unchanged** from the run above; no simulation was re-run, and fuel, wind handling and
the smouldering threshold were not retuned (`scripts/resq6/rescore_fair.py`).

| Incident | Horizon | AP engine (unchanged) | AP baseline (a), blurred | AP baseline (b), blurred | Δ vs best fair baseline | Call |
|---|---|---|---|---|---|---|
| E2023-084925 | 24h | 0.137 | 0.867 | 0.887 | −0.750 | LOSS |
| E2023-084925 | 48h | 0.440 | 0.600 | 0.527 | −0.160 | LOSS |
| E2024-131853 | 24h | 0.517 | 0.578 | 0.561 | −0.061 | LOSS |
| E2024-131853 | 48h | 0.464 | 0.535 | 0.455 | −0.071 | LOSS |
| E2024-135332 | 24h | 0.056 | 0.142 | 0.117 | −0.086 | LOSS |
| E2024-135332 | 48h | 0.040 | 0.128 | 0.085 | −0.088 | LOSS |
| E2024-155286 | 24h | 0.213 | 0.492 | 0.485 | −0.279 | LOSS |
| E2024-155286 | 48h | 0.457 | 0.492 | 0.483 | −0.035 | TIE |

**Fair-scoring tally: 0 wins, 1 tie, 7 losses of 8 scorable cells.** Blurring the baselines
narrowed the gap on most cells (e.g. E2024-131853 48h moved from LOSS Δ−0.109 to LOSS Δ−0.071)
but did not flip any cell to a win, and only one to a tie.

**"Engine with jitter off" — not produced, stated plainly rather than approximated.** This would
need the per-member spatial grids from the original 60-member run, which were not persisted
(only the aggregated AP/Brier numbers were saved) — reconstructing them requires rerunning
Cell2Fire, which this fix pass's own rule forbids ("no new simulation runs"). No number is
reported for this; it is not estimated or substituted.

### Dev gate: **FAILED**

Per the instruction's gate rule: fewer than 6 of 8 scorable cells are wins or ties under fair
scoring (**1 of 8**, not ≥6). **The test set is not run.** See `docs/simulation/FALLBACK.md`.

## Step 3: slope-term scoring (scoring-only, decides whether the live spread feature includes it)

Per instruction, the wind-elongated ellipse built for Step 3's live `/api/redesign/spread`
feature does **not** include `FALLBACK.md`'s slope term unless a scoring-only dev-set run shows
it wins on more cells than the no-slope version — same ±500 m ignition-jitter blur, AP primary,
same `±0.05` margin. Run via `scripts/resq6/score_slope_term.py`, no Cell2Fire, no new fuel/wind
tuning.

| Incident | Horizon | slope tan(slope) | AP no-slope | AP with slope | Δ | Call |
|---|---|---|---|---|---|---|
| E2024-131853 | 24h | 0.109 | 0.561 | 0.557 | −0.004 | TIE |
| E2024-131853 | 48h | 0.109 | 0.455 | 0.449 | −0.006 | TIE |
| E2024-135332 | 24h | 0.114 | 0.117 | 0.115 | −0.002 | TIE |
| E2024-135332 | 48h | 0.114 | 0.085 | 0.083 | −0.002 | TIE |
| E2023-084925 | 24h | 0.668 | 0.887 | 0.868 | −0.019 | TIE |
| E2023-084925 | 48h | 0.668 | 0.527 | 0.473 | −0.054 | LOSS |
| E2024-155286 | 24h | 0.306 | 0.485 | 0.483 | −0.002 | TIE |
| E2024-155286 | 48h | 0.306 | 0.483 | 0.481 | −0.002 | TIE |

**0 wins, 7 ties, 1 loss. Slope does not win on more cells than it loses on → the slope term is
excluded from `backend/inference/engine/spread_ellipse.py`.** (`FALLBACK.md`'s §1 slope formula
stays documented as an unvalidated placeholder, not shipped.)

## 2026-10-15 reproducibility audit — supersedes the prior fair-rescore section

The previously saved member grids were absent. A faithful rerun with the original runner and
the existing Cell2Fire executable regenerated them in
`results/resq6/dev_member_grids_recovered_20261015/`; recomputing AP and Brier directly from
those archives reproduced all saved Step 2a engine scores to `1e-14`. No original result file
was overwritten. The directory includes per-member Boolean grids, per-file SHA-256 manifest,
and input/runtime provenance.

That replay exposed a real seeded-sampling defect in the original runner. For each member `m`,
`run_member()` generated a jitter array of length `m + 1` and selected its `m`th point. This
does not select point `m` from the shared 60-point ensemble used by the fair-baseline rescorer;
59 of 60 positions differed per incident (median offset discrepancy 302–467 m). The old
fair-rescore table above therefore did not implement its stated same-jitter comparison and is
superseded. `run_dev.py` now selects each member from the one fixed seeded ensemble sample.

The four development incidents were rerun with the corrected indexing, 60/60 members each,
and the unchanged Cell2Fire executable, input data, fuel/weather/ROS configuration, labels,
horizons, metrics, and frozen decision threshold. Corrected per-member archives, aggregate
results, hashes, provenance, and corrected `fair_rescore.json` are under
`results/resq6/dev_member_grids_corrected_20261015/`. The corrected comparison remains **0
wins, 1 tie, 7 losses**: the development gate still fails. The held-out set remains untouched.

The regenerated ensemble predicts nonzero probability in 1.16–9.73% of domain cells across
scorable incident/horizon cells; at 24 h, no cells reach probability 0.5. This supports the
prior low-probability/sparse-surface explanation as plausible, not as a proven root cause.
Full-precision results and per-cell surface diagnostics are in the corrected run's JSON.

## 2026-10-15: member-grid recovery and jitter-indexing correction

The original per-member prediction grids were not present in the saved results or temporary
artifacts. They have now been regenerated for the four development incidents only, first with
the original runner to verify the archived AP/Brier values, then with the corrected jitter
indexing. The test set was not accessed. Both runs use distinct, new output directories; the
original `results/resq6/dev/` artifacts were not overwritten:

- Faithful replay and original-score check:
  `results/resq6/dev_member_grids_recovered_20261015/`
- Corrected, protocol-consistent run and per-member grids:
  `results/resq6/dev_member_grids_corrected_20261015/`

Each contains 240 per-member NPZs (60 per incident) holding the requested Boolean burn frames,
an incident manifest with SHA-256 hashes and ignition cells, aggregate incident JSON, and
`recovery_provenance.json` with hashes for the runner, protocol, executable, lookup table,
weather/raster inputs, and relevant scoring/engine code. The faithful replay reproduced all
saved engine AP and Brier values to absolute tolerance `1e-14`.

The replay exposed an implementation defect: `run_member()` called
`ignition_jitter(seed, member + 1)` and then selected that call's `member`-th angle. As a result,
59/60 actual member offsets per incident differed from the single 60-point seeded jitter set
used by `rescore_fair.py` (median discrepancy 302–467 m). The code now selects every member
from the same full ensemble sample, matching the documented protocol and fair-baseline
rescorer. Regression tests cover this invariant and NPZ artifact round-tripping.

The corrected fair comparison remains **0 wins, 1 tie, 7 losses**; the development gate still
fails and held-out evaluation remains prohibited. Full-precision cells and prediction-surface
diagnostics are in the corrected run's `fair_rescore.json`. They support—but do not prove—the
low-probability explanation: only 1.16–9.73% of cells have nonzero predicted probability,
depending on incident/horizon, while AP remains below the blurred baselines in seven cells.
No parameters, metrics, labels, horizons, or decision thresholds were changed.

## 2026-10-15 horizon-alignment correction — authoritative development result

**This section supersedes the preceding 2026-10-15 corrected-jitter result and its fair-rescore
table.** A further protocol mismatch was found: the runner had selected simulation frames from
the VIIRS overpass times, then sometimes used an earlier frame for a fixed 24 h or 48 h score
(for example, the earlier run used h=13 for the 24 h cell and h=37 for 48 h in
`E2024-135332`). `PROTOCOL.md` requires predictions at fixed product horizons; only the observed
footprint is selected from the latest VIIRS pass at or before each horizon. The runner now
requires exact simulation frames at 6, 12, 24, and 48 hours and reports an error instead of
substituting an earlier frame.

A fresh development-only 60-member evaluation was run with the corrected seeded jitter and
exact horizons. All 240 members succeeded (60 per incident). Artifacts, SHA-256 manifests,
aggregate JSON, provenance, and fair-rescore output are in
`results/resq6/dev_member_grids_horizon_aligned_20261015/`; earlier run directories and
`results/resq6/dev/` were not overwritten. The aggregate contains all four development incident
IDs. Every member manifest records source frames `{6:6, 12:12, 24:24, 48:48}`.

The observed source is still the latest cached VIIRS overpass at or before each horizon, as
specified: 6 h and 12 h are unscorable for every incident; the 24 h/48 h labels use the latest
eligible pass (hours since t0), respectively: E2024-131853 23.37/23.37; E2024-135332
13.72/37.40; E2023-084925 24.03/37.40; E2024-155286 12.77/12.77. Thus, some 48 h evaluations
compare a 48 h prediction with an observation snapshot taken appreciably earlier; in
E2024-155286 the 48 h truth is still the 12.77 h pass because the next pass (48.88 h) is after
the scoring horizon. This is the protocol's specified latest-available-observation comparison,
not an interpolated truth surface.

Fair scoring uses the same ±500 m ignition jitter for both baselines and the engine, with the
frozen ±0.05 AP decision margin. Values below are per incident and horizon; no pooled metric or
significance claim is made.

| Incident | Horizon | Observed cells | Engine AP | Blurred baseline (a) AP | Blurred baseline (b) AP | Engine Brier | Baseline (a) Brier | Baseline (b) Brier | Δ vs best baseline | Call |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| E2024-131853 | 24h | 494 | 0.508 | 0.578 | 0.561 | 0.00238 | 0.01095 | 0.09709 | −0.070 | LOSS |
| E2024-131853 | 48h | 638 | 0.332 | 0.535 | 0.455 | 0.00499 | 0.01091 | 0.25094 | −0.203 | LOSS |
| E2024-135332 | 24h | 312 | 0.042 | 0.142 | 0.117 | 0.00369 | 0.01439 | 0.11433 | −0.100 | LOSS |
| E2024-135332 | 48h | 1131 | 0.063 | 0.128 | 0.085 | 0.03005 | 0.01739 | 0.28003 | −0.065 | LOSS |
| E2023-084925 | 24h | 144 | 0.261 | 0.867 | 0.887 | 0.00093 | 0.01059 | 0.06348 | −0.626 | LOSS |
| E2023-084925 | 48h | 2343 | 0.430 | 0.600 | 0.527 | 0.01124 | 0.01188 | 0.19672 | −0.170 | LOSS |
| E2024-155286 | 24h | 482 | 0.366 | 0.492 | 0.485 | 0.00307 | 0.01361 | 0.12053 | −0.126 | LOSS |
| E2024-155286 | 48h | 482 | 0.465 | 0.492 | 0.483 | 0.00536 | 0.01361 | 0.29054 | −0.027 | TIE |

**Authoritative fair tally: 0 wins, 1 tie, 7 losses; dev gate FAILED (1 of 8 wins-or-ties,
required ≥6).** The test set remains untouched and must not be run under this failed gate.

### Probability and spatial diagnostics

These are descriptive development-set diagnostics, not new acceptance thresholds. The 24 h
engine maps have 1.58–5.07% nonzero cells and maximum cell probability below 0.5; at 48 h the
nonzero share is 3.70–15.29%. Median probability is zero in every scorable cell, and the 90th
percentile is zero in 7/8; the probability mass is concentrated in a sparse upper tail. The fixed
0.5 threshold is reached only in E2024-135332 at 24 h (204 cells, about 0.17% of its grid).
Ranking is substantially above prevalence in every scorable cell (AP/prevalence lift 6.4–273),
but this coexists with weak fair-baseline AP comparisons. A prevalence-only reference Brier skill
score (1 − engine Brier / Brier of constant observed prevalence) is positive in 5/8 cells and
negative in 3/8; it is secondary and does not change the protocol's AP calls. In particular,
E2024-135332 at 48 h has mean predicted probability 4.65% against 0.99% observed prevalence
(Brier skill −2.07), and E2024-155286 at 48 h has mean 1.28% against 0.42% prevalence (skill
−0.28). These support a spatial/probability-calibration investigation, not a claim that a
calibration transform is validated. Coarse reliability bins and per-cell diagnostics are
available by recomputing from the saved grids; no bins were used to retune this run.

| Incident | Horizon | Observed prevalence | Mean predicted p | Nonzero cells | p99 | AP / prevalence | ECE (10 fixed bins) | Predicted mass in observed mask |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| E2024-131853 | 24h | 0.351% | 0.254% | 1.58% | 0.083 | 144.6 | 0.00121 | 34.65% |
| E2024-131853 | 48h | 0.454% | 1.028% | 3.70% | 0.400 | 73.3 | 0.00574 | 23.30% |
| E2024-135332 | 24h | 0.273% | 0.641% | 5.07% | 0.217 | 15.6 | 0.00434 | 5.85% |
| E2024-135332 | 48h | 0.990% | 4.649% | 15.29% | 0.817 | 6.4 | 0.04158 | 5.74% |
| E2023-084925 | 24h | 0.096% | 0.197% | 1.58% | 0.083 | 273.2 | 0.00103 | 9.72% |
| E2023-084925 | 48h | 1.556% | 1.146% | 4.53% | 0.417 | 27.6 | 0.00671 | 38.61% |
| E2024-155286 | 24h | 0.422% | 0.357% | 2.05% | 0.133 | 86.8 | 0.00084 | 31.66% |
| E2024-155286 | 48h | 0.422% | 1.278% | 4.33% | 0.500 | 110.3 | 0.00857 | 23.60% |

Every scored cell has a higher mean predicted value on observed-positive than observed-negative
cells; ROC AUC ranges 0.751–0.997. However, AP relative to prevalence varies from 6.4× to 273×,
the two E2024-135332 cells are weakest, and all eight engine APs remain below the corresponding
jitter-blurred winning baseline. Thus positive-ranking signal exists, but it is not sufficient
to pass the comparative gate. Mean p is not uniformly too small: it is below prevalence in 3/8
cells and above in 5/8. The fixed-bin ECE is descriptive only; strong spatial dependence and rare
positive labels make it unsuitable as independent evidence of calibration.

The nominal ignition cell is inside the observed mask at both scored horizons for three
incidents. For E2024-135332 it is outside at both horizons, with the nearest positive cell 30 m
away on the model grid. This is a concrete target-alignment flag, not proof of a bad coordinate
or a reason to alter the fixed labels; the protocol's labels were not edited.

The paired ignition-jitter ablation described below has now been run. It changes ranking and
spatial concentration materially in some cells, but not consistently enough to justify further
jitter tuning.

## 2026-10-15 paired ignition-jitter ablation

Arm A is the preserved 500 m exact-horizon ensemble in
`dev_member_grids_horizon_aligned_20261015/`. Arm B is a new 60-member run with zero ignition
jitter in `dev_member_grids_zero_jitter_20261015/`. Both use identical member indices and the
same per-member wind draws (`default_rng(jitter_seed + member)`; 240/240 B-arm wind factors and
direction offsets matched the seeded values exactly). Weather, fuel/domain inputs, simulator
binary, internal Cell2Fire seed, ROS threshold, horizons, VIIRS masks, scoring implementation,
and AP margin are unchanged. Provenance confirms matching non-code input hashes and the same
Cell2Fire executable hash. B member archives store the wind perturbation parameters and jitter
radius. Each arm's baselines are matched to its jitter: A uses the same 60-point 500 m blur; B
uses the frozen baseline formulas at zero blur. Thus no arm receives a sharp-versus-blurred
comparison advantage.

Both arms completed all 60 members for each of four development incidents (240/240, zero errors).
The A-arm archives were SHA-256 checked before and after the experiment; all 240 are unchanged.
Both aggregate JSONs agree with their incident JSONs, and exact 6/12/24/48 h frames are present.
Full cell-level scoring, footprint, displacement, wind-direction, and support diagnostics are in
`dev_member_grids_zero_jitter_20261015/jitter_ablation_diagnostics.json`; paired A archive hashes
are recorded in `paired_reference_hashes.json`.

### AP and frozen matched baselines

| Incident | Horizon | A engine / baseline a / baseline b AP | B engine / baseline a / baseline b AP | B−A engine AP | A/B call |
|---|---:|---:|---:|---:|---|
| E2024-131853 | 24h | 0.508 / 0.578 / 0.561 | 0.465 / 0.624 / 0.552 | −0.043 | LOSS / LOSS |
| E2024-131853 | 48h | 0.332 / 0.535 / 0.455 | 0.318 / 0.573 / 0.438 | −0.014 | LOSS / LOSS |
| E2024-135332 | 24h | 0.042 / 0.142 / 0.117 | 0.080 / 0.208 / 0.137 | +0.038 | LOSS / LOSS |
| E2024-135332 | 48h | 0.063 / 0.128 / 0.085 | 0.040 / 0.154 / 0.095 | −0.024 | LOSS / LOSS |
| E2023-084925 | 24h | 0.261 / 0.867 / 0.887 | 0.602 / 0.916 / 0.893 | +0.341 | LOSS / LOSS |
| E2023-084925 | 48h | 0.430 / 0.600 / 0.527 | 0.216 / 0.601 / 0.519 | −0.214 | LOSS / LOSS |
| E2024-155286 | 24h | 0.366 / 0.492 / 0.485 | 0.272 / 0.419 / 0.373 | −0.094 | LOSS / LOSS |
| E2024-155286 | 48h | 0.465 / 0.492 / 0.483 | 0.322 / 0.419 / 0.394 | −0.144 | TIE / LOSS |

Fair gate tally is **A: 0 wins, 1 tie, 7 losses; B: 0 wins, 0 ties, 8 losses**. Zero jitter
does not improve the frozen comparative criterion. The one A-arm tie is lost in B. Only two
cells improve engine AP under zero jitter (E2024-135332 24h by 0.038 and E2023-084925 24h by
0.341); six decline, including a 0.214 AP decline at E2023-084925 48h. This is a mixed,
incident/horizon-dependent effect—not evidence that zero jitter is a better general setting.

### Brier scores by arm (engine / baseline a / baseline b)

| Incident | Horizon | A Brier | B Brier |
|---|---:|---:|---:|
| E2024-131853 | 24h | 0.00238 / 0.01095 / 0.09709 | 0.00239 / 0.01104 / 0.09812 |
| E2024-131853 | 48h | 0.00499 / 0.01091 / 0.25094 | 0.00701 / 0.01097 / 0.25226 |
| E2024-135332 | 24h | 0.00369 / 0.01439 / 0.11433 | 0.00473 / 0.01483 / 0.11592 |
| E2024-135332 | 48h | 0.03005 / 0.01739 / 0.28003 | 0.04298 / 0.01761 / 0.28187 |
| E2023-084925 | 24h | 0.00093 / 0.01059 / 0.06348 | 0.00046 / 0.01088 / 0.06413 |
| E2023-084925 | 48h | 0.01124 / 0.01188 / 0.19672 | 0.01516 / 0.01175 / 0.19741 |
| E2024-155286 | 24h | 0.00307 / 0.01361 / 0.12053 | 0.00398 / 0.01403 / 0.12182 |
| E2024-155286 | 48h | 0.00536 / 0.01361 / 0.29054 | 0.00781 / 0.01403 / 0.29196 |

### Brier, spatial capture, and footprint diagnostics

| Incident | Horizon | Expected probability mass in observed mask A/B | Cells p≥0.5 A/B | Probability-support cells / observed cells A/B | Probability-centroid to observed-centroid distance A/B (m) |
|---|---:|---:|---:|---:|---:|---:|
| E2024-131853 | 24h | 0.346 / 0.634 | 0 / 319 | 4.50 / 1.26 | 272 / 236 |
| E2024-131853 | 48h | 0.233 / 0.284 | 1041 / 1281 | 8.16 / 4.02 | 361 / 330 |
| E2024-135332 | 24h | 0.058 / 0.156 | 204 / 427 | 18.56 / 3.66 | 787 / 571 |
| E2024-135332 | 48h | 0.057 / 0.062 | 4694 / 5120 | 15.44 / 9.61 | 1136 / 1056 |
| E2023-084925 | 24h | 0.097 / 0.881 | 0 / 84 | 16.55 / 0.83 | 263 / 79 |
| E2023-084925 | 48h | 0.386 / 0.428 | 847 / 1245 | 2.91 / 1.02 | 553 / 479 |
| E2024-155286 | 24h | 0.317 / 0.431 | 103 / 369 | 4.87 / 1.61 | 247 / 306 |
| E2024-155286 | 48h | 0.236 / 0.262 | 1189 / 1342 | 10.27 / 5.47 | 223 / 266 |

Zero jitter increases expected probability capture in all eight cells and reduces the p>0 support
area in all eight. That concentration does not translate into better AP in six cells; the
E2024-155286 Brier scores also worsen at both horizons. For the early E2023-084925 cell, however,
zero jitter raises AP from 0.261 to 0.602, increases mask capture from 9.7% to 88.1%, and reduces
probability-centroid displacement from 263 m to 79 m. Its 48 h AP moves in the opposite direction.
This is strong evidence that ignition jitter is a meaningful spatial/probability-aggregation
factor for some incident-horizon pairs, but not a consistent source of error or a robust fix.

The most conspicuous remaining error is incident-specific displacement and excessive support.
E2024-135332's predicted probability centroid is 571–787 m from the observed centroid at 24 h
and 1056–1136 m at 48 h; at 48 h the p>0 support is 9.6–15.4 times the observed footprint.
E2023-084925's zero-jitter arm instead closely matches the small 24 h footprint, then has lower
AP at 48 h. Model centroids project downwind while the E2024-135332 observed centroids project
upwind at both scored horizons; at 48 h the model is about +599–680 m downwind while the observed
centroid is about −454 m. This is a directional discrepancy to investigate, not proof of a wind
bug: the protocol's 48 h truth can be an earlier snapshot (e.g. E2024-155286 uses 12.77 h truth
for a 48 h forecast because the next pass is at 48.88 h), and the target is not interpolated.

No application/simulator defect is established by this ablation, so no spread parameters or
production behavior were changed. Do not continue tuning ignition jitter. The next single
experiment should be a controlled Cell2Fire wind-direction convention check using synthetic
steady cardinal winds and a fixed simple fuel grid, verifying that burn centroids propagate in
the intended downwind direction. This is motivated by the measured centroid reversals and by
the simulator's explicit `WD` conversion in its CSV reader; the current source applies a 180°
conversion, but the downstream angular transforms make source inspection alone insufficient to
prove end-to-end orientation. Keep it as a simulator validation experiment; do not change wind
inputs based on the four observed cases unless that test demonstrates a defect. The development
gate remains failed and held-out evaluation remains prohibited.
