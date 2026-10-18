import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const PEOPLE = {
  staff: [
    { id: 7, name: 'Admin Rao', email: 'admin@x.in', role: 'admin', scopes: [], created_at: '2026-01-01T00:00:00Z', deactivated_at: null },
    { id: 8, name: 'Asha Operator', email: 'asha@x.in', role: 'control_room_operator', scopes: ['OD'], created_at: '2026-01-02T00:00:00Z', deactivated_at: null },
  ],
  citizens: 12, invites: [{ id: 1, email: 'wait@x.in', role: 'field_crew', scopes: ['OD'], created_at: '2026-10-01T00:00:00Z', expires_at: '2026-10-20T00:00:00Z' }],
  requests: [{ id: 3, name: 'Meera K', designation: 'Forest Guard', department: 'Angul Division', email: 'meera@x.in', state: 'OD', reason: 'Field verification duty', created_at: '2026-10-10T00:00:00Z' }],
};

test.describe('Administration', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, feed_stale_minutes: null, scenario_enabled: false })));
    await page.route('**/api/inbox', route => route.fulfill(json({ items: [], unread: 0 })));
  });

  test('only administrators see the page', async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead');
    await page.goto('/ops/admin');
    await expect(page.getByRole('heading', { name: 'This page is for administrators.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'People' })).toHaveCount(0);
  });

  test('invite needs a role and states, shows the link when email is not set up, and requests can be started or handled', async ({ page }) => {
    await signedInAs(page, 'admin', 'Admin Rao');
    const calls: Array<{ url: string; body: unknown }> = [];
    await page.route('**/api/admin/people', route => route.fulfill(json(PEOPLE)));
    await page.route('**/api/auth/invites', route => { calls.push({ url: 'invite', body: JSON.parse(route.request().postData() ?? '{}') }); return route.fulfill(json({ token: 'tok123', link: '/invite/tok123', emailed: false, email: 'new@x.in' })); });
    await page.route('**/api/admin/access-requests/3/handled', route => { calls.push({ url: 'handled', body: null }); return route.fulfill(json({ handled: true })); });
    await page.goto('/ops/admin');
    await expect(page.getByText('Asha Operator')).toBeVisible();
    const send = page.getByRole('button', { name: 'Create invitation' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Email').fill('new@x.in');
    await page.getByLabel('Role').selectOption('control_room_operator');
    await expect(send).toBeDisabled();                                             // a state is required
    await page.getByRole('checkbox', { name: 'Odisha' }).check();
    await send.click();
    await expect(page.getByText(/Email is not set up, so nothing was sent/)).toBeVisible();
    await expect(page.getByTestId('invite-link')).toContainText('/invite/tok123');
    expect(calls[0]).toEqual({ url: 'invite', body: { email: 'new@x.in', role: 'control_room_operator', scopes: ['OD'] } });
    await page.getByRole('button', { name: 'Start an invitation' }).click();
    await expect(page.getByLabel('Email')).toHaveValue('meera@x.in');
    await page.getByRole('button', { name: 'Mark handled' }).click();
    await expect.poll(() => calls.some(c => c.url === 'handled')).toBe(true);
  });

  test('deactivating asks first and you cannot deactivate yourself', async ({ page }) => {
    await signedInAs(page, 'admin', 'Admin Rao');
    const calls: string[] = [];
    await page.route('**/api/admin/people', route => route.fulfill(json(PEOPLE)));
    await page.route('**/api/admin/people/8/deactivate', route => { calls.push('off'); return route.fulfill(json({ deactivated: true })); });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto('/ops/admin');
    await expect(page.getByRole('button', { name: 'Deactivate' })).toHaveCount(1);   // not for the signed-in admin
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect.poll(() => calls.length).toBe(1);
  });

  test('a person accepts an invitation with a name and a strong password', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route('**/api/auth/invites/tok123/accept', route => { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ status: 'account_created' })); });
    await page.goto('/invite/tok123');
    const create = page.getByRole('button', { name: 'Create account' });
    await page.getByLabel('Your name').fill('Asha Rao');
    await page.getByLabel('New password').fill('short');
    await expect(create).toBeDisabled();
    await page.getByLabel('New password').fill('a-long-unrelated-phrase-7');
    await create.click();
    await expect(page.getByText('Your account is ready.')).toBeVisible();
    expect(bodies).toEqual([{ name: 'Asha Rao', password: 'a-long-unrelated-phrase-7' }]);
  });

  test('staff can ask for access from the sign-in page', async ({ page }) => {
    const bodies: Array<Record<string, string>> = [];
    await page.route('**/api/auth/access-requests', route => { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ status: 'received' }, 202)); });
    await page.goto('/login');
    await page.getByRole('link', { name: 'Ask for staff access' }).click();
    const send = page.getByRole('button', { name: 'Send request' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Your name').fill('Meera K');
    await page.getByLabel('Designation').fill('Forest Guard');
    await page.getByLabel('Department or division').fill('Angul Division');
    await page.getByLabel('Email').fill('meera@x.in');
    await page.getByLabel('State you work in').selectOption('OD');
    await page.getByLabel('What you need access for').fill('Field verification duty');
    await send.click();
    await expect(page.getByText(/Your request was received/)).toBeVisible();
    expect(bodies[0].state).toBe('OD');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await signedInAs(page, 'admin', 'Admin Rao');
      await page.route('**/api/admin/people', route => route.fulfill(json(PEOPLE)));
      for (const path of ['/ops/admin', '/invite/tok123', '/request-access']) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), path).toEqual([]);
      }
    });
  }
});
