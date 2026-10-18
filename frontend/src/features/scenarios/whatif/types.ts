/**
 * Public types of the what-if fire spread engine.
 *
 * GRID CONVENTION: cell index = row * width + col. Row 0 is the NORTH edge,
 * col 0 the WEST edge (raster order, north-up). Cells are square, cellSizeM metres.
 * Compass bearings: 0 = north, 90 = east, clockwise.
 */

/** Terrain and fuel rasters. `fuel` holds fuel class ids from fuels.ts (not raw WorldCover codes). */
export interface Grid {
  width: number;
  height: number;
  cellSizeM: number;
  elevationM: Float32Array;
  fuel: Uint8Array;
  /** Non-zero = impassable (water, bare rock, user barrier). Never burns. */
  blocked: Uint8Array;
}

/** Midflame wind. `fromDeg` is the direction the wind blows FROM; the fire head moves toward fromDeg + 180. */
export interface Wind {
  speedKmh: number;
  fromDeg: number;
}

/** Piecewise constant wind keyed by hours since ignition. Sorted, strictly increasing atHour. */
export interface WindSchedule {
  steps: { atHour: number; wind: Wind }[];
}

/** An ignition cell. */
export interface Ignition {
  col: number;
  row: number;
}

export interface SimInput {
  grid: Grid;
  ignitions: Ignition[];
  wind: Wind | WindSchedule;
  maxHours: number;
  /** Non-zero = user fire line (never burns, never crossed). */
  fireLines?: Uint8Array;
  /** Number of neighbour directions per cell: 16 (default, as in PLAN.md), 32 or 48 (more accurate, slower). */
  neighbours?: 16 | 32 | 48;
}

export interface SimResult {
  /** Hours since ignition at which the front reaches each cell. Infinity = not reached. */
  arrivalH: Float32Array;
  maxHours: number;
  reachedCells: number;
  engine: string;
  /** Grid size the result belongs to (added field). */
  width: number;
  height: number;
}

export interface PointArrival {
  id: string;
  hours: number | null;
}

export interface PointQuery {
  id: string;
  col: number;
  row: number;
}

export interface Contour {
  hours: number;
  /** Indices (row * width + col) of burned cells that touch an unburned cell (4-neighbourhood). */
  cells: Int32Array;
}

export type WhatIfErrorCode =
  | 'invalid_grid'
  | 'invalid_elevation'
  | 'invalid_fuel'
  | 'invalid_ignition'
  | 'invalid_wind'
  | 'invalid_hours'
  | 'invalid_fire_lines';

/** Description of a fuel class for the UI. */
export interface FuelDescription {
  id: number;
  name: string;
  burnable: boolean;
  r0MPerMin: number;
  windSensitivity: number;
  slopeSensitivity: number;
  note: string;
}
