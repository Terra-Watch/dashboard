import assert from 'node:assert/strict';
import { test } from 'node:test';
import { horizonKeys, readView, satelliteConfig, writeView, VIEW_KEY } from '../src/features/outlook/view.ts';

const store = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

test('a run with one outlook has one key, an older run with two keeps both in order', () => {
  assert.deepEqual(horizonKeys({ '48': {} }), [48]);
  assert.deepEqual(horizonKeys({ '48': {}, '24': {} }), [24, 48]);
  assert.deepEqual(horizonKeys(undefined), []);
});

test('the map view defaults to dark terrain and a saved satellite choice needs satellite to be set up', () => {
  assert.equal(readView(null, false), 'dark');
  assert.equal(readView(store({ [VIEW_KEY]: 'light' }), false), 'light');
  assert.equal(readView(store({ [VIEW_KEY]: 'satellite' }), false), 'dark');
  assert.equal(readView(store({ [VIEW_KEY]: 'satellite' }), true), 'satellite');
  const s = store(); writeView(s, 'light'); assert.equal(readView(s, false), 'light');
  assert.equal(readView({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} }, true), 'dark');
});

test('satellite needs the opt-in, a tile address and an attribution', () => {
  assert.equal(satelliteConfig({}), null);
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.jpg' }), null);
  const c = satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: 'https://tiles.example/{z}/{x}/{y}.jpg', VITE_SATELLITE_ATTRIBUTION: 'Example', VITE_SATELLITE_MAX_ZOOM: '17' });
  assert.deepEqual([c?.attribution, c?.maxZoom], ['Example', 17]);
});
