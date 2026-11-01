import assert from 'node:assert/strict';
import test from 'node:test';
import { hintsFor, laplacianVariance } from '../src/lib/photoCoach.ts';

const W = 64, H = 48;
const flat = (value: number) => new Float32Array(W * H).fill(value);
const checker = () => Float32Array.from({ length: W * H }, (_, i) => ((i % W) + Math.floor(i / W)) % 2 ? 200 : 60);

test('a flat picture has no detail and a checkerboard has plenty', () => {
  assert.equal(laplacianVariance(flat(120), W, H), 0);
  assert.ok(laplacianVariance(checker(), W, H) > 1000);
});
test('a sharp, well lit, large photo gets no hint', () => assert.deepEqual(hintsFor(checker(), W, H, 3000), []));
test('a flat picture is called soft', () => assert.deepEqual(hintsFor(flat(120), W, H, 3000), ['soft']));
test('a very dark picture is called dark (and soft if it has no detail)', () => assert.deepEqual(hintsFor(flat(10), W, H, 3000), ['dark', 'soft']));
test('a very bright picture is called bright', () => assert.deepEqual(hintsFor(flat(245), W, H, 3000), ['bright', 'soft']));
test('a small photo is called small', () => assert.deepEqual(hintsFor(checker(), W, H, 480), ['small']));
test('a night photo with detail is only dark, not soft', () => {
  const night = Float32Array.from(checker(), v => v * 0.1);
  assert.deepEqual(hintsFor(night, W, H, 3000).filter(h => h !== 'soft'), ['dark']);
});
