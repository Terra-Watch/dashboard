import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');

test('PWA manifest has installable icon sizes', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8')) as { icons: Array<{ sizes: string; type: string }> };
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
});

test('service worker excludes private and API paths from caching', () => {
  const worker = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.match(worker, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /pathname\.startsWith\('\/staff'\)/);
  assert.match(worker, /pathname\.startsWith\('\/app'\)/);
  assert.match(worker, /pathname\.startsWith\('\/ranger'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen\/report'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen\/reports'\)/);
  assert.match(worker, /pathname\.startsWith\('\/redesign\/incident'\)/);
  assert.match(worker, /if \(isPrivateOrApi\(url\)\) return/);
  assert.match(worker, /response\.redirected/);
  assert.match(worker, /url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.doesNotMatch(worker, /url\.pathname\.endsWith\('\.png'\)/);
});
