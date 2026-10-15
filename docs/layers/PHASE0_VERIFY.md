# RESQ7 Step 1 — Phase 0 Verification Report

Generated: 2025-01-13

---

## 1. Worktree Path Confirmed

```
/Users/kireeti/Desktop/Projects/RESQ/website/.claude/worktrees/agent-a09252bec024a73a8
```

---

## 2. Branch and HEAD

- **Branch:** `resq7/map-layers`
- **HEAD commit:** `dba538b` — "Map layers Step 0: inventory of candidate sources, licences, sizes"
- Matches the expected historical state (HEAD: dba538b ✓)

---

## 3. Git Status — Pre-existing Uncommitted Changes

```
On branch resq7/map-layers
Changes not staged for commit:
    modified:   docs/layers/00_inventory.md
```

`docs/layers/00_inventory.md` has uncommitted modifications (the §7 approval note was appended post-commit). These changes are **preserved** — no restore or checkout was performed.

---

## 4. Four Demo Bounding Boxes

Extracted verbatim from `docs/layers/00_inventory.md §0`:

| Incident ID | State | Ignition (lat, lon) | BBox (west, south, east, north) |
|---|---|---|---|
| E2024-131853 | TS (Telangana) | 19.20262, 78.60316 | 78.5318, 19.1352, 78.6745, 19.2700 |
| E2024-135332 | MH (Maharashtra) | 19.95163, 78.71265 | 78.6410, 19.8842, 78.7843, 20.0190 |
| E2023-084925 | OD (Odisha) | 19.32648, 83.93716 | 83.8657, 19.2591, 84.0086, 19.3939 |
| E2024-155286 | CG (Chhattisgarh) | 19.12243, 80.89992 | 80.8286, 19.0550, 80.9712, 19.1898 |

All four boxes are 15 km × 15 km (ignition point ± 7.5 km).

---

## 5. §7 Approval Note

**Status: PRESENT** ✓

Found at the end of `docs/layers/00_inventory.md`:

> **§7. Approval received (2026-10-13) — appended note, Step 1 proceeding**
>
> User approved: OSM (windowed Overpass) + ESA WorldCover + GHS-POP + Natural Earth only. WDPA, GADM, HydroSHEDS, FSI/Bhuvan are **not** being fetched. Both >200 MB backups (WorldPop India national raster, Hansen GFC tiles) are **skipped entirely**, not just deferred. State-level layers are deliberately coarse (major roads, towns, main rivers only).

---

## 6. Approved OSM Layer Stack

Per the inventory, the approved primary sources are:

| Layer | OSM Tags | Scope |
|---|---|---|
| Forest cover | `natural=wood`, `landuse=forest` | Demo boxes (ways + relations) |
| Protected areas | `boundary=protected_area` | Demo boxes |
| Roads | `highway=*` | Demo boxes (all classes); major classes only at state level |
| Settlements | `place=city`, `place=town`, (`place=village` demo boxes only) | Demo boxes + state level |
| Water | `waterway=river`, `natural=water` | Demo boxes |
| Admin boundaries | `boundary=administrative` (admin_level=4 state, 5–6 district) | Demo boxes + state level |

**Excluded (not to be fetched):** WDPA, GADM, HydroSHEDS, FSI/Bhuvan, WorldPop national raster, Hansen GFC tiles.

---

## 7. Tool Availability

| Tool | Path / Status |
|---|---|
| `tippecanoe` | `/opt/homebrew/bin/tippecanoe` ✓ |
| `pmtiles` | `/opt/homebrew/bin/pmtiles` ✓ |
| `ogr2ogr` | **MISSING** |
| `gdalwarp` | **MISSING** |
| `osmtogeojson` (system) | **MISSING** |
| `osmtogeojson` (npx) | **MISSING** (npx not resolving) |
| `python3 rasterio` | **MISSING** in current environment |

**Assessment:** The approved OSM vector build pipeline requires converting raw Overpass JSON/XML responses to GeoJSON, then running `tippecanoe` to produce PMTiles. The missing tools affect specific paths:

- `ogr2ogr` / `gdalwarp` — only needed for raster processing (ESA WorldCover, GHS-POP); **not required for the OSM vector build**.
- `osmtogeojson` — useful for converting Overpass JSON to GeoJSON. However, since it is missing from both system and npx, the build script must use a Python-based or Node.js-inline approach to parse Overpass JSON directly, or use Overpass's `[out:json]` format and convert with a small script.
- `rasterio` — only needed for raster layers; **not required for the OSM vector build**.

**Conclusion:** `tippecanoe` and `pmtiles` are present. The OSM vector pipeline is buildable using Overpass `[out:json]` format + a Python or Node.js conversion shim. No blocking tool gaps for the OSM vector stack.

---

## 8. Disk Space

```
Filesystem      Size  Used  Avail  Use%  Mounted on
/dev/disk3s1s1  461G  414G   47G   90%  /
```

**47 GB available.** The entire OSM vector build for 4 demo boxes is estimated at well under 100 MB total. Sufficient space.

---

## 9. Existing `frontend/public/tiles/` Contents

```
frontend/public/tiles/
└── resq-basemap.pmtiles   (38,245,886 bytes ≈ 36.5 MB)
```

- `resq-basemap.pmtiles` exists ✓ — **must not be overwritten**.
- No other tile files present yet — new layer tiles will be added alongside it.

---

## 10. `data/layers/` Directory

The directory exists but is **empty**:

```
data/layers/   (empty)
```

This is where raw Overpass responses and intermediate GeoJSON files will be written during the build.

---

## 11. `frontend/src/redesign/components/map.tsx` Analysis

### 11a. PMTiles basemap source wiring

The PMTiles protocol is registered globally via `pmtiles` npm package + `maplibregl.addProtocol`. The basemap style is built in `useBasemapStyle()`:

```ts
sources: {
  protomaps: {
    type: 'vector',
    url: `pmtiles://${BASEMAP_URL}`,  // → /tiles/resq-basemap.pmtiles
    attribution: '© OpenStreetMap contributors, © Protomaps',
  },
},
layers: basemapLayers(BASEMAP_SOURCE_ID, namedFlavor('light'), { lang: 'en' }),
```

New OSM layer sources should be added as additional `Source` components (children of `MapShell`), each referencing their own PMTiles URL via the same `pmtiles://` protocol.

### 11b. LayerPanel controls

`LayerPanel` receives:
- `active: Set<string>` — set of currently-toggled layer IDs
- `onToggle: (id: string) => void` — callback to flip a layer
- `layers?: readonly LayerDef[]` — array of `{ id, label, available }` definitions

Layers with `available: false` render a disabled checkbox with "Unavailable" badge. To make a new OSM layer usable, it must:
1. Appear in the `layers` array passed to `LayerPanel` with `available: true`
2. Have a corresponding `<Source>` + `<Layer>` component rendered as a `MapShell` child
3. Use `layout: { visibility: active.has(id) ? 'visible' : 'none' }` for toggle

### 11c. `DEFAULT_LAYERS` array structure

```ts
const DEFAULT_LAYERS = [
  { id: 'risk',       label: 'Risk cells',   available: true  },
  { id: 'detections', label: 'Detections',   available: true  },
  { id: 'incidents',  label: 'Incidents',    available: true  },
  { id: 'boundaries', label: 'Boundaries',   available: false },  // ← OSM admin boundaries
  { id: 'roads',      label: 'Roads',        available: false },  // ← OSM roads
  { id: 'villages',   label: 'Settlements',  available: false },  // ← OSM settlements
] as const;
```

The three OSM-relevant layer slots (`boundaries`, `roads`, `villages`) already exist with `available: false`. After PMTiles are built, these should be set to `available: true` and wired to `<Source>` + `<Layer>` components. Forest, protected areas, and water layers are not yet in this array — they will need to be added.

### 11d. OSM Attribution

Attribution is handled by MapLibre's `<AttributionControl compact position="bottom-right" />` component, which reads attribution strings from each source's `attribution` property. The basemap source already carries "© OpenStreetMap contributors". New OSM vector sources added to `MapShell` children must include matching attribution strings in their `<Source attribution="...">` prop to comply with ODbL requirements.

---

## 12. Summary Assessment

| Check | Result |
|---|---|
| Worktree path identified | ✓ `/Users/kireeti/Desktop/Projects/RESQ/website/.claude/worktrees/agent-a09252bec024a73a8` |
| Branch = resq7/map-layers | ✓ |
| HEAD = dba538b | ✓ |
| Pre-existing uncommitted changes preserved | ✓ `docs/layers/00_inventory.md` modified, not touched |
| Four demo bboxes confirmed | ✓ E2024-131853, E2024-135332, E2023-084925, E2024-155286 |
| §7 approval note present | ✓ |
| tippecanoe available | ✓ `/opt/homebrew/bin/tippecanoe` |
| pmtiles CLI available | ✓ `/opt/homebrew/bin/pmtiles` |
| ogr2ogr / gdalwarp | MISSING — not required for OSM vector build |
| osmtogeojson | MISSING — alternative: Overpass JSON + Python/Node shim |
| rasterio | MISSING — not required for OSM vector build |
| Disk space sufficient | ✓ 47 GB available |
| resq-basemap.pmtiles exists | ✓ 36.5 MB |
| data/layers/ ready (empty) | ✓ |
| Map.tsx layer slot stubs exist | ✓ `boundaries`, `roads`, `villages` (available: false) |

**Phase 0 complete. Ready to proceed to Phase 1 (OSM data download + PMTiles build).**
