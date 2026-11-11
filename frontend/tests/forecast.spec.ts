import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { json, signedInAs } from './helpers';

const DIR = '../backend/app/area_forecast_data';
const day = (d: string) => ({ ...JSON.parse(readFileSync(`${DIR}/${d}.json`, 'utf8')), scope: 'all' });
const march = day('2025-03-15');
const dates = ['2025-03-14', '2025-03-15', '2025-04-12', '2025-05-20', '2025-07-15', '2025-12-10'];
const shot = (name: string) => (process.env.SHOTDIR ? { path: `${process.env.SHOTDIR}/${name}.png`, fullPage: true } : undefined);

async function mock(page: import('@playwright/test').Page, body: unknown = march) {
  await page.route('**/api/area-forecast/dates', r => r.fulfill(json({ dates, latest: '2025-03-15', mode: 'replay' })));
  await page.route('**/api/area-forecast/latest', r => r.fulfill(json(body)));
  await page.route(/\/api\/area-forecast\/\d{4}-\d{2}-\d{2}$/, r => { const d = r.request().url().split('/').pop() as string; r.fulfill(json(d === '2025-03-15' ? body : day(d))); });
  await page.route('**/api/notices**', r => r.fulfill(json({ items: [] })));
}

test.describe('Fire forecast: control-room board', () => {
  test('lists areas by level with chance and usual, opens the detail with actions and places, and changes day', async ({ page }) => {
    await signedInAs(page, 'control_room_operator', 'Desk Rao'); await mock(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/ops/forecast');
    await expect(page.getByRole('heading', { name: 'Fire forecast' })).toBeVisible();
    await expect(page.getByText(/archived day from 2025/)).toBeVisible();
    await expect(page.getByText(/Yesterday \(2025-03-14\)/)).toBeVisible();
    const first = page.locator('tbody tr').first();
    await expect(first.getByText('Extreme')).toBeVisible();
    await first.getByRole('button').click();
    await expect(page.getByRole('heading', { name: 'Do today' })).toBeVisible();
    await expect(page.getByText('Warn villages and forest committees')).toBeVisible();
    await expect(page.getByText(/Where to look/)).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot(shot('board'));
    await page.getByLabel('Forecast for').selectOption('2025-07-15');
    await expect(page.getByText('No area is rated Moderate or above')).toBeVisible();      // the monsoon: nothing is red
    await page.getByLabel('Show areas with no rating').check();
    await expect(page.locator('tbody tr').first().getByText('No rating')).toBeVisible();
  });

  test('has the two tabs and no accessibility violations', async ({ page }) => {
    await signedInAs(page, 'control_room_operator', 'Desk Rao'); await mock(page);
    await page.goto('/ops/forecast');
    await expect(page.getByRole('link', { name: 'Fires burning now' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});

test.describe('Fire forecast: ranger card', () => {
  const small = { ...march, areas: [...march.areas.filter((a: { level: string }) => a.level === 'extreme').slice(0, 2), ...march.areas.filter((a: { level: string }) => a.level === 'high').slice(0, 1), ...march.areas.filter((a: { level: string }) => a.level === 'none').slice(0, 2)] };

  test('one card per area with what to do, places to check and a message to forward', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await signedInAs(page, 'range_officer', 'Ranger Das'); await mock(page, small);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/field/forecast');
    await expect(page.getByRole('heading', { name: /in my area/ })).toBeVisible();
    const card = page.locator('article').first();
    await expect(card.getByText('Extreme')).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Do today' })).toBeVisible();
    await expect(card.getByText(/Warn villages/)).toBeVisible();
    await card.getByRole('button', { name: 'Share on WhatsApp or SMS' }).click();
    await expect(card.getByRole('status')).toContainText(/Copied|Shared/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('fire danger tomorrow is Extreme');
    await card.getByRole('button', { name: 'Show map' }).click();
    await page.waitForTimeout(2500);
    await page.screenshot(shot('card'));
    await page.getByText(/areas with no rating/).click();
    await expect(page.locator('details li').first()).toBeVisible();
  });

  test('a quiet day says so, and the card page has no accessibility violations', async ({ page }) => {
    await signedInAs(page, 'range_officer', 'Ranger Das'); await mock(page, day('2025-07-15'));
    await page.goto('/field/forecast');
    await expect(page.getByText(/No area is rated Moderate or above/)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
