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
