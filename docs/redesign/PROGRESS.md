# Redesign v2 — progress log

Branch: `redesign-v2`. Started 2026-10-12. Gate 1 = Phase 0 (audit) + Phase 1 (design docs, wireframes, screenshots). No app code touched. No push/merge.

## Phase 0 — audit
- [x] Read RESQ5_PROTOCOL.md, RESQ5_RESULTS.md, RESQ4_SPREAD_TEST.md, PRODUCT_RULES.md, ARCHITECTURE.md, 05_prototype_gap_analysis.md.
- [x] Read backend/app/main.py + routers (auth, operations, risk) for actual endpoints.
- [x] Read frontend pages/features/components list; read SpreadPage.tsx (current "incident" UI) in full.
- [x] Inventoried data/, backend/runtime_data/, results/ for what geo layers actually exist on disk.
- [x] Checked for roads/water/settlements/boundaries/WorldPop — none found locally (grep across data/ and backend/runtime_data/).
- [x] Confirmed Playwright + @axe-core/playwright present in frontend/node_modules (devDependency, @playwright/test ^1.64.0) — usable for screenshots.
- [x] Wrote `00_audit.md`.

## Phase 1 — design docs
- [x] 00_audit.md
- [x] 01_narrative.md
- [x] 02_users_and_use_cases.md
- [x] 03_flows.md
- [x] 04_information_architecture.md
- [x] 05_landing_page.md
- [x] 06_simulation_ui.md
- [x] 07_maps.md
- [x] 08_design_system.md
- [x] 09_trust_rules.md
- [x] 10_backend_contract.md
- [x] 11_build_plan.md
- [x] wireframes/*.html (landing, today, watch, field-mobile, incident-24-48, replay)
- [x] screenshots/*.png at 390 and 1440 px (via frontend/node_modules/.bin/playwright, one-off script in scratchpad, not committed to repo)
- [x] SUMMARY.md

## What could not be checked
- Basemap licence for a satellite option: no confirmed licence found in repo for Indian satellite basemap tiles (e.g. Bhuvan terms were not vetted). Defaulted to an open light basemap (OSM raster, as used today) and flagged as an open decision.
- Whether the existing backend's PostGIS/user tables hold any real production data (DB not inspected live, only schema/route code read).
- Actual rendered Lighthouse/axe scores — out of scope for Phase 1 (that's Phase 2 per the brief).

Stopped at Gate 1 per instructions. Awaiting "Gate 1 approved" before any app code.

## Gate 1 approved — amendments applied (commit 582ad6f)
- Basemap: PMTiles via Protomaps, no raw OSM tile server; licence chain in 07_maps.md.
- Sample-data labeling + "no live wording in UI copy" rule added to 09_trust_rules.md.
- Idempotency-key + SyncQueue pending/synced/failed/retry spec added to 08/10.
- Exact per-metric replay win-counts recomputed from RESQ5_RESULTS.md, placed on Replay screen only (06_simulation_ui.md).
- Today screen's six-states-only coverage rule; corrected an unverified "6+2 zero-shot states" claim that does not exist in the repo — see 00_audit.md.
- Cross-cutting test checklist (sample-data badge, no "live" string, wind-source-switch actually changes output, baseline visible by default, duplicate-idempotency-key dedupe) added to 11_build_plan.md.

## Phase 2 build — in progress (frequent commits, per instruction)
- [x] 9bc7258 — Tailwind + redesign-scoped design tokens (light/dark, colour-blind-safe risk scale, trust scale), new deps (@tanstack/react-query, motion, pmtiles, clsx).
- [ ] Backend: `backend/app/services/redesign_store.py` (SQLite demo store: triage_actions w/ device_id+timestamp, field_reports w/ idempotency_key) and `redesign_data.py` (real-data loaders: VIIRS detections, replay metrics recomputed from `results/resq5/*/metrics_by_overpass.csv` at request time, cross-incident win-counts). Router (`backend/app/routers/redesign.py`) not yet wired into `main.py` — next step.
- [x] e1ad229 — Backend: redesign_store.py (SQLite demo store), redesign_data.py (real-data loaders, verified against a live uvicorn instance bypassing the Postgres-dependent main app), redesign.py router wired into main.py.
- [x] 20dc486 — Today, Watch, Incident, Replay, Field screens built and wired to the new endpoints. tsc -b + vite build both clean.
- [x] d8cebb6 — frontend/tests/redesign.spec.ts: 19/19 passing (sample-data badge, no "live" text, axe-core clean on all 5 screens, baseline-visible-by-default on Incident+Replay, wind-source switch changes 491/9409 grid cells, duplicate idempotency-key dedup verified). Fixed a real WCAG AA contrast failure (--rq-warn darkened) and 3 leftover "live" strings found by the test, not by inspection.
- [x] Landing page: **not built as a final component** per the mid-build instruction to pause here — instead produced 2 visually distinct direction wireframes (docs/redesign/wireframes/landing-direction-a.html "calm map-first" and -b.html "Magic-UI-style animated") with screenshots at 1440px, for the user to pick via the coordinating session before the final landing component is built.
- [x] 6a65f1d — Landing page built for real (Direction A, the user's pick) at `/redesign`, wired into `RedesignRoot`'s navigation with `App.tsx`'s pushState `go()` instead of full-page reloads. 2 a11y issues found and fixed by the test suite (a mid-fade-in color-contrast false-positive, fixed by waiting for the animation to settle before scanning; a real heading-order skip, h3→h2). 22/22 tests pass.
- [x] 9b52d47 — `/redesign/styleguide` route: every component from `08_design_system.md`'s inventory (TrustBadge ×4 levels, SampleDataBadge, Chip, StepIndicator, legends, MapShell/LayerPanel/WindArrowsControl (new), DetectionCard/VerifyActions across new/verified/dismissed/loading, TimelineSlider/BaselineToggle (on + hidden-reminder-off)/WindSourceSwitch/AssumptionsPanel/BriefingExport, PhotoCapture/SyncQueue (pending/syncing/synced/failed), RoleSwitcher, EmptyState/OfflineBanner/Toast/Dialog, Button ×4 variants + disabled + focus). axe-clean. 23/23 tests pass.
- [x] Lighthouse: run against a **production build** (`vite build` + `vite preview`), not the dev server (an initial dev-server pass gave misleadingly low performance scores, 43–56, from unbundled dev-mode JS — not representative, discarded). Full results and the root-cause of Today/Styleguide's lower performance scores (a legacy-route MapLibre bundle loading on every `/redesign/*` route) are in `docs/redesign/LIGHTHOUSE.md`. Headline: **accessibility 100 and best-practices 100 on every screen**; performance 77–98; SEO 82 on every screen (one shared, non-regression finding: no per-route `<title>`/meta description, normal for this SPA shape, not fixed here).

## Known gaps at Gate 2 (explicitly flagged, not fixed — scope decisions for the user)
- **MapShell fidelity**: `MapShell`/`LayerPanel`/`WindArrowsControl` (added for the styleguide) and the Incident screen's probability-grid renderer are **not** a georeferenced MapLibre + PMTiles map. There is no real basemap, no real lat/lon projection, no pannable/zoomable interaction anywhere in the redesign yet — Today lists ranked cells in a table, Watch/Replay/Field have no map view at all, and Incident renders its burn-probability data as a plain CSS grid of coloured divs (correct data, placeholder visualization). This is the single largest remaining gap between the design docs (`07_maps.md`, `06_simulation_ui.md`) and the built screens. Real MapLibre+PMTiles integration (picking/confirming a self-hosted or provider PMTiles source per the Gate 1 basemap amendment, wiring real coordinates, building the layer-render-order table from `07_maps.md`) is a substantial, separately-scoped task.
- **Real authentication**: still the client-side `RoleSwitcher` only, per the Gate 1 decision; real auth is a named later phase in `11_build_plan.md`, not started.
- **Live FIRMS/VIIRS ingestion**: still absent; Watch/Field serve the 4 fixed replay incidents as sample data, per the Gate 1 decision.
- **Bundle size / code-splitting**: the whole app (legacy + redesign) ships as one JS entry including a ~1MB MapLibre chunk even on redesign routes that don't use it yet; see `LIGHTHOUSE.md`.
- **SEO per-route metadata**: not implemented (see `LIGHTHOUSE.md`).
- Backend verified without Docker/Postgres by running a standalone uvicorn instance including only the risk + redesign routers (both are file-based, no DB dependency) — see commit messages for exact commands. The main app (auth, full operations.py) still needs Postgres and was not started in this environment.

Stopped at Gate 2 per instructions. No push, no merge, no files moved to `/legacy`. Awaiting the user's Gate 2 review.
