import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

async function inLanguage(page: import('@playwright/test').Page, code: string) {
  await page.addInitScript(lang => localStorage.setItem('tw_lang', lang), code);
}

test.describe('Languages', () => {
  test('a citizen sees the report form and the account page in Hindi', async ({ page }) => {
    await inLanguage(page, 'hi');
    await signedInAs(page, 'citizen', 'Test Citizen');
    await page.route('**/api/citizen/**', route => route.fulfill(json({ items: [], report: null })));
    await page.goto('/citizen/report');
    await expect(page.getByRole('heading', { name: 'आग की रिपोर्ट करें' })).toBeVisible();
    await expect(page.getByText('1. यह कहाँ है?')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('a Range Officer sees tasks in Odia', async ({ page }) => {
    await inLanguage(page, 'or');
    await signedInAs(page, 'field_crew', 'Officer Rao');
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
    await page.goto('/field/tasks');
    await expect(page.getByText('ଏବେ କୌଣସି କାମ ନାହିଁ।')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'or');
  });

  test('the Control Room queue is in Hindi and shows the assessment note in plain words', async ({ page }) => {
    await inLanguage(page, 'hi');
    await signedInAs(page, 'incident_commander', 'Lead');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, feed_stale_minutes: null, scenario_enabled: false })));
    await page.route('**/api/incidents', route => route.fulfill(json([])));
    await page.route('**/api/inbox', route => route.fulfill(json({ items: [], unread: 0 })));
    await page.goto('/ops/queue');
    await expect(page.getByRole('tab', { name: /निर्णय चाहिए/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'रिपोर्ट दर्ज करें' })).toBeVisible();
  });
});
