import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bandsAtHour,
  destinationPoint,
  realityCheck,
  ScenarioInputError,
  type Observation,
  type ScenarioInputs,
} from '../src/features/scenarios/engine/index.ts';

const start = { lat: 20.3, lon: 80.4 };
const inputs: ScenarioInputs = { start, headRosKmh: 2, schedule: [{ fromHour: 0, windKmh: 16.09344, windFromDeg: 270 }] };
const outer = bandsAtHour(inputs, { windSpeedPct: 0.2, windDirDeg: 10, rosPct: 0.2 }, 3).outer; // east reach 6.40 km at 3 h (Python golden)
const obs = (kind: Observation['kind'], bearing: number, km: number): Observation => ({
  ...destinationPoint(start, bearing, km),
  observedAt: '2026-05-01T10:00:00Z',
  kind,
});

test('all observations inside the outer band => consistent', () => {
  const r = realityCheck(outer, [obs('field', 90, 5), obs('signal', 90, 3), obs('report', 90, 1)]);
  assert.equal(r.status, 'consistent');
  assert.deepEqual(r.outside, []);
});

test('a field observation outside => unreliable and listed', () => {
  const o = [obs('field', 90, 5), obs('field', 90, 7.5), obs('signal', 180, 3)];
  const r = realityCheck(outer, o);
  assert.equal(r.status, 'unreliable');
  assert.deepEqual(r.outside, [o[1], o[2]]); // 6.40 km east limit; 3 km south is outside too
  assert.deepEqual(r.outsideByKind, { signal: 1, field: 1, report: 0 });
});

test('signal or report outside alone: listed, status consistent unless the kinds are escalated', () => {
  const o = [obs('signal', 90, 9), obs('report', 270, 3)];
  const r = realityCheck(outer, o);
  assert.equal(r.outside.length, 2);
  assert.equal(r.status, 'consistent');
  assert.equal(realityCheck(outer, o, ['field', 'signal']).status, 'unreliable');
});

test('inputs untouched; bad coordinates rejected', () => {
  const o = [obs('field', 90, 9)];
  const copy = JSON.stringify(o);
  realityCheck(outer, o);
  assert.equal(JSON.stringify(o), copy);
  assert.throws(() => realityCheck(outer, [{ ...o[0], lat: 100 }]), ScenarioInputError);
  assert.equal(realityCheck(outer, []).status, 'consistent');
});
