import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_CENTER, DEFAULT_GRID, gridBounds, gridCorners, metresPerDegree } from '../src/lib/simulationGeometry.ts';

// Ground distance in metres between two lng/lat points near the origin.
function metres(a: [number, number], b: [number, number]) {
  const per = metresPerDegree(DEFAULT_CENTER.latitude);
  return { east: Math.abs(b[0] - a[0]) * per.lon, north: Math.abs(b[1] - a[1]) * per.lat };
}

test('corners span exactly rows/columns x cell size on the ground', () => {
  const [tl, tr, br, bl] = gridCorners(DEFAULT_CENTER, DEFAULT_GRID);
  assert.ok(Math.abs(metres(tl, tr).east - 1200) < 1e-6);
  assert.ok(Math.abs(metres(tl, bl).north - 1200) < 1e-6);
  assert.deepEqual([tl[1], tr[1]], [tl[1], tl[1]]);
  assert.deepEqual([tl[0], bl[0]], [tl[0], tl[0]]);
  assert.ok(tl[1] > bl[1] && tl[0] < tr[0], 'top-left is north-west');
});

test('is not the legacy +-0.007 degree box (1.21x wide, 1.29x tall)', () => {
  const [tl, tr, , bl] = gridCorners(DEFAULT_CENTER);
  const legacy = metres([DEFAULT_CENTER.longitude - 0.007, 0], [DEFAULT_CENTER.longitude + 0.007, 0]).east;
  assert.ok(Math.abs(legacy / metres(tl, tr).east - 1.205) < 0.01);
  const legacyNorth = 0.014 * metresPerDegree(DEFAULT_CENTER.latitude).lat;
  assert.ok(Math.abs(legacyNorth / metres(tl, bl).north - 1.29) < 0.01);
});

test('non-square grids and other cell sizes scale per axis', () => {
  const [tl, tr, , bl] = gridCorners(DEFAULT_CENTER, { rows: 100, columns: 200, cellSizeM: 50 });
  assert.ok(Math.abs(metres(tl, tr).east - 10000) < 1e-6);
  assert.ok(Math.abs(metres(tl, bl).north - 5000) < 1e-6);
});

test('bounds are centred on the origin', () => {
  const [[w, s], [e, n]] = gridBounds(DEFAULT_CENTER);
  assert.ok(Math.abs((w + e) / 2 - DEFAULT_CENTER.longitude) < 1e-12);
  assert.ok(Math.abs((s + n) / 2 - DEFAULT_CENTER.latitude) < 1e-12);
});

test('matches the Python domain bounds', () => {
  const [[w, s], [e, n]] = gridBounds(DEFAULT_CENTER);
  assert.ok(Math.abs(w - 86.49488290726568) < 1e-9 && Math.abs(e - 86.50649309273432) < 1e-9);
  assert.ok(Math.abs(s - 21.86247533996782) < 1e-9 && Math.abs(n - 21.87331266003218) < 1e-9);
});
