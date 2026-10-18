/** One simulation run on a prepared grid. Used by the Web Worker, by the main-thread fallback and by tests. */
import { simulate, WhatIfInputError } from './mtt.ts';
import { usableIgnitions } from './ignition.ts';
import { neighboursFor, windInputFor, type WindCase } from './wind.ts';
import type { Cell } from './fireline.ts';
import type { Grid } from './types.ts';

export interface SimJob {
  ignitions: Cell[];
  wind: WindCase;
  maxHours: number;
  fireLines: Uint8Array;
}

export type SimOutcome =
  | { ok: true; arrivalH: Float32Array; reachedCells: number; skippedIgnitions: number }
  | { ok: false; code: string; message: string };

export function runJob(grid: Grid, job: SimJob): SimOutcome {
  const usable = usableIgnitions(grid, job.ignitions, job.fireLines);
  if (usable.length === 0) return { ok: false, code: 'no_ignition', message: 'No ignition is on a cell that can burn.' };
  try {
    const r = simulate({ grid, ignitions: usable, wind: windInputFor(job.wind, job.maxHours), maxHours: job.maxHours, fireLines: job.fireLines, neighbours: neighboursFor(job.wind, job.maxHours) });
    return { ok: true, arrivalH: r.arrivalH, reachedCells: r.reachedCells, skippedIgnitions: job.ignitions.length - usable.length };
  } catch (e) {
    if (e instanceof WhatIfInputError) return { ok: false, code: e.code, message: e.message };
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : 'The run failed.' };
  }
}
