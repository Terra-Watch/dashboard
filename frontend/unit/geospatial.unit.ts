import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidCoordinate,
  isValidBounds,
  isValidCenter,
  validateGeometryCoords,
  isValidGeometry,
  isValidFeature,
  toSafeGeoJson,
  extractCoordinates,
  computeFeatureCollectionBounds,
  EMPTY_GEOJSON,
} from '../src/redesign/lib/geospatial.ts';

test('isValidCoordinate: validates [lon, lat] pairs within WGS84 bounds', () => {
  // Valid coordinates
  assert.equal(isValidCoordinate([80.4, 20.3]), true);
  assert.equal(isValidCoordinate([-180, -90]), true);
  assert.equal(isValidCoordinate([180, 90]), true);
  assert.equal(isValidCoordinate([0, 0]), true);

  // Invalid types / lengths
  assert.equal(isValidCoordinate(null), false);
  assert.equal(isValidCoordinate(undefined), false);
  assert.equal(isValidCoordinate('80.4, 20.3'), false);
  assert.equal(isValidCoordinate([80.4]), false);
  assert.equal(isValidCoordinate([]), false);

  // Non-finite values
  assert.equal(isValidCoordinate([NaN, 20.3]), false);
  assert.equal(isValidCoordinate([80.4, Infinity]), false);
  assert.equal(isValidCoordinate([-Infinity, 20.3]), false);

  // Out of WGS84 range
  assert.equal(isValidCoordinate([180.1, 20.3]), false);
  assert.equal(isValidCoordinate([-180.1, 20.3]), false);
  assert.equal(isValidCoordinate([80.4, 90.1]), false);
  assert.equal(isValidCoordinate([80.4, -90.1]), false);
});

test('isValidBounds: validates [west, south, east, north] ordering and range', () => {
  // Valid bounds
  assert.equal(isValidBounds([80.0, 19.0, 85.0, 22.0]), true);
  assert.equal(isValidBounds([-180, -90, 180, 90]), true);

  // Inverted axes (west >= east or south >= north)
  assert.equal(isValidBounds([85.0, 19.0, 80.0, 22.0]), false);
  assert.equal(isValidBounds([80.0, 22.0, 85.0, 19.0]), false);
  assert.equal(isValidBounds([80.0, 20.0, 80.0, 20.0]), false);

  // Out of WGS84 range
  assert.equal(isValidBounds([-190, 19.0, 85.0, 22.0]), false);
  assert.equal(isValidBounds([80.0, 19.0, 190, 22.0]), false);
  assert.equal(isValidBounds([80.0, -95.0, 85.0, 22.0]), false);
  assert.equal(isValidBounds([80.0, 19.0, 85.0, 95.0]), false);

  // Non-finite / wrong length / wrong type
  assert.equal(isValidBounds([80.0, 19.0, NaN, 22.0]), false);
  assert.equal(isValidBounds([80.0, 19.0, 85.0]), false);
  assert.equal(isValidBounds(null), false);
  assert.equal(isValidBounds('invalid'), false);
});

test('isValidCenter: validates [lon, lat] center points', () => {
  assert.equal(isValidCenter([80.4, 20.3]), true);
  assert.equal(isValidCenter([-180, 0]), true);
  assert.equal(isValidCenter([180, 0]), true);

  assert.equal(isValidCenter([200, 20.3]), false);
  assert.equal(isValidCenter([80.4, 95.0]), false);
  assert.equal(isValidCenter([NaN, 20.3]), false);
  assert.equal(isValidCenter([80.4]), false);
  assert.equal(isValidCenter(null), false);
});

test('validateGeometryCoords and isValidGeometry: enforces GeoJSON geometry structure', () => {
  // Point
  assert.equal(isValidGeometry({ type: 'Point', coordinates: [80.4, 20.3] }), true);
  assert.equal(isValidGeometry({ type: 'Point', coordinates: [80.4, NaN] }), false);
  assert.equal(isValidGeometry({ type: 'Point', coordinates: [200, 20.3] }), false);

  // LineString
  assert.equal(isValidGeometry({ type: 'LineString', coordinates: [[80.0, 20.0], [80.5, 20.5]] }), true);
  assert.equal(isValidGeometry({ type: 'LineString', coordinates: [] }), false);
  assert.equal(isValidGeometry({ type: 'LineString', coordinates: [[80.0, 20.0], [NaN, 20.5]] }), false);

  // Polygon (closed ring with >= 4 points)
  const validRing = [[80.0, 20.0], [81.0, 20.0], [81.0, 21.0], [80.0, 21.0], [80.0, 20.0]];
  assert.equal(isValidGeometry({ type: 'Polygon', coordinates: [validRing] }), true);
  assert.equal(isValidGeometry({ type: 'Polygon', coordinates: [[[80.0, 20.0], [81.0, 20.0]]] }), false); // too short

  // Unknown geometry type
  assert.equal(isValidGeometry({ type: 'Curve', coordinates: [80.0, 20.0] }), false);
  assert.equal(isValidGeometry(null), false);
  assert.equal(isValidGeometry({}), false);
});

test('isValidFeature: validates feature envelope and geometry', () => {
  assert.equal(
    isValidFeature({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [80.4, 20.3] },
      properties: { cell_id: 12 },
    }),
    true
  );

  // Missing geometry or invalid type
  assert.equal(isValidFeature({ type: 'Feature', properties: {} }), false);
  assert.equal(isValidFeature({ type: 'Feature', geometry: null }), false);
  assert.equal(isValidFeature({ type: 'NotAFeature', geometry: { type: 'Point', coordinates: [80.4, 20.3] } }), false);
  assert.equal(isValidFeature(null), false);
});

test('toSafeGeoJson: sanitizes corrupted or partial responses without fabrication', () => {
  // Null or missing input returns EMPTY_GEOJSON
  assert.deepEqual(toSafeGeoJson(null), EMPTY_GEOJSON);
  assert.deepEqual(toSafeGeoJson(undefined), EMPTY_GEOJSON);
  assert.deepEqual(toSafeGeoJson({} as any), EMPTY_GEOJSON);

  // Empty collection
  assert.deepEqual(toSafeGeoJson({ type: 'FeatureCollection', features: [] }), EMPTY_GEOJSON);

  // Collection with corrupt features (NaN coordinates, null geometry, missing fields)
  const corruptCollection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [80.4, 20.3] }, properties: { id: 1 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [NaN, 20.3] }, properties: { id: 2 } },
      { type: 'Feature', geometry: null as any, properties: { id: 3 } },
      null as any,
      { type: 'Feature', geometry: { type: 'Point', coordinates: [80.5, 999] }, properties: { id: 4 } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [81.0, 21.0] }, properties: { id: 5 } },
    ],
  };

  const safe = toSafeGeoJson(corruptCollection);
  assert.equal(safe.type, 'FeatureCollection');
  assert.equal(safe.features.length, 2);
  assert.equal((safe.features[0].properties as any).id, 1);
  assert.equal((safe.features[1].properties as any).id, 5);
});

test('extractCoordinates: recursively traverses all GeoJSON geometry types', () => {
  const geom: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[80.0, 20.0], [81.0, 20.0], [81.0, 21.0], [80.0, 21.0], [80.0, 20.0]]],
  };
  const pts = extractCoordinates(geom);
  assert.equal(pts.length, 5);
  assert.deepEqual(pts[0], [80.0, 20.0]);
});

test('computeFeatureCollectionBounds: computes padded, clamped bounds for feature sets', () => {
  const collection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [80.0, 20.0] }, properties: {} },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [81.0, 21.0] }, properties: {} },
    ],
  };

  const bounds = computeFeatureCollectionBounds(collection);
  assert.ok(bounds != null);
  const [west, south, east, north] = bounds!;
  assert.ok(west < 80.0);
  assert.ok(east > 81.0);
  assert.ok(south < 20.0);
  assert.ok(north > 21.0);
  assert.ok(west >= -180 && east <= 180 && south >= -90 && north <= 90);
});

test('computeFeatureCollectionBounds: returns undefined for empty input without fallback points', () => {
  assert.equal(computeFeatureCollectionBounds(EMPTY_GEOJSON), undefined);
  assert.equal(computeFeatureCollectionBounds(null), undefined);
});
