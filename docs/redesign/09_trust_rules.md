# 09. Trust rules

Read `01_narrative.md` first — this doc operationalizes its "exact words" table into a checklist every screen must pass before ship.

## Wording rules

- Never use "predicts," "AI-powered," or any verb implying certainty about the future. Use "ranks," "estimates," "scenario," "guess" (for baselines), "not yet verified."
- Never state a number that isn't traceable to a file in this repo (`docs/RESQ5_RESULTS.md`, `results/resq5/*`, `results/resq4_*`, `docs/PRODUCT_RULES.md`). If a figure can't be sourced, the screen must say "not available" instead of inventing or estimating it.
- Never show "24h" or "48h" as a *forecast* horizon. Those numbers only ever appear as scenario timeline stops, always paired with the "Uncalibrated scenario" badge.
- Never call the 4 replay incidents "validated," "held out," or "a test set" without the qualifier "development incidents, not held out" in the same sentence or immediately adjacent.
- Never say the simulation "performed well" or "accurately predicted" anything — if citing a result, cite the real number and whether it beat or lost to the baseline, per `docs/RESQ5_RESULTS.md` §1's own framing ("does not beat the simple baselines in a consistent way").
- Risk bands are always named in words next to their colour (per `docs/PRODUCT_RULES.md`'s existing rule): Very high (top 1%), High (top 5%), Moderate (top 15%) — never shown as a raw score.
- Footer line "Advisory forecast. Confirm with field observations." appears on every authenticated page, unchanged from `docs/PRODUCT_RULES.md`.
- Every screen carries a visible `SampleDataBadge` until live FIRMS ingestion exists (it does not — see `00_audit.md`). No rendered text on any screen contains the word "live" in a way that could be read as "this data is real-time"; `03_flows.md`/`00_audit.md`/`10_backend_contract.md` may discuss liveness analytically as internal design prose, but UI copy must not.
- **Today screen content rule:** must display the model name ("Bar v3"), the date it is for, and its coverage area in plain text, sourced from `00_audit.md`'s verified read of `backend/app/barv3.py`. Inside the six states Bar v3 is scoped to (OD, CG, TS, MP, MH, JH), show the rank/band. Outside them, show **"Not validated here"** instead of a risk value — never a value with the same visual weight as a validated one. There is no second "zero-shot" tier; outside the six states is simply not validated.

## Colour and state rules

- Risk ramp (yellow/orange/red) and probability-band ramp (blues) must never share a hue family — see `08_design_system.md` — so a user can never mistake a forecast rank for a spread probability at a glance.
- Every colour-coded meaning also carries a text label and (for risk/probability bands) a pattern (hatch/dot), never colour alone.
- The `TrustBadge` component (`08_design_system.md`) is non-dismissible on scenario and replay screens — a user cannot hide the "uncalibrated" warning to get a cleaner screenshot.
- The `BaselineToggle` defaults to on everywhere; turning it off leaves a visible "Baseline hidden" reminder chip rather than letting the scenario appear alone.

## Per-screen checklist (every screen must pass all applicable items before ship)

1. Does this screen say, in plain text, which of the three steps (forecast / detection / verified incident+scenario) it is showing?
2. Does every number on screen trace to a real file or API response, with no invented precision?
3. If this screen shows a spread scenario, is the "Uncalibrated scenario" badge visible without scrolling, and is a baseline shown by default?
4. If this screen shows a forecast, does it avoid any horizon beyond "tomorrow"?
5. If this screen shows a detection, is "Not yet verified" visible on every unverified item, with no visual treatment that could be mistaken for a confirmed incident?
6. If this screen cites the 4 replay incidents, does it state they are development incidents, not held out?
7. Does every risk/probability colour also carry a text label and a pattern cue?
8. Is there an empty, loading, error, and (where relevant) offline state defined and not a reused generic spinner with no explanation?
9. Does the footer carry "Advisory forecast. Confirm with field observations." where applicable?
10. Would removing every colour from this screen (greyscale, pattern-only) still make all claims and distinctions legible?
