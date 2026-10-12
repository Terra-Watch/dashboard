# 07. Maps

Read `00_audit.md` §1 geo layer table first — this doc expands it per-screen with render order and colour rules.

## Basemap choice

**Default: light terrain/vector basemap (OSM-derived, key-free raster or open vector tiles), matching what's already in use today** (`frontend/src/features/operations/SpreadPage.tsx` and `ARCHITECTURE.md` both confirm the current app already serves key-free OSM raster tiles via MapLibre). This redesign keeps that default.

**Satellite basemap is an open decision, not a default.** No licence for a satellite imagery provider (Mapbox Satellite, Esri World Imagery, Bhuvan) has been confirmed usable in this repo — see `00_audit.md` §1. Until someone checks and confirms a licence, the UI must not offer a working "Satellite" option; `MapControls.tsx` already does this correctly today (shows "Satellite unavailable" as a disabled option) and the redesign should preserve that honesty rather than silently enabling a provider without a confirmed licence.

## Layer table

| Layer | Purpose | Screens | Source | Licence | Resolution | Exists today? | Render order (bottom→top) | Colour rule |
|---|---|---|---|---|---|---|---|---|
| Basemap (light/terrain) | Orientation | all | OSM raster tiles (current) or Carto/Protomaps light vector | OSM: ODbL, key-free; Carto/Protomaps: open, check attribution terms | ~street level | **Exists** (in use) | 1 | Muted, low-contrast per `08_design_system.md` "survey sheet" palette |
| Basemap (satellite) | Visual context, optional | all, if enabled | Not selected — open decision | **Not confirmed** | — | **Missing / not evaluated** | n/a until decided | n/a |
| Risk cells (ignition forecast) | Today screen's core content | Today | Archived Bar v3 replay (backend `risk.py` `/geojson`) | Internal/derived | 5 km cells | **Exists** (archived subset, not all six states — see `00_audit.md`) | 2 | Risk ramp: Low #BFD8CF 25%, Moderate #E9B824 35%, High #E5701F 55%+outline, Very high #B0183A 70%+hatch+outline (from `01_design_system.md`, reused) |
| VIIRS detections (live/queue) | Watch screen queue + map pins | Watch, Incident (as ignition evidence) | NASA FIRMS/LANCE VIIRS CSVs (`data/resq2/<id>/viirs_detections.csv` pattern) | NASA open data, attribution expected | ~375m detection cell | **Exists** (per-incident, demo set only — no live feed wired) | 3 | Violet ring #6B2FA0, opacity by age (reused from `01_design_system.md` symbology table) |
| VIIRS cumulative footprint (observed reference) | Replay/evidence screen | Replay | Same VIIRS CSVs, aggregated per RESQ5_PROTOCOL.md §2 | Same as above | 375m grid cells, unioned | **Exists** (precomputed in `results/resq5/<incident>/observed_footprints.npz`) | 4 (distinct from live detections — solid outline polygon, not rings) | Solid dark outline, no fill, labeled "Observed (VIIRS)" |
| Burn-probability bands (scenario) | Incident scenario, Replay | Incident scenario, Replay | Cell2Fire ensemble output, `results/resq5/<incident>/burn_count_*.npz` | Internal/derived, uncalibrated | 30 m cells | **Exists** (for the 4 replayed incidents; live incidents need the same pipeline run) | 5 | 4-band probability scale (0-20/20-50/50-80/80-100%), colour-blind-safe sequential ramp — distinct hue family from the risk ramp so the two are never confused |
| Baseline outline (proximity) | Incident scenario, Replay | Incident scenario, Replay | Computed per RESQ5_PROTOCOL.md §8 baseline (a): disc at d ≤ 693m | Internal/derived | vector circle | **Exists** (formula is simple, computed client- or server-side from ignition point) | 6 | Dashed neutral ink outline, labeled "Simple guess (proximity)", always distinct from probability-band fill |
| Baseline outline (circle, final area) | Replay only (information-advantaged, not shown live since it needs the final area which isn't known during a live incident) | Replay | RESQ5_PROTOCOL.md §8 baseline (b) | Internal/derived | vector circle | **Exists** (precomputed per incident) | 6 | Dotted neutral ink outline, labeled "Circle of final observed area (uses information not available live)" |
| Wind arrows | Incident scenario, Replay | Incident scenario, Replay | ERA5-Land / ERA5 0.25° / best_match CSVs per incident | CDS (ERA5): Copernicus licence, attribution; Open-Meteo best_match: check provider terms | hourly, point value | **Exists** (3 sources × 4 incidents) | 7 | Info blue #1F6FB2 arrows, length = speed, per `01_design_system.md` symbology |
| Fuel (land cover, context layer) | Assumptions panel map inset, optional | Incident scenario | ESA WorldCover 2021 v200 | CC-BY 4.0 | 10 m | **Exists** (per-incident windows) | background inset only, not main map layer | Muted class colours, only shown inside the assumptions panel's small reference map, never as a main-map overlay (avoid implying fuel is precisely known) |
| Terrain / elevation | Context only (slope has <1% effect per RESQ-5) | Incident scenario (assumptions panel text only, not rendered as a hillshade on the main map to avoid overstating terrain's role) | Copernicus GLO-30 DSM | Open, free registration | 30 m | **Exists** | n/a (not rendered as a map layer by default) | n/a |
| Admin boundaries | Orientation (state/district) | Today, Watch, Incident | **Missing locally** | OSM admin boundaries (open) as the only unlicensed-blocker-free option; Survey of India/Bhuvan boundaries would be more accurate but licence is unreviewed | — | **Missing** | 2.5 (above risk cells' fill, below pins) | Thin neutral line, dashed by level per `01_design_system.md` |
| Roads | Context, patrol planning | Today | **Missing locally** | OpenStreetMap, ODbL | — | **Missing** | shown as "Unavailable" until fetched | Grey lines by class |
| Water bodies | Context, incident assets | Incident | **Missing as a vector layer** (WorldCover water class exists in the raster but is unexploited as a UI layer) | WorldCover: CC-BY 4.0 (already on disk); OSM water: ODbL | 10 m (from WorldCover) or vector (OSM) | **Partially exists** (raster data present, not surfaced) | shown as "Unavailable" until a vector extraction step is built | Info blue droplet/fill |
| Settlements / villages | Context, incident assets | Today, Incident | **Missing as a vector layer** (WorldCover built-up class exists, unexploited) | Same as above | 10 m or vector | **Partially exists** | shown as "Unavailable" | Small dot + label from zoom 11 |
| WorldPop population | Not currently planned for any screen in this redesign's scope | — | WorldPop.org | CC-BY 4.0 | ~100 m | **Missing**, never fetched | n/a | n/a |
| Protected areas | Not currently planned for any screen in this redesign's scope | — | WDPA | Open, attribution | vector | **Missing**, never fetched | n/a | n/a |

## Essential vs optional

- **Essential for this redesign's three screens (Today, Watch/Incident, Replay):** basemap, risk cells, VIIRS detections/footprint, burn-probability bands, both baselines, wind arrows.
- **Optional / defer:** admin boundaries, roads, water, settlements (all currently "Unavailable" in the existing `MapControls.tsx` and can stay that way honestly until fetched), WorldPop, protected areas, any satellite basemap.
