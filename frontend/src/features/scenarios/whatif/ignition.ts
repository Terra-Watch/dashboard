import { FUEL_CLASSES } from './fuels.ts';
import type { Cell } from './fireline.ts';
import { lonLatToCell, type Layout } from './layout.ts';
import type { Grid } from './types.ts';

export const MAX_IGNITIONS = 10;

export type IgnitionRefusal = 'outside' | 'not_burnable' | 'fire_line' | 'duplicate' | 'too_many';
export type SnapResult = { ok: true; cell: Cell } | { ok: false; reason: IgnitionRefusal };

/** True when fire can enter the cell: a burnable fuel class, not blocked, and not on a fire line. */
export function canBurn(grid: Grid, cell: Cell, fireLines?: Uint8Array): boolean {
  if (cell.col < 0 || cell.row < 0 || cell.col >= grid.width || cell.row >= grid.height) return false;
  const i = cell.row * grid.width + cell.col;
  return FUEL_CLASSES[grid.fuel[i]]?.burnable === true && !grid.blocked[i] && !(fireLines && fireLines[i]);
}

/** Why a cell cannot be an ignition, or null when it can. */
export function checkIgnition(grid: Grid, cell: Cell, existing: readonly Cell[], fireLines?: Uint8Array): IgnitionRefusal | null {
  if (cell.col < 0 || cell.row < 0 || cell.col >= grid.width || cell.row >= grid.height) return 'outside';
  if (existing.length >= MAX_IGNITIONS) return 'too_many';
  if (existing.some(e => e.col === cell.col && e.row === cell.row)) return 'duplicate';
  if (fireLines && fireLines[cell.row * grid.width + cell.col]) return 'fire_line';
  if (!canBurn(grid, cell)) return 'not_burnable';
  return null;
}

/** Snap a clicked lon/lat to its grid cell and refuse cells that cannot burn. */
export function snapIgnition(grid: Grid, layout: Layout, lon: number, lat: number, existing: readonly Cell[], fireLines?: Uint8Array): SnapResult {
  const cell = lonLatToCell(layout, lon, lat);
  if (!cell) return { ok: false, reason: 'outside' };
  const refusal = checkIgnition(grid, cell, existing, fireLines);
  return refusal ? { ok: false, reason: refusal } : { ok: true, cell };
}

/** Move a cell by whole cells, staying inside the grid. */
export function nudge(cell: Cell, dCol: number, dRow: number, width: number, height: number): Cell {
  return { col: Math.min(width - 1, Math.max(0, cell.col + dCol)), row: Math.min(height - 1, Math.max(0, cell.row + dRow)) };
}

/** Ignitions the engine can use: those not on a fire line (the engine refuses those) and burnable. */
export function usableIgnitions(grid: Grid, ignitions: readonly Cell[], fireLines?: Uint8Array): Cell[] {
  return ignitions.filter(c => canBurn(grid, c, fireLines));
}
