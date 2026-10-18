import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const OUT = '/home/user/resq-lora/dashboard-build/docs/presentation/figures';
const now = Date.now();
const iso = (ms: number) => new Date(now - ms).toISOString();
const inc = (over: object = {}) => ({ id: 21, source: 'citizen', size: 'unknown', notes: 'Smoke over the ridge near Sundargarh', status: 'verified', close_reason: null, state: 'OD', latitude: 20.31, longitude: 85.82, observed_at: iso(3_600_000), created_at: iso(3_600_000), updated_at: iso(1_800_000), image_assessment_status: null, ...over });
const fresh = { source: 'nasa-firms', fetched_at: iso(0), age_seconds: 720, stale: false };
const wind = { wind_speed_ms: 4.5, wind_dir_deg: 225, valid_time: iso(0), freshness: { source: 'weather', fetched_at: iso(0), age_seconds: 300, stale: false } };
const NOTICE = { id: 3, title: 'Smoke advisory', body: 'Avoid the ridge road until noon.', severity: 'advisory', expires_at: '2030-01-01T00:00:00Z', published_at: iso(7_200_000) };
const INCIDENTS = [inc(), inc({ id: 22, status: 'reported', latitude: 20.5, longitude: 85.9, notes: 'Flames seen near the village road', created_at: iso(900_000) }), inc({ id: 23, status: 'responding', latitude: 20.2, longitude: 85.6 }), inc({ id: 24, status: 'contained', latitude: 20.45, longitude: 85.65 }), inc({ id: 25, status: 'reported', latitude: 20.3, longitude: 85.83, notes: 'Smoke column to the north', created_at: iso(1_500_000) })];

async function common(page: import('@playwright/test').Page) {
  await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: { radius_km: 2, window_minutes: 60 }, exposure_radii_km: [1, 3, 5], feed_stale_minutes: 120, scenario_enabled: true })));
  await page.route('**/api/incidents', route => route.fulfill(json(INCIDENTS)));
  await page.route('**/api/hotspots**', route => route.fulfill(json({ items: [{ id: 1, satellite: 'VIIRS', acq_datetime: iso(600_000), latitude: 20.315, longitude: 85.825, frp: 4, age_minutes: 10, distance_km: 1.2 }, { id: 2, satellite: 'VIIRS', acq_datetime: iso(900_000), latitude: 20.52, longitude: 85.88, frp: 6, age_minutes: 15, distance_km: 3 }], freshness: fresh, label: 'x', radius_km: 10 })));
  await page.route('**/api/weather/context**', route => route.fulfill(json(wind)));
  await page.route('**/api/notices**', route => route.fulfill(json({ items: [NOTICE] })));
  await page.route('**/api/inbox', route => route.fulfill(json({ unread: 2, items: [] })));
  await page.route('**/api/public/status', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/public/incidents', route => route.fulfill(json({ enabled: false, items: [] })));
  await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: true, items: [{ label: 'Forest control room', number: '0674 123 4567' }] })));
}
const settle = async (page: import('@playwright/test').Page, mapReady = false) => {
  if (mapReady) await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.waitForTimeout(mapReady ? 2500 : 600);
};

test.describe('figures', () => {
  test.use({ colorScheme: 'light' });
  test('landing', async ({ page }) => {
    await common(page); await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/'); await settle(page); await page.screenshot({ path: `${OUT}/landing.png` });
    await page.evaluate(() => document.querySelector('#roles, [id*=role]')?.scrollIntoView());
  });
  test('citizen', async ({ page }) => {
    await common(page); await signedInAs(page, 'citizen', 'Asha Rao'); await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/citizen/reports', route => route.fulfill(json({ items: [{ id: 55, status: 'closed', close_reason: 'false_alarm', state: 'OD', created_at: iso(86_400_000), updated_at: iso(80_000_000) }, { id: 56, status: 'verified', close_reason: null, state: 'OD', created_at: iso(7_200_000), updated_at: iso(3_600_000) }] })));
    await page.route('**/api/citizen/reports/56', route => route.fulfill(json({ report: { id: 56, status: 'verified', close_reason: null, state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: iso(7_200_000), created_at: iso(7_200_000), updated_at: iso(3_600_000), evidence: [] } })));
    await page.route('**/api/citizen/reports/56/timeline', route => route.fulfill(json({ items: [{ kind: 'received', at: iso(7_200_000) }, { kind: 'verified', at: iso(3_600_000) }] })));
    await page.goto('/citizen/near-me'); await settle(page, true); await page.screenshot({ path: `${OUT}/citizen-near-me.png` });
    await page.goto('/citizen/report'); await settle(page, true); await page.screenshot({ path: `${OUT}/citizen-report.png` });
    await page.goto('/citizen/reports/56'); await settle(page); await page.screenshot({ path: `${OUT}/citizen-report-detail.png` });
  });
  test('ops', async ({ page }) => {
    await common(page); await signedInAs(page, 'incident_commander', 'Lead Rao'); await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/incidents/21', route => route.fulfill(json({ ...inc(), images: [] })));
    await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [{ action: 'citizen_report_created', occurred_at: iso(3_600_000), user_id: 1, metadata: {} }, { action: 'incident_status_verified', occurred_at: iso(1_800_000), user_id: 2, metadata: {} }, { action: 'incident_assigned', occurred_at: iso(1_700_000), user_id: 2, metadata: {} }] })));
    await page.route('**/api/control-room/incidents/21/assignments', route => route.fulfill(json({ assignments: [{ id: 5, ranger_id: 9, ranger_name: 'Officer Rao', status: 'accepted', created_at: iso(1_700_000), updated_at: iso(1_500_000) }], verifications: [] })));
    await page.route('**/api/control-room/rangers', route => route.fulfill(json({ items: [{ id: 9, name: 'Officer Rao', home_state: 'OD' }] })));
    await page.route('**/api/control-room/assignments', route => route.fulfill(json({ items: [{ id: 5, incident_id: 21, ranger_name: 'Officer Rao', status: 'accepted', state: 'OD', incident_status: 'verified', observations: 1, updated_at: iso(1_500_000), created_at: iso(1_700_000) }, { id: 6, incident_id: 23, ranger_name: 'Officer Das', status: 'assigned', state: 'OD', incident_status: 'responding', observations: 0, updated_at: iso(2_400_000), created_at: iso(2_400_000) }] })));
    await page.route('**/api/notices?limit=100', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/community/**', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/handover/notes', route => route.fulfill(json({ items: [{ id: 4, state: 'OD', body: 'Ridge incident waits for a second officer. Water point at the east gate.', incident_id: 21, created_at: iso(7_200_000), acknowledged_at: null, author_name: 'Night lead', acknowledged_by_name: null }] })));
    await page.goto('/ops/queue'); await settle(page); await page.screenshot({ path: `${OUT}/ops-queue.png` });
    await page.goto('/ops/incidents/21'); await settle(page); await page.screenshot({ path: `${OUT}/ops-incident.png` });
    await page.getByRole('tab', { name: 'Scenario' }).click();
    await page.getByLabel('Head-fire rate of spread (km/h)').fill('1.5'); await page.getByLabel('Show up to').selectOption('6');
    await page.getByLabel('Wind speed (km/h)').fill('20'); await page.getByLabel('Wind blows from (degrees)').fill('225');
    await page.getByLabel('Wind speed ± (%)').fill('20'); await page.getByLabel('Wind direction ± (degrees)').fill('20'); await page.getByLabel('Rate of spread ± (%)').fill('30');
    await page.getByRole('button', { name: 'Draw scenario' }).click(); await settle(page, true);
    await page.screenshot({ path: `${OUT}/ops-scenario.png`, fullPage: true });
    await page.goto('/ops/map'); await settle(page, true); await page.screenshot({ path: `${OUT}/ops-map.png` });
    await page.goto('/ops/field'); await settle(page); await page.screenshot({ path: `${OUT}/ops-field.png` });
    await page.goto('/ops/handover'); await settle(page); await page.screenshot({ path: `${OUT}/ops-handover.png` });
  });
  test('field', async ({ page }) => {
    await common(page); await signedInAs(page, 'field_crew', 'Officer Rao'); await page.setViewportSize({ width: 390, height: 844 });
    await page.context().grantPermissions(['geolocation']); await page.context().setGeolocation({ latitude: 20.27, longitude: 85.78 });
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: [{ assignment_id: 11, incident_id: 21, status: 'assigned', source: 'citizen', size: 'unknown', notes: 'Smoke on the ridge', latitude: 20.31, longitude: 85.82 }, { assignment_id: 12, incident_id: 23, status: 'accepted', source: 'citizen', size: 'small', notes: 'Flames seen', latitude: 20.2, longitude: 85.6 }] })));
    await page.goto('/field/tasks'); await page.getByRole('button', { name: 'Show distance from me' }).click(); await settle(page); await page.screenshot({ path: `${OUT}/field-tasks.png` });
    await page.goto('/field/map'); await settle(page, true); await page.screenshot({ path: `${OUT}/field-map.png`, fullPage: true });
  });
  test('admin', async ({ page }) => {
    await common(page); await signedInAs(page, 'admin', 'Admin Rao'); await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('**/api/admin/people', route => route.fulfill(json({ staff: [{ id: 7, name: 'Admin Rao', email: 'admin@x.in', role: 'admin', scopes: [], created_at: iso(9e9), deactivated_at: null }, { id: 8, name: 'Asha Operator', email: 'asha@x.in', role: 'control_room_operator', scopes: ['OD'], created_at: iso(9e9), deactivated_at: null }], citizens: 12, invites: [], requests: [{ id: 3, name: 'Meera K', designation: 'Forest Guard', department: 'Angul Division', email: 'meera@x.in', state: 'OD', reason: 'Field verification duty', created_at: iso(86_400_000) }] })));
    await page.goto('/ops/admin'); await settle(page); await page.screenshot({ path: `${OUT}/ops-admin.png` });
  });
  test.describe('dark and Hindi', () => {
    test('citizen in Hindi', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('tw_lang', 'hi'));
      await common(page); await signedInAs(page, 'citizen', 'Asha Rao'); await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/citizen/near-me'); await settle(page, true); await page.screenshot({ path: `${OUT}/citizen-near-me-hindi.png` });
    });
  });
});
test('dark ops map', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await common(page); await signedInAs(page, 'incident_commander', 'Lead Rao'); await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/ops/map'); await settle(page, true); await page.screenshot({ path: `${OUT}/ops-map-dark.png` });
});
