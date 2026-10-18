import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');

test('PWA manifest has installable icon sizes', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as { icons: Array<{ sizes: string; type: string }> };
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
});

test('PWA manifest is shipped from public/, names its icons that exist, and has a maskable icon', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) as { icons: Array<{ src: string; purpose: string }>; display: string };
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok(existsSync(join(root, 'public', icon.src)), `${icon.src} is missing`);
});

test('service worker excludes private and API paths from caching', () => {
  const worker = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.match(worker, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /pathname\.startsWith\('\/staff'\)/);
  assert.match(worker, /pathname\.startsWith\('\/app'\)/);
  assert.match(worker, /pathname\.startsWith\('\/ranger'\)/);
  assert.match(worker, /pathname\.startsWith\('\/field'\)/);
  assert.match(worker, /pathname\.startsWith\('\/ops'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen\/report'\)/);
  assert.match(worker, /pathname\.startsWith\('\/citizen\/reports'\)/);
  assert.match(worker, /pathname\.startsWith\('\/redesign\/incident'\)/);
  assert.match(worker, /if \(isPrivateOrApi\(url\)\) return/);
  assert.match(worker, /response\.redirected/);
  assert.match(worker, /url\.pathname\.startsWith\('\/assets\/'\)/);
  assert.doesNotMatch(worker, /url\.pathname\.endsWith\('\.png'\)/);
});

test('service worker serves the saved map in pieces and never stores private screens', () => {
  const worker = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.match(worker, /status: 206/);
  assert.match(worker, /Content-Range/);
  assert.match(worker, /MAP_ARCHIVE/);
  assert.match(worker, /isPrivateOrApi\(url\) && event\.request\.mode === 'navigate'/);
  assert.doesNotMatch(worker, /cache\.put\(event\.request, copy\)[^;]*\/field/);
});

test('service worker waits for the person before taking over, and keeps the files the build lists', () => {
  const worker = readFileSync(join(root, 'public/sw.js'), 'utf8');
  assert.match(worker, /\/\*BUILD\*\/.*\/\*END\*\//);
  assert.match(worker, /\/\*PRECACHE\*\/.*\/\*END\*\//);
  assert.match(worker, /SKIP_WAITING/);
  const install = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf('// A new version waits'));
  assert.doesNotMatch(install, /skipWaiting\(\)/);          // an update never takes over silently
  assert.match(install, /allSettled/);                       // one missing file does not stop an update
});
