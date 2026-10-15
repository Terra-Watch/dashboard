# RESQ7 OSM extraction pipeline

This document defines the safe local pipeline for the six approved OSM
categories and the four approved incident boxes. It is preparatory only:
the Southern regional PBF must be complete and validated before execution.

## Source and output layout

Regional inputs remain under data/osm/geofabrik/. Intermediate files are
staged under a unique run directory. A complete run is published as one
release, and `current` is atomically switched only after all 24 layer outputs
and the provenance manifest validate:

    data/osm/.staging/<run-id>/...
    data/osm/extracted/releases/<run-id>/
    data/osm/extracted/current -> releases/<run-id>
    frontend/public/tiles/current -> releases/<run-id>

Every generated GeoJSON feature should retain osm_id, osm_type, and the
source tags, use WGS84 GeoJSON coordinate order [longitude, latitude], and
include © OpenStreetMap contributors in downstream tile metadata.

## Relation-aware processing

For each regional PBF:

1. Use osmium extract --strategy smart --bbox west,south,east,north so
   boundary-crossing ways and relevant relation members are retained.
2. Use osmium tags-filter with only the approved tag expressions. Do not use
   --omit-referenced; referenced nodes, ways, and relation members are
   required for geometry construction.
3. Use osmium export to assemble points, lines, and multipolygon geometry.
   Run with --show-errors; geometry errors must be recorded and reviewed,
   not silently converted.
4. Validate the GeoJSON before any future Tippecanoe invocation.

Protected-area and administrative boundary filters are tag-based across nodes,
ways, and relations (`nwr/...`); the approved inventory does not restrict
those tags to relations. The exported composite `osm_feature_id` property
(`osm_type/osm_id`) remains the stable OSM identity. Tippecanoe generates
numeric tile IDs from deterministically ordered input
(`--generate-ids --preserve-input-order`), because string attributes are not
valid numeric tile IDs and numeric OSM IDs are only unique within their object
type.

The guarded implementation is scripts/extract_osm_layers.py. It refuses
missing, partial, size-mismatched, or non-validated regional inputs and checks
for an active Southern aria2 process before opening any regional PBF. It
cannot run accidentally: production execution requires the explicit
environment guard below.

Future authorized production command:

    RESQ7_ALLOW_PRODUCTION_OSM=1 \
      python3 scripts/extract_osm_layers.py --execute

The implementation uses these verified Osmium 1.19.1 command forms:

    osmium extract --strategy smart --bbox west,south,east,north ...
    osmium tags-filter --input-format pbf --output-format pbf ...
    osmium check-refs ...
    osmium export --input-format pbf --output-format geojson \
      --attributes type,id --show-errors --stop-on-error ...

The command must stop before changing `current` if a preflight check, reference
check, export, geometry validation, or release publication fails. An incomplete
staging directory or orphan release may remain for inspection, while the
previous `current` release remains intact.

The current legacy Overpass-JSON shim intentionally refuses relations because
it cannot safely join way members or assign inner rings to their containing
outer rings. It must not be used to create operational protected-area,
administrative, or other relation-derived geometry.

## Approved filters

- Forest: natural=wood, landuse=forest
- Protected: boundary=protected_area
- Roads: highway=motorway|trunk|primary|secondary|tertiary
- Settlements: place=city|town|village
- Water: waterway=river, natural=water
- Administrative: boundary=administrative, admin_level=2..8

No additional tags or datasets are implied by this pipeline.

## Validation gates

Before tiling, verify:

- all four source PBFs have passed size, checksum, and osmium fileinfo;
- GeoJSON parses as a FeatureCollection in WGS84 coordinate order;
- every feature has an approved tag and stable OSM identity;
- no duplicate (osm_type, osm_id) objects exist;
- feature counts are recorded per incident and category;
- coordinates are finite and within the requested box, allowing documented
  relation members retained just outside the box;
- polygons are closed and valid, with inner/outer ring assignment preserved;
- osmium check-refs passes on intermediate OSM extracts;
- relation reference integrity is reported separately from geometry validity;
- output files are written atomically and failed runs do not replace prior
  validated outputs.

Expected final layout:

    data/osm/extracted/current/<incident_id>/<layer>.geojson
    data/osm/extracted/current/manifest.json
    frontend/public/tiles/current/osm-<layer>.pmtiles

The manifest records attribution, incident, layer, feature count, and output
path. Production extraction is blocked while any regional download is active
or incomplete, and no PMTiles command may run before all GeoJSON validation
gates pass.

A passing reference check does not prove that every multipolygon was assembled
correctly. Geometry validity and ring topology require a separate validation
pass.

## Future tiling gate

Only validated GeoJSON should be passed to Tippecanoe. Use stable source-layer
names osm_forest, osm_protected, osm_roads, osm_settlements, osm_water, and
osm_admin, retain only operationally useful attributes, and validate each
resulting archive with `pmtiles show --metadata`, including the expected
source-layer ID. The tiler stages all six archives and does not publish a
partial set; existing valid archives remain in place if any build or metadata
check fails. PMTiles generation remains blocked until all four regional PBFs
and the GeoJSON validation gates pass.
