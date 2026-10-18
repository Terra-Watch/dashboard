import assert from 'node:assert/strict';
import test from 'node:test';
import {
  comparePolygons,
  summariseValidation,
  type GeoPolygon,
} from '../src/features/scenarios/engine/index.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
// rectangle in degrees at lat ~0 so 0.1 deg is ~11.1195 km (R = 6371.0088 km): area = (0.1*111.19493)^2 = 123.6 km2 per 0.1x0.1 square
const rect = (w: number, s: number, e: number, n: number): GeoPolygon => ({
  type: 'Polygon',
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
});
const KM_PER_DEG = (Math.PI / 180) * 6371.0088;

test('identical polygons: iou 1, zero under/over', () => {
  const sq = rect(0, 0, 0.1, 0.1);
  const r = comparePolygons(sq, sq);
  near(r.iou, 1, 1e-9);
  near(r.predictedAreaKm2, (0.1 * KM_PER_DEG) ** 2, 0.2); // 123.64
  near(r.underPredictedKm2, 0, 1e-6);
  near(r.overPredictedKm2, 0, 1e-6);
});

test('disjoint polygons: iou 0, under = observed, over = predicted', () => {
  const r = comparePolygons(rect(0, 0, 0.1, 0.1), rect(1, 1, 1.1, 1.1));
  assert.equal(r.iou, 0);
  near(r.underPredictedKm2, r.observedAreaKm2, 1e-9);
  near(r.overPredictedKm2, r.predictedAreaKm2, 1e-9);
});

test('half overlap: shifted by half a side => iou 1/3, each side 1/2 under/over', () => {
  // A = [0,0.1]^2, B = [0.05,0.15]x[0,0.1]: I = A/2, U = 1.5 A, iou = 1/3
  const r = comparePolygons(rect(0, 0, 0.1, 0.1), rect(0.05, 0, 0.15, 0.1));
  near(r.iou, 1 / 3, 1e-4);
  near(r.underPredictedKm2, r.observedAreaKm2 / 2, 0.01);
  near(r.overPredictedKm2, r.predictedAreaKm2 / 2, 0.01);
  // prediction covering exactly half of the observed extent: iou 0.5
  const half = comparePolygons(rect(0, 0, 0.05, 0.1), rect(0, 0, 0.1, 0.1));
  near(half.iou, 0.5, 1e-4);
  near(half.overPredictedKm2, 0, 0.01);
});

test('concave observed extent (L-shape) is handled', () => {
  // L = 3 unit squares of 0.1 deg; predicted = full 2x2 square (4 units): I = 3, U = 4, iou 0.75
  const u = 0.1;
  const L: GeoPolygon = { type: 'Polygon', coordinates: [[[0, 0], [2 * u, 0], [2 * u, u], [u, u], [u, 2 * u], [0, 2 * u], [0, 0]]] };
  const r = comparePolygons(rect(0, 0, 2 * u, 2 * u), L);
  near(r.iou, 0.75, 1e-3);
});

test('aggregate: n, median, share >= 0.5', () => {
  const mk = (iou: number) => ({ iou, predictedAreaKm2: 1, observedAreaKm2: 1, underPredictedKm2: 0, overPredictedKm2: 0 });
  assert.deepEqual(summariseValidation([]), { n: 0, medianIou: null, shareIouAtLeastHalf: null });
  const s = summariseValidation([mk(0.9), mk(0.1), mk(0.5), mk(0.3)]);
  assert.equal(s.n, 4);
  near(s.medianIou as number, 0.4, 1e-12); // sorted 0.1,0.3,0.5,0.9 => (0.3+0.5)/2
  near(s.shareIouAtLeastHalf as number, 0.5, 1e-12);
  assert.equal(summariseValidation([mk(0.2), mk(0.7), mk(0.4)]).medianIou, 0.4);
});
