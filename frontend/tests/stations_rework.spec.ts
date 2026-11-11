import { expect, test } from '@playwright/test';
import { json, mockCommunities, signedInAs } from './helpers';

const st = (o: object) => ({ id: 1, node_id: 1, name: 'Ridge 1', latitude: 20.3, longitude: 85.8, state: 'OD', expected_interval_s: 600, notes: '', status: 'online', age_s: 30, last_heard: new Date().toISOString(),
  temp_c: 30, humidity_pct: 40, pm25: 10, pm10: 15, battery_mv: 3900, rssi: -90, snr: 5, hops: 1, pm25_normal: 10, pm25_vs_normal: 1, last_sound: null, statement: { key: 'normal', params: {}, tone: 'ok' }, ...o });
const items = [
  st({}),
  st({ id: 2, node_id: 2, name: 'Valley 2', pm25: 40, pm25_vs_normal: 4, statement: { key: 'smoke_rising', params: { minutes: 30 }, tone: 'check' } }),
  st({ id: 3, node_id: 3, name: 'Gap 3', status: 'offline', age_s: 9000, battery_mv: 3300, statement: { key: 'silent', params: { age_s: 9000 }, tone: 'gap' } }),
];

test.describe('Stations rework', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommunities(page);
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: { radius_km: 2, window_minutes: 40 }, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/stations', route => route.fulfill(json({ label: '', items })));
    await page.route('**/api/stations/unknown', route => route.fulfill(json({ items: [{ node_id: 9, first_heard: '2026-11-10T10:00:00Z', last_heard: '2026-11-10T11:00:00Z', heard: 3, reported_lat: null, reported_lon: null }] })));
  });

  test('the list says what each station says, those needing a look first, and the Network tab lists what to visit', async ({ page }) => {
    await page.goto('/ops/stations');
    const rows = page.getByRole('list', { name: 'Stations' }).getByRole('listitem');
    await expect(rows.first()).toContainText('Valley 2');
    await expect(rows.first()).toContainText('well above this station');
    await expect(rows.nth(1)).toContainText('Silent for 3 h');
    await page.getByRole('button', { name: 'Network' }).click();
    await expect(page.getByText('Gap 3')).toBeVisible();
    await expect(page.getByText('Not reporting · Battery low')).toBeVisible();
    await expect(page.getByText(/node 9/)).toBeVisible();
  });
});
