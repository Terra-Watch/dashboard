import { test, expect } from '@playwright/test';

const FRAME_TIMES = [
  '2024-03-10T06:00:00Z',
  '2024-03-10T12:00:00Z',
  '2024-03-10T18:00:00Z',
];

test.beforeEach(async ({ page }) => {
  // Keep this browser test hermetic: the app's service worker caches GET responses,
  // which would otherwise make API fixtures dependent on a prior browser session.
  await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: ServiceWorkerContainer }).serviceWorker; });
  await page.route('**/api/redesign/incidents/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/scenario')) return route.continue();
    const k = Number(url.searchParams.get('overpass_k') ?? 0);
    const time = FRAME_TIMES[k];
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        incident_id: 'E2023-084925', sample_data: true, uncalibrated: true,
        wind_source: url.searchParams.get('wind_source') ?? 'era5land_native',
        overpass_k: k, overpass_count: FRAME_TIMES.length,
        overpass_time_utc: time, hours_since_t0: k * 6,
        probability_bands_grid: [[k]], bounds: [83.8, 19.2, 84.1, 19.5],
        ignition: { lat: 19.3, lon: 83.9 },
        probability_bands_geojson: {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', id: `frame-${k}`, geometry: { type: 'Point', coordinates: [83.9 + k * 0.001, 19.3] }, properties: { frame: k } }],
        },
        wind_arrow: { lat: 19.3, lon: 83.9, direction_deg: 90, speed_ms: 1.2, source_time_utc: time },
        assumptions: { fuel: 'Saved example', weather: 'Past weather', terrain: 'Saved terrain' },
      }),
    });
  });
});

test('manual timeline steps select only returned frames and keep map timestamp aligned', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requestedFrames: number[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/scenario')) requestedFrames.push(Number(url.searchParams.get('overpass_k')));
  });

  await page.goto('/redesign/incident/E2023-084925');
  const grid = page.getByTestId('probability-grid');
  await expect(grid).toHaveAttribute('data-overpass-k', '0');
  await expect(grid).toHaveAttribute('data-frame-time', FRAME_TIMES[0]);
  await expect(grid).toHaveAttribute('data-wind-time', FRAME_TIMES[0]);
  await expect(page.getByTestId('scenario-frame-time')).toHaveAttribute('datetime', FRAME_TIMES[0]);

  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
  await expect(page.getByText(/Automatic playback is off/)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(grid).toHaveAttribute('data-overpass-k', '1');
  await expect(grid).toHaveAttribute('data-frame-time', FRAME_TIMES[1]);
  await expect(grid).toHaveAttribute('data-wind-time', FRAME_TIMES[1]);
  await expect(page.getByTestId('scenario-frame-time')).toHaveAttribute('datetime', FRAME_TIMES[1]);
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(grid).toHaveAttribute('data-overpass-k', '0');
  expect(requestedFrames).toContain(1);
});

test('play advances through saved frames and pauses at the last available frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/redesign/incident/E2023-084925');
  const grid = page.getByTestId('probability-grid');
  await expect(grid).toHaveAttribute('data-overpass-k', '0');

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(grid).toHaveAttribute('data-overpass-k', '1', { timeout: 5_000 });
  await expect(grid).toHaveAttribute('data-frame-time', FRAME_TIMES[1]);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(1300);
  await expect(grid).toHaveAttribute('data-overpass-k', '1');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(grid).toHaveAttribute('data-overpass-k', '2', { timeout: 5_000 });
  await expect(grid).toHaveAttribute('data-frame-time', FRAME_TIMES[2]);
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
});
