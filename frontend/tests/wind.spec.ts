import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const grid = {
  lats: [14, 20, 28], lons: [73, 80, 89], u: [[4, 4, 4], [4, 4, 4], [4, 4, 4]], v: [[2, 2, 2], [2, 2, 2], [2, 2, 2]],
  valid_time: new Date().toISOString(), freshness: { source: 'open-meteo', fetched_at: new Date().toISOString(), age_seconds: 300, stale: null },
};

test.describe('Animated wind on the Control Room map', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1250 });
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', r => r.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/incidents', r => r.fulfill(json([])));
    await page.route('**/api/hotspots**', r => r.fulfill(json({ items: [], freshness: grid.freshness })));
    await page.route('**/api/weather/context**', r => r.fulfill(json({ wind_speed_ms: 4.5, wind_dir_deg: 225, valid_time: new Date().toISOString(), freshness: grid.freshness })));
    await page.route('**/api/weather/wind-grid**', r => r.fulfill(json(grid)));
    await page.route('**/api/notices**', r => r.fulfill(json({ items: [] })));
  });

  test('particles are drawn over the map and removed when the toggle is switched off', async ({ page }) => {
    await page.goto('/ops/map');
    await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    const overlay = page.locator('canvas[aria-hidden="true"]');
    await expect(overlay).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
      const c = document.querySelector('canvas[aria-hidden="true"]') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
      return n;
    }), { timeout: 10000 }).toBeGreaterThan(500);
    await page.getByLabel('Animated wind').uncheck();
    await expect(overlay).toHaveCount(0);
  });
});

test('weather icons: an icon and temperature per grid point, with words for screen readers, and removed with the toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1250 });
  await signedInAs(page, 'incident_commander', 'Lead Rao');
  const rich = { ...grid, code: [[63, 63, 63], [0, 0, 0], [95, 95, 95]], temp: [[24.4, 24.4, 24.4], [31, 31, 31], [19, 19, 19]], precip: [[1, 1, 1], [0, 0, 0], [3, 3, 3]], is_day: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] };
  await page.route('**/api/ops/settings', r => r.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false })));
  await page.route('**/api/incidents', r => r.fulfill(json([])));
  await page.route('**/api/hotspots**', r => r.fulfill(json({ items: [], freshness: grid.freshness })));
  await page.route('**/api/weather/context**', r => r.fulfill(json({ wind_speed_ms: 4.5, wind_dir_deg: 225, valid_time: new Date().toISOString(), freshness: grid.freshness })));
  await page.route('**/api/weather/wind-grid**', r => r.fulfill(json(rich)));
  await page.route('**/api/notices**', r => r.fulfill(json({ items: [] })));
  await page.goto('/ops/map');
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
  const icons = page.locator('.maplibregl-marker[role="img"]');
  await expect(icons.first()).toBeVisible();
  expect(await icons.count()).toBe(9);
  await expect(page.locator('[aria-label="Rain, 24 degrees, 1 millimetres of rain"]').first()).toHaveCount(1);
  await page.getByLabel('Weather icons').uncheck();
  await expect(icons).toHaveCount(0);
});
