# Data for the what-if simulation

Area packs are produced by `scripts/whatif/prepare_area.py` into `frontend/public/whatif/<area>/`. Inputs are real open data only: **synthetic inputs: none**. Spread rates are not part of a pack; the engine assigns uncalibrated assumptions to land-cover classes.

## Prepare another location (one command)
```
pip install numpy pyproj rasterio          # plus pytest for tests
export CURL_CA_BUNDLE=<ca bundle>          # only if behind a proxy
python scripts/whatif/prepare_area.py --name "Place, State" \
    --center-lat 21.8679 --center-lon 86.5007 --size-km 10 --cell-m 30 \
    --out-dir frontend/public/whatif/<area>
```
Options: `--osm-file file.osm` (use a local OSM XML instead of the network), `--road-vertex-cap`, `--water-vertex-cap`. The script verifies the manifest hashes after writing and refuses to write a pack over 5 MB. Tests: `python -m pytest scripts/whatif/tests` (no network).

## Files in a pack
| File | Content |
|---|---|
| `manifest.json` | name, centre, UTM EPSG, grid origin/size, four corner lon/lat, file list (bytes, sha256), sources with URLs/licences/attribution, summary stats, build time, tool versions, the "synthetic inputs: none" statement |
| `elevation.i16` | Int16 little-endian metres, row-major, first row is the NORTH row. `-32768` = no data |
| `landcover.u8` | ESA WorldCover class codes (uint8), same layout. `0` = no data |
| `assets.json` | GeoJSON FeatureCollection in lon/lat: `village` Points (place=village/hamlet/town/city/isolated_dwelling), `road` LineStrings (highway=*, no footways), `water` LineStrings (waterway=*) and Polygons (natural=water). Clipped to the grid square, simplified (Douglas-Peucker in metres), capped by vertex count |

Files are raw (no gzip); a Similipal pack is about 337 KB. For larger areas, gzip would be possible later; the manifest field `compression` says what is used.

## Grid conventions
- North-up, square cells, local WGS 84 UTM zone (`crs.epsg`), metres.
- `grid.originX/originY` are the UTM coordinates of the **top-left corner** of cell (col 0, row 0); origin is snapped to a multiple of the cell size.
- Row 0 is the northernmost row, col 0 the westernmost, index = `row*width + col`.
- Cell centre: `x = originX + (col+0.5)*cellSizeM`, `y = originY - (row+0.5)*cellSizeM`. All samples are taken at cell centres.
- Width/height are `ceil(size_km*1000/cell_m)` (Similipal: 334 x 334 = 10.02 km).
- Elevation: bilinear from GLO-30 (valid neighbours only). Land cover: nearest neighbour from the 10 m grid (no majority filter, so a 30 m cell shows the class of its centre 10 m pixel). Only valid WorldCover codes (10,20,30,40,50,60,70,80,90,95,100) are kept; anything else becomes 0.

## Sources, licences and attribution text for the UI
| Layer | Source | Licence |
|---|---|---|
| Elevation | Copernicus DEM GLO-30, `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_<N|S>dd_00_<E|W>ddd_00_DEM/...tif` (1 degree COG tiles, AWS Open Data) | Copernicus DEM licence (free, commercial use allowed, attribution required) |
| Land cover | ESA WorldCover 10 m 2021 v200, `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_<N|S>dd<E|W>ddd_Map.tif` (3 degree tiles) | CC BY 4.0 |
| Villages, roads, water | OpenStreetMap via Overpass API, falling back to the OSM API `map` call (`https://api.openstreetmap.org/api/0.6/map`, tiled 0.1 degree, 1 s apart, identifying User-Agent) | ODbL 1.0 |

Attribution strings (show in the map or scenario footer):
- "Contains modified Copernicus DEM GLO-30 data (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA; all rights reserved."
- "(c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. CC BY 4.0."
- "(c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright"

## Similipal National Park pack (built 2026-10-18)
Centre 21.8679 N, 86.5007 E, EPSG:32645, 334 x 334 cells of 30 m.
- Elevation 192 to 968 m over the whole grid (5th to 95th percentile 332 to 898 m); the centre cell is 590 m and the 15 x 15 cell block around the centre spans 517 to 625 m, consistent with the earlier demo reading of 487 to 713 m at the centre. No void cells.
- Land cover: tree cover (10) 111,167 cells (99.65%), grass (30) 227, cropland (40) 162. No water, built-up or shrub cells at 30 m sampling.
- OSM: 0 villages, 0 roads, 1 stream (`Palpala Nadi`, 97 vertices after simplification) in the grid. This is the real state of OpenStreetMap there (the core zone of the park has almost no mapped roads or settlements; a wider 20 km check found one hamlet, Pithabata, outside the grid). It is not a failure of the script. For a demo needing at-risk villages and roads, pick a centre on the park edge (e.g. a buffer-zone road corridor) or use a larger `--size-km`; the engine must handle an empty village list.
- Network on the day: both COG tiles read directly (HTTP range requests). `overpass-api.de` was unreachable from this environment (connection reset by the proxy), `overpass.kumi.systems` and `overpass.private.coffee` answered HTTP 500 (server side); `overpass.openstreetmap.fr` returned 403 (whitelist only); `download.geofabrik.de` was reset. The pack's OSM layer therefore came from the OSM API `map` call, which returns the same data for a bounding box. The manifest records the endpoint and method used.

## Known limits
- WorldCover is a land-cover class, not a fuel model. All trees are one class (10); the engine's fuel table assigns assumed, uncalibrated rates per class. It cannot distinguish dry deciduous sal from moist evergreen, litter load, or understorey.
- GLO-30 is a surface model: it includes canopy and buildings, so slopes in forest are slightly smoothed or noisy relative to bare ground, and heights are above the EGM2008 geoid (irrelevant for slope).
- OSM completeness varies by region and by mapper; absence of a road or village in a pack means "not mapped", not "not there". Water mapped in OSM is not merged with WorldCover water; the engine should treat class 80 as water and OSM water as display and asset layer.
- Multipolygon water relations are not stitched: member ways are used as their own rings or lines (unclosed ones are tagged `partial-water-outline`).
- Roads/water are simplified to a vertex cap; tolerance used is recorded in `manifest.stats`.
- Nearest-neighbour from 10 m to 30 m drops small features (a 10 m stream or track will often vanish from the class grid).
- A grid crossing a UTM zone edge is still built in the zone of its centre; a grid crossing a tile edge is mosaicked from the neighbouring tiles automatically. Ocean-only tiles that do not exist are treated as no data.
