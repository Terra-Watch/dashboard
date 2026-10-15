# RESQ7 OSM production extraction runbook

This runbook is for the first explicitly authorized production extraction. It
is documentation only; no command in this document has been executed as part
of preparing it.

The pipeline covers four incident boxes and six approved layers, producing 24
GeoJSON outputs. It must not be started while the Southern Zone download is
active or while any regional PBF is incomplete.

## Safety boundary

Before any source-data inspection, confirm the worktree and branch:

```sh
pwd
git branch --show-current
git status --short
```

Check only the process table for the Southern transfer:

```sh
ps ax -o pid=,etime=,command= | rg 'aria2c.*southern-zone-latest\.osm\.pbf'
```

If a matching aria2 process exists, stop the runbook at this gate. Do not read
the Southern `.part` file or `.part.aria2` metadata and do not inspect any
regional PBF. If process status cannot be established, stop as well.

No production command may set `RESQ7_ALLOW_PRODUCTION_OSM=1` until all gates
below pass and separate execution authorization has been recorded.

## Gate 1: regional source validation

The extraction validator expects these exact official Geofabrik files:

| Region/file | Expected bytes | Published MD5 | Expected SHA-256 |
|---|---:|---|---|
| Southern `southern-zone-latest.osm.pbf` | 558191437 | `cd4deedec8d7d607668849445d5fbbc5` | `96e748cee47e5ec00beb9823b8260fc2f40dd3eecb18c5acd86e7163cc3880d5` |
| Western `western-zone-latest.osm.pbf` | 221215934 | `a6fba2e9da0b2b85928aa9060b6720d0` | `d616089efcf2102eb5303a10443a14a3abe852c2fc186f05a3488bebe15fcaf6` |
| Eastern `eastern-zone-latest.osm.pbf` | 247272544 | `190724e4b21ed59e8d6334bd125684fa` | `2134a2604524714198ef3963a2ef023245b6660a92f883646e2c46c65b971dfd` |
| Central `central-zone-latest.osm.pbf` | 351766093 | `0c5030767774dc49bad2bf5458035912` | `4e277df297f3a488e45b27ae3833d834628e7ff526efd2cdf34a87884a92ee2f` |

For each completed file, the authorized operator must independently run:

```sh
stat -f '%N %z bytes' data/osm/geofabrik/<file>.osm.pbf
md5 data/osm/geofabrik/<file>.osm.pbf
shasum -a 256 data/osm/geofabrik/<file>.osm.pbf
osmium fileinfo -e data/osm/geofabrik/<file>.osm.pbf
```

The size, MD5, and SHA-256 must match the pinned metadata before the file is
accepted. `osmium fileinfo -e` must report a readable PBF. The Southern file
must be renamed from `.part` to its final name only after all checks pass.

### Manifest prerequisite and safe Southern update

`data/osm/geofabrik/manifest.json` must contain, for each region:

- `status: "validated"`
- the final `file_path`
- the official `source_url`
- expected and actual sizes equal to the pinned size
- published and calculated MD5 equal to the pinned MD5
- calculated SHA-256 equal to the verified digest
- a non-empty `published_source_timestamp`
- `pbf_validation: "passed"`

The Southern transfer is no longer active. Its `.part` artifact was independently
verified at 558191437 bytes, with the current official Geofabrik MD5 and a
readable PBF (`osmium fileinfo -e --input-format=pbf`). Its calculated
SHA-256 is recorded above. To publish this verification, create an evidence
JSON document from those command results. The evidence must contain:

```json
{
  "region": "Southern Zone",
  "source_url": "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf",
  "status": "validated",
  "file_path": "data/osm/geofabrik/southern-zone-latest.osm.pbf",
  "expected_size_bytes": 558191437,
  "actual_size_bytes": 558191437,
  "published_md5": "cd4deedec8d7d607668849445d5fbbc5",
  "calculated_md5": "<verified MD5>",
  "calculated_sha256": "<verified 64-character SHA-256>",
  "pbf_validation": "passed",
  "independent_validation": {
    "size": true,
    "published_md5": true,
    "calculated_md5": true,
    "sha256": true,
    "pbf_readability": true
  }
}
```

`<verified MD5>` and `<verified 64-character SHA-256>` are placeholders for
the actual command outputs and must not be copied literally. The updater
requires the final path, official URL, exact size, official MD5, matching
calculated MD5, non-placeholder SHA-256, successful PBF readability, and all
five affirmative independent-validation flags. It does not open or hash the
PBF; the evidence document is an operator record of the preceding independent
checks.

Publish the transition with the focused utility:

```sh
python3 scripts/update_osm_manifest.py \
  --manifest data/osm/geofabrik/manifest.json \
  --evidence /path/to/southern-validation-evidence.json
```

The utility accepts only the approved Southern entry and official URL. It
accepts the expected partial pre-state or an identical already-validated
state, preserves unrelated entries, rejects ambiguous or unexpected paths,
and never accepts a partial evidence status. It writes a same-directory
temporary file, flushes and fsyncs it, parses the temporary JSON before
publication, replaces the manifest with `os.replace`, and best-effort fsyncs
the containing directory. Any failure removes the temporary file and leaves
the original manifest in place. Re-running with identical validated evidence
is idempotent; conflicting validated metadata is rejected.

Run the updater's synthetic tests before using it with the real manifest:

```sh
python3 -m unittest -v scripts/test_update_osm_manifest.py
```

## Gate 2: offline checks and production guard

Run these before production extraction:

```sh
python3 -m py_compile \
  scripts/extract_osm_layers.py \
  scripts/convert_and_tile.py \
  scripts/test_extract_osm_layers.py \
  scripts/test_convert_and_tile.py \
  scripts/update_osm_manifest.py \
  scripts/test_update_osm_manifest.py

python3 -m unittest -v \
  scripts/test_update_osm_manifest.py \
  scripts/test_extract_osm_layers.py \
  scripts/test_convert_and_tile.py

git diff --check
```

The production path is guarded by both the `--execute` argument and the
environment variable. A guard smoke test must continue to pass with the
environment variable absent; do not set it during the pre-flight.

The validator must be allowed to perform its own final all-four-input check
only after the Southern process has exited and the Southern final file has
passed Gate 1. It rejects active downloads, partial files, symlinks, missing
files, stale manifest status, size mismatches, source/path mismatches, and
checksum mismatches.

## Gate 3: authorized extraction command

Only after separate explicit authorization and successful Gates 1–2:

```sh
RESQ7_ALLOW_PRODUCTION_OSM=1 \
  python3 scripts/extract_osm_layers.py --execute
```

The implementation uses:

```text
osmium extract --strategy smart --bbox west,south,east,north
osmium tags-filter --input-format pbf --output-format pbf
osmium check-refs
osmium export --input-format pbf --output-format geojson
```

For each incident, `extract --strategy smart` is followed by reference checks,
each approved filter, another reference check, export, GeoJSON validation, and
atomic publication. The final release is exposed as:

```text
data/osm/extracted/releases/<run-id>/
data/osm/extracted/current -> releases/<run-id>
```

No `current` switch should occur if any incident, layer, reference check,
export, geometry check, or publication step fails. A failed run may leave a
staging directory or orphan release for investigation.

## GeoJSON acceptance checklist

Inspect all 24 files under:

```text
data/osm/extracted/current/<incident-id>/<layer>.geojson
```

The incident IDs and boxes are defined in `scripts/extract_osm_layers.py` and
must not be changed. The approved layer/tag contract is:

| Layer | Approved tags | Accepted geometry types |
|---|---|---|
| forest | `natural=wood`, `landuse=forest` | Polygon, MultiPolygon |
| protected | `boundary=protected_area` | Polygon, MultiPolygon |
| roads | `highway=motorway`, `trunk`, `primary`, `secondary`, `tertiary` | LineString, MultiLineString |
| settlements | `place=city`, `town`, `village` | Point, MultiPoint, Polygon, MultiPolygon |
| water | `waterway=river`, `natural=water` | LineString, MultiLineString, Polygon, MultiPolygon |
| admin | `boundary=administrative` and `admin_level` 2–8 | Polygon, MultiPolygon |

For every file, verify:

- It is a GeoJSON `FeatureCollection`.
- The feature count is recorded in the release manifest.
- Every accepted feature has `osm_type`, numeric `osm_id`, and
  `osm_feature_id` in the form `osm_type/osm_id`.
- Every accepted feature has an approved tag for that layer.
- No `(osm_type, osm_id)` identity is duplicated within the file.
- Coordinates are finite.
- Geometry type is in the layer’s accepted set.
- Polygon rings are closed and have at least three distinct vertices.
- At least one coordinate of each tagged feature intersects its requested box.
- Relation-derived geometry may retain member coordinates outside the box; this
  must be reviewed rather than clipped or discarded silently.
- Empty or unexpectedly sparse output is flagged for investigation. The code
  deliberately does not impose arbitrary minimum feature counts.
- Roads remain lines, rivers remain lines, water polygons remain polygons, and
  relation-derived protected/admin geometry is not approximated.

`osmium check-refs` passing is necessary but does not prove correct
inner/outer-ring assignment or complete multipolygon topology. Those require
manual geometry review and, where available, a GIS/browser inspection.

The reusable offline validator automates the file, identity, tag, geometry,
coordinate, bbox-intersection, duplicate, and layer-statistics checks:

```sh
python3 scripts/validate_osm_geojson.py \
  --release data/osm/extracted/current \
  --report /tmp/resq7-geojson-validation.json
```

It reads all 24 expected files and never rewrites them. The report is a JSON
object with `status` (`pass`, `warning`, or `hard_failure`), file counts,
hard-failure and warning totals, and per-incident/per-layer statistics and
issues. Exit status 0 means no hard failures (warnings may still require
review); exit status 1 means at least one hard failure. Missing files,
malformed GeoJSON, invalid identities, duplicate OSM identities, unapproved
identifying tags, unsupported or invalid geometry, non-finite/out-of-range
coordinates, and features whose envelopes do not intersect the intended box
are hard failures. Empty or one-feature layers, valid geometry extending
across a box edge, and unavailable full topology checking are warnings.

Run it after extraction and before `convert_and_tile.py`. It does not prove
source relation completeness, correct multipolygon inner/outer assignment, or
that a complete relation was retained by the source extract. Those still
require completed PBFs, `osmium check-refs`, and expert visual/GIS review.

## PMTiles acceptance checklist

After GeoJSON acceptance, the authorized operator may run the existing tiler:

```sh
python3 scripts/convert_and_tile.py
```

The current tiler reads the relation-aware GeoJSON release, stages all six
archives, validates each with `pmtiles show --metadata`, and publishes only a
complete release. Verify:

- `frontend/public/tiles/current/` exists and contains all six
  `osm-<layer>.pmtiles` files.
- Each archive is readable by `pmtiles show --metadata` and `pmtiles verify`.
- Each archive contains exactly the expected vector-layer ID:
  `osm_forest`, `osm_protected`, `osm_roads`, `osm_settlements`, `osm_water`,
  or `osm_admin`.
- Metadata fields include the expected OSM identity/tag properties.
- `data/layers/tile_manifest.json` identifies the same published release and
  six successful entries.
- A failed or incomplete build leaves the previous `current` symlink and
  previous release intact.
- Generated numeric tile IDs are present and source OSM identity properties
  remain available for traceability.
- OSM attribution is present in archive metadata and the frontend attribution
  control.

Automatable checks include file existence, `pmtiles show --metadata`,
`pmtiles verify`, vector-layer IDs, metadata fields, manifest consistency, and
release symlink integrity. Browser/GIS checks are still required for visual
acceptance:

- Forest/protected/admin polygons render as areas or boundaries, not missing
  geometry.
- Road and river lines render above the basemap but below active fire/risk
  overlays.
- Settlement labels remain readable without obscuring incident markers.
- All six visibility toggles work and do not duplicate sources or layers.
- Missing artifacts produce a disabled/unavailable context layer rather than
  breaking the operational map.

## Frontend verification

The existing `frontend/package.json` scripts are:

```sh
npm run build
npm run test:unit
```

The repository also contains Playwright tests and `playwright.config.ts`, but
there is no package-script entry for the browser suite. Run browser tests only
after dependencies are installed inside this worktree through a separately
approved process; do not install them as part of this runbook. Until then,
report TypeScript/build/browser checks as pending rather than inferred from
static inspection.

## Stop conditions

Stop without extraction or tiling if any of these occur:

- Southern aria2 is active or its state is uncertain.
- Any regional file is partial, missing, symlinked, unreadable, stale, or has a
  size/checksum mismatch.
- The Southern checksum is missing, a placeholder, or differs from the verified value.
- The manifest is inconsistent or cannot be updated atomically.
- Offline tests, compilation, or `git diff --check` fail.
- Any extraction/reference/export/GeoJSON validation step fails.
- Any PMTiles archive or expected vector-layer metadata is missing.
- A release would replace `current` with fewer than six validated layers.

This runbook does not authorize execution. Authorization must be explicit and
separate after the Southern source and manifest gates pass.
