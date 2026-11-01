import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleWind, type WindGrid } from '../src/features/map/windField.ts';

const grid: WindGrid = { lats: [10, 20], lons: [70, 80], u: [[0, 10], [0, 10]], v: [[0, 0], [10, 10]], valid_time: '' };

test('wind is interpolated between grid points', () => {
  const w = sampleWind(grid, 15, 75)!;
  assert.ok(Math.abs(w.u - 5) < 1e-9 && Math.abs(w.v - 5) < 1e-9);
});

test('grid corners return their own values', () => {
  assert.deepEqual(sampleWind(grid, 10, 80), { u: 10, v: 0 });
  assert.deepEqual(sampleWind(grid, 20, 70), { u: 0, v: 10 });
});

test('outside the grid there is no wind', () => {
  assert.equal(sampleWind(grid, 25, 75), null);
  assert.equal(sampleWind(grid, 15, 60), null);
});
