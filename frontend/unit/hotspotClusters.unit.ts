import assert from 'node:assert/strict';
import test from 'node:test';
import { clusterDetections } from '../src/features/ops/hotspotClusters.ts';

const d = (id: number, lat: number, lon: number, t = '2026-11-01T10:00:00Z', st: string | null = 'OD') => ({ id, latitude: lat, longitude: lon, acq_datetime: t, forest_state: st });

test('five detections in one 0.1 degree cell make a cluster; four do not', () => {
  const five = [1, 2, 3, 4, 5].map(i => d(i, 20.01 + i * 0.001, 85.0));
  assert.equal(clusterDetections(five).length, 1);
  assert.equal(clusterDetections(five.slice(0, 4)).length, 0);
  assert.equal(clusterDetections(five)[0].count, 5);
});

test('detections in different cells are not mixed, and the biggest cluster comes first', () => {
  const a = [1, 2, 3, 4, 5].map(i => d(i, 20.0, 85.0));
  const b = [6, 7, 8, 9, 10, 11].map(i => d(i, 22.0, 80.0, '2026-11-01T12:00:00Z', 'CG'));
  const out = clusterDetections([...a, ...b]);
  assert.deepEqual(out.map(c => [c.count, c.state]), [[6, 'CG'], [5, 'OD']]);
});
