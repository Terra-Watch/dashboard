import { expect, test } from '@playwright/test';
import { json, mockCommunities, signedInAs } from './helpers';

const place = { name: 'Pathara', kind: 'village', lat: 22.4, lon: 80.1, km: 1.3, bearing: 'S', on_side: true };
const fire = (o: object = {}) => ({ id: 'abc0123456', lat: 22.5, lon: 80.1, bbox: [80.09, 22.49, 80.11, 22.51], first_seen: '2025-04-10T08:00:00Z', last_seen: '2025-04-12T08:00:00Z', age_h: 3, n_det: 9, n_passes: 3, area_km2: 3.1, frp_sum: 40,
  status: 'growing', kind: 'likely', grew_toward: 'SE', grew_deg: 135, passes: [{ t: '2025-04-10T08:00:00Z', n: 3, n_new: 3, area_km2: 1 }, { t: '2025-04-11T08:00:00Z', n: 3, n_new: 2, area_km2: 2 }, { t: '2025-04-12T08:00:00Z', n: 3, n_new: 2, area_km2: 3.1 }],
  places: [place], nearest: place, multi: true, tasked: false, attention: 60, ...o });
const ring = (x: number, y: number) => [[x, y], [x + 0.003, y], [x + 0.003, y + 0.003], [x, y + 0.003], [x, y]];
const detail = { ...fire(), footprints: [{ t: 'a', rings: [ring(80.09, 22.49)] }, { t: 'b', rings: [ring(80.093, 22.49)] }, { t: 'c', rings: [ring(80.096, 22.488)] }], detections: [], marks: [], stations: [{ id: 4, name: 'Ridge 4', km: 6.2 }], note: '' };
const board = { generated_at: '2025-04-12T09:00:00Z', window_h: 96, counts: { active: 2, growing: 1, near_village: 1, no_task: 2, single: 40 }, items: [fire(), fire({ id: 'def0123456', status: 'steady', nearest: null, places: [], tasked: true, kind: 'unconfirmed' })] };

test.describe('Active fires', () => {
  test.beforeEach(async ({ page }) => {
    await mockCommunities(page);
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: { radius_km: 2, window_minutes: 40 }, exposure_radii_km: null, scenario_enabled: false })));
    await page.route(/\/api\/fires(\?.*)?$/, route => route.fulfill(json(board)));
    await page.route('**/api/fires/abc0123456', route => route.fulfill(json(detail)));
  });

  test('the board says how many need attention, lists fires by need, and sends a crew into the normal queue', async ({ page }) => {
    let sent = false;
    await page.route('**/api/fires/abc0123456/crew', route => { sent = true; return route.fulfill(json({ created: true, incident_id: 77 }, 201)); });
    await page.route('**/api/incidents/77**', route => route.fulfill(json({ id: 77, status: 'reported', notes: '', source: 'fire' })));
    await page.goto('/ops/fires');
    await expect(page.getByRole('status').filter({ hasText: 'Active now 2' })).toContainText('growing 1 · within 2 km of a village 1 · no check yet 2');
    const rows = page.getByRole('list', { name: 'Fires' }).getByRole('listitem');
    await expect(rows.first()).toContainText('near Pathara'); await expect(rows.first()).toContainText('Growing');
    await expect(rows.first()).toContainText('Pathara (village), 1.3 km from the fire edge, on the side it grew toward');
    await expect(rows.nth(1)).toContainText('not confirmed'); await expect(rows.nth(1)).toContainText('A check is open for this fire.');
    await expect(page.getByText('40 fires seen only once are hidden')).toBeVisible();
    await rows.first().getByRole('button', { name: 'Send a crew' }).click();
    await expect.poll(() => sent).toBe(true);
  });

  test('the fire page shows observed facts, steps through the looks, and says no prediction exists yet', async ({ page }) => {
    await page.goto('/ops/fires/abc0123456');
    await expect(page.getByTestId('happened')).toContainText('Seen 3 times over 2 days, about 3.1 km² so far. At the last look it had grown toward the south-east.');
    await expect(page.getByText('Where it may spread next is not available for live fires yet.')).toBeVisible();
    await expect(page.getByTestId('map')).toHaveAttribute('data-polygons', '3');
    await page.getByRole('button', { name: /3 detections · 1 km²/ }).click();
    await expect(page.getByTestId('map')).toHaveAttribute('data-polygons', '1');
    await expect(page.getByRole('heading', { name: 'Places in reach' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ridge 4' })).toBeVisible();
  });

  test('marking a fire out is one click and says what happens next', async ({ page }) => {
    let body: unknown = null;
    await page.route('**/api/fires/abc0123456/mark', route => { body = route.request().postDataJSON(); return route.fulfill(json({ fire: 'abc0123456', status: 'out' })); });
    await page.goto('/ops/fires/abc0123456');
    await page.getByRole('button', { name: 'Out', exact: true }).click();
    await expect(page.getByText('Marked. It leaves the board unless the satellite sees it again.')).toBeVisible();
    expect(body).toMatchObject({ status: 'out' });
  });

  test('a ranger sees the fires near them and can mark one not a forest fire', async ({ page }) => {
    await signedInAs(page, 'range_officer', 'Ranger');
    let status = '';
    await page.route('**/api/fires/abc0123456/mark', route => { status = route.request().postDataJSON().status; return route.fulfill(json({ fire: 'abc0123456', status })); });
    await page.goto('/field/fires');
    await expect(page.getByRole('heading', { name: 'Fires near me' })).toBeVisible();
    const card = page.getByRole('article', { name: 'near Pathara' });
    await expect(card).toContainText('Seen 3 times');
    await card.getByRole('button', { name: 'Not a forest fire' }).click();
    await expect(card.getByText('Marked as not a forest fire.')).toBeVisible(); expect(status).toBe('not_forest_fire');
  });

  test('no serious accessibility violations on the board and the fire page', async ({ page }) => {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    for (const url of ['/ops/fires', '/ops/fires/abc0123456']) {
      await page.goto(url); await expect(page.getByRole('main')).toBeVisible();
      const r = await new AxeBuilder({ page }).disableRules(['region']).analyze(); expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), url).toEqual([]);
    }
  });
});
