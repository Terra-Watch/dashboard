# 08. Roadmap, gates, risks and decisions

Time is stated as effort, not dates. Each phase ends with a gate. A failed gate stops or redirects the work; it never leads to quietly changing the rules.

## Phases

| Phase | Work | Output | Gate |
|---|---|---|---|
| **0. Freeze and feasibility** (days) | Product question; FIRMS India extraction; event clustering; Phase 0 audit (file 03) | Audit report: counts, sizes, gaps, variance; draft protocol | **G0**: enough independent growth cases for the pre-stated power. If not, stop and ship the indicative envelope |
| **1. Benchmark build** (about 1 to 2 weeks) | Dataset manifest; splits; lattice and masks; scoring harness; baselines B0 to B4; leakage and synthetic tests | Frozen protocol (signed), harness with tests, baseline results on validation | **G1**: harness passes tests; protocol frozen; baselines computed |
| **2. Empirical model** (about 2 weeks) | Tier 1 features, quantile model, calibration; ablations | Validation results vs baselines; feature-signal report | **G2**: beats best baseline on validation, calibrated; else stay with baseline |
| **3. Physics-informed (optional)** (about 2 to 3 weeks) | Tier 2 self-calibrated spread; Tier 3 Cell2Fire from the front | Comparison under the same protocol | **G3**: beats Tier 1 on validation, else drop physics |
| **4. Test and integrate** (about 2 weeks) | Open the test set once; API and UI; monitoring; shadow scoring | Test report; integrated feature behind a flag | **G4** = validation Gates F and G |
| **5. Flywheel** (ongoing) | Close-out perimeter capture; shadow scoring in production; periodic re-evaluation | Growing ground-truth set; skill dashboard | Review each season |

Phases 0 and 1 are worth doing even if every model fails, because they give the product an honest baseline and a benchmark.

## Risks

| Risk | Likelihood | Effect | Response |
|---|---|---|---|
| Too few multi-pass events, or too few that grow | Medium | Study underpowered | Stop at G0; ship indicative envelope; invest in flywheel |
| VIIRS labels miss small fires | High | Biased sample toward large forest fires | State the scope; stratify; independent burn-scar subset |
| Reanalysis weather overstates skill | High | False confidence | Forecast-archive evaluation is primary |
| Baselines are hard to beat | Medium to high | No model ships | Fine: ship the baseline, say so |
| Label time or position errors | Medium | Noisy skill | Position tolerance sensitivity; FSS; event-level reporting |
| Protocol drift | Medium | Invalid claims | Signed freeze; amendments logged |
| Scope creep into physics | Medium | Time loss | Entry conditions in file 05 |
| Overclaiming in slides or UI | Medium | Reputation and safety | Wording rules (file 02, 04, 07) |

## Decisions needed

See the list in `README.md`. In short: product question, data access, time budget, and who signs the freeze.

## What happens to existing work

- `docs/simulation/*` and `results/resq6/*` stay unchanged as the record.
- The browser Scenario tab stays as the indicative planning aid. The server-side wind-ellipse endpoint is documented but not in this tree (see file 07); bringing it across is a Phase 4 task. This plan changes where the ellipse starts (the front, not the ignition point) only in Phase 4, and only with its wording kept.
- Cell2Fire job creation stays disabled (the route returns 503 on this branch).

## First actions after approval

1. Confirm the product question and horizons.
2. Get the FIRMS key and CDS account on the machine that runs the audit.
3. Write the Phase 0 audit script (read-only on data, writes a report and a manifest) and run it on the chosen years.
4. Review the audit with the owner and decide G0.
