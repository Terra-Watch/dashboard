import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FUEL_CLASSES,
  FUEL_BARE,
  FUEL_BUILT,
  FUEL_GRASS,
  FUEL_SHRUB,
  FUEL_TREE,
  FUEL_WATER,
  WIND_EXPONENT,
  WIND_REF_KMH,
  WhatIfInputError,
  arrivalAtPoints,
  burnedAreaKm2,
  cellSpread,
  contourCells,
  describeFuel,
  frontAt,
  mapWorldCoverRaster,
  newCellSpread,
  simulate,
  type Grid,
  type SimInput,
  type Wind,
  type WindSchedule,
} from '../src/features/scenarios/whatif/index.ts';
import { ellipseMetrics, ellipseRadiusKm } from '../src/features/scenarios/engine/ellipse.ts';

const CELL = 30;
const GRASS = FUEL_CLASSES[FUEL_GRASS];

function makeGrid(w: number, h: number, fuel = FUEL_GRASS, elev?: (col: number, row: number) => number): Grid {
  const n = w * h;
  const elevationM = new Float32Array(n);
  if (elev) for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) elevationM[r * w + c] = elev(c, r);
  return { width: w, height: h, cellSizeM: CELL, elevationM, fuel: new Uint8Array(n).fill(fuel), blocked: new Uint8Array(n) };
}
const noWind: Wind = { speedKmh: 0, fromDeg: 0 };
const bearingOf = (dx: number, dyNorth: number) => ((Math.atan2(dx, dyNorth) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Grass head rate in km/h for a flat cell and a given wind (independent of ros.ts internals except the exported constants). */
function grassHeadKmh(speedKmh: number): number {
  return GRASS.r0MPerMin * (1 + GRASS.windSensitivity * Math.pow(speedKmh / WIND_REF_KMH, WIND_EXPONENT)) * 0.06;
}
function analyticMetrics(speedKmh: number, fromDeg: number, hours: number) {
  return ellipseMetrics({ headRosKmh: grassHeadKmh(speedKmh), midflameWindKmh: speedKmh, windFromDeg: fromDeg, hours, start: { lat: 0, lon: 0 } });
}

// ---------- 1. zero wind circle ----------
const N = 401;
const C = 200;
test('zero wind, flat, uniform fuel: arrival times form a circle (16 neighbours, max rel. error <= 3%)', () => {
  const grid = makeGrid(N, N);
  const r = simulate({ grid, ignitions: [{ col: C, row: C }], wind: noWind, maxHours: 24 });
  const rateMh = GRASS.r0MPerMin * 60 / 1000; // km/h
  let maxErr = 0;
  let sum = 0;
  let cnt = 0;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const d = Math.hypot(col - C, row - C);
      if (d < 10) continue; // the first cells are dominated by cell-centre discretisation
      const expected = (d * CELL) / 1000 / rateMh;
      const err = (r.arrivalH[row * N + col] - expected) / expected;
      maxErr = Math.max(maxErr, Math.abs(err));
      sum += err;
      cnt++;
    }
  }
  console.log(`[whatif] circle: max relative error ${(maxErr * 100).toFixed(2)}%, mean signed ${((sum / cnt) * 100).toFixed(2)}%`);
  assert.ok(maxErr <= 0.03, `max error ${maxErr}`);
  assert.ok(sum / cnt >= 0, 'grid paths are never faster than the straight line');
  // Axis-aligned distances are exact.
  const t = r.arrivalH[C * N + C + 100];
  assert.ok(Math.abs(t - (100 * CELL) / 1000 / rateMh) < 1e-4);
});

// ---------- 2. ellipse under constant wind ----------
test('constant wind: head, back and flank distances match the analytic ellipse (axis-aligned wind)', () => {
  const grid = makeGrid(N, N);
  const speed = 8;
  const r = simulate({ grid, ignitions: [{ col: C, row: C }], wind: { speedKmh: speed, fromDeg: 270 }, maxHours: 24 });
  // wind from the west, so the head is east (+col), back is west, flank is north/south.
  for (const hours of [1, 2, 3]) {
    const m = analyticMetrics(speed, 270, hours);
    const reach = (dc: number, dr: number) => {
      let k = 0;
      while (C + (k + 1) * dc >= 0 && C + (k + 1) * dc < N && C + (k + 1) * dr >= 0 && C + (k + 1) * dr < N && r.arrivalH[(C + (k + 1) * dr) * N + C + (k + 1) * dc] <= hours) k++;
      return (k * CELL) / 1000;
    };
    const head = reach(1, 0);
    const back = reach(-1, 0);
    const flankIgn = reach(0, -1); // distance from ignition at 90 degrees
    assert.ok(Math.abs(head - m.headKm) <= CELL / 1000, `head ${head} vs ${m.headKm}`);
    assert.ok(Math.abs(back - m.backKm) <= CELL / 1000, `back ${back} vs ${m.backKm}`);
    assert.ok(Math.abs(flankIgn - m.flankFromIgnitionKm) <= CELL / 1000, `flank ${flankIgn} vs ${m.flankFromIgnitionKm}`);
    // maximum half-width of the burned area
    let maxHalfWidth = 0;
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) if (r.arrivalH[row * N + col] <= hours) maxHalfWidth = Math.max(maxHalfWidth, Math.abs(row - C));
    const bKm = (maxHalfWidth * CELL) / 1000;
    const relB = Math.abs(bKm - m.flankKm) / m.flankKm;
    console.log(`[whatif] ellipse t=${hours}h: head ${head.toFixed(3)}/${m.headKm.toFixed(3)} km, back ${back.toFixed(3)}/${m.backKm.toFixed(3)}, half-width rel. error ${(relB * 100).toFixed(1)}%`);
    assert.ok(relB <= 0.1, `half-width error ${relB}`);
    // burned area vs pi a b
    const area = burnedAreaKm2(r, grid, hours);
    const analytic = Math.PI * m.semiMajorKm * m.flankKm;
    const relA = Math.abs(area - analytic) / analytic;
    console.log(`[whatif] ellipse t=${hours}h: area ${area.toFixed(3)} vs ${analytic.toFixed(3)} km2 (${(relA * 100).toFixed(1)}%)`);
    assert.ok(relA <= 0.12, `area error ${relA}`);
  }
});

test('constant wind from an oblique direction: arrival times follow the ellipse (max error bounded, measured)', () => {
  const grid = makeGrid(N, N);
  const speed = 8;
  const from = 300;
  const r = simulate({ grid, ignitions: [{ col: C, row: C }], wind: { speedKmh: speed, fromDeg: from }, maxHours: 24 });
  const m = analyticMetrics(speed, from, 1);
  let maxErr = 0;
  let sum = 0;
  let cnt = 0;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (Math.hypot(col - C, row - C) < 10) continue;
      const got = r.arrivalH[row * N + col];
      if (!Number.isFinite(got)) continue;
      const dx = (col - C) * CELL;
      const dy = -(row - C) * CELL;
      const expected = Math.hypot(dx, dy) / 1000 / ellipseRadiusKm(m, bearingOf(dx, dy));
      const err = (got - expected) / expected;
      maxErr = Math.max(maxErr, Math.abs(err));
      sum += err;
      cnt++;
    }
  }
  console.log(`[whatif] oblique ellipse (8 km/h): max relative error ${(maxErr * 100).toFixed(1)}%, mean signed ${((sum / cnt) * 100).toFixed(2)}%`);
  assert.ok(maxErr <= 0.15, `max error ${maxErr}`);
  assert.ok(sum / cnt >= 0 && sum / cnt <= 0.03);
});

test('fire moves downwind (windFrom + 180)', () => {
  const grid = makeGrid(201, 201);
  for (const from of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const r = simulate({ grid, ignitions: [{ col: 100, row: 100 }], wind: { speedKmh: 10, fromDeg: from }, maxHours: 2 });
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let row = 0; row < 201; row++) for (let col = 0; col < 201; col++) if (r.arrivalH[row * 201 + col] <= 2) { sx += col - 100; sy += -(row - 100); n++; }
    const bearing = bearingOf(sx / n, sy / n);
    assert.ok(angDiff(bearing, (from + 180) % 360) < 6, `from ${from}: centroid bearing ${bearing}`);
  }
});

// ---------- 3 & 4. slope ----------
test('uphill spread is faster than downhill on a tilted plane (no wind)', () => {
  const tan = 0.4;
  const grid = makeGrid(201, 201, FUEL_GRASS, (_c, r) => -r * CELL * tan); // rises to the north
  const r = simulate({ grid, ignitions: [{ col: 100, row: 100 }], wind: noWind, maxHours: 24 });
  const up = r.arrivalH[(100 - 40) * 201 + 100];
  const down = r.arrivalH[(100 + 40) * 201 + 100];
  const side = r.arrivalH[100 * 201 + 140];
  console.log(`[whatif] slope tan=0.4: 40 cells uphill ${up.toFixed(3)} h, downhill ${down.toFixed(3)} h, cross ${side.toFixed(3)} h`);
  assert.ok(up < side && side < down, `${up} ${side} ${down}`);
  // the head rate is R0 (1 + k_s tan^2)
  const expectedUp = (40 * CELL) / (GRASS.r0MPerMin * (1 + GRASS.slopeSensitivity * tan * tan)) / 60;
  assert.ok(Math.abs(up - expectedUp) / expectedUp < 0.01);
});

test('cross-slope fire (wind along the contour) is skewed toward uphill', () => {
  const grid = makeGrid(201, 201, FUEL_GRASS, (_c, r) => -r * CELL * 0.4); // rises north
  const r = simulate({ grid, ignitions: [{ col: 100, row: 100 }], wind: { speedKmh: 8, fromDeg: 270 }, maxHours: 2 });
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let row = 0; row < 201; row++) for (let col = 0; col < 201; col++) if (r.arrivalH[row * 201 + col] <= 2) { sx += col - 100; sy += -(row - 100); n++; }
  const b = bearingOf(sx / n, sy / n);
  assert.ok(b > 20 && b < 85, `centroid bearing ${b} should lie north of east`);
  // compare with the same wind on flat ground: centroid exactly east
  assert.ok(sy / n > 0);
});

test('wind plus slope: wind blowing downhill gives a head between the wind and the uphill direction', () => {
  const sp = newCellSpread();
  const tan = 0.4;
  // plane rising to the north: gradient (E=0, N=tan). Wind from NE (45) blows toward 225 (SW), 135 degrees from uphill.
  cellSpread(FUEL_GRASS, 8, 45, 0, tan, sp);
  const headBearing = bearingOf(sp.headE, sp.headN);
  assert.ok(headBearing > 225 && headBearing < 360, `head ${headBearing}`);
  // opposite wind and slope: the stronger term wins
  cellSpread(FUEL_GRASS, 30, 0, 0, tan, sp); // wind from north blows south (downhill), strong
  assert.ok(angDiff(bearingOf(sp.headE, sp.headN), 180) < 1e-6);
  cellSpread(FUEL_GRASS, 1, 0, 0, tan, sp); // weak downhill wind
  assert.ok(angDiff(bearingOf(sp.headE, sp.headN), 0) < 1e-6);
  // the simulated fire agrees
  const grid = makeGrid(201, 201, FUEL_GRASS, (_c, r) => -r * CELL * tan);
  const r = simulate({ grid, ignitions: [{ col: 100, row: 100 }], wind: { speedKmh: 8, fromDeg: 45 }, maxHours: 2 });
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let row = 0; row < 201; row++) for (let col = 0; col < 201; col++) if (r.arrivalH[row * 201 + col] <= 2) { sx += col - 100; sy += -(row - 100); n++; }
  const b = bearingOf(sx / n, sy / n);
  assert.ok(b > 225 && b < 360, `centroid bearing ${b}`);
});

// ---------- 5. barriers ----------
function ring(grid: Grid, cx: number, cy: number, rad: number, gap?: { col: number; row: number }): Uint8Array {
  const lines = new Uint8Array(grid.width * grid.height);
  for (let r = cy - rad; r <= cy + rad; r++) {
    for (let c = cx - rad; c <= cx + rad; c++) {
      if (Math.max(Math.abs(c - cx), Math.abs(r - cy)) === rad) lines[r * grid.width + c] = 1;
    }
  }
  if (gap) lines[gap.row * grid.width + gap.col] = 0;
  return lines;
}
const outside = (r: { arrivalH: Float32Array }, w: number, cx: number, cy: number, rad: number) => {
  let n = 0;
  for (let i = 0; i < r.arrivalH.length; i++) {
    const c = i % w;
    const row = (i - c) / w;
    if (Math.max(Math.abs(c - cx), Math.abs(row - cy)) > rad && Number.isFinite(r.arrivalH[i])) n++;
  }
  return n;
};

test('a closed fire line contains the fire; a one-cell gap lets it through', () => {
  const grid = makeGrid(121, 121);
  const wind: Wind = { speedKmh: 12, fromDeg: 270 };
  const closed = ring(grid, 60, 60, 20);
  const r1 = simulate({ grid, ignitions: [{ col: 60, row: 60 }], wind, maxHours: 24, fireLines: closed });
  assert.equal(outside(r1, 121, 60, 60, 20), 0);
  assert.ok(r1.reachedCells > 100);
  const gap = ring(grid, 60, 60, 20, { col: 80, row: 60 });
  const r2 = simulate({ grid, ignitions: [{ col: 60, row: 60 }], wind, maxHours: 24, fireLines: gap });
  assert.ok(outside(r2, 121, 60, 60, 20) > 1000);
  assert.ok(Number.isFinite(r2.arrivalH[60 * 121 + 100]));
});

test('an 8-connected diagonal line (diamond) also contains the fire', () => {
  const grid = makeGrid(121, 121);
  const lines = new Uint8Array(121 * 121);
  const R = 25;
  for (let k = 0; k <= R; k++) {
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lines[(60 + sy * (R - k)) * 121 + 60 + sx * k] = 1;
  }
  for (const nb of [16, 32, 48] as const) {
    const r = simulate({ grid, ignitions: [{ col: 60, row: 60 }], wind: { speedKmh: 10, fromDeg: 90 }, maxHours: 24, fireLines: lines, neighbours: nb });
    let leaked = 0;
    for (let row = 0; row < 121; row++) for (let col = 0; col < 121; col++) if (Math.abs(col - 60) + Math.abs(row - 60) > R && Number.isFinite(r.arrivalH[row * 121 + col])) leaked++;
    assert.equal(leaked, 0, `${nb} neighbours leaked ${leaked}`);
  }
});

test('blocked cells and water stop spread the same way', () => {
  const g1 = makeGrid(101, 101);
  const lines = ring(g1, 50, 50, 15);
  for (let i = 0; i < lines.length; i++) g1.blocked[i] = lines[i];
  const r1 = simulate({ grid: g1, ignitions: [{ col: 50, row: 50 }], wind: noWind, maxHours: 24 });
  assert.equal(outside(r1, 101, 50, 50, 15), 0);
  const g2 = makeGrid(101, 101);
  for (let i = 0; i < lines.length; i++) if (lines[i]) g2.fuel[i] = FUEL_WATER;
  const r2 = simulate({ grid: g2, ignitions: [{ col: 50, row: 50 }], wind: noWind, maxHours: 24 });
  assert.equal(outside(r2, 101, 50, 50, 15), 0);
});

// ---------- 6. non-burnable ----------
test('non-burnable cells never get an arrival time', () => {
  const grid = makeGrid(81, 81);
  const kinds = [FUEL_WATER, FUEL_BUILT, FUEL_BARE, 0];
  for (let r = 10; r < 70; r++) for (let c = 10; c < 70; c++) {
    if ((c * 7 + r * 13) % 11 === 0) grid.fuel[r * 81 + c] = kinds[(c + r) % 4];
  }
  grid.fuel[40 * 81 + 40] = FUEL_GRASS;
  const r = simulate({ grid, ignitions: [{ col: 40, row: 40 }], wind: { speedKmh: 6, fromDeg: 200 }, maxHours: 24 });
  let nb = 0;
  for (let i = 0; i < grid.fuel.length; i++) {
    if (!FUEL_CLASSES[grid.fuel[i]].burnable) { nb++; assert.equal(r.arrivalH[i], Infinity); }
  }
  assert.ok(nb > 100);
  assert.ok(r.reachedCells > 1000);
});

test('fuel table: ordering, burnable flags, WorldCover mapping', () => {
  const rate = (id: number) => FUEL_CLASSES[id].r0MPerMin;
  assert.ok(rate(FUEL_GRASS) > rate(FUEL_SHRUB) && rate(FUEL_SHRUB) > rate(FUEL_TREE));
  for (const id of [FUEL_WATER, FUEL_BUILT, FUEL_BARE, 7]) assert.equal(FUEL_CLASSES[id].burnable, false);
  for (const f of FUEL_CLASSES) assert.match(f.note, /[Uu]ncalibrated/);
  const mapped = mapWorldCoverRaster(Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100, 0, 255]));
  assert.deepEqual(Array.from(mapped), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 0]);
  assert.equal(describeFuel(FUEL_GRASS).name, 'Grassland');
  assert.equal(describeFuel(250).burnable, false);
});

// ---------- 7. determinism ----------
function randomTerrain(w: number, h: number, seed: number): Grid {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = makeGrid(w, h, FUEL_GRASS, (c, r) => 80 * Math.sin(c / 23) + 60 * Math.cos(r / 31) + 5 * Math.sin((c + r) / 5));
  for (let i = 0; i < g.fuel.length; i++) {
    const u = rnd();
    g.fuel[i] = u < 0.35 ? FUEL_TREE : u < 0.6 ? FUEL_SHRUB : u < 0.85 ? FUEL_GRASS : u < 0.9 ? FUEL_WATER : 4;
  }
  return g;
}
const schedule: WindSchedule = { steps: [{ atHour: 0, wind: { speedKmh: 12, fromDeg: 250 } }, { atHour: 3, wind: { speedKmh: 20, fromDeg: 10 } }] };

test('deterministic: two runs give byte-equal arrival arrays', () => {
  const grid = randomTerrain(150, 150, 42);
  grid.fuel[75 * 150 + 75] = FUEL_GRASS;
  const input: SimInput = { grid, ignitions: [{ col: 75, row: 75 }, { col: 20, row: 120 }], wind: schedule, maxHours: 12 };
  grid.fuel[120 * 150 + 20] = FUEL_GRASS;
  const a = simulate(input);
  const b = simulate(input);
  assert.ok(Buffer.from(a.arrivalH.buffer).equals(Buffer.from(b.arrivalH.buffer)));
  assert.equal(a.reachedCells, b.reachedCells);
});

// ---------- 8. wind schedule ----------
test('wind schedule: the head direction changes after the change time', () => {
  const grid = makeGrid(501, 501);
  const c = 250;
  const sched: WindSchedule = { steps: [{ atHour: 0, wind: { speedKmh: 6, fromDeg: 270 } }, { atHour: 2, wind: { speedKmh: 6, fromDeg: 0 } }] };
  const rs = simulate({ grid, ignitions: [{ col: c, row: c }], wind: sched, maxHours: 5 });
  const r1 = simulate({ grid, ignitions: [{ col: c, row: c }], wind: { speedKmh: 6, fromDeg: 270 }, maxHours: 5 });
  // before the change the two runs agree exactly for cells settled before 2 h
  for (let i = 0; i < rs.arrivalH.length; i++) {
    if (r1.arrivalH[i] < 1.99) assert.equal(rs.arrivalH[i], r1.arrivalH[i]);
  }
  const extent = (r: { arrivalH: Float32Array }, t: number) => {
    let east = 0;
    let south = 0;
    for (let row = 0; row < 501; row++) for (let col = 0; col < 501; col++) if (r.arrivalH[row * 501 + col] <= t) { east = Math.max(east, col - c); south = Math.max(south, row - c); }
    return { east, south };
  };
  const e2 = extent(rs, 2);
  const e4 = extent(rs, 4);
  const k4 = extent(r1, 4);
  assert.ok(e4.south - e2.south > e4.east - e2.east, 'after the shift the front gains more toward the south than east');
  assert.ok(k4.south < e4.south, 'constant west wind does not push south as far as the shifted wind');
  assert.ok(k4.east > e4.east, 'constant west wind reaches farther east');
});

// ---------- 9. monotone along paths ----------
test('every reached cell has a neighbour with a strictly smaller arrival time; descent reaches an ignition', () => {
  const grid = randomTerrain(120, 120, 7);
  const ign = [{ col: 60, row: 60 }, { col: 10, row: 10 }];
  for (const g of ign) grid.fuel[g.row * 120 + g.col] = FUEL_GRASS;
  const r = simulate({ grid, ignitions: ign, wind: schedule, maxHours: 24 });
  const isIgn = (i: number) => ign.some((g) => g.row * 120 + g.col === i);
  let checked = 0;
  for (let i = 0; i < r.arrivalH.length; i++) {
    if (!Number.isFinite(r.arrivalH[i])) continue;
    let cur = i;
    for (let steps = 0; steps < 5000 && !isIgn(cur); steps++) {
      const cc = cur % 120;
      const cr = (cur - cc) / 120;
      let best = cur;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const c2 = cc + dc;
        const r2 = cr + dr;
        if (c2 < 0 || r2 < 0 || c2 >= 120 || r2 >= 120) continue;
        const j = r2 * 120 + c2;
        if (r.arrivalH[j] < r.arrivalH[best]) best = j;
      }
      assert.ok(best !== cur, `cell ${cur} has no earlier neighbour`);
      assert.ok(r.arrivalH[best] < r.arrivalH[cur]);
      cur = best;
    }
    assert.ok(isIgn(cur));
    checked++;
  }
  assert.ok(checked > 1000);
});

// ---------- 10. performance ----------
test('performance: 400x400 grid, 24 h', () => {
  const grid = randomTerrain(400, 400, 3);
  grid.fuel[200 * 400 + 200] = FUEL_GRASS;
  const input: SimInput = { grid, ignitions: [{ col: 200, row: 200 }], wind: { speedKmh: 12, fromDeg: 250 }, maxHours: 24 };
  simulate({ ...input, maxHours: 1 }); // warm up
  const t0 = performance.now();
  const r = simulate(input);
  const ms = performance.now() - t0;
  console.log(`[whatif] 400x400, 24 h, 16 neighbours: ${ms.toFixed(0)} ms, ${r.reachedCells} cells reached`);
  assert.ok(ms < 5000, `took ${ms} ms`);
  assert.ok(r.reachedCells > 10000);
});

// ---------- 11. points, fronts, contours ----------
test('arrivalAtPoints returns null for unreached, non-burnable and out-of-range points', () => {
  const grid = makeGrid(61, 61);
  grid.fuel[30 * 61 + 40] = FUEL_WATER;
  const r = simulate({ grid, ignitions: [{ col: 30, row: 30 }], wind: noWind, maxHours: 0.5 });
  const out = arrivalAtPoints(r, grid, [
    { id: 'near', col: 35, row: 30 },
    { id: 'far', col: 60, row: 60 },
    { id: 'water', col: 40, row: 30 },
    { id: 'off', col: -1, row: 5 },
    { id: 'off2', col: 5, row: 61 },
    { id: 'ign', col: 30, row: 30 },
  ]);
  const by = Object.fromEntries(out.map((o) => [o.id, o.hours]));
  assert.ok(by.near !== null && by.near > 0 && by.near < 0.5);
  assert.equal(by.far, null);
  assert.equal(by.water, null);
  assert.equal(by.off, null);
  assert.equal(by.off2, null);
  assert.equal(by.ign, 0);
});

test('frontAt, contourCells and burnedAreaKm2 agree', () => {
  const grid = makeGrid(101, 101);
  const r = simulate({ grid, ignitions: [{ col: 50, row: 50 }], wind: noWind, maxHours: 24 });
  const t = 0.4;
  const mask = frontAt(r, grid, t);
  const count = mask.reduce((a, b) => a + b, 0);
  assert.equal(burnedAreaKm2(r, grid, t), (count * CELL * CELL) / 1e6);
  const [c] = contourCells(r, grid, [t]);
  assert.ok(c.cells.length > 0 && c.cells.length < count);
  for (const i of c.cells) assert.equal(mask[i], 1);
  // radius = R t = 15 m/min * 24 min = 360 m = 12 cells; area close to pi r^2
  assert.ok(Math.abs(burnedAreaKm2(r, grid, t) - Math.PI * 0.36 * 0.36) / (Math.PI * 0.36 * 0.36) < 0.05);
  assert.equal(frontAt(r, grid, 0)[50 * 101 + 50], 1);
});

test('maxHours cuts the search', () => {
  const grid = makeGrid(101, 101);
  const r = simulate({ grid, ignitions: [{ col: 50, row: 50 }], wind: noWind, maxHours: 0.2 });
  for (const v of r.arrivalH) assert.ok(v === Infinity || v <= 0.2 + 1e-6);
  assert.ok(r.reachedCells < 101 * 101);
});

test('more neighbours reduce the directional error (measured)', () => {
  const grid = makeGrid(201, 201);
  const m = analyticMetrics(15, 270, 1);
  const errs: number[] = [];
  for (const nb of [16, 32, 48] as const) {
    const r = simulate({ grid, ignitions: [{ col: 100, row: 100 }], wind: { speedKmh: 15, fromDeg: 270 }, maxHours: 24, neighbours: nb });
    let max = 0;
    for (let row = 0; row < 201; row++) for (let col = 0; col < 201; col++) {
      if (Math.hypot(col - 100, row - 100) < 10) continue;
      const got = r.arrivalH[row * 201 + col];
      if (!Number.isFinite(got)) continue;
      const dx = (col - 100) * CELL;
      const dy = -(row - 100) * CELL;
      const exp = Math.hypot(dx, dy) / 1000 / ellipseRadiusKm(m, bearingOf(dx, dy));
      max = Math.max(max, Math.abs(got - exp) / exp);
    }
    errs.push(max);
  }
  console.log(`[whatif] 15 km/h wind, max relative arrival error: 16 nb ${(errs[0] * 100).toFixed(1)}%, 32 nb ${(errs[1] * 100).toFixed(1)}%, 48 nb ${(errs[2] * 100).toFixed(1)}%`);
  assert.ok(errs[1] < errs[0] && errs[2] < errs[1]);
});

// ---------- 12. validation ----------
function expectError(fn: () => unknown, code: string, msg: RegExp) {
  assert.throws(fn, (e: unknown) => e instanceof WhatIfInputError && e.code === code && msg.test(e.message));
}
test('input validation raises typed errors with clear messages', () => {
  const base = (): SimInput => ({ grid: makeGrid(10, 10), ignitions: [{ col: 5, row: 5 }], wind: noWind, maxHours: 1 });
  let i = base(); i.grid.width = 0;
  expectError(() => simulate(i), 'invalid_grid', /width\/height/);
  i = base(); i.grid.width = 10.5;
  expectError(() => simulate(i), 'invalid_grid', /positive integers/);
  i = base(); i.grid.cellSizeM = -1;
  expectError(() => simulate(i), 'invalid_grid', /cellSizeM/);
  i = base(); i.grid.fuel = new Uint8Array(5);
  expectError(() => simulate(i), 'invalid_grid', /fuel/);
  i = base(); i.grid.elevationM[17] = NaN;
  expectError(() => simulate(i), 'invalid_elevation', /index 17/);
  i = base(); i.grid.fuel[3] = 200;
  expectError(() => simulate(i), 'invalid_fuel', /class id 200/);
  i = base(); i.ignitions = [{ col: 10, row: 5 }];
  expectError(() => simulate(i), 'invalid_ignition', /out of range/);
  i = base(); i.ignitions = [{ col: 1.5, row: 5 }];
  expectError(() => simulate(i), 'invalid_ignition', /out of range/);
  i = base(); i.ignitions = [];
  expectError(() => simulate(i), 'invalid_ignition', /at least one/);
  i = base(); i.grid.fuel[5 * 10 + 5] = FUEL_WATER;
  expectError(() => simulate(i), 'invalid_ignition', /does not burn/);
  i = base(); i.grid.fuel[5 * 10 + 5] = FUEL_BUILT;
  expectError(() => simulate(i), 'invalid_ignition', /does not burn/);
  i = base(); i.fireLines = new Uint8Array(100); i.fireLines[55] = 1;
  expectError(() => simulate(i), 'invalid_ignition', /fire line/);
  i = base(); i.fireLines = new Uint8Array(7);
  expectError(() => simulate(i), 'invalid_fire_lines', /fireLines/);
  i = base(); i.wind = { speedKmh: -1, fromDeg: 0 };
  expectError(() => simulate(i), 'invalid_wind', /speedKmh/);
  i = base(); i.wind = { speedKmh: 5, fromDeg: NaN };
  expectError(() => simulate(i), 'invalid_wind', /fromDeg/);
  i = base(); i.wind = { steps: [{ atHour: 2, wind: noWind }, { atHour: 1, wind: noWind }] };
  expectError(() => simulate(i), 'invalid_wind', /strictly increasing/);
  i = base(); i.wind = { steps: [] };
  expectError(() => simulate(i), 'invalid_wind', /at least one step/);
  i = base(); i.maxHours = 0;
  expectError(() => simulate(i), 'invalid_hours', /maxHours/);
  i = base(); i.maxHours = NaN;
  expectError(() => simulate(i), 'invalid_hours', /maxHours/);
});
