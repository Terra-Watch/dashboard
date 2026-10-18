import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const NOTICE = { id: 3, title: 'Smoke advisory', body: 'Avoid the ridge road until noon.', severity: 'advisory', expires_at: '2030-01-01T00:00:00Z', published_at: '2026-10-16T08:00:00Z' };

test.describe('Citizen', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'citizen', 'Asha Rao');
    await page.route('**/api/public/incidents', route => route.fulfill(json({ enabled: false, items: [] })));
  });

  test('signed-out visitors go to sign in and come back to where they were going', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/citizen/report');
    await expect(page).toHaveURL(/\/login\?next=%2Fcitizen%2Freport/);
  });

  test('staff cannot use the citizen area', async ({ page }) => {
    await signedInAs(page, 'incident_commander');
    await page.goto('/citizen/near-me');
    await expect(page.getByRole('heading', { name: 'This area is for citizen accounts.' })).toBeVisible();
  });

  test('Near me shows official notices, configured contacts as call links, and never claims there is no fire', async ({ page }) => {
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [NOTICE] })));
    await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: true, items: [{ label: 'Forest control room', number: '0674 123 4567' }] })));
    await page.goto('/citizen/near-me');
    await expect(page.getByText('Avoid the ridge road until noon.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Forest control room/ })).toHaveAttribute('href', 'tel:06741234567');
    await expect(page.getByText('Public map data is not available yet.')).toBeVisible();
    await expect(page.getByText(/Nothing shown here does not mean there is no fire/)).toBeVisible();
    await expect(page.getByText('If anyone is in danger, call emergency services first.')).toBeVisible();
  });

  test('without configured numbers the page says so instead of inventing any', async ({ page }) => {
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: false, items: [] })));
    await page.goto('/citizen/near-me');
    await expect(page.getByText(/No numbers have been set up/)).toBeVisible();
    await expect(page.getByRole('link', { name: /tel:/ })).toHaveCount(0);
    const section = page.getByRole('heading', { name: 'Emergency contacts' }).locator('xpath=ancestor::section[1]');
    expect(await section.innerText()).not.toMatch(/\b(112|100|101)\b/);
  });

  test('the report form needs a place, a state and words; it sends once and shows the report', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = []; const uploads: string[] = [];
    await page.route('**/api/citizen/reports', route => { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ created: true, report: { id: 55, status: 'reported' } }, 201)); });
    await page.route('**/api/citizen/reports/55/evidence', route => { uploads.push('photo'); return route.fulfill(json({ evidence: { id: 1 } }, 201)); });
    await page.route('**/api/citizen/reports/55', route => route.fulfill(json({ report: { id: 55, status: 'reported', close_reason: null, state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: '2026-10-16T08:00:00Z', created_at: '2026-10-16T08:00:00Z', evidence: [] } })));
    await page.route('**/api/citizen/reports/55/timeline', route => route.fulfill(json({ items: [{ kind: 'received', at: '2026-10-16T08:00:00Z' }] })));
    await page.goto('/citizen/report');
    const send = page.getByRole('button', { name: 'Send report' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Or type the coordinates').fill('north of the river');
    await expect(page.getByText('Write coordinates like 20.31, 85.82')).toBeVisible();
    await page.getByLabel('Or type the coordinates').fill('20.31, 85.82');
    await page.getByLabel('State').selectOption('OD');
    await page.getByLabel('Describe it').fill('Thick smoke rising from the hill');
    await page.locator('input[type=file]').setInputFiles({ name: 'smoke.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
    await expect(page.getByText('smoke.jpg')).toBeVisible();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page).toHaveURL(/\/citizen\/reports\/55$/);
    await expect(page.getByText('Your report was sent.')).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ latitude: 20.31, longitude: 85.82, state: 'OD', description: 'Thick smoke rising from the hill' });
    expect(String(bodies[0].client_key)).toHaveLength(36);
    expect(uploads).toEqual(['photo']);
  });

  test('offline, a report is kept on the phone and the person is told what that means for photos', async ({ page }) => {
    await page.route('**/api/citizen/reports', route => route.abort('internetdisconnected'));
    await page.goto('/citizen/report');
    await page.getByLabel('Or type the coordinates').fill('20.31, 85.82');
    await page.getByLabel('State').selectOption('OD');
    await page.getByLabel('Describe it').fill('Smoke near the village road');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('heading', { name: 'Saved on this phone' })).toBeVisible();
    await expect(page.getByText(/Photos are not saved offline/)).toBeVisible();
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('resq_offline_queue') ?? '[]'));
    expect(queued).toHaveLength(1);
    expect(queued[0].path).toBe('/api/citizen/reports');
  });

  test('My reports lists reports; the detail shows every step and the closure reason in words', async ({ page }) => {
    await page.route('**/api/citizen/reports', route => route.fulfill(json({ items: [{ id: 55, status: 'closed', close_reason: 'false_alarm', state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T09:00:00Z' }] })));
    await page.route('**/api/citizen/reports/55', route => route.fulfill(json({ report: { id: 55, status: 'closed', close_reason: 'false_alarm', state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: '2026-10-16T08:00:00Z', created_at: '2026-10-16T08:00:00Z', evidence: [] } })));
    await page.route('**/api/citizen/reports/55/timeline', route => route.fulfill(json({ items: [{ kind: 'received', at: '2026-10-16T08:00:00Z' }, { kind: 'verified', at: '2026-10-16T08:30:00Z' }, { kind: 'closed', at: '2026-10-16T09:00:00Z', close_reason: 'false_alarm' }] })));
    await page.goto('/citizen/reports');
    await expect(page.getByRole('link', { name: /Report 55/ })).toBeVisible();
    await page.getByRole('link', { name: /Report 55/ }).click();
    await expect(page.getByText('This report is closed')).toBeVisible();
    await expect(page.getByText('It turned out not to be a fire.').first()).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Received' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a photo' })).toHaveCount(0);   // closed reports take no more photos
  });

  test('empty states explain what will appear', async ({ page }) => {
    await page.route('**/api/citizen/reports', route => route.fulfill(json({ items: [] })));
    await page.goto('/citizen/reports');
    await expect(page.getByText('You have not sent a report yet.')).toBeVisible();
  });

  test('Account: export downloads a file; closing needs the password and signs out', async ({ page }) => {
    let deleted = false;
    await page.route('**/api/citizen/account', async route => {
      if (route.request().method() === 'DELETE') { const body = JSON.parse(route.request().postData() ?? '{}'); if (body.password !== 'right-password-here') return route.fulfill(json({ detail: 'That password is not right' }, 403)); deleted = true; return route.fulfill(json({ status: 'deleted' })); }
      return route.fulfill(json({ account: { id: 7, name: 'Asha Rao', email: 'asha@example.test', created_at: '2026-10-01T08:00:00Z', consented_at: '2026-10-01T08:00:00Z' } }));
    });
    await page.route('**/api/citizen/account/export', route => route.fulfill(json({ account: { id: 7 }, reports: [], community: {} })));
    await page.route('**/api/auth/logout', route => route.fulfill(json({})));
    await page.goto('/citizen/account');
    await expect(page.getByText('asha@example.test')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download my data' }).click();
    expect((await download).suggestedFilename()).toBe('terrawatch-my-data.json');
    await page.getByRole('button', { name: 'Close my account' }).click();
    const confirm = page.getByRole('button', { name: 'Close account' });
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Type your password to confirm').fill('wrong-password-here');
    await confirm.click();
    await expect(page.getByRole('dialog').getByText('That password is not right')).toBeVisible();
    await page.getByLabel('Type your password to confirm').fill('right-password-here');
    await confirm.click();
    await expect(page).toHaveURL(/\/$/);
    expect(deleted).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('resq_token'))).toBeNull();
  });

  test('navigation: five destinations, Report is the raised centre action, current page is marked', async ({ page }) => {
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: false, items: [] })));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/citizen/near-me');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(nav.getByRole('link', { name: 'Near me' })).toHaveAttribute('aria-current', 'page');
    const labels = await nav.getByRole('link').allInnerTexts();
    expect(labels.map(label => label.trim())).toEqual(['Near me', 'My reports', 'Report', 'Community', 'Account']);
    await nav.getByRole('link', { name: 'Report', exact: true }).click();
    await expect(page).toHaveURL(/\/citizen\/report$/);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme}, phone)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.route('**/api/notices**', route => route.fulfill(json({ items: [NOTICE] })));
      await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: true, items: [{ label: 'Forest control room', number: '0674 123 4567' }] })));
      await page.route('**/api/citizen/reports', route => route.fulfill(json({ items: [{ id: 55, status: 'verified', close_reason: null, state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T09:00:00Z' }] })));
      await page.route('**/api/citizen/account', route => route.fulfill(json({ account: { id: 7, name: 'Asha', email: 'a@example.test', created_at: '2026-10-01T08:00:00Z', consented_at: null } })));
      await page.setViewportSize({ width: 360, height: 700 });
      for (const path of ['/citizen/near-me', '/citizen/report', '/citizen/reports', '/citizen/account']) {
        await page.goto(path); await page.waitForTimeout(300);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${path} ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
      }
    });
  }
});
