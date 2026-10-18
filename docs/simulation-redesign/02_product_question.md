# 02. The product question

A forecast is only good for the decision it supports. This file fixes that decision first. **Section 4 lists what the owner must choose.**

## 1. Who uses it and for what

| User | Decision | What they need from the forecast |
|---|---|---|
| Control Room operator | Where to send crews, which areas to alert | Direction and distance of likely advance, with uncertainty, by the next pass |
| Range Officer | Where to approach, where is unsafe | Same, in the field, offline-tolerant |
| Citizen | Whether to leave an area | **Not** this forecast. Citizens see coarsened, delayed public information only |

The scenario output is Control Room only today (`features/scenarios`, flag `SCENARIO_PLANNER_ENABLED`). That does not change.

## 2. The forecast, in one sentence

> Given the fire front observed at time t0, where is the front likely to be at the next satellite pass, and how confident are we?

Output: a probability surface over a 375 m lattice plus three summaries: expected advance distance, bearing, and an envelope that contains the true next front with a stated frequency (for example 50% and 80%).

## 3. What it is not

- Not a prediction of ignition (that is the onset model, TWM, and the risk layer).
- Not a burned-area estimate.
- Not shown to citizens.
- Not claimed accurate until Gate F in `docs/SCIENTIFIC_VALIDATION_GATE.md` passes.

## 4. Decisions needed from the owner

| Decision | Options | Recommendation | Why it matters |
|---|---|---|---|
| Primary horizon | next pass (about 3 to 12 h), 24 h, 48 h | **Next pass**, then 24 h | Only horizons with real observations can be scored. 6 h and 12 h were unscorable before |
| Primary user | Control Room dispatch, planning, village alerts | **Control Room dispatch** | Sets area-efficiency and direction metrics |
| Fire types in scope | All, or forest fires above a size | **Forest and large fires first**, state the limit | Labels are far better there (file 03) |
| Region scope | All India, or named states | **States with the most events** (confirmed in Phase 0) | Sample size |
| Failure behaviour | Show nothing, or show baseline with a label | **Show the wind-ellipse envelope labelled "indicative"** until a model passes its gate | Keeps the feature useful without overclaiming |

## 5. Wording rules (carry over from `docs/redesign/06_simulation_ui.md`)

- "Indicative spread envelope, not a forecast" until Gate F passes. Then "Spread outlook" with its measured skill shown beside it.
- Always show: data and wind source, time of the last satellite pass used, model name and version, ensemble size.
- Never show an animation or a single crisp outline as if it were certain.
