/**
 * Minimum travel time (MTT) fire spread over a raster, after Finney (2002)
 * in spirit: Dijkstra over arrival time on a 16-neighbour graph. The fire is
 * `arrival <= t`; contours of the arrival surface are fire fronts.
 *
 * WHAT-IF ONLY. Not a forecast. Spread rates are uncalibrated assumptions
 * (see fuels.ts).
 *
 * MODEL CHOICES (all documented in docs/simulation-whatif/ENGINE.md)
 *  - Graph: each cell links to its 8 nearest neighbours and 8 knight moves
 *    (+-1,+-2), 16 directions.
 *  - Edge cost = distance / R(direction), with R the ellipse rate of the SOURCE
 *    cell (its fuel, slope, and the wind at the time the front settled that cell).
 *    The rate does not use the target cell. Simple, deterministic, and exact
 *    for homogeneous conditions; at fuel changes the rate switches one cell late.
 *  - Wind schedule: the wind used for a source cell is the step active at that
 *    cell's arrival time. An edge that starts before a change keeps the old wind
 *    even if it ends after the change (error is at most one cell crossing time).
 *    Before the first step, the first step's wind applies.
 *  - Edges may not cut through impassable cells: for diagonal and knight moves
 *    every cell the segment touches (the intermediate cells) must be passable.
 *    This makes any 8-connected fire line a closed barrier.
 *  - Impassable = blocked, non-burnable fuel, or fire line. They never receive
 *    an arrival time and are never traversed.
 *  - Deterministic: no random numbers; ties broken by heap order, which depends
 *    only on the input.
 */
import { FUEL_CLASSES } from './fuels.ts';
import { cellSpread, newCellSpread, rateAlong } from './ros.ts';
import type {
  Contour,
  Grid,
  Ignition,
  PointArrival,
  PointQuery,
  SimInput,
  SimResult,
  Wind,
  WindSchedule,
  WhatIfErrorCode,
} from './types.ts';

export const ENGINE_ID = 'mtt16-ellipse-v1';

/** Typed error for every refused input. */
export class WhatIfInputError extends Error {
  readonly code: WhatIfErrorCode;
  readonly field: string;
  constructor(code: WhatIfErrorCode, field: string, detail?: string) {
    super(`${code}: ${field}${detail ? ` (${detail})` : ''}`);
    this.name = 'WhatIfInputError';
    this.code = code;
    this.field = field;
  }
}

function isSchedule(w: Wind | WindSchedule): w is WindSchedule {
  return (w as WindSchedule).steps !== undefined;
}

function checkWind(w: Wind, field: string): void {
  if (!w || !Number.isFinite(w.speedKmh) || w.speedKmh < 0) throw new WhatIfInputError('invalid_wind', field, 'speedKmh must be a finite number >= 0');
  if (!Number.isFinite(w.fromDeg)) throw new WhatIfInputError('invalid_wind', field, 'fromDeg must be a finite number');
}

/** Validate the whole input; throws WhatIfInputError. Returns the passable mask. */
export function validateInput(input: SimInput): Uint8Array {
  const g = input?.grid;
  if (!g) throw new WhatIfInputError('invalid_grid', 'grid', 'missing');
  if (!Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1) {
    throw new WhatIfInputError('invalid_grid', 'width/height', 'must be positive integers');
  }
  if (!Number.isFinite(g.cellSizeM) || g.cellSizeM <= 0) throw new WhatIfInputError('invalid_grid', 'cellSizeM', 'must be > 0');
  const n = g.width * g.height;
  if (g.elevationM?.length !== n) throw new WhatIfInputError('invalid_grid', 'elevationM', `length ${g.elevationM?.length} != ${n}`);
  if (g.fuel?.length !== n) throw new WhatIfInputError('invalid_grid', 'fuel', `length ${g.fuel?.length} != ${n}`);
  if (g.blocked?.length !== n) throw new WhatIfInputError('invalid_grid', 'blocked', `length ${g.blocked?.length} != ${n}`);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(g.elevationM[i])) throw new WhatIfInputError('invalid_elevation', 'elevationM', `non-finite value at index ${i}`);
    if (g.fuel[i] >= FUEL_CLASSES.length) throw new WhatIfInputError('invalid_fuel', 'fuel', `unknown class id ${g.fuel[i]} at index ${i}; map WorldCover codes with mapWorldCoverRaster`);
  }
  if (input.fireLines !== undefined && input.fireLines.length !== n) {
    throw new WhatIfInputError('invalid_fire_lines', 'fireLines', `length ${input.fireLines.length} != ${n}`);
  }
  if (input.neighbours !== undefined && input.neighbours !== 16 && input.neighbours !== 32 && input.neighbours !== 48) {
    throw new WhatIfInputError('invalid_grid', 'neighbours', 'must be 16, 32 or 48');
  }
  if (!Number.isFinite(input.maxHours) || input.maxHours <= 0) throw new WhatIfInputError('invalid_hours', 'maxHours', 'must be a finite number > 0');
  if (isSchedule(input.wind)) {
    const s = input.wind.steps;
    if (!Array.isArray(s) || s.length === 0) throw new WhatIfInputError('invalid_wind', 'wind.steps', 'at least one step required');
    for (let i = 0; i < s.length; i++) {
      if (!Number.isFinite(s[i].atHour) || s[i].atHour < 0) throw new WhatIfInputError('invalid_wind', `wind.steps[${i}].atHour`, 'must be >= 0');
      if (i > 0 && !(s[i].atHour > s[i - 1].atHour)) throw new WhatIfInputError('invalid_wind', `wind.steps[${i}].atHour`, 'steps must be strictly increasing');
      checkWind(s[i].wind, `wind.steps[${i}].wind`);
    }
  } else {
    checkWind(input.wind, 'wind');
  }
  const passable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const burnable = FUEL_CLASSES[g.fuel[i]].burnable;
    passable[i] = burnable && !g.blocked[i] && !(input.fireLines && input.fireLines[i]) ? 1 : 0;
  }
  if (!Array.isArray(input.ignitions) || input.ignitions.length === 0) throw new WhatIfInputError('invalid_ignition', 'ignitions', 'at least one ignition required');
  input.ignitions.forEach((ig: Ignition, k) => {
    if (!ig || !Number.isInteger(ig.col) || !Number.isInteger(ig.row) || ig.col < 0 || ig.row < 0 || ig.col >= g.width || ig.row >= g.height) {
      throw new WhatIfInputError('invalid_ignition', `ignitions[${k}]`, 'cell out of range');
    }
    if (!passable[ig.row * g.width + ig.col]) throw new WhatIfInputError('invalid_ignition', `ignitions[${k}]`, 'cell does not burn (non-burnable fuel, blocked or fire line)');
  });
  return passable;
}

interface Move { dc: number; dr: number; dist: number; ux: number; uy: number; mid: number[] }
const MOVE_SETS = new Map<number, Move[]>();
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/**
 * Move set for a neighbourhood of 16 (reach 2), 32 (reach 3) or 48 (reach 4)
 * directions: all (dc, dr) with max(|dc|,|dr|) <= reach and gcd(|dc|,|dr|) = 1.
 * For each move the intermediate cells the straight segment touches are listed
 * (as offsets); all of them must be passable. Segment cells are found by
 * sampling centre-to-centre; where the sampled path steps diagonally the two
 * side cells are included too, so no move can slip through the corner of an
 * 8-connected barrier.
 */
export function movesFor(count: number): Move[] {
  const cached = MOVE_SETS.get(count);
  if (cached) return cached;
  const reach = count === 16 ? 2 : count === 32 ? 3 : 4;
  const out: Move[] = [];
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      if (dc === 0 && dr === 0) continue;
      if (gcd(Math.abs(dc), Math.abs(dr)) !== 1) continue;
      const dist = Math.hypot(dc, dr);
      const seen = new Set<number>();
      const mid: number[] = [];
      const add = (c: number, r: number) => {
        if ((c === 0 && r === 0) || (c === dc && r === dr)) return;
        const key = (c + 16) * 64 + (r + 16);
        if (!seen.has(key)) { seen.add(key); mid.push(c, r); }
      };
      let pc = 0, pr = 0;
      const steps = 256;
      for (let k = 1; k <= steps; k++) {
        const x = (dc * k) / steps;
        const y = (dr * k) / steps;
        // nudge by a tiny amount along the move so exact ties resolve to both cells over the sweep
        const c = Math.floor(x + 0.5 - 1e-9 * Math.sign(dc));
        const r = Math.floor(y + 0.5 - 1e-9 * Math.sign(dr));
        if (c !== pc && r !== pr) { add(c, pr); add(pc, r); }
        add(c, r);
        pc = c; pr = r;
      }
      // Ties exactly on a cell edge (e.g. knight moves at the midpoint) touch both neighbours.
      for (let k = 1; k < steps; k++) {
        const x = (dc * k) / steps;
        const y = (dr * k) / steps;
        const fx = x + 0.5 - Math.floor(x + 0.5);
        const fy = y + 0.5 - Math.floor(y + 0.5);
        if (Math.abs(fy) < 1e-9 || Math.abs(fy - 1) < 1e-9) { add(Math.floor(x + 0.5), Math.round(y) - 1 + 0); add(Math.floor(x + 0.5), Math.round(y)); }
        if (Math.abs(fx) < 1e-9 || Math.abs(fx - 1) < 1e-9) { add(Math.round(x) - 1, Math.floor(y + 0.5)); add(Math.round(x), Math.floor(y + 0.5)); }
      }
      out.push({ dc, dr, dist, ux: dc / dist, uy: -dr / dist, mid });
    }
  }
  MOVE_SETS.set(count, out);
  return out;
}
export const MOVE_COUNT = movesFor(16).length;

/** Wind at `hours` since ignition. */
export function windAtHour(w: Wind | WindSchedule, hours: number): Wind {
  if (!isSchedule(w)) return w;
  const s = w.steps;
  let cur = s[0].wind;
  for (let i = 0; i < s.length; i++) {
    if (s[i].atHour <= hours) cur = s[i].wind;
    else break;
  }
  return cur;
}

/** Run the simulation. Throws WhatIfInputError on bad input. */
export function simulate(input: SimInput): SimResult {
  const passable = validateInput(input);
  const g = input.grid;
  const W = g.width;
  const H = g.height;
  const n = W * H;
  const h = g.cellSizeM;
  const z = g.elevationM;
  const fuel = g.fuel;
  const maxH = input.maxHours;
  const wind = input.wind;
  const scheduled = isSchedule(wind);
  const constWind = scheduled ? null : (wind as Wind);

  const dist = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  // Indexed binary min-heap: heap[] holds cell ids, pos[] their heap slot (-1 = absent).
  const heap = new Int32Array(n);
  const pos = new Int32Array(n).fill(-1);
  let size = 0;

  const less = (a: number, b: number) => dist[a] < dist[b] || (dist[a] === dist[b] && a < b);
  const up = (i0: number) => {
    let i = i0;
    const id = heap[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(id, heap[p])) break;
      heap[i] = heap[p];
      pos[heap[i]] = i;
      i = p;
    }
    heap[i] = id;
    pos[id] = i;
  };
  const down = (i0: number) => {
    let i = i0;
    const id = heap[i];
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && less(heap[c + 1], heap[c])) c++;
      if (!less(heap[c], id)) break;
      heap[i] = heap[c];
      pos[heap[i]] = i;
      i = c;
    }
    heap[i] = id;
    pos[id] = i;
  };

  for (const ig of input.ignitions) {
    const id = ig.row * W + ig.col;
    if (pos[id] === -1) {
      dist[id] = 0;
      heap[size] = id;
      pos[id] = size;
      size++;
      up(size - 1);
    }
  }

  const MOVES = movesFor(input.neighbours ?? 16);
  const sp = newCellSpread();
  const maxMin = maxH * 60;
  let reached = 0;
  while (size > 0) {
    const s = heap[0];
    size--;
    pos[s] = -1;
    if (size > 0) {
      heap[0] = heap[size];
      pos[heap[0]] = 0;
      down(0);
    }
    done[s] = 1;
    reached++;
    const t0 = dist[s]; // minutes
    const sc = s % W;
    const sr = (s - sc) / W;

    // Local elevation gradient (central differences, one-sided at the edges). North = decreasing row.
    const cE = sc + 1 < W ? sc + 1 : sc;
    const cW = sc > 0 ? sc - 1 : sc;
    const rS = sr + 1 < H ? sr + 1 : sr;
    const rN = sr > 0 ? sr - 1 : sr;
    const gradE = cE !== cW ? (z[sr * W + cE] - z[sr * W + cW]) / ((cE - cW) * h) : 0;
    const gradN = rS !== rN ? (z[rN * W + sc] - z[rS * W + sc]) / ((rS - rN) * h) : 0;

    const wv = constWind ?? windAtHour(wind, t0 / 60);
    cellSpread(fuel[s], wv.speedKmh, wv.fromDeg, gradE, gradN, sp);
    const head = sp.headMPerMin;
    if (!(head > 0)) continue;

    for (let m = 0; m < MOVES.length; m++) {
      const mv = MOVES[m];
      const tc = sc + mv.dc;
      const tr = sr + mv.dr;
      if (tc < 0 || tr < 0 || tc >= W || tr >= H) continue;
      const t = tr * W + tc;
      if (done[t] || !passable[t]) continue;
      let clear = true;
      for (let q = 0; q < mv.mid.length; q += 2) {
        if (!passable[(sr + mv.mid[q + 1]) * W + sc + mv.mid[q]]) { clear = false; break; }
      }
      if (!clear) continue;
      const cosPhi = mv.ux * sp.headE + mv.uy * sp.headN;
      const rate = rateAlong(head, sp.e, cosPhi);
      const nt = t0 + (mv.dist * h) / rate;
      if (nt > maxMin || nt >= dist[t]) continue;
      dist[t] = nt;
      if (pos[t] === -1) {
        heap[size] = t;
        pos[t] = size;
        size++;
        up(size - 1);
      } else {
        up(pos[t]);
      }
    }
  }

  const arrivalH = new Float32Array(n);
  for (let i = 0; i < n; i++) arrivalH[i] = done[i] ? dist[i] / 60 : Infinity;
  return { arrivalH, maxHours: maxH, reachedCells: reached, engine: ENGINE_ID, width: W, height: H };
}

/** Burned mask (1 = arrival <= hours). */
export function frontAt(result: SimResult, grid: Grid, hours: number): Uint8Array {
  const n = grid.width * grid.height;
  const out = new Uint8Array(n);
  const a = result.arrivalH;
  for (let i = 0; i < n; i++) out[i] = a[i] <= hours ? 1 : 0;
  return out;
}

/** Hours at which the front reaches each query cell; null if not reached or out of range. */
export function arrivalAtPoints(result: SimResult, grid: Grid, points: PointQuery[]): PointArrival[] {
  return points.map((p) => {
    if (!Number.isInteger(p.col) || !Number.isInteger(p.row) || p.col < 0 || p.row < 0 || p.col >= grid.width || p.row >= grid.height) {
      return { id: p.id, hours: null };
    }
    const v = result.arrivalH[p.row * grid.width + p.col];
    return { id: p.id, hours: Number.isFinite(v) ? v : null };
  });
}

/** Boundary cells of the burned area at each requested time (burned cells with an unburned 4-neighbour inside the grid). */
export function contourCells(result: SimResult, grid: Grid, hoursList: number[]): Contour[] {
  const W = grid.width;
  const H = grid.height;
  const a = result.arrivalH;
  return hoursList.map((hours) => {
    const out: number[] = [];
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = r * W + c;
        if (!(a[i] <= hours)) continue;
        if ((c > 0 && !(a[i - 1] <= hours)) || (c + 1 < W && !(a[i + 1] <= hours)) || (r > 0 && !(a[i - W] <= hours)) || (r + 1 < H && !(a[i + W] <= hours))) {
          out.push(i);
        }
      }
    }
    return { hours, cells: Int32Array.from(out) };
  });
}

/** Burned area in km2 at `hours` (planimetric, cell count x cell area). */
export function burnedAreaKm2(result: SimResult, grid: Grid, hours: number): number {
  let count = 0;
  const a = result.arrivalH;
  for (let i = 0; i < a.length; i++) if (a[i] <= hours) count++;
  return (count * grid.cellSizeM * grid.cellSizeM) / 1e6;
}
