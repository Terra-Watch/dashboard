# Owner decisions required before evaluation

No policy below is approved. An accountable project/model-governance owner is not identified in the reviewed repository; the project must name one. Data providers must separately confirm reuse terms.

| ID | Decision / why | Alternatives and consequences | Evidence needed | Work without decision? |
|---|---|---|---|---|
| D1 Target semantics | What is being validated: operational perimeter, interpreted burn scar, or another target? They measure different things. | Timestamped authority edge may be operationally estimated; optical scar is interval-censored; daily BA is coarse/date uncertain. Equating them overstates evidence. | Observation method, source, time, uncertainty, event link, reuse terms. | Metadata screening only. |
| D2 Time origin | Accept proxy `2024-02-16T08:00Z` or require confirmed ignition? | Proxy preserves saved run but limits inference; replacing origin can misalign saved weather/state or require forbidden rerun. | Authority event record and saved-run clock/initial state relation. | Can document; cannot call physical 24 h. |
| D3 Observation lag | Maximum mismatch from t+24? Can a later scene include later growth? | Tight lag may leave no scene; wider lag assesses later scar, not t+24; bracketing needs a declared method. | Actual scene/perimeter times and scientific question. | Search metadata only; no accepted nominal score. |
| D4 Spatial mapping | How map native pixels/polygons to 30 m; how represent uncertainty? | Fractional overlap preserves mixtures; binary threshold simplifies but imposes a boundary; ambiguity band preserves uncertainty but reduces support. Coarse data cannot be made fine by upsampling. | CRS, native resolution, transforms and accuracy; preapproved rule. | Toy tests, no evaluation. |
| D5 Validity/coverage | Minimum usable coverage and cloud/smoke/QA requirements? | Strict may reject scenes; permissive yields false negatives. Scene-level cloud percent is not AOI pixel validity. | Pixel QA and AOI-level valid mask. | Report diagnostics only. |
| D6 Unknown cells | How treat cloud, smoke, no-data, unobserved? | Exclude with explicit mask (recommended); interval/sensitivity method; counting as unburned biases errors. | QA semantics and coverage. | No binary score until set; never silently negative. |
| D7 Metrics | Primary metrics/support? Are probability metrics valid for interpreted/fractional truth? | IoU/Dice and commission/omission for binary area; area bias; AP/Brier require defensible negatives. Post-hoc metric/threshold choice invites outcome selection. | Target meaning, valid mask, probability/fractional semantics. | Descriptives only. |
| D8 Case selection | Approve pre-score screening order and replacement rule? | Preserve current order; choose next by predeclared availability criteria; switching after seeing agreement is cherry-picking. | Approval before catalog results and logged exclusion reasons. | Current order stands; no score-driven switch. |
| D9 Physical-spread claim | What evidence is sufficient for that wording? | Timestamped progression and known initial state; narrowly worded scar comparison; or defer claim pending multiple sources/cases. | Independentness, time/location uncertainty, validity, reproducibility and governance threshold. | No accuracy claim. |
| D10 License/reuse | Can source and derived masks be stored/published? | Follow open terms, seek specific grant, or restrict outputs. | Exact version terms/DOI or written provider permission. | Metadata review only. |

## Recommendation (NOT APPROVED)

- Treat E2024-131853 as first metadata-screening candidate only.
- Prefer an authority timestamped progression if available; otherwise use an independently interpreted S2/Landsat scar as interval-censored post-event evidence, not exact arrival.
- Keep unknown pixels unknown; do not score probability metrics without defensible negatives.
- Keep exploratory results separate from official VIIRS benchmark.

Owner: __________________ Role: __________________ Date: __________

Decision IDs / conditions: ______________________________________________
