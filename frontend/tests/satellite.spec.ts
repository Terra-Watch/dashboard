import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const now = Date.now();
const hs = (id: number, lat: number, lon: number, state: string | null, min = 30) => ({ id, satellite: 'VIIRS_NOAA20_NRT', acq_datetime: new Date(now - min * 60_000).toISOString(), latitude: lat, longitude: lon, frp: 3.5, confidence: 'nominal', forest_state: state, age_minutes: min });
const items = [...[1, 2, 3, 4, 5, 6].map(i => hs(i, 20.0 + i * 0.002, 85.0, 'OD')), hs(10, 22.5, 80.5, 'CG'), hs(11, 25.0, 77.0, null)];
const freshness = { source: 'nasa-firms', fetched_at: new Date(now).toISOString(), age_seconds: 600, stale: null };

test.describe('Satellite detections page', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/hotspots**', route => route.fulfill(json({ items, truncated: false, freshness, label: 'Satellite signal, not confirmed by a person' })));
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
  });

  test('lists every detection, groups the cluster, and filters by state', async ({ page }) => {
    await page.goto('/ops/satellite');
    await expect(page.getByRole('heading', { name: 'Satellite detections' })).toBeVisible();
    await expect(page.getByText('6 detections · OD')).toBeVisible();                  // the one cluster (5 or more in a cell)
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(8);              // header + 7 inside forest cells; the one outside is hidden
    await page.getByLabel('Forest cells only').uncheck();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(9);
    await page.getByLabel('State').selectOption('CG');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
    await expect(page.getByText('No clusters in this window.')).toBeVisible();
  });

  test('no serious accessibility violations', async ({ page }) => {
    await page.goto('/ops/satellite');
    await expect(page.getByRole('table')).toBeVisible();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
  });
});
