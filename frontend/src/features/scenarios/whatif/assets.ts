/** Which assets the front could reach, and when. Wording: "could reach", never a promise. */
import type { AssetItem } from './pack.ts';
import type { Cell } from './fireline.ts';

/** Cells within this many cells of an asset count as reaching it (2 cells = about 60 m at 30 m cells): built-up cells never burn, so a village is reached when its surroundings burn. */
export const ASSET_NEAR_CELLS = 2;

/** Earliest arrival (hours) at any cell of the asset or within `radius` cells of it; null when none is reached by maxHours. */
export function assetArrivalHours(arrivalH: Float32Array, width: number, height: number, cells: readonly number[], radius: number = ASSET_NEAR_CELLS, maxHours: number = Infinity): number | null {
  let best = Infinity;
  for (const idx of cells) {
    const c = idx % width;
    const r = (idx - c) / width;
    for (let dr = -radius; dr <= radius; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= height) continue;
      for (let dc = -radius; dc <= radius; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= width) continue;
        const v = arrivalH[rr * width + cc];
        if (v < best) best = v;
      }
    }
  }
  return Number.isFinite(best) && best <= maxHours ? best : null;
}

export interface AssetRow { asset: AssetItem; hours: number | null }

/** One row per asset, reached ones first by time (ties by name), then the rest by name. */
export function assetRows(assets: readonly AssetItem[], arrivalH: Float32Array, width: number, height: number, maxHours: number): AssetRow[] {
  const rows = assets.map(asset => ({ asset, hours: assetArrivalHours(arrivalH, width, height, asset.cells, ASSET_NEAR_CELLS, maxHours) }));
  const label = (r: AssetRow) => r.asset.name || r.asset.id;
  return rows.sort((a, b) => {
    if (a.hours !== null && b.hours !== null) return a.hours - b.hours || label(a).localeCompare(label(b)) || a.asset.id.localeCompare(b.asset.id);
    if (a.hours !== null) return -1;
    if (b.hours !== null) return 1;
    return label(a).localeCompare(label(b)) || a.asset.id.localeCompare(b.asset.id);
  });
}

/** Hours rounded for display: halves below 10 h, whole hours above. */
export function formatHours(h: number): string {
  const v = h < 10 ? Math.round(h * 2) / 2 : Math.round(h);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export interface ReachPhrase { reached: boolean; hoursText: string }

/** Structured phrase for the table: reached -> "could reach in about X h"; else "not reached in N h". */
export function reachPhrase(hours: number | null, maxHours: number): ReachPhrase {
  return hours === null ? { reached: false, hoursText: formatHours(maxHours) } : { reached: true, hoursText: formatHours(hours) };
}

/** English wording for notes and tests. The page uses translated templates with the same shape. */
export function reachText(hours: number | null, maxHours: number): string {
  const p = reachPhrase(hours, maxHours);
  return p.reached ? `could reach in about ${p.hoursText} h` : `not reached in ${p.hoursText} h`;
}

/** Extent of the burned area along the wind axis at `hour`, in km, measured from the nearest ignition: head = downwind, back = upwind. */
export function reachKm(arrivalH: Float32Array, width: number, height: number, cellSizeM: number, ignitions: readonly Cell[], hour: number, headBearingDeg: number): { headKm: number; backKm: number } {
  if (ignitions.length === 0) return { headKm: 0, backKm: 0 };
  const rad = (headBearingDeg * Math.PI) / 180;
  const ex = Math.sin(rad);
  const ny = Math.cos(rad);
  let head = 0;
  let back = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!(arrivalH[row * width + col] <= hour)) continue;
      let bd = Infinity;
      let ig = ignitions[0];
      for (const g of ignitions) {
        const d = (g.col - col) * (g.col - col) + (g.row - row) * (g.row - row);
        if (d < bd) { bd = d; ig = g; }
      }
      const proj = (col - ig.col) * ex + (ig.row - row) * ny;
      if (proj > head) head = proj;
      if (-proj > back) back = -proj;
    }
  }
  return { headKm: (head * cellSizeM) / 1000, backKm: (back * cellSizeM) / 1000 };
}
