import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

// These need the production build (run with playwright.preview.config.ts): the service worker is only stamped there.
test.describe('Installed app', () => {
  test('the service worker keeps the app ready, and pages still open with no network', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();                                                  // now the page is controlled by the worker
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    const kept = await page.evaluate(async () => {
      const names = await caches.keys();
      const shell = names.find(name => name.startsWith('terrawatch-shell-'));
      const keys = shell ? (await (await caches.open(shell)).keys()).map(request => new URL(request.url).pathname) : [];
      return { shell: shell ?? '', keys };
    });
    expect(kept.shell).toMatch(/^terrawatch-shell-[0-9a-f]{10}$/);
    expect(kept.keys.some(path => /^\/assets\/index-.*\.js$/.test(path))).toBe(true);
    expect(kept.keys.some(path => /^\/assets\/ThemeMenu-.*\.js$/.test(path))).toBe(true);   // a screen chunk, ready before it is opened
    expect(kept.keys.some(path => /MapView|maplibre-gl-worker/.test(path))).toBe(false);     // the map code waits until it is needed

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a signed-in officer opens a private screen offline and is told they are offline', async ({ page, context }) => {
    await signedInAs(page, 'field_crew', 'Officer Rao');
    await page.route('**/api/**', route => route.fulfill(json({ items: [] })));
    await page.goto('/field/tasks');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.unroute('**/api/**');
    await context.setOffline(true);
    await page.goto('/field/tasks');
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible();
    await expect(page.getByText('Offline').first()).toBeVisible();
  });

  test('private screens and API answers are never stored by the worker', async ({ page }) => {
    await signedInAs(page, 'citizen', 'Citizen');
    await page.route('**/api/**', route => route.fulfill(json({ items: [], report: null, configured: false })));
    await page.goto('/citizen/near-me');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Near me' })).toBeVisible();
    const stored = await page.evaluate(async () => {
      const all: string[] = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) all.push(new URL(request.url).pathname);
      return all;
    });
    expect(stored.filter(path => path.startsWith('/api/') || path.startsWith('/citizen'))).toEqual([]);
  });
});
