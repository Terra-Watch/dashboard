# Simulation redesign: plan

Status: **plan only**. No simulation code, data or results are added by this folder. Everything here is a proposal to be frozen before any scoring starts.

Branch: `feat/simulation-redesign-plan`, created from `origin/main` at `a1ac62a` (includes merged PR #2 and PR #3).

## Why this folder exists

The first simulation study (`docs/simulation/`) asked: *can a physics simulator (Cell2Fire) started at the ignition point beat simple baselines at 24 h and 48 h?* On the four development incidents the answer was no (0 wins, 1 tie, 7 losses; gate failed; test pool of 11 untouched). The study was careful, but it also showed that the question, the target and the metric were poorly matched to how the product is used. This plan starts again from the product question rather than from the simulator.

## One-page summary

| Item | Old study | Redesign |
|---|---|---|
| Question | Does Cell2Fire beat baselines from the ignition point at 24/48 h? | Given the fire front now, where will it be at the next satellite pass, and how sure are we? |
| Start state | Ignition point | Latest observed front (re-initialised at each pass) |
| Truth | Cumulative VIIRS detections | VIIRS front at the next pass, with valid-observation masks; independent burn scars for a subset |
| Scored cells | All cells, including those already burning | New-growth cells only |
| Primary metric | AP | Brier skill score vs the best baseline, event-block bootstrap |
| Baselines | Proximity, wind ellipse | Persistence, own-advance extrapolation, wind ellipse from the front, climatology |
| Sample | 4 dev + 11 test incidents | Hundreds of events, if Phase 0 confirms they exist |
| Method order | Physics first | Baselines, then empirical model, then physics only if there is signal |
| Wording | "Uncalibrated scenario" | Same, until Gate F passes |

## Files

| File | Content |
|---|---|
| [01_findings_and_lessons.md](01_findings_and_lessons.md) | What the first study showed, what went wrong and what must carry over |
| [02_product_question.md](02_product_question.md) | The decision the forecast supports, horizons, users, wording |
| [03_data_and_feasibility.md](03_data_and_feasibility.md) | Data sources, event construction, Phase 0 feasibility audit and its stop rule |
| [04_target_metrics_baselines.md](04_target_metrics_baselines.md) | Target definition, metric hierarchy, baselines, decision rule |
| [05_models.md](05_models.md) | Candidate models in the order they are tried, with entry conditions |
| [06_evaluation_protocol.md](06_evaluation_protocol.md) | Splits, leakage controls, statistics, pre-registration checklist |
| [07_product_integration.md](07_product_integration.md) | API, sync vs queue, UI, wording, monitoring |
| [08_roadmap_and_gates.md](08_roadmap_and_gates.md) | Phases, gates, stop rules, risks, decisions needed |
| [09_references.md](09_references.md) | Sources, with a note on which were checked |

## Decisions needed before Phase 0 starts

1. **Product question** (file 02): dispatch support, village alerts, or planning? It sets horizons and metrics.
2. **Data access** (file 03): a FIRMS map key and a Copernicus (CDS) account for the machine that will run the audit.
3. **Time budget**: Phase 0 is days, not weeks; the rest only proceeds if its gate passes.
4. **Who freezes the protocol**: one named person signs off the frozen protocol (file 06) before any score is computed.

## Relationship to existing documents

- `docs/SCIENTIFIC_VALIDATION_GATE.md` defines Gates A to G. This plan keeps them and maps each phase to them (file 08).
- `docs/simulation/*` stays as the record of the first study. Nothing in it is edited or reinterpreted here.
- `docs/sim_followups.md` open items are folded in (file 01, "Carry-over list").
