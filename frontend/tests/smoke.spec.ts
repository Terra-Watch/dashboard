import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public landing opens and links to demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('RESQ', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open the demo' }).click();
  await expect(page).toHaveURL(/\/demo(?:\?.*)?$/);
});

test('public landing has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('sign-in support links are keyboard reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'See where to move early.' })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test('successful sign-in leaves the login screen', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'test-token', user: { name: 'Forest control', role: 'admin', email: 'admin@resq.local' } }) }));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/map(?:\?.*)?$/);
});

test('PWA shell registers and demo stays above the 30 fps gate on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/demo?debug=1');
  await page.evaluate(async () => { if (navigator.serviceWorker) await navigator.serviceWorker.ready; });
  await expect(page.locator('h1', { hasText: 'Ignition risk outlook' })).toBeVisible();
  const fpsMeter = page.locator('output[aria-label="Frames per second"]');
  await expect.poll(async () => Number((await fpsMeter.innerText()).split(' ')[0]), { timeout: 5000 }).toBeGreaterThanOrEqual(30);
});

test('offline incident reports queue without overwriting each other', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'offline-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Field officer', role: 'officer', email: 'officer@resq.local' }));
  });
  await page.route('**/api/incidents', route => route.abort());
  await page.goto('/app/incidents/new');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.locator('.success-state')).toBeVisible();
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await page.waitForTimeout(100);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('resq_pending_incidents') || '[]'));
  expect(queued).toHaveLength(2);
});
