# RESQ redesign — Gate 1 summary

## The narrative, in five lines

RESQ is three separate tools behind one interface: a ranking of forest cells for tomorrow (not a prediction), a triage queue for satellite and field detections (not confirmed fires until a person verifies), and, only after verification, a spread scenario built from an uncalibrated Cell2Fire simulation. Tested against four real Indian fires, that simulation did not beat a simple "fire stays near the ignition point" baseline on three of them, and never beat it consistently on both AP and IoU in the same incident. Every screen states, in plain words, which of the three steps it is showing and how much to trust it: forecast language never implies prediction, detections stay "not yet verified" until a person confirms, and every spread scenario carries a persistent "Uncalibrated scenario" badge next to the baseline it is compared against. Horizons longer than tomorrow (6/12/24/48h) only ever appear on a verified incident's scenario, never on the forecast. The four replay incidents are shown as development incidents used to build the tool, not a held-out test, with their real numbers (not rounded up, not reframed) on a dedicated Replay/evidence screen.

## The screens

Landing, Today (forecast), Watch (detection triage) plus detection detail, Field (mobile, offline-capable verification), Incident list plus Incident detail, Incident scenario (6/12/24/48h, the only place Cell2Fire output appears), Replay/evidence (per-incident simulation vs baseline vs VIIRS footprint), About, Login, system pages (403/404/500/offline). Full sitemap and role access in `04_information_architecture.md`. Six screens have working HTML wireframes with real copy, screenshotted at 390px and 1440px: `wireframes/{landing,today,watch,field-mobile,incident-24-48,replay}.html` rendered to `screenshots/*_{390,1440}.png`.

## Open decisions

Full detail and reasoning in `11_build_plan.md`.

1. Judges' demo vs real deployment — changes how much new backend work (live VIIRS ingestion, real field accounts) is worth building now.
2. Basemap licence — no satellite basemap licence confirmed; default stays the current key-free light OSM basemap unless someone checks a provider.
3. Backend rebuild scope — extend `operations.py`/`risk.py` in place, or build detections/field/replay as a separate service.
4. Role/auth model — real authenticated roles extending the existing JWT scaffolding, or a client-side role switcher for now.
5. Offline sync scope for field crew — how much map/data should be downloadable for true offline use in Phase 2.
6. VIIRS/FIRMS live ingestion — in scope for this redesign's Phase 2, or deferred, keeping Watch on the 4 demo incidents' labeled sample data.
7. Confirm the older `docs/01_design_system.md` / `02_screens.md` scope (teams, plans, admin, assistant) stays explicitly out of scope for this redesign.

Full detail lives in `docs/redesign/00_audit.md` through `11_build_plan.md`, `wireframes/`, and `screenshots/`. Progress log: `PROGRESS.md`.
