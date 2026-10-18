/**
 * Fuel classes for the what-if engine.
 *
 * ALL NUMBERS HERE ARE UNCALIBRATED ASSUMPTIONS. They give a plausible ordering
 * (grass fastest, then shrub, crop, tree litter, wetland and others slow; built-up,
 * bare, snow, water do not burn). They are NOT fitted to observed Indian fires and
 * are NOT the standard Rothermel/Anderson fuel models.
 *
 * Columns
 *   r0MPerMin        head rate of spread on flat ground with NO wind, metres/minute.
 *   windSensitivity  k_w: wind factor phi_w = k_w (U / 10 km/h)^1.2 (see ros.ts).
 *   slopeSensitivity k_s: slope factor phi_s = k_s tan(slope)^2 (see ros.ts).
 *   burnable         false = the cell never burns and is never crossed.
 *
 * Class ids are small integers stored in Grid.fuel. ESA WorldCover codes map to
 * them with WORLDCOVER_TO_FUEL / worldCoverToFuel.
 */
import type { FuelDescription } from './types.ts';

export interface FuelClass {
  id: number;
  name: string;
  burnable: boolean;
  r0MPerMin: number;
  windSensitivity: number;
  slopeSensitivity: number;
  note: string;
}

const UNCAL = 'Uncalibrated assumption, not fitted to observed Indian fires.';

export const FUEL_CLASSES: readonly FuelClass[] = [
  { id: 0, name: 'Unknown / not burnable', burnable: false, r0MPerMin: 0, windSensitivity: 1, slopeSensitivity: 0, note: 'Unmapped cells never burn. ' + UNCAL },
  { id: 1, name: 'Tree cover (litter)', burnable: true, r0MPerMin: 2.5, windSensitivity: 0.6, slopeSensitivity: 4, note: 'Slow surface litter fire under canopy; low wind reach. ' + UNCAL },
  { id: 2, name: 'Shrubland', burnable: true, r0MPerMin: 6, windSensitivity: 0.9, slopeSensitivity: 5, note: 'Medium rate, strong wind response. ' + UNCAL },
  { id: 3, name: 'Grassland', burnable: true, r0MPerMin: 15, windSensitivity: 1.2, slopeSensitivity: 6, note: 'Fastest fuel, strongest wind response. ' + UNCAL },
  { id: 4, name: 'Cropland', burnable: true, r0MPerMin: 8, windSensitivity: 1.0, slopeSensitivity: 5, note: 'Moderate rate; depends on season (standing crop or stubble). ' + UNCAL },
  { id: 5, name: 'Built-up', burnable: false, r0MPerMin: 0, windSensitivity: 1, slopeSensitivity: 0, note: 'Treated as a break. Structures are not modelled. ' + UNCAL },
  { id: 6, name: 'Bare / sparse', burnable: false, r0MPerMin: 0, windSensitivity: 1, slopeSensitivity: 0, note: 'Too little fuel to carry fire. ' + UNCAL },
  { id: 7, name: 'Snow / ice', burnable: false, r0MPerMin: 0, windSensitivity: 1, slopeSensitivity: 0, note: 'Does not burn. ' + UNCAL },
  { id: 8, name: 'Permanent water', burnable: false, r0MPerMin: 0, windSensitivity: 1, slopeSensitivity: 0, note: 'Does not burn; acts as a barrier. ' + UNCAL },
  { id: 9, name: 'Herbaceous wetland', burnable: true, r0MPerMin: 1.5, windSensitivity: 0.7, slopeSensitivity: 3, note: 'Wet fuel, slow and patchy. ' + UNCAL },
  { id: 10, name: 'Mangroves', burnable: true, r0MPerMin: 1, windSensitivity: 0.5, slopeSensitivity: 2, note: 'Wet, very slow. ' + UNCAL },
  { id: 11, name: 'Moss / lichen', burnable: true, r0MPerMin: 1, windSensitivity: 0.5, slopeSensitivity: 3, note: 'Sparse, slow. ' + UNCAL },
];

export const FUEL_UNKNOWN = 0;
export const FUEL_TREE = 1;
export const FUEL_SHRUB = 2;
export const FUEL_GRASS = 3;
export const FUEL_CROP = 4;
export const FUEL_BUILT = 5;
export const FUEL_BARE = 6;
export const FUEL_SNOW = 7;
export const FUEL_WATER = 8;
export const FUEL_WETLAND = 9;
export const FUEL_MANGROVE = 10;
export const FUEL_MOSS = 11;

/** ESA WorldCover code -> fuel class id. */
export const WORLDCOVER_TO_FUEL: Readonly<Record<number, number>> = {
  10: FUEL_TREE,
  20: FUEL_SHRUB,
  30: FUEL_GRASS,
  40: FUEL_CROP,
  50: FUEL_BUILT,
  60: FUEL_BARE,
  70: FUEL_SNOW,
  80: FUEL_WATER,
  90: FUEL_WETLAND,
  95: FUEL_MANGROVE,
  100: FUEL_MOSS,
};

/** Fuel class id for one WorldCover code (unmapped codes -> 0, not burnable). */
export function worldCoverToFuel(code: number): number {
  return WORLDCOVER_TO_FUEL[code] ?? FUEL_UNKNOWN;
}

/** Convert a raster of WorldCover codes to fuel class ids. */
export function mapWorldCoverRaster(codes: Uint8Array): Uint8Array {
  const lut = new Uint8Array(256);
  for (const [k, v] of Object.entries(WORLDCOVER_TO_FUEL)) lut[Number(k)] = v;
  const out = new Uint8Array(codes.length);
  for (let i = 0; i < codes.length; i++) out[i] = lut[codes[i]];
  return out;
}

/** Description of a fuel class for the UI (unknown ids describe class 0). */
export function describeFuel(id: number): FuelDescription {
  const f = FUEL_CLASSES[id] ?? FUEL_CLASSES[0];
  return {
    id: f.id,
    name: f.name,
    burnable: f.burnable,
    r0MPerMin: f.r0MPerMin,
    windSensitivity: f.windSensitivity,
    slopeSensitivity: f.slopeSensitivity,
    note: f.note,
  };
}
