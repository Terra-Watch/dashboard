import assert from 'node:assert/strict';
import test from 'node:test';
import { bearingDeg, compassPoint, distanceKm, distanceText } from '../src/features/field/geo.ts';

test('distance: Bhubaneswar to Cuttack is about 25 km; zero for the same point', () => {
  const d = distanceKm({ lat: 20.2961, lon: 85.8245 }, { lat: 20.4625, lon: 85.883 });
  assert.ok(d > 17 && d < 21, `got ${d}`);       // great-circle distance is about 18.7 km
  assert.equal(distanceKm({ lat: 1, lon: 2 }, { lat: 1, lon: 2 }), 0);
});
test('bearing: due east is 90, due north is 0, south-west is 225', () => {
  assert.ok(Math.abs(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 90) < 0.01);
  assert.ok(Math.abs(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 0) < 0.01 || Math.abs(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 360) < 0.01);
  assert.ok(Math.abs(bearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: -1 }) - 225) < 0.5);
});
test('compass words and readable distances', () => {
  assert.equal(compassPoint(0), 'N'); assert.equal(compassPoint(359), 'N'); assert.equal(compassPoint(45), 'NE'); assert.equal(compassPoint(200), 'SSW');
  assert.equal(distanceText(0.42), '400 m'); assert.equal(distanceText(3.26), '3.3 km'); assert.equal(distanceText(42.4), '42 km');
});
