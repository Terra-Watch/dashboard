import assert from 'node:assert/strict';
import test from 'node:test';
import { cellCentre } from '../src/features/map/geojson.ts';

test('a point cell keeps its coordinates', () => {
  assert.deepEqual(cellCentre({ type: 'Point', coordinates: [84.5, 21.25] }), { lat: 21.25, lon: 84.5 });
});

test('a square cell is drawn at its centre', () => {
  const ring = [[84.45, 21.2], [84.55, 21.2], [84.55, 21.3], [84.45, 21.3], [84.45, 21.2]];
  const c = cellCentre({ type: 'Polygon', coordinates: [ring] });
  assert.ok(Math.abs(c.lon - 84.5) < 1e-9 && Math.abs(c.lat - 21.25) < 1e-9);
});
