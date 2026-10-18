/** Geometry of an area pack: cell <-> lon/lat using the four corner coordinates of the manifest (bilinear, fine for a 10 to 14 km square). */
export type LonLat = [number, number];
export type Quad = [LonLat, LonLat, LonLat, LonLat];

export interface Layout {
  width: number;
  height: number;
  cellSizeM: number;
  nw: LonLat;
  ne: LonLat;
  se: LonLat;
  sw: LonLat;
}

/** Position at fractions u (west to east) and v (north to south) of the pack square. */
export function atFraction(l: Layout, u: number, v: number): LonLat {
  const lon = (1 - v) * ((1 - u) * l.nw[0] + u * l.ne[0]) + v * ((1 - u) * l.sw[0] + u * l.se[0]);
  const lat = (1 - v) * ((1 - u) * l.nw[1] + u * l.ne[1]) + v * ((1 - u) * l.sw[1] + u * l.se[1]);
  return [lon, lat];
}

/** Lon/lat of a point given in cell units from the NW corner (a cell centre is col + 0.5, row + 0.5). */
export function cellToLonLat(l: Layout, x: number, y: number): LonLat {
  return atFraction(l, x / l.width, y / l.height);
}

/** Fractional cell coordinates (x east, y south, from the NW corner) of a lon/lat, by Newton iteration on the bilinear map. */
export function lonLatToXY(l: Layout, lon: number, lat: number): { x: number; y: number } {
  let u = 0.5;
  let v = 0.5;
  for (let k = 0; k < 12; k++) {
    const [px, py] = atFraction(l, u, v);
    const fx = px - lon;
    const fy = py - lat;
    const dux = (1 - v) * (l.ne[0] - l.nw[0]) + v * (l.se[0] - l.sw[0]);
    const duy = (1 - v) * (l.ne[1] - l.nw[1]) + v * (l.se[1] - l.sw[1]);
    const dvx = (1 - u) * (l.sw[0] - l.nw[0]) + u * (l.se[0] - l.ne[0]);
    const dvy = (1 - u) * (l.sw[1] - l.nw[1]) + u * (l.se[1] - l.ne[1]);
    const det = dux * dvy - dvx * duy;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-18) break;
    const du = (fx * dvy - dvx * fy) / det;
    const dv = (dux * fy - fx * duy) / det;
    u -= du;
    v -= dv;
    if (Math.abs(du) < 1e-12 && Math.abs(dv) < 1e-12) break;
  }
  return { x: u * l.width, y: v * l.height };
}

/** The grid cell containing a lon/lat, or null when it is outside the pack. */
export function lonLatToCell(l: Layout, lon: number, lat: number): { col: number; row: number } | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const { x, y } = lonLatToXY(l, lon, lat);
  const col = Math.floor(x);
  const row = Math.floor(y);
  if (!(x >= 0 && y >= 0) || col >= l.width || row >= l.height) return null;
  return { col, row };
}

export function cellCentre(l: Layout, col: number, row: number): LonLat {
  return cellToLonLat(l, col + 0.5, row + 0.5);
}

/** [[west, south], [east, north]] box around the pack, for fitBounds. */
export function packBounds(l: Layout): [[number, number], [number, number]] {
  const lons = [l.nw[0], l.ne[0], l.se[0], l.sw[0]];
  const lats = [l.nw[1], l.ne[1], l.se[1], l.sw[1]];
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}

/** Corner order MapLibre wants for an image source: top-left, top-right, bottom-right, bottom-left. */
export function imageQuad(l: Layout): Quad {
  return [l.nw, l.ne, l.se, l.sw];
}
