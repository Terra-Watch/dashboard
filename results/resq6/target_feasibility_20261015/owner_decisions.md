# RESQ6 target and observation-policy decisions for approval

These are proposed decisions only. No policy is adopted by this audit. No accountable owner or approval role was identified in the inspected project documents.

1. **Primary target semantics**

   - **Question:** Should the next RESQ6 development evaluation target cumulative detected active-fire presence (VIIRS positives), fire onset, or spatial spread/burned extent?
   - **Options:** (a) cumulative n/h VIIRS detections; (b) first/new detection after a known fire-free baseline; (c) change in a mapped fire perimeter/burned area.
   - **Consequences:** (a) best matches current positive construction, but remains “detected presence,” not fire absence or perimeter, and requires valid-observation masks for negatives. (b) needs pre-origin coverage and reliable previously-unburned state. (c) needs an initial footprint and time-resolved perimeter/change truth; present MCD64A1 is monthly and too coarse/uncertain for 6–48 h.
   - **Recommendation — NOT APPROVED:** choose (a) for the near-term development target; keep (b) and (c) as distinct tasks until their additional truth data exist.
   - **Approval:** project owner; identity not established by repository evidence.

2. **Forecast origin and incident association**

   - **Question:** Is the current origin (`first associated detection − 12 h`, floored to hour) retained as a protocol time origin, or should a new operational origin be defined?
   - **Options:** retain current origin with explicit “not ignition” wording; define a separately observed ignition/origin; exclude/re-associate cases with ambiguous pre-origin detections under a frozen rule.
   - **Consequences:** retaining it preserves historical comparability but does not establish that cells are unburned at origin. E2023-084925 has three raw pre-origin detections inside the domain that belong to separate connected components; silently attaching or ignoring them for a new onset/spread task would change semantics.
   - **Recommendation — NOT APPROVED:** retain the old origin only for reproducing the historical benchmark; for a new target, approve an explicit origin/association rule and adjudicate E2023-084925 before scoring.
   - **Approval:** project owner; no named owner was found.

3. **Maximum target age and missing horizons**

   - **Question:** What maximum absolute lag between nominal horizon and target acquisition is scientifically acceptable, and what happens when no pass qualifies?
   - **Options:** exclude the horizon; report it as unscorable; redefine forecast as prediction at the next acquisition (a distinct target); or approve a justified tolerance per task/horizon. Do not silently use a post-horizon observation.
   - **Evidence:** 24 h lags are 0.63/10.28/11.15/11.23 h; 48 h lags are 23.80/10.60/10.60/35.23 h. No eligible event-linked pass exists by 6 h or 12 h. The protocol has no lag threshold.
   - **Recommendation — NOT APPROVED:** set no universal number from this audit. Select tolerance based on intended “state at horizon” vs “state at acquisition,” sensor cadence, expected fire dynamics, spatial footprint uncertainty, and forecast use; predeclare it and leave missing cases unscored.
   - **Approval:** project owner; no named owner was found.

4. **Valid negatives, observation coverage, and unknown cells**

   - **Question:** Which source and quality semantics establish that a cell had a valid observation opportunity and can be labeled negative?
   - **Options:** obtain per-acquisition cloud/clear-sky/view/quality coverage masks and label uncovered cells unknown; use an independently validated observation source; or restrict results to positive-detection descriptions without binary negatives until coverage exists.
   - **Consequences:** current FIRMS CSV has detections and metadata but no per-cell opportunity field. Treating non-detections as negatives can contaminate AP/Brier and create false evidence of absence. MCD64A1 derived CSVs are burned pixels, not current per-cell VIIRS coverage; the 155286 MCD metadata has an unresolved size-match flag and no derived CSV.
   - **Recommendation — NOT APPROVED:** unknown/unobserved cells must not be treated as negatives; procure/derive a validated coverage mask before binary evaluation.
   - **Approval:** project owner and the responsible remote-sensing/data-quality authority, if designated; no identity was found.

5. **Confidence, satellite/pass grouping, and spatial unit**

   - **Question:** Which confidence classes/platforms/pass grouping and spatial footprint mapping define target positives and the evaluation unit?
   - **Options:** preserve current n/h-only, satellite/date/day-night pass grouping and nominal 375 m global-key mapping; approve another confidence policy; or rasterize actual scan/track footprint geometry under a frozen CRS/grid.
   - **Consequences:** current metadata retain `confidence`, satellite, day/night, scan and track, but mask generation collapses detections to nominal 375 m keys and maps those blocks to 30 m cells. Changing these choices changes positive support and historical scores.
   - **Recommendation — NOT APPROVED:** preserve the current rule only for historical reproduction. For new evaluation, approve a target footprint/grid explicitly and document sensitivity before comparing it with the historical benchmark.
   - **Approval:** project owner / data-methodology owner; none is named in inspected docs.

6. **Metrics, denominators, and split governance**

   - **Question:** Once coverage is available, which covered-cell metrics and denominator reporting govern the new target, and what incident-level split/freeze process applies?
   - **Options:** report AP and Brier on valid covered cells with positive/negative/unknown counts; use positive-only descriptive metrics until valid negatives exist; for true spread add predeclared perimeter overlap/distance metrics. Keep incident-level split and preserve untouched test cases.
   - **Consequences:** dropping unknown cells changes the metric population and can change AP/Brier; a VIIRS-detection target cannot be described as burned-area skill. Reusing future detections in event assignment/origin or tuning leaks target information.
   - **Recommendation — NOT APPROVED:** report per incident and horizon with explicit covered-cell denominators; freeze label, coverage, metrics, and incident split before tuning; retain the existing official protocol and failed development gate as a separate historical benchmark.
   - **Approval:** project owner; no named owner was identified.

## Minimum gate before a new scored evaluation

- [ ] Approve one target interpretation and define what the prediction horizon means.
- [ ] Freeze origin/incident association and resolve the E2023-084925 pre-origin detections for any new task.
- [ ] Approve target-age and no-eligible-pass handling without post-horizon leakage.
- [ ] Obtain validated per-cell observation opportunity/quality data or explicitly avoid binary negative labels.
- [ ] Approve confidence, pass grouping, CRS, grid size, and footprint rasterization.
- [ ] Freeze unknown-cell and metric-denominator handling, incident-level split, and leakage controls.
- [ ] Version/hash raw observations, coverage, label arrays, code, predictions, and scoring environment.
- [ ] Preserve the official benchmark and held-out data untouched until its separate authorization gate is satisfied.
