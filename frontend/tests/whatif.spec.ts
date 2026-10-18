import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { cellCentre, parseManifestLayout } from './whatifLayout';
import { json, signedInAs } from './helpers';

const layout = parseManifestLayout(JSON.parse(readFileSync(new URL('../public/whatif/similipal/manifest.json', import.meta.url), 'utf8')));

async function openAs(page: Page, role: string, scenario = true) {
  await signedInAs(page, role, 'Lead Rao');
  await page.route('**/api/**', route => route.fulfill(json({ items: [], unread: 0 })));
  await page.route('**/api/incidents', route => route.fulfill(json([])));
  await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, feed_stale_minutes: null, scenario_enabled: scenario })));
}

/** Where the centre of grid cell (col, row) is on the screen. */
async function cellPixel(page: Page, col: number, row: number) {
  const [lon, lat] = cellCentre(layout, col, row);
  // Buttons in the left column can scroll the map out of view; bring it back before measuring.
  await page.evaluate(() => document.querySelector('[data-testid=map]')?.scrollIntoView({ block: 'center' }));
  const box = (await page.getByTestId('map').boundingBox())!;
  const p = await page.evaluate(([lo, la]) => { const m = (window as unknown as { __twMap: { project(c: number[]): { x: number; y: number } } }).__twMap; return m.project([lo, la]); }, [lon, lat]);
  return { x: box.x + p.x, y: box.y + p.y };
}
async function clickCell(page: Page, col: number, row: number) { const p = await cellPixel(page, col, row); await page.mouse.click(p.x, p.y); }
const burned = async (page: Page) => Number(await page.getByTestId('burned-km2').getAttribute('data-value'));
async function waitRun(page: Page) { await expect(page.getByText('Up to date.')).toBeVisible({ timeout: 30000 }); }
async function openPage(page: Page) {
  await page.goto('/app/whatif');
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
  // The map eases to the pack bounds; wait until it has stopped before projecting cells to pixels.
  await page.waitForFunction(() => { const m = (window as unknown as { __twMap?: { isMoving(): boolean } }).__twMap; return !!m && !m.isMoving(); }, undefined, { timeout: 30000 });
  await page.waitForTimeout(300);
}
async function setHour(page: Page, h: number) { await page.getByLabel(/Hours after ignition/).fill(String(h)); }

test.describe('What-if fire spread', () => {
  test('is for the Control Room only, and only while the scenario setting is on', async ({ page }) => {
    await openAs(page, 'citizen');
    await page.goto('/app/whatif');
    await expect(page.getByRole('heading', { name: 'This area is for Control Room staff.' })).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toHaveCount(0);
  });

  test('field officers cannot open it either', async ({ page }) => {
    await openAs(page, 'field_crew');
    await page.goto('/app/whatif');
    await expect(page.getByRole('heading', { name: 'This area is for Control Room staff.' })).toBeVisible();
  });

  test('absent from the menu and the page when the setting is off, listed when it is on', async ({ page }) => {
    await openAs(page, 'incident_commander', false);
    await page.goto('/ops/queue');
    await expect(page.getByRole('link', { name: 'Queue' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'What-if' })).toHaveCount(0);
    await page.goto('/app/whatif');
    await expect(page.getByText('What-if fire spread is not switched on')).toBeVisible();
    await expect(page.getByTestId('map')).toHaveCount(0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await openAs(page, 'incident_commander', true);
    await page.goto('/ops/queue');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'What-if' }).first()).toBeVisible();
  });

  test('loads Similipal with its attribution and the fixed notice; an area that fails to load says so', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await expect(page.getByTestId('disclaimer')).toContainText('What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels.');
    await expect(page.getByTestId('disclaimer')).toContainText('Spotting, crown fire, fuel-moisture change and suppression are not modelled.');
    await expect(page.getByText(/OpenStreetMap contributors/).first()).toBeVisible();
    await expect(page.getByText(/ESA WorldCover/).first()).toBeVisible();
    await expect(page.getByText(/Copernicus DEM/).first()).toBeVisible();
    await expect(page.getByText('The area files matched their checksums.')).toBeVisible();
    await expect(page.getByText('No ignition yet. Nothing is drawn until you place one.')).toBeVisible();
    // Similipal has no mapped villages or roads: the table says so.
    await clickCell(page, 167, 167);
    await expect(page.getByRole('listitem').filter({ hasText: 'Ignition 1' })).toBeVisible();
    await waitRun(page);
    await expect(page.getByText(/no villages, roads or water mapped|No villages or hamlets are mapped/).first()).toBeVisible();

    await page.route('**/whatif/almora/manifest.json', route => route.fulfill({ status: 404, body: 'no' }));
    await page.getByLabel('Area').selectOption('almora');
    await expect(page.getByText('This area could not be loaded')).toBeVisible();
    await expect(page.getByText(/not available yet/)).toBeVisible();
    await page.getByLabel('Area').selectOption('similipal');
    await expect(page.getByTestId('map')).toBeVisible();
  });

  test('places ignitions on cells that can burn, refuses the others, and offers a keyboard route', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await page.getByRole('button', { name: 'Place ignition at map centre' }).click();
    await expect(page.getByText(/Ignition 1 placed in the cell/)).toBeVisible();
    await waitRun(page);
    expect(await burned(page)).toBeGreaterThan(0);
    // arrow keys move the selected ignition by one cell
    const item = page.getByRole('button', { name: /^Ignition 1: column/ });
    const before = await item.textContent();
    await item.focus();
    await page.keyboard.press('ArrowRight');
    await expect(item).not.toHaveText(before!);
    // a click outside the square is refused with a message
    const box = (await page.getByTestId('map').boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + 8);
    await expect(page.getByText('That place is outside the area. Click inside the shaded square.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear ignitions' }).click();
    await expect(page.getByText('No ignition yet. Nothing is drawn until you place one.')).toBeVisible();
  });

  test('changing the wind changes the burned area; the time slider grows it', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await clickCell(page, 167, 167);
    await waitRun(page);
    await setHour(page, 4);
    const at4 = await burned(page);
    await setHour(page, 12);
    const at12 = await burned(page);
    expect(at12).toBeGreaterThan(at4);
    await expect(page.getByTestId('whatif-legend')).toContainText('darker is earlier');

    const calm = await burned(page);
    await page.getByLabel('Wind speed (km/h)').fill('30');
    await expect(page.getByText('Calculating…')).toBeVisible();
    await waitRun(page);
    const strong = await burned(page);
    expect(strong).not.toBeCloseTo(calm, 1);
    await expect(page.getByTestId('head-km')).not.toHaveText('–');
    await expect(page.getByText(/Directions per cell: 32/)).toBeVisible();
  });

  // A tall window so one grid cell is more than two screen pixels and a click lands on the intended cell.
  test.describe('fire lines', () => {
    test.use({ viewport: { width: 1440, height: 1500 } });
    test('a fire line stops the spread and fire lines can be undone', async ({ page }) => {
      await openAs(page, 'incident_commander');
      await openPage(page);
      await clickCell(page, 120, 167);
      await waitRun(page);
      await setHour(page, 12);
      const open = await burned(page);
      await page.getByRole('button', { name: 'Draw fire line' }).click();
      await clickCell(page, 150, 0);
      await clickCell(page, 150, 333);
      await page.getByRole('button', { name: 'Finish line' }).click();
      await expect(page.getByText('Fire lines drawn: 1')).toBeVisible();
      await expect.poll(() => burned(page), { timeout: 30000 }).toBeLessThan(open);
      const blocked = await burned(page);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByText('Fire lines drawn: 0')).toBeVisible();
      await expect.poll(() => burned(page), { timeout: 30000 }).toBeGreaterThan(blocked);
    });
  });

  test('compares up to three wind cases with outlines, a legend and a table', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await clickCell(page, 167, 167);
    await waitRun(page);
    await setHour(page, 8);
    await page.getByRole('button', { name: 'Add a wind case to compare' }).click();
    await page.getByLabel('Wind speed (km/h)').fill('25');
    await page.getByLabel('Wind from (degrees)').fill('90');
    await page.getByRole('button', { name: 'Add a wind case to compare' }).click();
    await page.getByLabel('Wind speed (km/h)').fill('0');
    await expect(page.getByRole('button', { name: 'Add a wind case to compare' })).toHaveCount(0);
    await expect(page.getByText('Up to date.')).toBeVisible({ timeout: 30000 });
    const table = page.getByRole('table', { name: 'Wind cases side by side' });
    await expect(table).toBeVisible();
    const a = Number(await page.getByTestId('compare-burned-A').innerText().then(s => s.replace(/[^\d.]/g, '')));
    const b = Number(await page.getByTestId('compare-burned-B').innerText().then(s => s.replace(/[^\d.]/g, '')));
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    const legend = page.getByRole('list', { name: 'Wind case outlines' });
    await expect(legend).toContainText('Case A: solid line');
    await expect(legend).toContainText('Case B: dashed line');
    await expect(legend).toContainText('Case C: dotted line');
  });

  test('exports an image and a note that carry the notice; no forbidden wording', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await clickCell(page, 167, 167);
    await waitRun(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image' }).click();
    expect((await download).suggestedFilename()).toMatch(/^whatif-similipal-6h\.png$/);
    await page.getByRole('button', { name: 'Copy scenario as note' }).click();
    const note = await page.getByLabel('Scenario note').inputValue();
    expect(note).toContain('What-if scenario for planning and training. Not a forecast.');
    expect(note).toContain('Case A: wind 10 km/h from 270 degrees (W)');
    const text = (await page.locator('main').innerText()).replace(/What-if scenario for planning and training\. Not a forecast\./g, '');
    expect(text).not.toMatch(/forecast|prediction|probabilit|will burn|will reach/i);
  });

  test('wind shift: a stronger wind later changes the result; "How this works" opens', async ({ page }) => {
    await openAs(page, 'incident_commander');
    await openPage(page);
    await clickCell(page, 167, 167);
    await waitRun(page);
    await setHour(page, 24);
    const steady = await burned(page);
    await page.getByLabel('The wind changes later').check();
    await page.getByLabel('New wind speed (km/h)').fill('30');
    await page.getByLabel('After (hours)').fill('2');
    await expect.poll(() => burned(page), { timeout: 30000 }).not.toBeCloseTo(steady, 1);
    await page.getByText('How this works').click();
    await expect(page.getByText('Measured limits')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openAs(page, 'incident_commander');
      await openPage(page);
      await clickCell(page, 167, 167);
      await waitRun(page);
      await page.getByRole('button', { name: 'Add a wind case to compare' }).click();
      await page.getByLabel('The wind changes later').check();
      await page.getByRole('button', { name: 'Draw fire line' }).click();
      await page.getByText('How this works').click();
      await expect(page.getByText('Up to date.')).toBeVisible({ timeout: 30000 });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).exclude('.maplibregl-canvas-container').analyze();
      expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
    });
  }
});
