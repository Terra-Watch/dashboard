import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const ME = (role: string, scopes: string[]) => ({ id: 7, name: 'Test Person', email: 'person@example.test', role, home_state: scopes[0] ?? null, scopes });

test.describe('every role has an account page, and the header reaches it', () => {
  for (const [role, home, label, scopes] of [['control_room_operator', '/ops/queue', 'Control Room operator', ['OD', 'CG']], ['field_crew', '/field/tasks', 'Range Officer', ['OD']]] as const) {
    test(`${role}: the header's account button opens name, email, role and areas`, async ({ page }) => {
      await signedInAs(page, role, 'Test Person');
      await page.route('**/api/auth/me', route => route.fulfill(json(ME(role, [...scopes]))));
      await page.route(/\/api\/(ops|incidents|handover|ranger|notices|inbox|public)/, route => route.fulfill(json({ items: [], unread: 0 })));
      await page.goto(home);
      const account = page.getByRole('link', { name: 'My account' });
      await expect(account).toHaveAttribute('href', role === 'field_crew' ? '/field/me' : '/ops/me');
      await page.goto(role === 'field_crew' ? '/field/me' : '/ops/me');
      await expect(page.getByText('person@example.test')).toBeVisible();
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByText(scopes.length > 1 ? 'Odisha, Chhattisgarh' : 'Odisha')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Change password' })).toBeVisible();
      await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible();
    });
  }
});

test('the installed app opens on the officer\'s own home, not the landing page', async ({ page }) => {
  await signedInAs(page, 'field_crew', 'Officer Rao');
  await page.route(/\/api\/(ranger|notices|inbox)/, route => route.fulfill(json({ items: [], unread: 0 })));
  await page.goto('/?source=pwa');
  await expect(page).toHaveURL(/\/field\/tasks$/);
});

test('signed out, the app start page still shows the landing page', async ({ page }) => {
  await page.goto('/?source=pwa');
  await expect(page).toHaveURL(/\/\?source=pwa$/);
});
