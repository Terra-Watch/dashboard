/**
 * Area pack parsing (pure: no DOM, no network). Layout of the files is in docs/simulation-whatif/DATA.md:
 * elevation.i16 = Int16 little-endian metres, row-major from the NORTH row, -32768 = no data;
 * landcover.u8 = ESA WorldCover codes, same layout; assets.json = GeoJSON in lon/lat.
 */
import { mapWorldCoverRaster } from './fuels.ts';
import { rasterLine } from './fireline.ts';
import { lonLatToCell, type Layout, type LonLat } from './layout.ts';
import type { Grid } from './types.ts';

export class PackError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PackError';
    this.code = code;
  }
}

export interface PackFileInfo { name: string; bytes: number; sha256: string }
export interface PackSource { layer: string; name: string; licence: string; attribution: string }
export interface PackManifest {
  name: string;
  center: { lat: number; lon: number };
  layout: Layout;
  files: PackFileInfo[];
  sources: PackSource[];
  statement: string;
}

export const ELEVATION_NODATA = -32768;
const REQUIRED_FILES = ['elevation.i16', 'landcover.u8', 'assets.json'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function lonLat(v: unknown, what: string): LonLat {
  if (!isObj(v)) throw new PackError('bad_manifest', `corner ${what} is missing`);
  const lon = num(v.lon);
  const lat = num(v.lat);
  if (lon === null || lat === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new PackError('bad_manifest', `corner ${what} is not a lon/lat`);
  return [lon, lat];
}

/** Check a parsed manifest.json and return the fields the page uses. Throws PackError with a plain message. */
export function parseManifest(raw: unknown): PackManifest {
  if (!isObj(raw)) throw new PackError('bad_manifest', 'manifest is not an object');
  if (typeof raw.schema !== 'string' || !raw.schema.startsWith('resq-whatif-area-pack/')) throw new PackError('bad_manifest', 'not an area pack manifest');
  const grid = raw.grid;
  if (!isObj(grid)) throw new PackError('bad_manifest', 'grid is missing');
  const width = num(grid.width);
  const height = num(grid.height);
  const cellSizeM = num(grid.cellSizeM);
  if (width === null || height === null || cellSizeM === null || !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 2000 || height > 2000 || cellSizeM <= 0) {
    throw new PackError('bad_manifest', 'grid size is not valid');
  }
  const corners = raw.cornersLonLat;
  if (!isObj(corners)) throw new PackError('bad_manifest', 'corner coordinates are missing');
  const layout: Layout = { width, height, cellSizeM, nw: lonLat(corners.nw, 'nw'), ne: lonLat(corners.ne, 'ne'), se: lonLat(corners.se, 'se'), sw: lonLat(corners.sw, 'sw') };
  const files: PackFileInfo[] = [];
  for (const f of Array.isArray(raw.files) ? raw.files : []) {
    if (isObj(f) && typeof f.name === 'string' && typeof f.sha256 === 'string' && num(f.bytes) !== null) files.push({ name: f.name, bytes: f.bytes as number, sha256: f.sha256 });
  }
  for (const need of REQUIRED_FILES) if (!files.some(f => f.name === need)) throw new PackError('bad_manifest', `file list lacks ${need}`);
  const n = width * height;
  if (files.find(f => f.name === 'elevation.i16')!.bytes !== n * 2) throw new PackError('bad_manifest', 'elevation size does not match the grid');
  if (files.find(f => f.name === 'landcover.u8')!.bytes !== n) throw new PackError('bad_manifest', 'land cover size does not match the grid');
  const sources: PackSource[] = [];
  for (const s of Array.isArray(raw.sources) ? raw.sources : []) {
    if (isObj(s) && typeof s.attribution === 'string') sources.push({ layer: String(s.layer ?? ''), name: String(s.name ?? ''), licence: String(s.licence ?? ''), attribution: s.attribution });
  }
  const centre = isObj(raw.center) ? raw.center : {};
  return {
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Area',
    center: { lat: num(centre.lat) ?? 0, lon: num(centre.lon) ?? 0 },
    layout, files, sources,
    statement: typeof raw.statement === 'string' ? raw.statement : '',
  };
}

/** Int16 little-endian metres to Float32. No-data cells take the mean of the valid cells so slopes stay finite. */
export function decodeElevation(buf: ArrayBuffer, n: number): Float32Array {
  if (buf.byteLength !== n * 2) throw new PackError('bad_elevation', `elevation has ${buf.byteLength} bytes, expected ${n * 2}`);
  const view = new DataView(buf);
  const out = new Float32Array(n);
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < n; i++) {
    const v = view.getInt16(i * 2, true);
    if (v === ELEVATION_NODATA) { out[i] = NaN; continue; }
    out[i] = v;
    sum += v;
    valid++;
  }
  if (valid < n) {
    const fill = valid ? sum / valid : 0;
    for (let i = 0; i < n; i++) if (Number.isNaN(out[i])) out[i] = fill;
  }
  return out;
}

/** WorldCover codes to engine fuel class ids. */
export function decodeFuel(buf: ArrayBuffer, n: number): Uint8Array {
  if (buf.byteLength !== n) throw new PackError('bad_landcover', `land cover has ${buf.byteLength} bytes, expected ${n}`);
  return mapWorldCoverRaster(new Uint8Array(buf));
}

export function buildGrid(layout: Layout, elevation: ArrayBuffer, landcover: ArrayBuffer): Grid {
  const n = layout.width * layout.height;
  return { width: layout.width, height: layout.height, cellSizeM: layout.cellSizeM, elevationM: decodeElevation(elevation, n), fuel: decodeFuel(landcover, n), blocked: new Uint8Array(n) };
}

export type AssetKind = 'village' | 'road' | 'water';
export interface AssetItem {
  id: string;
  kind: AssetKind;
  name: string;
  /** Place type (village, hamlet, town), highway class or waterway/natural tag. */
  detail: string;
  /** Grid cell indices of the asset (points, or every cell along the line), inside the grid only. */
  cells: number[];
  lonlat: LonLat;
  /** Original vertices for drawing (the point, the line, or the polygon ring). */
  coords: LonLat[];
}

const KINDS: readonly string[] = ['village', 'road', 'water'];

function lineCells(coords: unknown[], layout: Layout, into: Set<number>, verts: LonLat[]): LonLat | null {
  let first: LonLat | null = null;
  let prev: { col: number; row: number } | null = null;
  for (const c of coords) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    verts.push([c[0], c[1]]);
    const cell = lonLatToCell(layout, c[0], c[1]);
    if (!cell) { prev = null; continue; }
    if (!first) first = [c[0], c[1]];
    // Fill the cells between two vertices so a long straight road segment is not missed between them.
    for (const p of prev ? rasterLine(prev, cell) : [cell]) into.add(p.row * layout.width + p.col);
    prev = cell;
  }
  return first;
}

/** assets.json (GeoJSON in lon/lat) to assets on the grid. Features outside the grid or of another kind are dropped. */
export function parseAssets(fc: unknown, layout: Layout): AssetItem[] {
  if (!isObj(fc) || !Array.isArray(fc.features)) return [];
  const out: AssetItem[] = [];
  fc.features.forEach((f: unknown, index: number) => {
    if (!isObj(f) || !isObj(f.properties) || !isObj(f.geometry)) return;
    const kind = f.properties.kind;
    if (typeof kind !== 'string' || !KINDS.includes(kind)) return;
    const g = f.geometry;
    const cells = new Set<number>();
    const verts: LonLat[] = [];
    let at: LonLat | null = null;
    if (g.type === 'Point' && Array.isArray(g.coordinates)) at = lineCells([g.coordinates], layout, cells, verts);
    else if (g.type === 'LineString' && Array.isArray(g.coordinates)) at = lineCells(g.coordinates, layout, cells, verts);
    else if (g.type === 'Polygon' && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) at = lineCells(g.coordinates[0] as unknown[], layout, cells, verts);
    if (!at || cells.size === 0) return;
    const p = f.properties;
    const detail = kind === 'village' ? String(p.place ?? '') : kind === 'road' ? String(p.highway ?? '') : String(p.waterway ?? p.natural ?? '');
    out.push({ id: String(f.id ?? `${kind}-${index}`), kind: kind as AssetKind, name: typeof p.name === 'string' ? p.name : '', detail, cells: [...cells], lonlat: at, coords: verts });
  });
  return out;
}

/** Lower-case hex SHA-256 of some bytes, or null when this browser context has no crypto.subtle (plain http outside localhost). */
export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: { digest(a: string, d: ArrayBuffer): Promise<ArrayBuffer> } } }).crypto?.subtle;
  if (!subtle) return null;
  const digest = new Uint8Array(await subtle.digest('SHA-256', buf));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}
