import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { json, signedInAs } from './helpers';

const DIR = '../backend/app/area_forecast_data';
const day = (d: string) => ({ ...JSON.parse(readFileSync(`${DIR}/${d}.json`, 'utf8')), scope: 'all' });
const march = day('2025-03-10');
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8'));   // the demo scenes and the typical-day numbers, as the server serves them
const dates = ['2025-02-05', '2025-02-18', '2025-03-04', '2025-03-10', '2025-04-24'];
// a quiet day: nothing rated, nothing for the card to show (the archive no longer ships one, so make it from a real day)
const quiet = { ...march, areas: march.areas.map((a: { look?: unknown }) => ({ ...a, level: 'none', look: undefined })), summary: { none: march.areas.length, moderate: 0, high: 0, extreme: 0 } };
const shot = (name: string) => (process.env.SHOTDIR ? { path: `${process.env.SHOTDIR}/${name}.png`, fullPage: true } : undefined);

async function mock(page: import('@playwright/test').Page, body: unknown = march) {
  await page.route('**/api/area-forecast/dates', r => r.fulfill(json({ dates, latest: '2025-03-10', mode: 'replay' })));
  await page.route('**/api/area-forecast/latest', r => r.fulfill(json(body)));
  await page.route(/\/api\/area-forecast\/\d{4}-\d{2}-\d{2}$/, r => { const d = r.request().url().split('/').pop() as string; r.fulfill(json(d === '2025-03-10' ? body : day(d))); });
  await page.route('**/api/area-forecast/archive/dates', r => r.fulfill(json({ dates, latest: '2025-04-24', mode: 'replay', typical: index.typical, scenes: index.scenes })));
  await page.route(/\/api\/area-forecast\/archive\/\d{4}-\d{2}-\d{2}$/, r => { const d = r.request().url().split('/').pop() as string; r.fulfill(json(day(d))); });
  const top = march.areas.find((a: { state: string }) => a.state === 'OD');   // one forest cell inside the first (Extreme) area, so the forecast can be drawn on cells
  await page.route('**/api/risk/geojson**', r => r.fulfill(json({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [top.lon, top.lat] }, properties: { cell_id: 1, state: top.state, rank_percentile: 99, band: 'Very high', forest_frac: 0.9 } }] })));
  await page.route('**/api/notices**', r => r.fulfill(json({ items: [] })));
}

test.describe('Fire forecast: control-room board', () => {
  test('lists areas by level with chance and usual, opens the detail with actions and places, and changes day', async ({ page }) => {
    await signedInAs(page, 'control_room_operator', 'Desk Rao'); await mock(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/ops/forecast');
    await expect(page.getByRole('heading', { name: 'Fire forecast' })).toBeVisible();
    await expect(page.getByText(/Archive demo: a past day of 2025/)).toBeVisible();      // the board opens on the archive, not on the live forecast
    await expect(page.getByText(/Yesterday \(2025-03-09\)/)).toBeVisible();
    // the demo opens on a scene (one state, one day): what the forecast got right and wrong there
    await expect(page.getByText(/Odisha · 10 Mar 2025: 41 areas were rated High or Extreme and 31 of them had a fire; 2 of the 33 areas with a fire were rated lower \(missed\), and 10 rated High or Extreme had no fire \(false alarms\)/)).toBeVisible();
    await expect(page.getByLabel('State')).toHaveValue('OD');
    await expect(page.getByText(/On a typical active day of 2025 \(the 96 days/)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Fire detected' })).toBeVisible();
    await expect(page.getByTestId('legend').getByText('Rated, less reliable here')).toBeVisible();
    await expect(page.getByTestId('map')).toHaveAttribute('data-polygons', '1');       // the forecast is drawn on the scored forest cell, not on the whole 55 km box
    await page.getByLabel('Outline the 55 km areas').check();
    await expect(page.getByTestId('map')).not.toHaveAttribute('data-polygons', '1');   // now the outlines of the rated areas too
    await page.getByLabel('Outline the 55 km areas').uncheck();
    await page.getByLabel('Forest cells', { exact: true }).check();
    await expect(page.getByTestId('map')).toHaveAttribute('data-polygons', '2');       // the forest cell on its own as well
    await page.getByLabel('Forest cells', { exact: true }).uncheck();
    await expect(page.locator('tbody tr').getByText('Yes').first()).toBeVisible();
    const first = page.locator('tbody tr').filter({ hasText: 'Yes' }).first();       // a rated area where a fire was detected
    await expect(first.getByText(/Extreme|High/)).toBeVisible();
    await first.getByRole('button').click();
    await expect(page.getByRole('heading', { name: 'Do today' })).toBeVisible();
    await expect(page.getByText('Warn villages and forest committees')).toBeVisible();
    await expect(page.getByText(/Where to look/)).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot(shot('board'));
    await expect(page.getByText('A fire was detected in this area that day.')).toBeVisible();
    await page.getByLabel('Compare').selectOption('fire');
    await expect(page.locator('tbody tr').first().getByText('Yes')).toBeVisible();
    await page.getByLabel('Compare').selectOption('nofire');                          // rated High or Extreme but no fire: every row says No
    await expect(page.locator('tbody tr').first().getByText('No', { exact: true })).toBeVisible();
    await page.getByLabel('Compare').selectOption('missed');                          // a fire, rated lower: every row says Yes and is not High or Extreme
    await expect(page.locator('tbody tr').first().getByText('Yes')).toBeVisible();
    await expect(page.locator('tbody tr').getByText(/Extreme|High/)).toHaveCount(0);
    await page.getByLabel('Compare').selectOption('all');
    await page.getByLabel('Fire squares').selectOption('0.8'); await page.getByLabel('Fire squares').selectOption('0');   // the forest-cover filter for the red diamonds
    await page.getByLabel('Fires detected').uncheck(); await page.getByLabel('Forecast (model output)').uncheck();   // the two layers switch off on their own
    await page.getByLabel('Fires detected').check(); await page.getByLabel('Forecast (model output)').check();
    await page.getByLabel('Scene').selectOption('2025-03-04-AS');                      // another scene: Assam on 4 Mar
    await expect(page.getByText(/Assam · 4 Mar 2025: 17 areas were rated High or Extreme and 14 of them had a fire/)).toBeVisible();
    await expect(page.getByLabel('State')).toHaveValue('AS');
    await page.getByLabel('Scene').selectOption('');                                   // the whole country again: the national line
    await expect(page.getByText(/What was detected on 2025-03-04: a fire was seen by satellite in/)).toBeVisible();
    await page.getByLabel('Show areas with no rating').check();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('has the two tabs and no accessibility violations', async ({ page }) => {
    await signedInAs(page, 'control_room_operator', 'Desk Rao'); await mock(page);
    await page.goto('/ops/forecast');
    await expect(page.getByRole('link', { name: 'Active fires' })).toBeVisible();
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

  test('with no live forecast the card opens on the archive demo: scenes, what the forecast got right, and where a fire was detected', async ({ page }) => {
    await signedInAs(page, 'field_crew', 'Ranger Das'); await mock(page);
    await page.route('**/api/area-forecast/dates', r => r.fulfill(json({ detail: 'No forecast is available' }, 404)));   // nothing issued yet: the demo takes over
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/field/forecast');
    await expect(page.getByRole('button', { name: 'Archive (demo)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Odisha/ })).toBeVisible();
    await expect(page.getByText(/41 areas were rated High or Extreme and 31 of them had a fire/)).toBeVisible();
    await expect(page.getByText(/archived day from 2025/)).toBeVisible();
    await expect(page.getByText(/fire was detected in this area that day/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Karnataka/ }).click();
    await expect(page.getByRole('button', { name: /Karnataka/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a quiet day says so, and the card page has no accessibility violations', async ({ page }) => {
    await signedInAs(page, 'range_officer', 'Ranger Das'); await mock(page, quiet);
    await page.goto('/field/forecast');
    await expect(page.getByText(/No area is rated Moderate or above/)).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
