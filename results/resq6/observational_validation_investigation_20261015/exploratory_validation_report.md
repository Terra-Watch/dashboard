# Exploratory validation report

## Decision: no simulation-versus-observation comparison run

No IoU, Dice/F1, commission/omission, AP, Brier, or burned-area bias was computed in this investigation. This is intentional: the available local references do not provide an approved combination of temporal interpretation, valid-cell population, and spatial mapping for physical spread. No Cell2Fire simulation was run, and the existing development outputs and official 0-wins/1-tie/7-loss result were not rescored.

## Bounded local diagnostics actually computed

The read-only inventory script inspected only the four development cases. It:

- SHA-256 hashed the local VIIRS CSV, VIIRS-derived mask NPZ, available MCD64A1 HDFs, static WorldCover/DEM rasters, local MCD fetch reports, and existing per-case simulation result/manifest JSONs.
- Read VIIRS row/date/confidence/platform/type/schema fields and checked for cloud/clear/valid/coverage columns (none present).
- Read NPZ array shapes, dtypes, positive-cell counts, and whether any unknown state exists (none; arrays are Boolean).
- Read GeoTIFF CRS, affine transform, dimensions, bounds, resolution, nodata and tags.
- Read MCD64A1 Burn Date, Burn Date Uncertainty and QA arrays/attributes; projected the 30 m cell centers to the local HDF sinusoidal tile extent and counted native HDF pixel centers inside each exact EPSG:32644 domain. This is geometry/metadata coverage, not observation-opportunity coverage.

| Incident | VIIRS rows / date range | MCD64A1 local months | Native MODIS pixel centers in domain | QA-valid land centers | Burn-date-positive pixels among valid land | 30 m model centers within tile |
|---|---|---:|---:|---:|---:|---:|
| E2024-131853 | 81; 2024-02-16–2024-02-27 | Feb, Mar 2024 | 582 | 582 | 0 | 100.00% |
| E2024-135332 | 101; 2024-03-05–2024-03-13 | Feb, Mar 2024 | 399 | 399 | 12 (10 DOY 68, 2 DOY 69; uncertainty 1 day) | 83.69% |
| E2023-084925 | 99; 2023-03-07–2023-03-16 | Mar 2023 | 626 | 624 | 4 (DOY 70×2, 71×1, 76×1; uncertainty 1, 2, 6 days) | 100.00% |
| E2024-155286 | 245; 2024-04-12–2024-04-20 | Apr 2024 | 480 | 480 | 0 | 100.00% |

These counts are restricted to native MODIS pixel centers within the model-domain rectangle; they are not pixel-area intersections and are not exact 30 m truth labels. The two water-coded E2023-084925 pixels are not counted as valid land. E2024-135332's local HDF tile does not cover 16.31% of model-cell centers, notably at the northern domain edge. E2024-155286 has no locally recorded burned pixels in the April tile, but its fetch report lacks a comparable LAADS listing byte count; absence in this monthly product is not proof of no fire.

MCD64A1's local CoreMetadata records MCD64A0 and MCD12Q1 input granules. It is a different product/source from the current VIIRS CSV-derived labels, but this does not establish independence from all satellite observation processes or ground truth. The existing VIIRS target NPZ is explicitly not independent of VIIRS CSV detections.

## Interpretation

The available local evidence establishes that MCD64A1 is present and has a few candidate monthly burn-date pixels, but not that those pixels correspond to the incident footprint at an exact RESQ6 horizon. Its approximately 463 m pixels, ordinal monthly dates, uncertainty of up to 6 days in the observed local burn cells, QA semantics, incomplete E2024-135332 tile extent, and absence of an approved temporal/spatial/unknown-cell policy prevent a defensible score. VIIRS also cannot supply complete physical perimeters or valid negatives. The exact historical development comparison remains the existing benchmark; this report does not replace, adjust, or validate it.
