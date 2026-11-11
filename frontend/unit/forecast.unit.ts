import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionsFor, areaPolygons, chanceWords, levelName, levelRank, recordWords, shareText, toneOf, usualWords, vsUsual, type Action, type Area } from '../src/features/forecast/model.ts';

const t = (_k: string, fallback: string, o: Record<string, unknown> = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o[k] ?? ''));
const area = (o: Partial<Area> = {}): Area => ({ id: 1, name: 'near Kendu', state: 'OD', lat: 20.2, lon: 85.2, bbox: [85, 20, 85.5, 20.5], cells: 10, chance: 0.62, expected_fires: 3.1, usual_fires: 1.2, usual_chance: 0.4, level: 'extreme', reliable: true, ...o });
const actions: Action[] = [{ id: 'warn', min_chance: 0.1, text: 'Warn villages.' }, { id: 'patrol', min_chance: 0.3, text: 'Add a patrol.' }, { id: 'crew', min_chance: 0.6, text: 'Keep a crew ready.' }];

test('the chance is said in plain words and never more precisely than a tenth', () => {
  assert.equal(chanceWords(0.03, t), 'less than 1 in 20'); assert.equal(chanceWords(0.07, t), 'less than 1 in 10');
  assert.equal(chanceWords(0.62, t), 'about 6 in 10'); assert.equal(chanceWords(0.95, t), 'more than 9 in 10');
});

test('levels sort from extreme down to no rating', () => {
  assert.ok(levelRank('extreme') > levelRank('high') && levelRank('high') > levelRank('moderate') && levelRank('moderate') > levelRank('none'));
  assert.equal(levelName('none', t), 'No rating');
});

test('expected fires are put against the usual for the week, and missing usual says nothing', () => {
  assert.equal(vsUsual(3.1, 1.2), 'far_above'); assert.equal(vsUsual(1.3, 1.2), 'usual'); assert.equal(vsUsual(0.5, 1.2), 'below'); assert.equal(vsUsual(2, 1.2), 'above');
  assert.equal(vsUsual(2, null), null); assert.equal(usualWords(area({ usual_fires: null }), t), null);
  assert.equal(usualWords(area(), t), 'far above usual for this week (usual: 1.2)');
});

test('each action is triggered by its own chance', () => {
  assert.deepEqual(actionsFor(area({ chance: 0.35 }), actions).map(a => a.on), [true, true, false]);
  assert.deepEqual(actionsFor(area({ chance: 0.05 }), actions).map(a => a.on), [false, false, false]);
});

test('areas with no rating are not drawn, weak-skill areas are drawn paler, and the polygon is the area box', () => {
  assert.equal(toneOf(area({ level: 'none' })), null); assert.equal(toneOf(area({ reliable: false })), 'envelope');
  assert.deepEqual([toneOf(area({ level: 'extreme' })), toneOf(area({ level: 'high' })), toneOf(area({ level: 'moderate' }))], ['cell', 'warning', 'advisory']);
  const p = areaPolygons([area(), area({ id: 2, level: 'none' })]); assert.equal(p.length, 1); assert.deepEqual(p[0].ring[0], p[0].ring[4]);
});

test('the share text carries the date, level, places and the actions that are on', () => {
  const a = area({ look: [{ cell_id: 1, lat: 1, lon: 1, chance: 0.5, place: { name: 'Kendumundi', kind: 'village', km: 2, from_place: 'N' } }, { cell_id: 2, lat: 1, lon: 1, chance: 0.4, place: null }] });
  const s = shareText(a, '2025-03-15', t, actions);
  assert.match(s, /2025-03-15 · near Kendu, OD: fire danger tomorrow is Extreme/); assert.match(s, /Places to check: Kendumundi\./); assert.match(s, /Warn villages\. Add a patrol\. Keep a crew ready\./);
});

test('yesterday record says how many High or Extreme areas had a fire, and is silent without data', () => {
  assert.equal(recordWords(undefined, t), null);
  assert.match(recordWords({ date: '2025-03-14', areas_with_fire: 295, in_high_or_extreme: 282, areas_rated_high_or_extreme: 367, of_those_with_fire: 282 }, t) as string, /282 of the 367 areas rated High or Extreme, and 282 of the 295/);
});
