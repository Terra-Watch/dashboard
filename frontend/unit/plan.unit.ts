import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_FORM, isOutdated, parsePlan, reachTable, runPlan, msToKmh } from '../src/features/scenarios/plan.ts';

const start = { lat: 20.3, lon: 85.8 };
const filled = { ros: '1.5', windKmh: '20', windFrom: '270', hours: '6', speedPct: '20', dirDeg: '20', rosPct: '30' };

test('nothing is assumed: an empty form is refused with a message for every field', () => {
  const r = parsePlan(EMPTY_FORM, start);
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), Object.keys(EMPTY_FORM).sort());
});

test('a complete form runs, shows the hours up to the chosen one and the outer band reaches at least as far as the typed inputs', () => {
  const r = parsePlan(filled, start);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.plan.hours, [1, 3, 6]);
  const rows = reachTable(start, runPlan(r.plan));
  assert.equal(rows.length, 3);
  for (const row of rows) { assert.ok(row.outerKm >= row.nominalKm - 1e-9); assert.ok(row.nominalKm > 0); }
  assert.ok(rows[2].nominalKm > rows[0].nominalKm);
});

test('zero or negative rate of spread, and out-of-range direction, are refused', () => {
  for (const bad of [{ ros: '0' }, { ros: '-1' }, { windFrom: '400' }, { hours: '5' }, { speedPct: '100' }]) {
    assert.equal(parsePlan({ ...filled, ...bad }, start).ok, false, JSON.stringify(bad));
  }
});

test('a run is outdated once any input changes, or when the wind reading it used becomes older than the limit', () => {
  const ran = { form: filled, windAt: '2026-10-16T06:00:00Z' };
  assert.equal(isOutdated(null, filled, 120), false);
  assert.equal(isOutdated(ran, filled, 120, Date.parse('2026-10-16T07:00:00Z')), false);
  assert.equal(isOutdated(ran, filled, 120, Date.parse('2026-10-16T09:00:00Z')), true);
  assert.equal(isOutdated(ran, { ...filled, windKmh: '25' }, 120, Date.parse('2026-10-16T06:10:00Z')), true);
  assert.equal(isOutdated({ form: filled }, filled, 120, Date.parse('2030-01-01T00:00:00Z')), false);
});

test('metres per second convert to km/h', () => assert.equal(msToKmh(5), 18));
