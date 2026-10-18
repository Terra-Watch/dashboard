import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessExposure,
  bandsAtHour,
  bandsAtHours,
  destinationPoint,
  growEllipse,
  haversineKm,
  nestedEnvelopes,
  pointInPolygon,
  polygonAreaKm2,
  ScenarioInputError,
  windShift,
  type Asset,
  type GeoPolygon,
  type ScenarioInputs,
} from '../src/features/scenarios/engine/index.ts';

const start = { lat: 20.3, lon: 80.4 };
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const calm: ScenarioInputs = {
  start,
  headRosKmh: 2,
  schedule: [{ fromHour: 0, windKmh: 16.09344, windFromDeg: 270 }], // 10 mph from the west, heading east
};
const maxDist = (p: GeoPolygon) => Math.max(...p.coordinates[0].map(([lon, lat]) => haversineKm(start, { lat, lon })));

test('constant wind: envelope at 3 h equals the single ellipse (head 6 km)', () => {
  const env = nestedEnvelopes(calm, [3]);
  near(maxDist(env[0].polygon), 6, 1e-6);
  const single = growEllipse({ headRosKmh: 2, midflameWindKmh: 16.09344, windFromDeg: 270, hours: 3, start });
  near(polygonAreaKm2(env[0].polygon), polygonAreaKm2(single.polygon), 0.3); // different vertex grids, same ellipse
});

test('nested envelopes at 1,3,6,12,24 h grow with head = R*t (golden 2,6,12,24,48 km)', () => {
  const env = nestedEnvelopes(calm);
  assert.deepEqual(env.map((e) => e.hour), [1, 3, 6, 12, 24]);
  env.forEach((e, i) => near(maxDist(e.polygon), 2 * e.hour, 1e-6 + 0 * i));
  for (let i = 1; i < env.length; i++) {
    // every vertex of the smaller envelope lies inside the larger one
    for (const [lon, lat] of env[i - 1].polygon.coordinates[0]) {
      assert.ok(pointInPolygon({ lat, lon }, env[i].polygon) || haversineKm(start, { lat, lon }) < 0.5);
    }
    assert.ok(polygonAreaKm2(env[i].polygon) > polygonAreaKm2(env[i - 1].polygon));
  }
});

test('shifting wind: union of per-segment ellipses from the ignition (documented upper bound)', () => {
  // wind from west (heading east) until hour 3, then from north (heading south)
  const shifted = { ...calm, headRosKmh: 1.5, schedule: windShift([{ fromHour: 0, windKmh: 16.09344, windFromDeg: 270 }], { atHour: 3, windFromDeg: 0 }) };
  // Hour 2: only the first segment => head east 3 km
  near(maxDist(nestedEnvelopes(shifted, [2])[0].polygon), 3, 1e-6);
  // Hour 6: segment 1 head 1.5*3 = 4.5 km east; segment 2 head 1.5*6 = 9 km south
  const p6 = nestedEnvelopes(shifted, [6])[0].polygon;
  const reach = (b: number) => {
    let best = 0;
    for (let d = 0.05; d < 12; d += 0.05) if (pointInPolygon(destinationPoint(start, b, d), p6)) best = d;
    return best;
  };
  assert.ok(Math.abs(reach(180) - 9) < 0.1, String(reach(180)));
  assert.ok(Math.abs(reach(90) - 4.5) < 0.1, String(reach(90)));
  // north: max(segment 1 flank 4.5/6*0.4012 = 0.3009, segment 2 back 9/28.9075 = 0.311 km) = 0.311 (Python golden)
  assert.ok(Math.abs(reach(0) - 0.3113) < 0.06, String(reach(0)));
});

test('bad envelope inputs are typed errors', () => {
  assert.throws(() => nestedEnvelopes({ ...calm, headRosKmh: 0 }), ScenarioInputError);
  assert.throws(() => nestedEnvelopes(calm, [3, 1]), ScenarioInputError);
  assert.throws(() => nestedEnvelopes({ ...calm, schedule: [] }), ScenarioInputError);
});

const unc = { windSpeedPct: 0.2, windDirDeg: 10, rosPct: 0.2 };

test('bands: outer contains nominal and inner; golden eastward reach per hour', () => {
  const b = bandsAtHour(calm, unc, 6);
  const grid: { lat: number; lon: number }[] = [];
  for (let brg = 0; brg < 360; brg += 7.5) for (let d = 0.05; d < 15; d += 0.25) grid.push(destinationPoint(start, brg, d));
  let nIn = 0;
  for (const p of grid) {
    if (pointInPolygon(p, b.nominal)) { nIn++; assert.ok(pointInPolygon(p, b.outer), 'nominal point outside outer'); }
    if (pointInPolygon(p, b.inner)) assert.ok(pointInPolygon(p, b.outer), 'inner point outside outer');
  }
  assert.ok(nIn > 100);
  assert.ok(polygonAreaKm2(b.outer) > polygonAreaKm2(b.nominal));
  // Python golden, hour 6, due east (bearing 90): outer 12.796 km, inner 8.531 km
  const reach = (poly: GeoPolygon, brg: number) => {
    let best = 0;
    for (let d = 0.01; d < 20; d += 0.01) if (pointInPolygon(destinationPoint(start, brg, d), poly)) best = d;
    return best;
  };
  assert.ok(Math.abs(reach(b.outer, 90) - 12.796) < 0.03, String(reach(b.outer, 90)));
  assert.ok(Math.abs(reach(b.inner, 90) - 8.5307) < 0.03, String(reach(b.inner, 90)));
});

test('uncertainty validation', () => {
  assert.throws(() => bandsAtHour(calm, { ...unc, windSpeedPct: 1 }, 3), ScenarioInputError);
  assert.throws(() => bandsAtHour(calm, { ...unc, windDirDeg: -1 }, 3), ScenarioInputError);
  assert.throws(() => bandsAtHour(calm, { ...unc, rosPct: Number.NaN }, 3), ScenarioInputError);
});

test('exposure: village downwind (east, 5 km) vs upwind (west)', () => {
  // Wind from the west blows the fire toward the east, so the "east" village is downwind.
  // Python golden radii at bearing 90 / 270 (outer, inner): 1h 2.13/1.42 | 3h 6.40/4.27 | 6h 12.80/8.53 | 24h 51.2/34.1
  // west: 12h 1.657/1.105, 24h 3.315/2.210
  const bands = bandsAtHours(calm, unc, [1, 3, 6, 12, 24]);
  const assets: Asset[] = [
    { id: 'w2', name: 'Upwind far', kind: 'village', ...destinationPoint(start, 270, 4) },
    { id: 'w1', name: 'Upwind near', kind: 'village', ...destinationPoint(start, 270, 2.5) },
    { id: 'e1', name: 'East village', kind: 'village', ...destinationPoint(start, 90, 5) },
  ];
  const out = assessExposure(bands, assets);
  assert.deepEqual(out.map((o) => o.asset.id), ['e1', 'w1', 'w2']);
  assert.equal(out[0].earliestInOuterHour, 3); // outer 6.40 > 5 at 3 h, 2.13 < 5 at 1 h
  assert.equal(out[0].earliestInInnerHour, 6); // inner 4.27 < 5 at 3 h, 8.53 > 5 at 6 h
  assert.equal(out[1].earliestInOuterHour, 24); // outer 1.66 < 2.5 at 12 h, 3.31 > 2.5 at 24 h
  assert.equal(out[1].earliestInInnerHour, null); // inner 2.21 < 2.5 at 24 h
  assert.equal(out[2].earliestInOuterHour, null); // 4 km upwind never reached (3.31 km max)
  assert.equal(out[2].earliestInInnerHour, null);
  // determinism: reversed input gives the same order
  assert.deepEqual(assessExposure(bands, [...assets].reverse()).map((o) => o.asset.id), ['e1', 'w1', 'w2']);
});
