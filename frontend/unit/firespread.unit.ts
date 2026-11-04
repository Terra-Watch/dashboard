import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bandPolygons, pixelPoints } from '../src/features/firespread/model.ts';

const ring = [[78, 17], [78.01, 17], [78.01, 17.01], [78, 17]] as Array<[number, number]>;

test('each band polygon becomes one map polygon with a tone for its band', () => {
  const polys = bandPolygons({ features: [
    { properties: { band: 3 }, geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring]] } },
    { properties: { band: 1 }, geometry: { type: 'MultiPolygon', coordinates: [[ring]] } },
  ] }, 'e-48');
  assert.deepEqual(polys.map(p => [p.id, p.tone]), [['e-48-b3-0', 'cell'], ['e-48-b3-1', 'cell'], ['e-48-b1-0', 'advisory']]);
});

test('detections become signal points in lat/lon order', () => {
  const [p] = pixelPoints({ features: [{ geometry: { coordinates: [78.5, 17.4] } }] }, 'e');
  assert.deepEqual([p.lat, p.lon, p.symbol], [17.4, 78.5, 'signal']);
});
