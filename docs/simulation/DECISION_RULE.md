# RESQ-6 decision rule (metric and margin)

**Written and committed before any Step 2a tuning run, per instruction.** This is not a new
statistical claim — `docs/simulation/PROTOCOL.md` §4/§5 already forbid pooling and significance
tests. This document only fixes the plain-language rule for calling a per-(incident, horizon)
cell a "win," "loss," or "no clear difference" in Step 2a/2b/Step 3's own reports, so that call
is not made ad hoc, after the numbers are already in front of me, in whichever direction looks
better.

## Primary metric: AP

Average precision (`sklearn.metrics.average_precision_score`), per `PROTOCOL.md` §4 — listed
first in the protocol's own metric ordering, and the one of the two metrics that is not
dominated by the (large) share of non-burning cells in a 10-15 km domain.

## Win margin

For a given (incident, horizon) where both the engine and at least one baseline are scorable:

- **Engine win**: `AP_engine - max(AP_baseline_a, AP_baseline_b) >= 0.05` (absolute AP points).
- **Engine loss**: `AP_engine - max(AP_baseline_a, AP_baseline_b) <= -0.05`.
- **No clear difference**: anything in between (`|Δ| < 0.05`) — reported as such, not rounded
  toward either side.

0.05 absolute AP is chosen as the margin because it is roughly the gap RESQ-5 itself treated as
meaningful between its own baselines on the same incidents (`RESQ5_RESULTS.md` baseline AP values
cluster within roughly that band of each other on several incident/horizon cells) — a round,
pre-registered number, not fitted to make Step 2a's own result look a particular way, and not
revisited after this document is committed regardless of which way the dev-set numbers land.

## Secondary metric: Brier

Reported alongside AP at every (incident, horizon) cell (`PROTOCOL.md` §4), but **does not
change the win/loss call above** — it is there so a reader can see whether an AP win also shows
up as a calibration improvement, not folded into a combined score. If AP and Brier disagree on
direction for a given cell, both numbers are reported plainly and the disagreement is stated,
not resolved by picking whichever metric favors the engine.

## Scope and reuse

This rule applies identically to Step 2a's development-set iteration and Step 3's single
test-set run — the same formula, same margin, not re-derived or loosened after either set of
results is seen. Per-incident, per-horizon reporting only (`PROTOCOL.md` §4/§5); this document
adds no pooled call across incidents or horizons ("the engine wins overall") — only the plain
count of how many of the scorable cells were wins/losses/no-clear-difference, stated as a
pattern, never a significance claim.
