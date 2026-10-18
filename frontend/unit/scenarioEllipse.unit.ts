import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScenarioInputError,
  bearingDeg,
  destinationPoint,
  ellipseMetrics,
  growEllipse,
  haversineKm,
  headBackRatio,
  kmhToMph,
  lengthToBreadth,
  parseWindInput,
  polygonAreaKm2,
  pointInPolygon,
  windAt,
  windSegments,
  windShift,
  type EllipseInput,
} from '../src/features/scenarios/engine/index.ts';

const start = { lat: 20.3, lon: 80.4 };
const base: EllipseInput = { headRosKmh: 2, midflameWindKmh: 0, windFromDeg: 270, hours: 3, start };
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Golden values below were computed independently in Python with the same formulas:
//   LB(U) = 0.936 e^(0.2566U) + 0.461 e^(-0.1548U) - 0.397, U in m/s (= km/h / 3.6)
//   e = sqrt(LB^2-1)/LB; back = head(1-e)/(1+e); a = (head+back)/2; b = a/LB; latus = a/LB^2
test('zero wind: LB = 1 and the fire is a circle of radius R*t', () => {
  near(lengthToBreadth(0), 1, 1e-12);
  const g = growEllipse(base);
  near(g.headKm, 6);
  near(g.backKm, 6);
  near(g.flankKm, 6);
  near(g.hb, 1);
  for (const [lon, lat] of g.polygon.coordinates[0]) near(haversineKm(start, { lat, lon }), 6, 1e-6);
  near(polygonAreaKm2(g.polygon), Math.PI * 36, 0.5); // 113.097 for a true circle; 72-gon is 0.2% smaller
});

test('10 mph (16.09344 km/h): LB, HB, back, flank (golden)', () => {
  assert.ok(Math.abs(kmhToMph(16.09344) - 10) < 1e-12);
  near(lengthToBreadth(16.09344), 2.781282500951872, 1e-9);
  const m = ellipseMetrics({ ...base, midflameWindKmh: 16.09344 });
  near(m.lb, 2.781282500951872, 1e-9);
  near(m.eccentricity, 0.9331272232886689, 1e-9);
  near(m.hb, 28.907536345221253, 1e-8);
  near(m.headKm, 6, 1e-12);
  near(m.backKm, 0.20755833109907573, 1e-9);
  near(m.semiMajorKm, 3.103779165549538, 1e-9);
  near(m.flankKm, 1.1159525019437235, 1e-9);
  near(m.flankFromIgnitionKm, 0.401236660267987, 1e-9);
  near(m.headKm / m.backKm, m.hb, 1e-8);
  near(headBackRatio(m.lb), m.hb, 1e-12);
});

test('36 km/h (10 m/s): LB 11.88, HB 562.7', () => {
  const m = ellipseMetrics({ ...base, midflameWindKmh: 36 });
  near(m.lb, 11.88183314097161, 1e-9);
  near(m.hb, 562.7100580454409, 1e-6);
  near(m.backKm, 0.010662684830693799, 1e-9);
});

test('polygon: head points downwind, distances match the metrics', () => {
  // wind FROM 270 (west) blows toward the east: heading 90
  const g = growEllipse({ ...base, midflameWindKmh: 16.09344 });
  assert.equal(g.headingDeg, 90);
  const ring = g.polygon.coordinates[0];
  assert.equal(ring.length, 73); // 72 vertices + closing point
  assert.deepEqual(ring[0], ring[72]);
  // vertex 0 is the head, 18 is +90 deg (flank), 36 is the back
  const at = (i: number) => ({ lon: ring[i][0], lat: ring[i][1] });
  near(haversineKm(start, at(0)), 6, 1e-6);
  near(bearingDeg(start, at(0)), 90, 1e-6);
  near(haversineKm(start, at(36)), 0.20755833109907573, 1e-6);
  near(haversineKm(start, at(18)), 0.401236660267987, 1e-6);
  // the ignition point is inside, a point 3 km downwind is inside, 3 km upwind is not
  assert.ok(pointInPolygon(start, g.polygon));
  assert.ok(pointInPolygon(destinationPoint(start, 90, 3), g.polygon));
  assert.ok(!pointInPolygon(destinationPoint(start, 270, 3), g.polygon));
  // area close to pi*a*b = 10.8814 km2 (inscribed 72-gon is slightly smaller)
  const area = polygonAreaKm2(g.polygon);
  assert.ok(area > 10.2 && area < 10.89, String(area));
});

test('destinationPoint and haversine agree (due north 111.19508 km (R=6371.0088) = 1 degree)', () => {
  const p = destinationPoint({ lat: 0, lon: 0 }, 0, (Math.PI / 180) * 6371.0088);
  near(p.lat, 1, 1e-9);
  near(p.lon, 0, 1e-9);
});

test('custom vertex count and rejected vertex counts', () => {
  assert.equal(growEllipse(base, 36).polygon.coordinates[0].length, 37);
  assert.throws(() => growEllipse(base, 4), ScenarioInputError);
});

test('inputs are rejected with typed errors; no default for head ROS', () => {
  const code = (fn: () => unknown) => {
    try { fn(); } catch (e) { return (e as ScenarioInputError).code; }
    return 'none';
  };
  assert.equal(code(() => growEllipse({ ...base, headRosKmh: 0 })), 'invalid_ros');
  assert.equal(code(() => growEllipse({ ...base, headRosKmh: -1 })), 'invalid_ros');
  assert.equal(code(() => growEllipse({ ...base, headRosKmh: Number.NaN })), 'invalid_ros');
  assert.equal(code(() => growEllipse({ ...base, headRosKmh: Infinity })), 'invalid_ros');
  assert.equal(code(() => growEllipse({ ...base, headRosKmh: undefined as unknown as number })), 'invalid_ros');
  assert.equal(code(() => growEllipse({ ...base, midflameWindKmh: -1 })), 'invalid_wind_speed');
  assert.equal(code(() => growEllipse({ ...base, windFromDeg: 361 })), 'invalid_wind_direction');
  assert.equal(code(() => growEllipse({ ...base, hours: 0 })), 'invalid_hours');
  assert.equal(code(() => growEllipse({ ...base, start: { lat: 91, lon: 0 } })), 'invalid_position');
});

test('wind schedule: parse, windAt, windShift, segments', () => {
  assert.deepEqual(parseWindInput({ windKmh: '12.5', windFromDeg: 360 }), { windKmh: 12.5, windFromDeg: 0 });
  assert.throws(() => parseWindInput({ windKmh: '', windFromDeg: 10 }), ScenarioInputError);
  assert.throws(() => parseWindInput({ windKmh: 5, windFromDeg: -1 }), ScenarioInputError);
  const s = [{ fromHour: 0, windKmh: 10, windFromDeg: 270 }];
  const shifted = windShift(s, { atHour: 3, windFromDeg: 0 });
  assert.deepEqual(shifted, [
    { fromHour: 0, windKmh: 10, windFromDeg: 270 },
    { fromHour: 3, windKmh: 10, windFromDeg: 0 },
  ]);
  assert.equal(s.length, 1); // input untouched
  assert.equal(windAt(shifted, 2.9).windFromDeg, 270);
  assert.equal(windAt(shifted, 3).windFromDeg, 0);
  assert.equal(windAt(shifted, 20).windFromDeg, 0);
  assert.deepEqual(windSegments(shifted, 6).map((x) => [x.fromHour, x.toHour]), [[0, 3], [3, 6]]);
  assert.deepEqual(windSegments(shifted, 2).map((x) => [x.fromHour, x.toHour]), [[0, 2]]);
  // identical adjacent entries merge into one segment
  const same = [...s, { fromHour: 4, windKmh: 10, windFromDeg: 270 }];
  assert.deepEqual(windSegments(same, 8).map((x) => [x.fromHour, x.toHour]), [[0, 8]]);
  assert.throws(() => windAt([{ fromHour: 1, windKmh: 1, windFromDeg: 1 }], 2), ScenarioInputError);
});
