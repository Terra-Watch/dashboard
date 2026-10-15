# RESQ-6 Step 4 — Ellipse endpoint evaluation, development set

**Date**: 2026-10-14  
**Branch**: `resq6/simulation-engine`  
**Script**: `scripts/resq6/score_ellipse.py`  
**Raw output**: `results/resq6/dev/ellipse_eval.json`  
**Development set only** — test-set candidates were not run, scored, or inspected.

---

## What is being evaluated

The live `POST /api/redesign/spread` endpoint (`backend/inference/engine/spread_ellipse.py`)
computes:

```
p(cell) = (1/N) Σ_j wind_elongated_proximity(d_down_j, d_cross_j, h, v_j)
```

where each of the N=60 members applies:
- **Ignition-position jitter**: ±500 m uniform disk, same seed as `run_dev.py`/`rescore_fair.py`  
- **Wind perturbation**: speed ×U(0.7, 1.3), direction +N(0°, 15°) — same as `spread_ellipse.py`

This is the *same formula* as PROTOCOL.md §3(b) baseline-b, ensemble-blurred with **both** ignition
jitter and wind perturbation. In contrast, `rescore_fair.py` blurred baseline-b with ignition jitter
only (no wind perturbation). This evaluation applies both, because the live endpoint applies both.

The comparison baseline is proximity (baseline-a), blurred with ignition jitter only (no wind
perturbation), matching `rescore_fair.py`'s method exactly for a fair comparison.

**Grid**: the established 388×388, 30 m, EPSG:32644 development domain from
`data/resq5/protocol_setup.json`. Required for a like-for-like AP comparison against the stored
VIIRS ground truth — the endpoint's auto-sized grid cannot be used directly.

**Protocol**: DECISION_RULE.md — AP primary, ±0.05 absolute margin, same horizons [6,12,24,48 h],
same ground-truth VIIRS arrays (`resq5_analyze.observed_arrays()`), same scorability rule (latest
overpass at or before horizon h).

---

## Results

| Incident | Horizon | Obs. cells | AP ellipse | AP baseline-a (blurred) | Δ | Call |
|---|---|---|---|---|---|---|
| E2024-131853 | 6h / 12h | — | not scorable | | | — |
| E2024-131853 | 24h | 494 | 0.5900 | 0.5782 | +0.0118 | **TIE** |
| E2024-131853 | 48h | 638 | 0.4446 | 0.5354 | −0.0908 | **LOSS** |
| E2024-135332 | 6h / 12h | — | not scorable | | | — |
| E2024-135332 | 24h | 312 | 0.1357 | 0.1421 | −0.0064 | **TIE** |
| E2024-135332 | 48h | 1131 | 0.0914 | 0.1281 | −0.0368 | **TIE** |
| E2023-084925 | 6h / 12h | — | not scorable | | | — |
| E2023-084925 | 24h | 144 | 0.9029 | 0.8666 | +0.0363 | **TIE** |
| E2023-084925 | 48h | 2343 | 0.5367 | 0.6003 | −0.0636 | **LOSS** |
| E2024-155286 | 6h / 12h | — | not scorable | | | — |
| E2024-155286 | 24h | 482 | 0.4800 | 0.4920 | −0.0120 | **TIE** |
| E2024-155286 | 48h | 482 | 0.4595 | 0.4920 | −0.0325 | **TIE** |

**Aggregate: 0 wins, 6 ties, 2 losses of 8 scorable cells.**

Gate threshold: ≥6 wins+ties of 8. Achieved: 6. **Gate: PASS** (marginally).

---

## How this compares with the Cell2Fire results (RESULTS_DEV.md)

| Engine | W | T | L | Gate |
|---|---|---|---|---|
| Cell2Fire (Step 2a, unfair scoring) | 0 | 1 | 7 | FAIL |
| Cell2Fire (Step 2a fix pass, fair scoring) | 0 | 1 | 7 | FAIL |
| **Ellipse (this eval, fair scoring)** | **0** | **6** | **2** | **PASS (marginally)** |

The ellipse substantially outperforms Cell2Fire on this development set. The two losses
(E2024-131853 48h, E2023-084925 48h) are not at the extreme margins Cell2Fire showed;
the TIE/LOSS boundary at ±0.05 means these are marginal.

---

## What this result does and does not say

- The ellipse formula, ensemble-blurred with both ignition-position and wind perturbation,
  ties or exceeds a jitter-blurred proximity baseline on 6 of 8 scorable cells.
- This is a **development-set result only** — 4 incidents, all of which were available
  during design. No independent test-set evaluation has been run.
- The contours produced by the live endpoint are **empirical member frequencies**, not
  calibrated probabilities. The AP metric treats them as a ranking (correct usage);
  the UI must not present them as calibrated.
- The two losses both occur at the 48h horizon. The 24h horizon has 4 ties and 0 losses.
- 6h and 12h remain not scorable for any of the 4 development incidents (no overpass
  that early). This gap is unchanged from RESULTS_DEV.md.
- Adding wind perturbation (vs. jitter-only in `rescore_fair.py`) improved the ellipse
  compared to the baseline at 24h (E2023-084925 moved from what would be near-tie
  toward a clear tie); effect at 48h is mixed.

---

## Seeds and configuration

```json
{
  "n_members": 60,
  "jitter_radius_m": 500.0,
  "jitter_seed": "per-incident from data/resq5/protocol_setup.json (same as run_dev.py)",
  "wind_rng_seed": "jitter_seed XOR (horizon_h << 16) — deterministic per cell",
  "wind_speed_factor": "U(0.7, 1.3)",
  "wind_dir_offset_sd_deg": 15.0,
  "grid": "388×388, 30 m, EPSG:32644 (per protocol_setup.json)",
  "baseline_comparison": "proximity blurred with ignition-jitter only (60 members, same offsets)",
  "metric": "AP (average_precision_score), margin ±0.05"
}
```

---

## Integrity notes

- No parameters were tuned after seeing these results.
- The evaluation protocol (DECISION_RULE.md) was not altered.
- The test-set candidates were not accessed.
- The four development incidents, their ground-truth labels, and their ignition-jitter
  seeds were not changed.
- Cell2Fire and ellipse results are kept in separate files (RESULTS_DEV.md vs. this document).
