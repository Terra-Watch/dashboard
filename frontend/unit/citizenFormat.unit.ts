import assert from 'node:assert/strict';
import test from 'node:test';

// format.ts imports the i18n instance (browser only); the coordinate parser is tested through a copy of its contract below.
const { parseCoordinates } = await import('../src/features/citizen/coordinates.ts');

test('coordinates are parsed from common ways of writing them and rejected when impossible', () => {
  assert.deepEqual(parseCoordinates('20.3, 85.8'), { lat: 20.3, lon: 85.8 });
  assert.deepEqual(parseCoordinates('20.3 85.8'), { lat: 20.3, lon: 85.8 });
  assert.deepEqual(parseCoordinates(' -1.5,36.8 '), { lat: -1.5, lon: 36.8 });
  assert.equal(parseCoordinates('91, 20'), null);
  assert.equal(parseCoordinates('20, 181'), null);
  assert.equal(parseCoordinates('north of the river'), null);
  assert.equal(parseCoordinates(''), null);
});
