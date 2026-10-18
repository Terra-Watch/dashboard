/** Hillshade and land-cover tint for the dark terrain view. Pure functions on the pack's own elevation. */
import { FUEL_BARE, FUEL_BUILT, FUEL_CROP, FUEL_GRASS, FUEL_MANGROVE, FUEL_MOSS, FUEL_SHRUB, FUEL_SNOW, FUEL_TREE, FUEL_WATER, FUEL_WETLAND } from './fuels.ts';
import type { RGB } from './ramp.ts';

export const SUN_AZIMUTH_DEG = 315;
export const SUN_ALTITUDE_DEG = 45;
/** Vertical exaggeration: 30 m cells under forest rarely exceed 25 degrees, so 2x makes ridges and valleys obvious without looking carved. */
export const Z_FACTOR = 2;

/**
 * Horn hillshade, 0 (dark) to 1 (bright), row 0 = north. Light comes from `azimuthDeg` (compass, 315 = north-west) at `altitudeDeg`.
 * Flat ground gives sin(altitude). Non-finite heights are replaced by the centre height, so the output is always finite.
 */
export function hillshade(elev: ArrayLike<number>, width: number, height: number, cellSizeM: number, azimuthDeg: number = SUN_AZIMUTH_DEG, altitudeDeg: number = SUN_ALTITUDE_DEG, zFactor: number = Z_FACTOR): Float32Array {
  const out = new Float32Array(width * height);
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt);
  const ly = Math.cos(az) * Math.cos(alt);
  const lz = Math.sin(alt);
  const flat = lz;
  for (let r = 0; r < height; r++) {
    const rn = Math.max(0, r - 1), rs = Math.min(height - 1, r + 1);
    for (let c = 0; c < width; c++) {
      const cw = Math.max(0, c - 1), ce = Math.min(width - 1, c + 1);
      const centre = elev[r * width + c];
      if (!Number.isFinite(centre)) { out[r * width + c] = flat; continue; }
      const z = (rr: number, cc: number) => { const v = elev[rr * width + cc]; return Number.isFinite(v) ? v : centre; };
      const a = z(rn, cw), b = z(rn, c), cc_ = z(rn, ce), d = z(r, cw), f = z(r, ce), g = z(rs, cw), h = z(rs, c), i = z(rs, ce);
      // Gradients per metre, east and north positive. Edge cells use a shorter run, so scale by the actual column and row spans.
      const dx = ((cc_ + 2 * f + i) - (a + 2 * d + g)) / (4 * (ce - cw) * cellSizeM || 1);
      const dy = ((a + 2 * b + cc_) - (g + 2 * h + i)) / (4 * (rs - rn) * cellSizeM || 1);
      const nx = -dx * zFactor, ny = -dy * zFactor;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const s = (nx * lx + ny * ly + lz) * inv;
      out[r * width + c] = s < 0 ? 0 : s > 1 ? 1 : s;
    }
  }
  return out;
}

export type TintGroup = 'tree' | 'grass' | 'crop' | 'built' | 'water' | 'bare';
export const TINT_TOKENS: Record<TintGroup, string> = { tree: 'wi-tint-tree', grass: 'wi-tint-grass', crop: 'wi-tint-crop', built: 'wi-tint-built', water: 'wi-tint-water', bare: 'wi-tint-bare' };

/** Which tint a fuel class gets (unmapped cells get none). */
export function tintGroup(fuel: number): TintGroup | null {
  switch (fuel) {
    case FUEL_TREE: case FUEL_MANGROVE: return 'tree';
    case FUEL_SHRUB: case FUEL_GRASS: case FUEL_WETLAND: return 'grass';
    case FUEL_CROP: return 'crop';
    case FUEL_BUILT: return 'built';
    case FUEL_WATER: return 'water';
    case FUEL_BARE: case FUEL_SNOW: case FUEL_MOSS: return 'bare';
    default: return null;
  }
}

export interface TerrainOptions {
  tints: Record<TintGroup, RGB>;
  light: RGB;
  dark: RGB;
  /** Opacity of the land-cover tint (muted), 0 to 1. */
  tintAlpha: number;
  /** How strongly shade shows: 0 none, 1 full. */
  strength: number;
}

/** One RGBA pixel per cell: the muted land-cover tint with the hillshade over it (light where the surface faces the sun, dark where it faces away). */
export function terrainPixels(fuel: ArrayLike<number>, shade: Float32Array, o: TerrainOptions): Uint8ClampedArray<ArrayBuffer> {
  const n = shade.length;
  const out = new Uint8ClampedArray(new ArrayBuffer(n * 4));
  const flat = Math.sin((SUN_ALTITUDE_DEG * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const g = tintGroup(fuel[i]);
    const t = g ? o.tints[g] : null;
    const ta = t ? o.tintAlpha : 0;
    const d = (shade[i] - flat) * o.strength * 2.2;           // about -1 to +0.5 for steep faces
    const sc = d >= 0 ? o.light : o.dark;
    const sa = Math.min(0.85, Math.abs(d));
    const a = sa + ta * (1 - sa);                              // "over" compositing
    if (a <= 0) continue;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = (sc[k] * sa + (t ? t[k] : 0) * ta * (1 - sa)) / a;
    out[i * 4 + 3] = a * 255;
  }
  return out;
}
