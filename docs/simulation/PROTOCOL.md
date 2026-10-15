# RESQ-6 protocol

**Status: fixed before any Step 2 engine change, committed before any run.**
Changes are allowed only as a dated amendment appended to this file, stating
what changed and why — the same discipline `docs/RESQ5_PROTOCOL.md` used.

Purpose: fix, in advance, which incidents are for development and which are
held out, and exactly how the engine will be scored against two
no-simulator baselines, before Step 2 writes or changes any engine code.
Metrics computed under this protocol are for repo tests and docs only —
never for display in the product UI (see task scope; the UI's "Uncalibrated
scenario" badge is the only user-facing trust signal, unchanged by this
document).

## 1. Development set (4 incidents, fixed, already used)

These are the same four incidents `docs/RESQ4_SPREAD_TEST.md` accepted (the
unchanged RESQ-3 forest rule: the 10 m WorldCover 2021 class at the ignition
pixel must be forest — class 10 tree cover or 95 mangroves) and
`docs/RESQ5_PROTOCOL.md` already replayed once. Their ignition point, t0,
and per-incident domain corner are **not re-derived** here — they are
read from `data/resq5/protocol_setup.json`, which was itself fixed before
any RESQ-5 replay ran:

| Incident | State | Ignition (lat, lon) | First detection (UTC) | t0 (UTC) | In `RESQ2_INCIDENTS.md`'s 15-candidate table? |
|---|---|---|---|---|---|
| E2024-131853 | TS | 19.20262, 78.60316 | 2024-02-16 20:11:00 | 2024-02-16 08:00:00 | yes, row 12 |
| E2024-135332 | MH | 19.95163, 78.71265 | 2024-03-05 07:53:00 | 2024-03-04 19:00:00 | yes, row 15 |
| E2023-084925 | OD | 19.32648, 83.93716 | 2023-03-10 19:51:00 | 2023-03-10 07:00:00 | **no** — found by RESQ-4's separate replacement screening (`data/resq2/replacement_screening.json`) after two original candidates (E2023-078506, E2024-133629) failed the forest rule |
| E2024-155286 | CG | 19.12243, 80.89992 | 2024-04-12 19:46:00 | 2024-04-12 07:00:00 | **no** — same replacement screening as E2023-084925 |

Two of the four (E2023-084925, E2024-155286) were never part of the
RESQ2_INCIDENTS.md 15-row table — worth stating plainly so §2's "the other
candidates" is read correctly: it means the other rows of that table, not
"every incident not in the development set."

Everything else about Step 2 engine development happens against this
development set only. Engine parameters (domain margin within the 10-15 km
range, ensemble jitter magnitudes, the smouldering/duration rule's
constants, weather-source handling) are fixed by ordinary engineering
iteration against these 4 incidents and documented when each Step 2
sub-item lands. The two baseline formulas in §3 are fixed **now**, in this
document, and are never adjusted afterward regardless of how they score —
on the development set or the test set.

## 2. Test set (candidate pool, rule fixed now, inputs fetched only in Step 3)

Test-set membership rule (unchanged from RESQ-3/4): take every candidate row
of `docs/RESQ2_INCIDENTS.md`'s 15-row proposed-incident table that is not
already a development-set member and not already known to fail the forest
rule, and apply the same forest rule (10 m WorldCover 2021 class at the
ignition pixel must be 10 tree cover or 95 mangroves).

Already resolved by prior stages, not re-screened:
- **Development set** (excluded from the test pool): row 12 (E2024-131853),
  row 15 (E2024-135332).
- **Already rejected by the forest rule in RESQ-3** (excluded; "not to be
  substituted" per `docs/RESQ5_PROTOCOL.md` §1): row 2 (E2023-078506,
  grassland at the ignition pixel), row 11 (E2024-133629, cropland at the
  ignition pixel).

**Candidate pool for the test set — forest rule not yet checked for any of
these 11, by design:**

| # (table row) | id | state | ignition lat, lon |
|---|---|---|---|
| 1 | E2023-081873 | OD | 19.1537, 84.1941 |
| 3 | E2023-073104 | OD | 20.1916, 82.8242 |
| 4 | E2023-076907 | JH | 23.9566, 86.3719 |
| 5 | E2024-179444 | CG | 21.9301, 82.9254 |
| 6 | E2023-078467 | CG | 23.4034, 83.5717 |
| 7 | E2023-100317 | CG | 23.0020, 83.7492 |
| 8 | E2024-137188 | MP | 22.8252, 77.7226 |
| 9 | E2023-078274 | JH | 22.4374, 85.3222 |
| 10 | E2023-072491 | JH | 22.2293, 85.9403 |
| 13 | E2024-146565 | MP | 22.6798, 78.5640 |
| 14 | E2024-162538 | MP | 22.4318, 80.1904 |

**Checking the forest rule itself requires a WorldCover read at each
ignition pixel — that is test-set input, so it happens exactly once, together
with fetching the rest of each surviving candidate's inputs, in Step 3, not
before.** Per the task's rule: "fetch their inputs only AFTER this protocol
document is committed, not before" is satisfied by deferring the fetch to
Step 3 entirely (the stronger, later rule in the task — "first time you
touch test-set data at all" happens in Step 3 — governs). Candidates that
fail the forest rule when finally checked are reported as failing, not
dropped silently and not replaced; `docs/simulation/RESULTS.md` (Step 3)
will state how many of the 11 passed.

## 3. Baselines (frozen formulas, no simulator, no fitting)

Both baselines use only the ignition point, the horizon, and (for baseline
b) the wind series from whichever weather source is being compared against
for that run — never the simulator output, never the observed final extent,
never anything fitted to any incident's outcome.

### (a) Proximity (unchanged from `docs/RESQ5_PROTOCOL.md` §8(a))

```
p(cell) = exp(-d / 1000 m)
```
where `d` is the distance from the ignition point to the cell centre.
Time-independent — the same map is scored at every horizon. This is
carried forward unchanged from RESQ-5; it is not re-fitted here.

### (b) Wind-elongated proximity (new; also a usable production fallback, per task 2g)

Replaces RESQ-5's old baseline (b), "circle of the final observed area" —
that baseline needed the final burned area to construct, which does not
exist for a live, still-unfolding incident, so it could never be a usable
product fallback output. This baseline needs only the ignition point and a
wind series over `[t0, t0+h]`, so it is computable live, at any horizon,
before anything has happened, and can ship as the fallback output in 2g if
the engine is ever judged not worth running or not to use.

For horizon `h` (hours) and a cell at downwind/crosswind offsets
`(d_down, d_cross)` from the ignition point, where "downwind" is the
cell's displacement projected onto the **vector mean "to" wind direction
over `[t0, t0+h]`** of the comparison weather source:

```
scale(h)    = h / 12                                   # dimensionless, 1.0 at the 12 h reference horizon
v_mean(h)   = mean wind speed (m/s) over [t0, t0+h]
L_cross(h)  = 1000 m * scale(h)
L_down(h)   = L_cross(h) * (1 + 1.0 * v_mean(h))        # elongation constant fixed at 1.0 per m/s
r(cell, h)  = sqrt( (d_down / L_down(h))^2 + (d_cross / L_cross(h))^2 )
p(cell, h)  = exp(-r(cell, h))
```

The 1000 m base radius and the 12 h reference horizon reuse baseline (a)'s
constant and the product's own horizon set; the elongation constant (1.0
per m/s) is fixed here, arbitrarily but explicitly, as "a 1 m/s mean wind
doubles the downwind extent relative to the crosswind extent" — a plain
geometric choice, not fitted to any incident, not claimed accurate. At
`v_mean = 0` this reduces to an isotropic map that is a horizon-scaled
version of baseline (a). The 50% band is the ellipse `r(cell, h) = ln(2)`.

Both baselines' constants (1000 m, 12 h, elongation 1.0/m/s) are frozen by
this document and are never revisited after Step 2 or Step 3 results are
seen, on either the development or the test set.

## 4. Success criteria (written now, before any Step 2 run)

For each incident in the development set (Step 2 iteration) and,
separately and only once, each surviving candidate in the test set
(Step 3), at each of the product's four horizons (6 h, 12 h, 24 h, 48 h
after t0):

- **Ground truth per horizon**: the cumulative observed n/h-confidence
  VIIRS footprint (same cumulative, 375 m-grid, nominal+high-confidence
  definition `docs/RESQ5_PROTOCOL.md` §2 and §8 use) as of the **latest
  overpass at or before that horizon**. If no overpass has occurred by a
  given horizon for a given incident, that (incident, horizon) pair is
  reported as **not scorable** — never interpolated or synthesized.
- **Metrics, computed over all cells of that incident's domain**:
  - **AP** (average precision; `sklearn.metrics.average_precision_score`,
    same as RESQ-5) of the predicted probability against cell membership in
    the ground-truth footprint.
  - **A Brier-type score**: mean squared error of predicted probability
    against the binary ground-truth label, `mean((p - y)^2)` over domain
    cells (lower is better; this is the plain Brier score, not a
    skill-score variant, so no reference climatology is subtracted).
- **Compared, per incident, per horizon**: the engine vs. baseline (a) vs.
  baseline (b). Every scorable (incident, horizon, metric) cell of the
  report table is filled in; nothing is dropped because it looks bad.
- **Reporting discipline**: results are reported **per incident**, never
  pooled into one number across incidents, and **no single p-value or
  significance claim is made anywhere** — four (development) or however
  many survive the forest rule (test) incidents is too few for a
  significance test to mean anything, and this document fixes that rule
  now so it cannot be relaxed later if a pooled claim would look good.

## 5. Discipline (restated, applies throughout Step 2 and Step 3)

- The development set is for all iteration. The test set is touched exactly
  once, after Step 2's engine is frozen (Step 3), including the forest-rule
  check and input fetch for its candidate pool.
- If the engine does not beat the baselines on the test set, Step 3's
  `RESULTS.md` says so plainly. No return to Step 2 to "fix" the engine
  using what the test set showed.
- Every input that is missing stays marked missing in the docs/output. No
  invented or synthesized value is presented as a real reading of any kind
  (weather, fuel, DEM, detection, or otherwise).

## Amendment 1 (2026-10-13, coordinator review before Step 2)

Protocol approved with four amendments, addressed in order:

**1. Terminology.** "Slope and aspect" framing from the original task brief
does not survive into RESQ-6's own docs, code comments, or commit messages
going forward: say "slope used" only. Aspect is never described as used or
planned to be used — confirmed in `docs/simulation/00_audit.md` that
Cell2Fire's simulator never reads it (`Cells.cpp`). Applied retroactively to
`00_audit.md`'s wording in the same commit as this amendment.

**2. Temperature/RH exposure — effort estimate and decision.** See
`docs/simulation/ENGINE_DECISIONS.md` §1 for the full analysis. Summary:
confirmed by a full-codebase search that `weatherDF.tmp`/`.rh` are written
in `ReadCSV.cpp` but **read nowhere else in the Cell2Fire source** — the
Spain ROS formula (`FuelModelSpain.cpp`) is a function of wind only.
Wiring real values into the struct for simulator `S` is a small patch
(~10 lines) but would have **zero effect on simulated fire behaviour**,
since nothing downstream consumes it; making it actually matter requires a
fuel-moisture term in the ROS formula itself, which in turn needs fuel
moisture inputs this project does not have (`INDIAN_RUNTIME` blocked).
**Decision: leave the constants as-is, do not even make the inert patch,
and carry `tmp=27°C, rh=40%` forward as a stated, permanent engine
limitation** (see `ENGINE_DECISIONS.md` §1 for the exact wording to reuse
in Step 2's engine docs).

**3. Ignition location source.** `/spread/jobs` takes the ignition location
from a verified-incident record, designed against `resq8/firms-ingestion`'s
`docs/ingest/00_design.md` (`resq_incident_candidates` + verification state
from `resq9/product-pass`'s audit log — neither exists as code yet on either
branch as of this writing). See `docs/simulation/ENGINE_DECISIONS.md` §2 for
the stubbed lookup interface this engine builds against, and the explicit
note that reconciling it with the real `resq8`/`resq9` implementation is a
cross-branch dependency for later, not something this task blocks on or
resolves by changing `operations.py`'s incident schema.

**4. Pre-Step-2 answers, test-set size and runtime budget.**

- **If the forest rule drops some of the 11 test-set candidates:** report
  the engine on however many survive. **Minimum viable test-set size: 3**
  (one fewer than the development set, chosen so the test-set claim is never
  implied to rest on more independent evidence than development did). Below
  3, `docs/simulation/RESULTS.md` states explicitly, as prominently as the
  numbers themselves, that the test set is too small to support **any**
  claim of generalization (stronger than just "no p-value") and recommends
  against any accuracy-flavoured claim anywhere in the product off the back
  of it. At **0** survivors, Step 3 reports that plainly and the
  recommendation defaults toward the baseline-only/hybrid option rather than
  the engine, since there would be no held-out evidence of any kind to
  prefer it.
- **Minimum number of test incidents to report "meaningfully" at all:**
  **1** is the floor for reporting any individual per-incident number;
  **3** is the floor for saying anything about whether a result repeats
  across incidents (a pattern statement, never a significance claim, per
  §5's existing rule). Below 1 there is nothing to report but the fact that
  nothing survived.
- **Ensemble size, finalized: 60 members** (the bottom of the task's 60-90
  range, not the top), chosen for the runtime budget below: at RESQ-5's
  measured 8-15 s/member on a 10-12 km domain with 7 parallel workers, 90
  members gives a worst case of about 90/7*15 s ≈ 193 s per
  (incident, horizon-relevant weather source); 60 members brings that to
  about 129 s, materially better for a feature meant to run on an incident
  commander's request, while still resolving probability to about 1.7%
  (1/60) — finer than the product's 20-point-wide bands need. Revisit toward
  90 only if real deployment hardware/parallelism is confirmed to make that
  cheap; 60 is the frozen default for Step 2 and Step 3.
- **Runtime budget per run (informs Step 2f's async job design):**
  **target 5 minutes (300 s)** wall-clock for one `/spread/jobs` request —
  one incident, all four horizons, one weather source, the full 60-member
  ensemble — matching `docs/sim_followups.md` item 7's own estimate
  ("about 3-5 min with 7 workers") and RESQ-2 section 3's Cell2Fire
  run-time extrapolation. **Hard ceiling: 10 minutes (600 s)** — past this
  the job is marked failed/timed-out and reported as such, never silently
  truncated or left spinning. The job must report progress (members
  completed / total) at an interval no coarser than ~10 s, so a 5-minute
  wait is never a silent spinner.

Nothing else in this document changes. Proceeding to Step 2 on the
development set only, per the original task's scope and stop points.
