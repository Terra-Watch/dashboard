import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const now = Date.now();
const incident = (over: object = {}) => ({ id: 21, source: 'citizen', size: 'unknown', notes: 'Smoke over the ridge', status: 'verified', close_reason: null, state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: new Date(now - 3_600_000).toISOString(), created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now).toISOString(), ...over });
const freshness = { source: 'nasa-firms', fetched_at: new Date(now).toISOString(), age_seconds: 600, stale: null };

test.describe('Control Room map', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/incidents', route => route.fulfill(json([incident(), incident({ id: 22, status: 'reported', latitude: 20.5, longitude: 85.9 }), incident({ id: 23, status: 'closed' }), incident({ id: 24, created_at: new Date(now - 30 * 3_600_000).toISOString(), latitude: 20.1, longitude: 85.5 })])));
    await page.route('**/api/hotspots**', route => route.fulfill(json({ items: [{ id: 1, satellite: 'VIIRS_SNPP_NRT', acq_datetime: new Date(now - 600_000).toISOString(), latitude: 20.31, longitude: 85.81, frp: 4, age_minutes: 10 }], freshness, label: 'x' })));
    await page.route('**/api/weather/context**', route => route.fulfill(json({ wind_speed_ms: 4.5, wind_dir_deg: 225, valid_time: new Date(now).toISOString(), freshness: { source: 'open-meteo', fetched_at: new Date(now).toISOString(), age_seconds: 120, stale: null } })));
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
  });

  test('shows only what belongs: closed incidents and old ones stay off, the window widens on request', async ({ page }) => {
    await page.goto('/ops/map');
    const map = page.getByTestId('map');
    await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await expect(map).toHaveAttribute('data-points', '3');            // verified #21, report #22, one satellite signal; not closed #23, not the 30-hour-old #24
    await page.getByRole('button', { name: '72 h' }).click();
    await expect(map).toHaveAttribute('data-points', '4');
    await page.getByRole('button', { name: '6 h' }).click();
    await expect(map).toHaveAttribute('data-points', '3');
  });

  test('the legend explains every symbol in words and shapes; wind and source freshness are stated', async ({ page }) => {
    await page.goto('/ops/map');
    const legend = page.getByTestId('legend');
    for (const word of ['Satellite signal', 'Report, not checked', 'Verified', 'Responding', 'Contained']) await expect(legend.getByText(word, { exact: true })).toBeVisible();
    await expect(legend.getByText('Heat seen from space. No person has checked it.')).toBeVisible();
    await expect(page.getByText('Wind 4.5 m/s from 225°')).toBeVisible();
    await expect(page.getByText(/Satellite · 10 min/)).toBeVisible();
    await expect(page.getByText(/Weather · 2 min/)).toBeVisible();
  });

  test('the same items are listed for people who cannot use a map; choosing one opens its panel and link', async ({ page }) => {
    await page.goto('/ops/map');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const list = page.getByTestId('map-list');
    await expect(list.getByRole('button')).toHaveCount(3);
    await list.getByRole('button', { name: /#21/ }).click();
    const panel = page.getByTestId('selected');
    await expect(panel.getByText('Smoke over the ridge')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open incident' })).toHaveAttribute('href', '/ops/incidents/21');
  });

  test('a satellite signal is described as unconfirmed', async ({ page }) => {
    await page.goto('/ops/map');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByTestId('map-list').getByRole('button', { name: /Satellite signal/ }).click();
    await expect(page.getByTestId('selected').getByText('It is not a confirmed fire until staff check it.')).toBeVisible();
  });

  test('when satellite data is unavailable the page says so and still shows incidents', async ({ page }) => {
    await page.route('**/api/hotspots**', route => route.fulfill(json({ detail: 'off' }, 503)));
    await page.goto('/ops/map');
    await expect(page.getByText('Satellite signals are not available right now.')).toBeVisible();
    await expect(page.getByTestId('map')).toHaveAttribute('data-points', '2', { timeout: 20000 });
  });

  test('no third-party map requests are made (fonts, icons and tiles are served from this site)', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', request => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) foreign.push(url.hostname); });
    await page.goto('/ops/map');
    await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await page.waitForTimeout(1500);
    expect(foreign).toEqual([]);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/ops/map'); await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).exclude('.maplibregl-canvas-container').analyze();
      expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
    });
  }
});
