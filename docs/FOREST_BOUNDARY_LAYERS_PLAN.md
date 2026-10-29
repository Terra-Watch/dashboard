# Forest boundary layers for the app: plan

Status: **PLAN ONLY** (2026-10-28). Nothing has been downloaded into `website/`, no app code or config changed. Written after the forecasting dataset (`wildfire-datasets-v4/`) switched its definition of forest from tree cover to forest boundaries. Tags: **[V]** verified in this project; **[S]** from a secondary source or the layer names only; **[?]** to confirm.

## 1. Why
- The app ranks "forest cells" (docs/PRODUCT_RULES.md). The dataset behind the next models now defines a forest cell as at least 20% of the 0.1 degree cell inside forest boundaries (reserved + protected + other forest). The app's forest mask must be the same set of cells, or the ranking covers different cells from the ones the models learn from.
- The forest department works in beats, ranges, divisions and circles. Showing and scoping by those units fits the Range Officer and Control Room roles and the existing region-scoped authorisation.
- Visitors and rangers care about protected areas (sanctuaries, national parks, eco-sensitive zones).

## 2. Source and layers
Public compilation "india-geodata", release tag `environment/forests` (published 2026-03-08), files as Parquet, PMTiles and GeoJSONL.7z; licence stated as CC0 by the compilation [S, not an official release; data year not stated]. Original sources named: Forest Survey of India, Bharatmaps/Parivesh, PM GatiShakti, Survey of India, NCOG.

| Layer | Size (PMTiles) | Use in the app |
|---|---|---|
| FSI_Beats | 184 MB | ranger assignment and region scope (finest unit) |
| FSI_Ranges | 66 MB | region scope, summaries |
| FSI_Divisions | 75 MB | region scope, control-room summaries |
| FSI_Circles | 38 MB | region scope |
| Bharatmaps_RFA (reserved forest) | 263 MB | "forest land" overlay |
| SOI_Forests (reserved, protected, other forest) | 47 MB | "forest land" overlay |
| GatiShakti_Wildlife_Sanctuaries_and_National_Parks | 9 MB | protected-area context |
| Bharatmaps_Parivesh_Wildlife_Reserves_and_Corridors | 4 MB | protected-area context |
| GatiShakti / Bharatmaps eco-sensitive zones | 1-3 MB each | protected-area context |
The app already serves maps with MapLibre GL and a self-hosted PMTiles basemap, so these files fit its map stack [V from ORG_README.md].

## 3. What we know about quality (from the dataset work)
- Cross-check with official FSI data [V]: pixels the FSI fuel-load rasters class Low, Moderate or High lie 98-100% inside the boundary union in all four delivered divisions (Amrabad, Bastar-Indravati, Melghat, Similipal). Class 0 is mostly inside (84-99%); class 15 only partly (17-71%). `wildfire-datasets-v4/audit/fsi_fuel_vs_forest_mask.csv`.
- Coverage is uneven by state [V, `wildfire-datasets-v4/audit/legal_forest_by_state.csv`]: good in Madhya Pradesh, Chhattisgarh, Telangana, Uttarakhand, Himachal Pradesh, Jharkhand; thin in the North-East, Odisha, Uttar Pradesh, Bihar, West Bengal. **A missing boundary must never be shown or read as "not forest".**
- The union covers about 0.67 million km2 for all India [V]; a secondary source quotes 7.67 lakh km2 recorded forest area [S].

## 4. Phases (each needs the user's go-ahead before work starts)
| Phase | What | Depends on |
|---|---|---|
| P0 Terms and provenance | confirm licence and redistribution terms with the original owners (especially beat boundaries); ask FSI to confirm the layers or supply authoritative recorded forest boundaries (North-East, Odisha) | none |
| P1 Forecast mask alignment | the app does not build its own mask (section 8): it serves the research model's cells. Replace that cell set by the dataset's boundary-based cells (`wildfire-datasets-v4/dataset/cells_forest_*.parquet`, 0.1 degree cells, about 11 km) together with the new models; decide how to handle the grid change (app cells are 5 km); re-check the rank bands (top 1%, 5%, 15%) on the new cell set | trained models in the new ML folder and their audit |
| P2 Forest land overlay | add SOI_Forests / RFA as a role-allowed map layer with a source note and the "advisory" footer | P0 |
| P3 Ranger units | add beats, ranges, divisions, circles; map each user's region scope to a unit; check the scoping server-side | P0, backend change in `backend/app` (region scope) |
| P4 Offline pack | include the unit and forest layers in the Range Officer's offline regional map | P2, P3 |
| P5 Protected-area context | sanctuaries, national parks, eco-sensitive zones as a layer and as a tag on alerts ("near a protected area") | P0 |
| Later | roads and rivers as barriers in the (parked) fire simulation; settlements for exposure | simulation work resumes |

## 5. Rules to keep
- Advisory wording stays: "Advisory forecast. Confirm with field observations." No raw model scores in the UI (PRODUCT_RULES.md).
- Every layer shows its source and says it can be incomplete; citizens do not see layers their role is not allowed to see.
- Big files are hosted as tiles, not committed to the repository.
- The public map still shows verified incidents only, as before; boundary layers add context, not new incident data.

## 6. Acceptance checks
- P1: the app's cell list equals the dataset's cell list for every state it serves; band thresholds recomputed and documented; a replay day renders without empty or extra cells.
- P2/P3: layer renders at state and district zoom without a visible performance drop on the target phone; scope tests (a user in one division cannot read another division's units).
- P5: a test incident inside a sanctuary carries the tag, and one just outside does not.

## 7. Open questions
1. Licence and permission for beat and range boundaries in a public app [?].
2. Data year of the compilation (not stated) [?]; plan a refresh process.
3. ~~How the app builds its forest-cell mask~~ answered in section 8; new question: keep the 5 km research grid or move the app to the 0.1 degree grid used by the new dataset and models.
4. Which roles see which layers.
5. Hosting and bandwidth for about 0.7 GB of tiles if all forest layers are served.

## 8. How the app builds its forest mask today (checked 2026-10-28, read-only)
- **The app does not compute a forest mask.** `backend/app/barv3.py` reads saved Bar v3 predictions (`results/bar3_deployable_2023/2024_predictions.npz`) and the model table (`features/model_table.pkl`) from an external model bundle (`RESQ_MODEL_BUNDLE_DIR`). The "forest cells" are whatever cells that research table contains. `backend/inference/import_barv3_replay.py` loads their geometry from `bundle/grid/cells.geojson` into the PostGIS `cells` table (grid_version `bundle-bar-v3`).
- **Cell set and size:** the research grid, 17,764 model cells over six states with tree fraction >= 0.20 [docs/RESQ2_INCIDENTS.md]; cells are 5 km squares (the incident script tests a detection against +-2,500 m of a cell centre, `scripts/resq2/build_incident_candidates.py:92`). The dataset behind the new models uses 0.1 degree cells (about 11 km), so the two are **different grids**, not just different masks.
- **Bands:** computed per day by ranking the cells present that day (top 1% Very high, 5% High, 15% Moderate, rest Low).
- **Coverage today:** the API reports `coverage: "archived validation subset; not the complete forest grid"`, only archived 2023-2024 days.
- **Origin of the grid:** `docs/ranking/00_audit.md` notes the original grid construction data was lost and the grid reconstructed (decision 42); the master grid is a frozen research file (`proposed/imagery/cells_in_rows.csv`).
- **Consequence for P1:** switching masks means switching grids. Either (a) rebuild the live forecast on the 0.1 degree cells and update the app's cell geometry and map, or (b) keep the 5 km grid and map model scores to it, which needs a defined rule and a new check. This is a product decision to take after the new models exist.
