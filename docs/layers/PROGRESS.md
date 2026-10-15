# Map layers — progress log

Branch: `resq7/map-layers` (created off `redesign-v2`). Scope: `data/layers/`, `docs/layers/` only. Never touches frontend/backend code, `resq6/simulation-engine`, or `docs/sim_diagnosis/`. Not pushed/merged/deleted anything.

## Step 0 — inventory (DONE, awaiting approval)

- Wrote `docs/layers/00_inventory.md`: candidate sources, licences, resolution, size estimates for all 6 layer groups (forest, protected areas, roads, settlements, water/rivers, population) across the 4 demo incident boxes (15 km, computed from `data/resq2/<id>/fetch_report.json` ignition points — note E2023-084925 and E2024-155286 are not in the `docs/RESQ2_INCIDENTS.md` proposed-15 table, so bboxes were derived straight from the per-incident `fetch_report.json` ignition coordinates, not the markdown table) and the 8-state scope.
- Checked environment: no `tippecanoe`/`pmtiles`/`planetiler`/`ogr2ogr`/`gdalwarp` installed yet; `brew`, `pip3`, `npm` available for Step 1.
- Recommendation: OSM-only vector stack (via windowed Overpass queries) for forest/protected-areas/roads/settlements/water/admin boundaries (ODbL, clean for commercial/real deployment); GHS-POP (CC-BY 4.0, tiled) for population. Flagged WDPA, GADM, HydroSHEDS as licence-restricted (non-commercial-primary terms) — not selected. Flagged WorldPop national raster (~150-350MB) and Hansen GFC tiles (~100-300MB/tile) as >200MB-risk items needing explicit approval if needed as backups.
- **STOPPED per task instructions. No data downloaded yet.** Waiting for user approval of the inventory/recommendation before Step 1 begins.

## Step 1 — build (NOT STARTED)

## Step 2 — check (NOT STARTED)
