import assert from 'node:assert/strict';
import test from 'node:test';
import { groupClaims, type Claim } from '../src/features/map/corroboration.ts';
import { ScenarioInputError, destinationPoint } from '../src/features/scenarios/engine/index.ts';

const o = { lat: 20.3, lon: 80.4 };
const T0 = Date.parse('2026-05-01T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60000).toISOString();
const claim = (id: string, kind: Claim['kind'], bearing: number, km: number, min: number): Claim => ({
  id, kind, ...destinationPoint(o, bearing, km), at: at(min),
});
const th = { radiusKm: 2, windowMinutes: 40 };

test('three reports + one signal within 2 km / 40 min form one group', () => {
  const claims = [
    claim('r1', 'report', 0, 0.5, 0),
    claim('r2', 'report', 90, 1, 10),
    claim('r3', 'report', 180, 1.5, 25),
    claim('s1', 'signal', 270, 0.8, 30),
  ];
  const g = groupClaims(claims, th);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['r1', 'r2', 'r3', 's1']);
  assert.deepEqual(g[0].summary, { reports: 3, signals: 1, incidents: 0 });
  assert.deepEqual(g[0].kinds, { report: 3, signal: 1, incident: 0 });
  assert.equal(g[0].earliest, at(0));
  assert.equal(g[0].latest, at(30));
  assert.ok(Math.abs(g[0].centre.lat - 20.3) < 0.02);
  assert.ok(!('verified' in g[0]));
});

test('far or old claims stay separate', () => {
  const g = groupClaims(
    [claim('a', 'report', 0, 0, 0), claim('far', 'report', 0, 3, 5), claim('old', 'signal', 0, 0.5, 90)],
    th,
  );
  assert.equal(g.length, 3);
  assert.ok(g.every((x) => x.ids.length === 1));
});

test('threshold boundaries are inclusive', () => {
  const g = groupClaims([claim('a', 'report', 0, 0, 0), claim('b', 'report', 0, 1.999, 40)], th);
  assert.equal(g.length, 1);
});

test('transitive chain: ends are 4 km / 80 min apart but linked through the middle', () => {
  const g = groupClaims(
    [claim('c', 'report', 90, 4, 80), claim('a', 'report', 90, 0, 0), claim('b', 'signal', 90, 2, 40)],
    { radiusKm: 2.01, windowMinutes: 40 },
  );
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['a', 'b', 'c']);
});

test('order: size desc, then latest desc; deterministic under input permutation; no mutation', () => {
  const claims = [
    claim('x1', 'report', 0, 0, 0),
    claim('big1', 'report', 90, 20, 0),
    claim('big2', 'signal', 90, 20.5, 5),
    claim('solo-new', 'incident', 180, 30, 600),
    claim('solo-old', 'report', 270, 40, 100),
  ];
  const frozen = JSON.stringify(claims);
  const a = groupClaims(claims, th);
  assert.equal(JSON.stringify(claims), frozen);
  assert.deepEqual(a.map((g) => g.ids), [['big1', 'big2'], ['solo-new'], ['solo-old'], ['x1']]);
  const b = groupClaims([...claims].reverse(), th);
  assert.deepEqual(b, a);
  groupClaims(Object.freeze(claims.map((c) => Object.freeze({ ...c }))), th); // frozen input is fine
});

test('thresholds are required: missing, zero or non-finite throw', () => {
  const cs = [claim('a', 'report', 0, 0, 0)];
  assert.throws(() => groupClaims(cs, undefined as never), ScenarioInputError);
  assert.throws(() => groupClaims(cs, {} as never), ScenarioInputError);
  assert.throws(() => groupClaims(cs, { radiusKm: 2 } as never), ScenarioInputError);
  assert.throws(() => groupClaims(cs, { radiusKm: 2, windowMinutes: 0 }), ScenarioInputError);
  assert.throws(() => groupClaims(cs, { radiusKm: Number.NaN, windowMinutes: 5 }), ScenarioInputError);
  assert.throws(() => groupClaims([{ ...cs[0], at: 'nope' }], th), ScenarioInputError);
  assert.deepEqual(groupClaims([], th), []);
});
