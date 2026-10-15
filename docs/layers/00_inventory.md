# 00. Map layers inventory (Step 0 — STOP, awaiting approval)

Branch `resq7/map-layers` off `redesign-v2`. No download has happened yet — this document is candidate sources, licences, resolutions, and size estimates only, so the user can sign off before any fetch (Step 1). Nothing here touches frontend/backend code, `resq6/simulation-engine`, or `docs/sim_diagnosis/`.

## 0. Scope areas (computed from `data/resq2/<id>/fetch_report.json`, not re-derived from the markdown table, since two of the four IDs are not in `docs/RESQ2_INCIDENTS.md`'s proposed-15 table)

15 km box = ignition point ± 7.5 km (≈ ±0.0674° lat everywhere; lon step scaled by cos(lat)).

| id | state | ignition (lat, lon) | bbox (west, south, east, north) |
|---|---|---|---|
| E2024-131853 | TS | 19.20262, 78.60316 | 78.5318, 19.1352, 78.6745, 19.2700 |
| E2024-135332 | MH | 19.95163, 78.71265 | 78.6410, 19.8842, 78.7843, 20.0190 |
| E2023-084925 | OD | 19.32648, 83.93716 | 83.8657, 19.2591, 84.0086, 19.3939 |
| E2024-155286 | CG | 19.12243, 80.89992 | 80.8286, 19.0550, 80.9712, 19.1898 |

State-level scope (Step B): Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, Jharkhand, Uttarakhand, Andhra Pradesh — full state extents, each queried by its own bbox, never a whole-India or whole-planet pull.

## 1. Tooling already present / missing (checked in this environment)

`tippecanoe`, `pmtiles` CLI, `planetiler`, `ogr2ogr`, `gdalwarp` — **none installed**. `brew`, `pip3`, `node`/`npm` are available. For Step 1 the plan is: `brew install tippecanoe` (vector → PMTiles) and `pip install pmtiles rasterio` (raster handling/PMTiles raster write + GeoTIFF clipping), or `npm install -g pmtiles` for the CLI — whichever is needed will be named explicitly before running, per the task's instruction not to silent-install.

## 2. Layer-by-layer candidates

### 2.1 Forest cover

| Source | Licence | Commercial/real-deployment OK? | Resolution | Form | Size estimate (this scope) | Notes |
|---|---|---|---|---|---|---|
| OSM `natural=wood` / `landuse=forest` polygons via Overpass API, windowed per bbox | ODbL 1.0 — attribution + share-alike on the *database*; a rendered/derived "produced work" (e.g. our PMTiles) does not need to be share-alike | **Yes** | Vector, mapper-drawn (variable, often coarse in sparsely-mapped forest areas) | Demo boxes: well under 1 MB each (225 km² of polygon data). States: a few MB to ~20 MB each, windowed by state bbox | **Selected as primary.** Coverage quality in rural Indian forest is uneven — some demo boxes may return sparse/no polygons; will report gaps honestly rather than fill from another source silently. |
| Hansen Global Forest Change (UMD/Google), tree-cover-2000 + loss/gain | Freely available, no restriction stated (public, hosted on GEE and earthenginepartners.appspot.com) | **Yes** | 30 m raster | 10°x10° tiles, ~100–300 MB each uncompressed-ish | Tile boundaries don't align conveniently with our bboxes; would need windowed COG reads (tiles are plain GeoTIFF on the Hansen site, not confirmed cloud-optimized) — **not selected for Step 1** unless OSM coverage proves too sparse; flagging as backup only. |
| ESA WorldCover 2021 v200 "tree cover" class | CC-BY 4.0 | **Yes** | 10 m raster | Already partially on disk for all 4 demo incidents (`data/resq2/<id>/worldcover_2021_window.tif`, windowed, each a few MB) | Usable as a raster cross-check/fallback for the demo boxes at no extra download; whole state-level WorldCover tiles are ~128 MB each (per `docs/RESQ2_INCIDENTS.md` §4) and would need windowed/COG range reads to stay under the state scope, not whole tiles. |
| India Forest Survey (FSI) / Bhuvan (ISRO) forest cover | **Unclear** — Bhuvan terms of use restrict some layers to non-commercial/research use; FSI shapefiles are often distributed on request, licence not published in machine-readable form | **Unconfirmed** | Varies | n/a | **Flagged, not selected.** Could not determine a clean licence; would need a direct enquiry to FSI/Bhuvan, out of scope for this pass. |

### 2.2 Protected-area boundaries

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| OSM `boundary=protected_area` / `leisure=nature_reserve` / `boundary=national_park`, via Overpass, windowed | ODbL (as above) | **Yes** | Vector, mapper-drawn | Demo boxes: negligible (<1 MB). States: a few MB each | **Selected as primary.** |
| WDPA (World Database on Protected Areas, UNEP-WCMC/IUCN) | **Restricted** — WDPA's standard Terms of Use license the data "primarily for non-commercial scientific research, conservation planning and environmental impact assessment"; redistribution/commercial use requires written permission from UNEP-WCMC | **Not confirmed for real/commercial deployment** without separate permission | Vector | Full dataset ~1–2 GB; a bbox/state clip via their ArcGIS REST API would be much smaller (a few MB), but the licence gate applies regardless of clip size | **Flagged restricted, not selected** unless the user wants to pursue a permission request. Higher boundary accuracy than OSM for IUCN-category reserves (incl. Similipal, Melghat, Indravati tiger reserves relevant to these states), so worth a follow-up ask if OSM coverage is thin. |

### 2.3 Roads

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| OSM roads (`highway=*`) via Overpass, windowed | ODbL | **Yes** | Vector | Demo boxes: <1 MB each. States, filtered to motorway/trunk/primary/secondary (not every residential street) for the "major roads" ask: a few MB to ~30 MB per state | **Selected.** Full `highway=*` incl. residential/track for demo boxes (small area, fine); major-class only for state scope to keep size and tile weight down. |
| Natural Earth roads (1:10m) | Public domain (CC0-equivalent) | **Yes** | Coarse (country-scale) | Single global file, a few MB, but only has a handful of roads per state — too coarse | **Not selected** — resolution too coarse even for the state-level ask. |

### 2.4 Settlements (towns/villages)

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| OSM `place=city/town/village` points via Overpass, windowed | ODbL | **Yes** | Vector points | Demo boxes: negligible. States (place=city/town only, per the "towns" ask): <5 MB each | **Selected.** Villages are numerous and would bloat the state-level files for a "towns" requirement — restrict state scope to city/town, keep village-level only for the demo boxes if present. |
| GHSL Settlement grid (GHS-SMOD, JRC) | CC-BY 4.0 | **Yes** | 1 km raster, classified | Tiled, ~10–40 MB/tile | Backup only — coarser than OSM points and raster, not vector; not selected unless OSM is sparse. |

### 2.5 Water bodies / rivers

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| OSM `waterway=river/stream` + `natural=water` via Overpass, windowed | ODbL | **Yes** | Vector | Demo boxes: negligible. States, filtered to `waterway=river` (main rivers, per the ask) + larger water polygons: a few MB each | **Selected.** |
| HydroSHEDS / HydroRIVERS (WWF) | **Restricted** — "free for noncommercial, scientific, conservation and educational use"; commercial use needs written permission | **Not confirmed for real/commercial deployment** | Vector, derived from hydrology modelling (more topologically correct than OSM) | Regional extract a few MB | **Flagged restricted, not selected.** |

### 2.6 Administrative boundaries (state/district — needed for the state-level scope, and useful context for demo boxes)

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| OSM `boundary=administrative` admin_level=4 (state) / 5–6 (district) via Overpass | ODbL | **Yes** | Vector | Per state: <5 MB | **Selected.** |
| GADM v4.1 | **Restricted** — GADM licence text: "freely available for academic and other non-commercial use... redistribution or commercial use is not allowed without prior permission" | **Not usable for real/commercial deployment** without permission | Vector, high positional accuracy | India level-2 (district) file ~50–150 MB for the whole country; per-state clip would be smaller but the licence blocks commercial use regardless | **Flagged restricted, not selected.** |
| Natural Earth admin-0/1 | Public domain | **Yes** | Coarse (state-level only, no districts) | Single small global file | Usable as a state-outline-only fallback if OSM state boundaries are incomplete; **not primary** since it has no district detail. |

### 2.7 Population (WorldPop, per the task's explicit ask)

| Source | Licence | Commercial/real-deployment OK? | Resolution | Size estimate | Notes |
|---|---|---|---|---|---|
| WorldPop.org India 2020 (UN-adjusted constrained), national GeoTIFF mosaic | CC-BY 4.0 | **Yes** | ~100 m | **Only distributed as one national raster, not pre-clipped by state.** Estimated 150–350 MB (India ~3.28M km² at 100 m, compressed GeoTIFF) — **likely exceeds the 200 MB threshold; needs explicit approval before download**, or a windowed/COG range-read if WorldPop's hosting supports HTTP range requests on a COG (not yet confirmed — would need to probe the file's structure, which itself does not require downloading the whole thing if range GETs work, same pattern used for WorldCover/Copernicus DEM in `data/resq2/`). | Will attempt a COG range-read first in Step 1; if the hosted file is not a valid COG, will stop and ask before pulling the full national file. |
| GHS-POP (Global Human Settlement population grid, JRC), tiled | CC-BY 4.0 | **Yes** | 100 m / 250 m / 1 km (pick 100 m) | Global mosaic split into tiles by the GHSL tiling grid; the ~2–4 tiles covering these 8 states are each roughly 20–60 MB | **Preferred primary** — same open licence as WorldPop, clean commercial use, and avoids the single-giant-national-file problem since it's natively tiled. Will use this unless the user specifically wants WorldPop's product. |

## 3. Licence summary — clean vs restricted

**Clean for real/commercial deployment (selected as primary sources):**
- OpenStreetMap (via Overpass) — forest polygons, protected areas, roads, settlements, water, admin boundaries. ODbL: attribution required ("© OpenStreetMap contributors"), share-alike applies to the *database*, not to a rendered/derived "produced work" like our PMTiles — still will record and surface the attribution string per the task's ask.
- ESA WorldCover 2021 v200 — CC-BY 4.0, attribution required, used only as a raster cross-check for forest/water in the demo boxes (already partially cached).
- GHS-POP (JRC) — CC-BY 4.0, attribution required, primary population candidate.
- WorldPop — CC-BY 4.0, attribution required, backup population candidate (size risk noted above).
- Natural Earth — public domain, backup for coarse state outlines only.
- Hansen GFC — no stated restriction, backup for forest only if OSM proves too sparse.

**Restricted — flagged, NOT selected without further approval:**
- WDPA (protected areas) — non-commercial-primary terms, needs UNEP-WCMC permission for real deployment.
- GADM (admin boundaries) — explicitly disallows redistribution/commercial use without permission.
- HydroSHEDS/HydroRIVERS (rivers) — non-commercial terms, needs permission for commercial use.
- India FSI/Bhuvan forest cover — licence terms unclear/unpublished in a form I could verify; not pursued.

## 4. What I could not determine

- Whether WorldPop's hosted GeoTIFF for India is a true COG supporting HTTP range reads (would let us avoid the full-country download). Needs a live probe in Step 1, not assumable from documentation alone.
- Bhuvan/FSI forest-cover licence terms — their site does not publish a clear machine-readable licence; would need a direct email enquiry, out of scope here.
- Exact OSM mapping density/completeness inside each of the 4 demo boxes and 8 states ahead of time — Overpass query results aren't known until run; some rural areas (esp. remote forest in CG/JH/OD) may have sparse `natural=wood` tagging. Will report per-layer, per-scope coverage honestly in Step 2 rather than assume it's complete.
- Whether the GHSL tiling grid's 2–4 relevant tiles individually stay under 200 MB each — size is an estimate from GHSL's published per-tile sizes elsewhere, not yet confirmed by listing the actual files for this scope.

## 5. Downloads that may exceed 200 MB — explicit approval needed before any of these in Step 1

1. **WorldPop India national raster** (~150–350 MB estimated) — only needed if GHS-POP tiles don't cover population adequately or the user prefers WorldPop's product. Will not fetch without a yes.
2. **Hansen GFC 10°x10° tiles** (~100–300 MB each) — only needed as a forest-cover backup if OSM forest polygons are too sparse in a given scope. Will not fetch without a yes.
3. **GADM or WDPA full/clipped files** — these are licence-restricted regardless of size (see §3); will not fetch at all without separate explicit permission from the data provider, which is outside what this task can obtain — recommending we skip these entirely and proceed OSM-only unless told otherwise.

Everything else identified above (OSM via windowed Overpass queries per bbox, ESA WorldCover windows already cached, GHS-POP tiles, Natural Earth single small file) is estimated well under 200 MB in total across all 4 demo boxes + 8 states, and Overpass queries will be paced (one bbox at a time, backing off on 429/504) to respect rate limits.

## 6. Recommendation

Proceed with an **OSM-only vector stack** (forest, protected areas, roads, settlements, water, admin boundaries) via windowed Overpass queries — cleanly licensed (ODbL, attribution required, no share-alike burden on produced PMTiles), free, same source across both scopes for consistency. Use **GHS-POP** for population (CC-BY 4.0, tiled, avoids the single large national-file problem). Treat **WDPA, GADM, and HydroSHEDS as out of scope** for this build (licence-restricted) unless the user explicitly wants to pursue permission for one of them. Keep **Hansen GFC and WorldPop** as named, approval-gated backups only if OSM/GHS-POP prove insufficient in Step 2's honesty check.

---

**STOP. Awaiting explicit approval before Step 1**, including sign-off on the recommendation above and on any of the >200 MB items in §5 if they turn out to be needed.

## 7. Approval received (2026-10-13) — appended note, Step 1 proceeding

User approved: OSM (windowed Overpass) + ESA WorldCover + GHS-POP + Natural Earth only. WDPA, GADM, HydroSHEDS, FSI/Bhuvan are **not** being fetched. Both >200 MB backups (WorldPop India national raster, Hansen GFC tiles) are **skipped entirely**, not just deferred. State-level layers are kept deliberately coarse (major roads, towns, main rivers only) to avoid Overpass timeouts — this is a scope decision, not a data gap.

**Compliance flag for pre-deployment review — not resolved by this task:** the forest/protected-area boundaries shipped here are OSM-derived (crowd-mapped), not an official forest-department dataset. Before any real/public deployment, RESQ's forest-boundary layer should be confirmed or replaced by the relevant state/central forest department's authoritative data. Separately, any India map that depicts external or international boundaries (and, in some cases, certain internal boundaries) is subject to government map-accuracy rules — this needs sign-off from the forest department or other relevant authority before public deployment. Neither of these is addressed by fetching OSM data; they are flagged here as an open pre-deployment compliance item for the product owner, not something resolved in this branch.
