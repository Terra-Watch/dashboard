import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILES, canShow, visibleLayers, withinHours, type LayerId } from '../src/features/map/profiles.ts';
import { boundsOf, freshness, pointsToGeoJson, polygonsToGeoJson } from '../src/features/map/geojson.ts';

test('citizens can never be shown signals, unchecked reports, scenarios or officers, whatever is requested', () => {
  const everything: LayerId[] = ['public_areas', 'advisories', 'own_reports', 'incidents', 'reports', 'signals', 'officers', 'terrain', 'wind', 'scenario', 'task'];
  assert.deepEqual([...visibleLayers('citizen', everything)].sort(), ['advisories', 'own_reports', 'public_areas']);
  for (const layer of ['signals', 'reports', 'scenario', 'officers', 'incidents'] as LayerId[]) assert.equal(canShow('citizen', layer), false);
});

test('field officers never see a scenario or the whole incident list; they may see signals near their task', () => {
  assert.equal(canShow('field', 'scenario'), false);
  assert.equal(canShow('field', 'incidents'), false);
  assert.equal(canShow('field', 'reports'), false);
  assert.equal(canShow('field', 'signals'), true);
});

test('the Control Room can show everything except the citizen-only layers and the officer-only task layer', () => {
  assert.equal(canShow('control_room', 'scenario'), true);
  assert.equal(canShow('control_room', 'public_areas'), false);
  assert.equal(canShow('control_room', 'task'), false);
});

test('every default layer is allowed for its role', () => {
  for (const [role, profile] of Object.entries(PROFILES)) for (const layer of profile.defaults) assert.ok(profile.allowed.includes(layer), `${role} default ${layer}`);
});

test('time windows', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(withinHours('2026-10-16T08:00:00Z', 6, now), true);
  assert.equal(withinHours('2026-10-16T05:00:00Z', 6, now), false);
  assert.equal(withinHours('not a date', 6, now), false);
  assert.equal(withinHours('2026-10-17T12:00:00Z', 6, now), false);        // from the future
});

test('old signals fade but stay visible', () => {
  assert.equal(freshness(0), 1);
  assert.ok(freshness(36 * 60) < 0.6 && freshness(36 * 60) > 0.4);
  assert.equal(freshness(10_000), 0.35);
  assert.equal(freshness(undefined), 1);
});

test('GeoJSON conversion drops impossible coordinates and closes polygon rings', () => {
  const fc = pointsToGeoJson([{ id: 'a', lat: 20, lon: 85, symbol: 'verified' }, { id: 'b', lat: 99, lon: 85, symbol: 'report' }, { id: 'c', lat: NaN, lon: 1, symbol: 'signal' }]);
  assert.equal(fc.features.length, 1);
  const poly = polygonsToGeoJson([{ id: 'p', ring: [[0, 0], [1, 0], [1, 1]], tone: 'cell' }, { id: 'tiny', ring: [[0, 0], [1, 1]], tone: 'cell' }]);
  assert.equal(poly.features.length, 1);
  const geometry = poly.features[0].geometry as { coordinates: number[][][] };
  assert.deepEqual(geometry.coordinates[0][0], geometry.coordinates[0][geometry.coordinates[0].length - 1]);
});

test('bounds pad a single point and cover many', () => {
  assert.equal(boundsOf([]), null);
  const one = boundsOf([{ lat: 20, lon: 85 }])!;
  assert.ok(one[0][0] < 85 && one[1][0] > 85);
  const many = boundsOf([{ lat: 20, lon: 85 }, { lat: 21, lon: 86 }])!;
  assert.ok(many[0][1] < 20 && many[1][1] > 21);
});
