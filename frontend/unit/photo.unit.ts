import assert from 'node:assert/strict';
import test from 'node:test';
import { fitWithin } from '../src/lib/photo.ts';

test('a large landscape photo is scaled so the long side is 1600 and the shape is kept', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
});
test('a portrait photo is scaled by its height', () => {
  assert.deepEqual(fitWithin(3000, 4000), { width: 1200, height: 1600 });
});
test('a small photo is never enlarged', () => {
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});
test('a very thin image keeps at least one pixel on each side', () => {
  assert.deepEqual(fitWithin(10000, 1), { width: 1600, height: 1 });
});
