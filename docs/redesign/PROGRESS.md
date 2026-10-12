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
- [ ] **Landing page direction note (new instruction, not yet executed):** before building the final landing page, must produce 2 visually distinct direction wireframes (shadcn/ui + `motion`, calm/map-first restraint, Magic-UI-style entrance animations allowed ONLY on landing) and get the user's pick via the coordinating session — do NOT build a final landing page component until a direction is chosen. Today/Watch/Incident/Field stay static/functional, motion only for meaningful state transitions (timeline slider). Will produce the 2 directions as static HTML near the end of this run, for the coordinator to relay.
- [ ] Today, Watch, Incident, Replay, Field screens: not yet built.
- [ ] /styleguide + component library: not yet built.
- [ ] Playwright/axe/Lighthouse test pass: not yet run (no live backend available in this environment — no Docker daemon running locally, so Postgres-backed endpoints can't be exercised; the new SQLite demo store and file-based data loaders are designed to run without Postgres and will be used for real testing).
