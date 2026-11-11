import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ON, byGroup, groupCounts, groupName, groupOf, reasonWords, symbolOfGroup, visible } from '../src/features/ops/satelliteGroups.ts';

const t = (_k: string, d: string) => d;
const items = [{ id: 1, quality_group: 'known_source' as const }, { id: 2, quality_group: 'likely' as const }, { id: 3 }, { id: 4, quality_group: 'unconfirmed' as const }, { id: 5, quality_group: 'outside_forest' as const }, { id: 6, quality_group: 'likely' as const }];

test('a detection without a group is ungrouped, and nothing is lost when counting', () => {
  assert.equal(groupOf({}), 'ungrouped');
  const c = groupCounts(items); assert.deepEqual(c, { likely: 2, unconfirmed: 1, ungrouped: 1, known_source: 1, outside_forest: 1 }); assert.equal(Object.values(c).reduce((a, b) => a + b, 0), items.length);
});

test('by default the operator sees likely, unconfirmed and unsorted detections; known sources and outside forest are one tap away', () => {
  assert.deepEqual(visible(items, DEFAULT_ON).map(i => i.id), [2, 3, 4, 6]);
  assert.deepEqual(byGroup(visible(items, DEFAULT_ON)).map(i => i.id), [2, 6, 4, 3]);                 // likely first, then unconfirmed, then unsorted
  assert.equal(visible(items, new Set(['known_source', 'outside_forest'] as const)).length, 2);
});

test('each group has a name, a map symbol of its own and reasons in words', () => {
  assert.equal(groupName('known_source', t), 'Known heat source'); assert.equal(symbolOfGroup('likely'), 'signal_likely'); assert.equal(symbolOfGroup('unconfirmed'), 'signal'); assert.equal(symbolOfGroup('outside_forest'), 'signal_source');
  assert.deepEqual(reasonWords(['seen_again', 'weird'], t), ['seen again on a later satellite pass', 'weird']); assert.deepEqual(reasonWords(null, t), []);
});
