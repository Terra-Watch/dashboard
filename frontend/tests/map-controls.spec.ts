import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('operational map exposes a metric scale and north-orientation control', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    (window as unknown as { __requestedDetectionFeed: boolean }).__requestedDetectionFeed = false;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname.endsWith('/api/risk/geojson')) {
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [81.5, 20.3] }, properties: { cell_id: 1, state: 'OD', rank_percentile: 99, band: 'Very high' } }],
        }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } });
      }
      if (url.pathname.endsWith('/api/redesign/detections')) {
        (window as unknown as { __requestedDetectionFeed: boolean }).__requestedDetectionFeed = true;
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  });

  await page.goto('/redesign/today');
  const map = page.getByTestId('map-shell');
  await expect(map).toHaveAttribute('data-map-idle', 'true', { timeout: 15_000 });
  await expect(map.locator('.maplibregl-ctrl-scale')).toBeVisible();
  await expect(map.locator('.maplibregl-ctrl-scale')).toContainText(/m|km/);
  await expect(map.getByRole('button', { name: /rotate map.*reset north/i })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __requestedDetectionFeed: boolean }).__requestedDetectionFeed)).toBe(false);
});

test('map reports PMTiles source failure instead of treating idle as a rendered map', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname.endsWith('/api/risk/geojson')) {
        return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/geo+json' },
        });
      }
      if (url.pathname.endsWith('/api/redesign/detections')) {
        return new Response(JSON.stringify({
          items: [{ id: 'map-test', lat: 20.3, lon: 81.5, label: 'Saved example', status: 'review' }],
          sample_data: true,
          note: 'Test fixture',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  });
  let pmtilesRequestBlocked = false;
  await page.route('**/*', (route) => {
    if (route.request().url().includes('/tiles/resq-basemap.pmtiles')) {
      pmtilesRequestBlocked = true;
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('/redesign/watch');
  const map = page.getByTestId('map-shell');
  await expect(map).toBeVisible();
  await expect.poll(() => pmtilesRequestBlocked).toBe(true);
  await expect(map.getByRole('alert')).toContainText('Map tiles or style could not be rendered.');
  await expect(map).toHaveAttribute('data-map-state', 'error');
  await expect(map).toHaveAttribute('data-map-idle', 'false');
});
