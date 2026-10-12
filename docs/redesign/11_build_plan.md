# 11. Build plan

Per the brief, Phase 2 build order is fixed: design tokens/components (`/styleguide`) → landing → Today → Watch → Incident (scenario) → Replay → Field (PWA, offline queue). Committing after each. This doc adds tasks/tests per phase and the decisions the user must answer before Gate 1.

## Phase 2 tasks and tests, in build order

1. **Design tokens + components (`/styleguide` page).** Tasks: implement Tailwind tokens from `08_design_system.md`; build each listed component (MapShell...Dialog) with its documented props/states. Tests: Playwright screenshot of `/styleguide` at 390/1440px; axe-core scan of the styleguide page (every component's states, including error/offline, rendered and scanned).
2. **Landing.** Tasks: build `05_landing_page.md` section-by-section with its exact copy. Tests: Lighthouse (performance + a11y) on `/`, axe-core scan, Playwright screenshot at 390/1440px, link-check for all nav/CTA targets.
3. **Today.** Tasks: wire `GET /risk/geojson`, build risk map + Cell panel + Priority list fallback. Tests: axe-core + Lighthouse on `/today`; a unit test asserting no 24h/48h horizon string ever renders on this route (`09_trust_rules.md` rule 4); Playwright screenshots at both widths.
4. **Watch.** Tasks: build new `/detections` endpoints (backend) serving the 4 incidents' VIIRS data as labeled sample data; build QueueList/DetectionCard/VerifyActions. Tests: axe-core + Lighthouse; a test asserting "Not yet verified" renders on every unverified card; offline-degrade banner test.
5. **Incident (scenario).** Tasks: extend `/spread/jobs` with `wind_source` + baseline payload; build the full `06_simulation_ui.md` screen (TimelineSlider, ProbabilityBand legend, WindArrowsControl, BaselineToggle, AssumptionsPanel, BriefingExport). Tests: a test asserting the "Uncalibrated scenario" badge is present and non-dismissible; a test asserting the baseline is on by default; axe-core + Lighthouse; Playwright screenshots including the AssumptionsPanel expanded state.
6. **Replay.** Tasks: new `GET /replay/{incident_id}` static-data endpoint sourced from `results/resq5/`; build the headline table + per-overpass metrics + honest-conclusions text verbatim. Tests: a data-integrity test diffing rendered numbers against `docs/RESQ5_RESULTS.md`'s source tables (catches any future accidental rewrite that softens the numbers); axe-core + Lighthouse.
7. **Field (PWA, offline queue).** Tasks: `GET /field/tasks`, `POST /field/tasks/{id}/verify` with multipart + offline background sync; build PhotoCapture, SyncQueue, OfflineBanner. Tests: a Playwright test that goes offline (network throttling), submits a verification, confirms it queues and later syncs; axe-core + Lighthouse on mobile viewport specifically.

Across all phases: run axe-core and Lighthouse on every screen (per the brief), fix what fails before moving to the next phase, commit after each phase.

**Cross-cutting tests required on every screen (Gate 1 amendment), in addition to the per-screen tests above:**
- Every screen renders a visible sample-data label (`SampleDataBadge`).
- No screen's rendered text contains the literal string "live" anywhere (case-insensitive substring check against the rendered DOM text, not the HTML source).
- On Incident, changing the `WindSourceSwitch` control changes the rendered scenario output (assert the probability-band layer's data or the displayed summary numbers differ between two wind sources) — not a visual no-op.
- The baseline overlay renders visibly by default (not just toggleable-but-hidden) on both Incident and Replay — assert the baseline layer/element is present and has non-zero opacity/visibility on initial render, not only after a user action.
- Submitting a field report twice with the same idempotency key is deduped server-side — assert exactly one record exists after two identical `POST`s, and the second response does not report a new item created.

## Open decisions the user must answer before Gate 1 is approved

1. **Judges' demo vs real deployment.** Is this redesign aimed at a hackathon/demo audience (in which case the Replay/evidence screen and the 4-incident demo dataset *are* the product for now) or a real pilot deployment path (in which case Watch/Field need real VIIRS/FIRMS ingestion and real field-crew accounts before they're usable, which is much more work than this redesign's Phase 2 scope)? This changes how much of `10_backend_contract.md`'s "new endpoints" work is worth doing now vs later.
2. **Basemap licence.** No satellite basemap licence has been confirmed usable (`00_audit.md`, `07_maps.md`). Keep the current key-free OSM light basemap as the only option, or should someone check a specific provider's (Bhuvan / Esri / Mapbox) terms before Phase 2 starts?
3. **Backend rebuild scope.** Should Phase 2 extend `operations.py`/`risk.py` as described in `10_backend_contract.md`, or should the detections/field/replay endpoints live in a new, separate service to avoid touching the existing (partially scaffolded) `operations.py`?
4. **Role/auth model.** Does the redesign need real authenticated roles (extending the existing JWT/admin-officer-viewer model to the five user types in `02_users_and_use_cases.md`), or is a client-side `RoleSwitcher` with no auth change sufficient for the current stage?
5. **Offline sync scope for field crew.** How much should actually be downloadable for true offline use in Phase 2 — just the assigned task's immediate area, or a whole division's map/boundaries (per the older `02_screens.md` "Offline data" settings concept)? This affects how much of the PWA/service-worker work is in scope now vs deferred.
6. **VIIRS/FIRMS live ingestion.** Is building a real near-real-time detection feed in scope for this redesign's Phase 2, or does Watch stay on the 4 demo incidents' static data (clearly labeled as sample data) until a separate ingestion project exists? `docs/05_prototype_gap_analysis.md` §B lists this as unbuilt; it is a meaningfully larger scope than the UI work in this plan.
7. **`docs/01_design_system.md`/`02_screens.md` scope (plans/teams/admin/assistant).** Confirm these stay explicitly out of scope for this redesign (per `04_information_architecture.md`) rather than being partially built in a way that could look finished when it isn't.
