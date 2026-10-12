import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SCREENS: { path: string; name: string }[] = [
  { path: '/redesign/today', name: 'today' },
  { path: '/redesign/watch', name: 'watch' },
  { path: '/redesign/incident/E2023-084925', name: 'incident' },
  { path: '/redesign/replay', name: 'replay' },
  { path: '/redesign/field', name: 'field' },
];

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test(`${screen.name}: sample-data badge, no "live" wording, axe clean`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForSelector('[data-rq-app]');
      await expect(page.getByTestId('sample-data-badge').first()).toBeVisible();

      const text = await textOf(page);
      expect(text.toLowerCase()).not.toContain('live');

      const results = await new AxeBuilder({ page }).include('[data-rq-app]').analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    for (const width of [390, 1440]) {
      test(`${screen.name}: screenshot at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(screen.path);
        await page.waitForSelector('[data-rq-app]');
        await page.screenshot({ path: `../docs/redesign/screenshots/phase2/${screen.name}_${width}.png`, fullPage: true });
      });
    }
  });
}

test('incident: baseline overlay visible by default', async ({ page }) => {
  await page.goto('/redesign/incident/E2023-084925');
  await expect(page.getByTestId('baseline-overlay')).toBeVisible();
});

test('replay: baseline overlay visible', async ({ page }) => {
  await page.goto('/redesign/replay');
  await expect(page.getByTestId('baseline-overlay')).toBeVisible();
});

test('incident: switching wind source changes the rendered scenario', async ({ page }) => {
  await page.goto('/redesign/incident/E2023-084925');
  await page.waitForSelector('[data-testid="probability-grid"]');
  // Move to the last overpass where the fire has spread, so the grids have something to differ on.
  const slider = page.locator('#timeline');
  await slider.fill('7');
  await page.waitForTimeout(300);
  const before = await page.locator('[data-testid="probability-grid"]').innerHTML();
  await page.getByLabel('Wind source').selectOption('era5_025');
  await page.waitForTimeout(300);
  const after = await page.locator('[data-testid="probability-grid"]').innerHTML();
  expect(after).not.toEqual(before);
});

test('field: duplicate idempotency key is deduped server-side', async ({ page, request }) => {
  const base = process.env.VITE_API_BASE_URL || 'http://localhost:8201';
  const body = {
    idempotency_key: `playwright-dedupe-${Date.now()}`,
    task_id: 'det-test',
    note: 'first',
    device_id: 'playwright-device',
    captured_at: new Date().toISOString(),
  };
  const first = await request.post(`${base}/api/redesign/field/reports`, { data: body });
  const second = await request.post(`${base}/api/redesign/field/reports`, { data: body });
  expect((await first.json()).created).toBe(true);
  expect((await second.json()).created).toBe(false);
});
