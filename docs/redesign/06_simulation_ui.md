# 06. Simulation UI — incident scenario and replay/evidence

Read `01_narrative.md`, `03_flows.md`. This screen only exists downstream of a **Verified incident** (see `03_flows.md`'s rule: Today never links to the scenario).

## A. Incident scenario screen (`/incidents/:id/scenario`)

### Layout

```
+----------------------------------------------------------------+
| StepIndicator: Forecast -> Detection -> [Verified incident] -> Scenario |
| TrustBadge: "Uncalibrated scenario" (persistent, top of screen) |
+--------------------------------+---------------------------------+
|                                | AssumptionsPanel (collapsed by  |
|   MAP                         | default, one-tap expand)        |
|   - burn probability bands    | - Fuel: WorldCover-derived,     |
|   - baseline outline (toggle) |   TL2/GR1, uncalibrated          |
|   - wind arrows (hourly)      | - Weather: [source name]         |
|   - ignition point            | - Terrain: Copernicus GLO-30     |
|                                | - "India-specific fuel data not |
|  [WindArrowsControl]          |   available (INDIAN_RUNTIME     |
|  [BaselineToggle]             |   blocked)"                      |
+--------------------------------+---------------------------------+
| TimelineSlider: 6h  12h  24h  48h                                |
| ProbabilityBand legend (0-20% / 20-50% / 50-80% / 80-100%)       |
+-------------------------------------------------------------------+
| WindSourceSwitch: ERA5-Land (primary) | ERA5 0.25° | best_match   |
+-------------------------------------------------------------------+
| [Export briefing]                                                 |
+-------------------------------------------------------------------+
```

### Every control, state and label

- **StepIndicator** — always visible, non-interactive labels: "Forecast → Detection → Verified incident → Scenario", current step bold. Communicates at a glance that this screen required a verified incident.
- **TrustBadge** — fixed, non-dismissible text: "Uncalibrated scenario — one simulation run, not a forecast." Same component used on every scenario/replay screen (see `08_design_system.md`).
- **Map** — MapLibre. Probability-band fill (see `07_maps.md` colour rules) for the cell being viewed at the selected horizon; ignition point marker; baseline outline as a separate line layer (toggleable but default-on — never default-off, since hiding the baseline is exactly the overclaiming risk this product forbids); wind arrows per hour, rendered along the timeline scrub.
  - Loading: skeleton map tile shimmer + "Running scenario…" (only while the backend job is actually running; no fake percentage).
  - Error: "The scenario could not run. Check the point is inside a mapped forest area and try again." (reused verbatim pattern from existing `SpreadPage.tsx`).
  - Offline: "Scenario needs a connection. Showing the last result from [time]." if a cached result exists, else "Scenario needs a connection."
- **TimelineSlider** — four stops only: 6h, 12h, 24h, 48h (not a continuous scrub — the RESQ-5 protocol's overpass structure and the product's horizon promise are both discrete). Dragging updates the map's probability bands and the wind arrows shown up to that hour. Label under the slider: "Hour [N] of the scenario, not hour [N] after now" if the incident didn't start now.
- **ProbabilityBand legend** — four bands (0-20/20-50/50-80/80-100%), colour-blind-safe (see `08_design_system.md` token table), each swatch labeled with the percentage, never just a colour.
- **WindArrowsControl** — toggle (default on) + a small inline note: "Arrows show wind for the selected hour, from the source below." Arrow length = speed, direction = meteorological "from" bearing, matching RESQ-5's convention.
- **BaselineToggle** — toggle, default on, label: "Simple guess (proximity baseline)" with a tooltip: "A guess using only distance from the ignition point — no simulator, no wind, no fuel." If toggled off, a small reminder chip stays on screen: "Baseline hidden — ask why" (keeps it one tap away, never silently forgotten).
- **AssumptionsPanel** — collapsed by default (to avoid overwhelming the map) but with a visible, un-missable header chip "Assumptions" with a count badge (e.g., "4"), expand on tap. Contents, each with its "exists/obtainable/missing" status against `07_maps.md`:
  - Fuel: "Derived from ESA WorldCover land-cover class, mapped to Spanish fuel models (TL2 forest, GR1 grass). Uncalibrated — no canopy, load, or moisture data. India-specific fuel mapping is blocked (not yet available)." (verbatim sense from RESQ5_PROTOCOL.md §4.)
  - Weather: "[Selected wind source]. Temperature and humidity are fixed at 27°C/40% by the simulator regardless of actual conditions." (RESQ5_PROTOCOL.md §5.)
  - Terrain: "Copernicus GLO-30 elevation. Slope has almost no effect on this result (RESQ-5 measured less than 1% effect at a 20° slope)."
  - Ignition: "Point and time are estimates from the first satellite detection, not a confirmed exact ignition."
- **WindSourceSwitch** — three options: "ERA5-Land (primary)", "ERA5 0.25° (sensitivity)", "best_match (not a reanalysis, sensitivity)". Switching re-renders the map and timeline immediately from already-computed ensemble data (no new job run needed if results are pre-computed for the incident; if live, show the same loading state as above). Helper text: "Wind source changes this result more than anything else tested. Compare it yourself."
- **Export briefing** — generates an image/PDF snapshot of the current map + timeline + assumptions panel + trust badge, all baked into the export (not strippable). Button label: "Export briefing". Success toast: "Briefing exported."

### Replay/evidence screen (`/replay/:incidentId`)

```
+-------------------------------------------------------------------+
| TrustBadge: "Tested against 4 real fires used to build this tool  |
| (not held out, not independent)"                                   |
+-------------------------------------------------------------------+
| Incident selector: E2024-131853 TS | E2024-135332 MH |            |
|                     E2023-084925 OD | E2024-155286 CG              |
+--------------------------------+-----------------------------------+
| MAP: sim probability bands,    | Headline comparison (last overpass)|
| baseline outline, observed     | AP: sim 0.191 vs proximity 0.367   |
| VIIRS footprint (distinct      |   -> baseline wins                 |
| symbol, see 07_maps.md)        | IoU@0.5: sim 0.167 vs proximity    |
|                                |   0.230 -> baseline wins            |
| Overpass selector: k=0..N      | (per incident; see table below)    |
+--------------------------------+-----------------------------------+
| Full metrics table per overpass (AUC, AP, IoU, precision, recall, |
| area ratio) — sim vs both baselines, exactly as RESQ5_RESULTS.md  |
+-------------------------------------------------------------------+
| Wind-source sensitivity table (same incident, 3 sources)          |
+-------------------------------------------------------------------+
| "Honest conclusions" — verbatim from docs/RESQ5_RESULTS.md §6     |
+-------------------------------------------------------------------+
```

- Every number on this screen must come from `results/resq5/<incident>/` or `docs/RESQ5_RESULTS.md` — no rounding beyond what those sources already show, no rephrasing of "did not beat" into softer language.
- **Cross-incident win-count summary** (shown once, above the per-incident table; computed by counting winners in `RESQ5_RESULTS.md` §1's table, not estimated — recount if that table ever changes):
  - **AUC** (rank-based ability) vs proximity baseline: simulation wins in **0 of 4** incidents (RESQ5_RESULTS.md §1: "proximity baseline is higher than the simulation's in all four incidents").
  - **AP** vs proximity baseline (baseline a): simulation wins in **0 of 4** incidents (E2024-131853, E2024-135332, E2023-084925, E2024-155286 all baseline).
  - **AP** vs circle-of-final-area baseline (baseline b, information-advantaged): simulation wins in **3 of 4** incidents (E2024-131853, E2024-135332, E2024-155286; E2023-084925 still baseline).
  - **IoU@0.5** vs proximity baseline (baseline a): simulation wins in **0 of 4** incidents.
  - **IoU@0.5** vs circle-of-final-area baseline (baseline b): simulation wins in **1 of 4** incidents (E2024-135332 only).
  - This is the only place these win-counts appear with this precision; the narrative/landing copy stays qualitative ("did not beat a simple proximity baseline on AUC/AP in the replayed incidents; won IoU against one baseline in one incident") and must link here for the breakdown rather than restating counts.
- The incident selector always shows all 4 replayed incidents; there is no way to filter to only the one where simulation won on IoU (E2024-135332) — the headline comparison table is shown in full for all 4 every time, per `02_users_and_use_cases.md` user 5's "must never misread" rule.
- **Empty/loading/error states:** this is static precomputed data; loading is near-instant (brief skeleton only), error is "Replay data could not load" (a deploy/data issue, not expected in normal operation), no offline-specific state needed beyond standard caching since the dataset is small and static.
