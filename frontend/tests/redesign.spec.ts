import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SCREENS: { path: string; name: string; hasMap: boolean }[] = [
  { path: '/redesign', name: 'landing', hasMap: false },
  { path: '/redesign/today', name: 'today', hasMap: true },
  { path: '/redesign/watch', name: 'watch', hasMap: true },
  { path: '/redesign/incident/E2023-084925', name: 'incident', hasMap: true },
  { path: '/redesign/field', name: 'field', hasMap: true },
];

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test(`${screen.name}: sample-data badge, no "live" wording, axe clean`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForSelector('[data-rq-app]');
      await page.waitForTimeout(700); // let the landing page's one-time fade-in settle before scanning contrast
      await expect(page.getByTestId('sample-data-badge').first()).toBeVisible();

      const text = await textOf(page);
      expect(text.toLowerCase()).not.toContain('live');

      const results = await new AxeBuilder({ page }).include('[data-rq-app]').analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    if (screen.hasMap) {
      test(`${screen.name}: renders a real MapLibre canvas over the self-hosted PMTiles basemap`, async ({ page }) => {
        await page.goto(screen.path);
        await page.waitForSelector('[data-rq-app]');
        await expect(page.locator('.maplibregl-canvas').first()).toBeVisible({ timeout: 10_000 });
        // The attribution control proves it's the real OSM-derived PMTiles basemap, not a placeholder.
        await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(/OpenStreetMap/i);
        // 'idle' (exposed as data-map-idle) only flips true once MapLibre has actually painted
        // the pmtiles basemap's tiles, not just created the canvas — proves real tiles rendered,
        // not merely that a MapLibre instance exists over a blank/unloaded source.
        await expect(page.locator('[data-map-idle="true"]').first()).toBeVisible({ timeout: 15_000 });
      });
    }

    for (const width of [390, 1440]) {
      test(`${screen.name}: screenshot at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(screen.path);
        await page.waitForSelector('[data-rq-app]');
        if (screen.hasMap) {
          // Wait for every MapShell on the page (styleguide-style pages can have more than one)
          // to finish loading real basemap tiles before capturing, so the screenshot isn't a
          // race against pmtiles' async range-request fetches.
          const maps = page.getByTestId('map-shell');
          const count = await maps.count();
          for (let i = 0; i < count; i++) {
            await expect(maps.nth(i)).toHaveAttribute('data-map-idle', 'true', { timeout: 15_000 });
          }
        }
        await page.screenshot({ path: `../docs/redesign/screenshots/phase2/${screen.name}_${width}.png`, fullPage: true });
      });
    }
  });
}

test('incident: shows the forecast-estimate caveat, not a baseline comparison', async ({ page }) => {
  await page.goto('/redesign/incident/E2023-084925');
  await expect(page.getByTestId('scenario-caveat')).toHaveText('Estimate from forecast wind and fuel. Real fires can differ.');
  // The proximity-baseline toggle/outline and the Replay/evidence screen were removed per the
  // user's amendment (research content, not something the user-facing product should surface).
  await expect(page.getByText('Show proximity baseline outline')).toHaveCount(0);
  await expect(page.locator('a[href="/redesign/replay"]')).toHaveCount(0);
});

test('no AUC/AP/IoU numbers or research framing appear anywhere in the app', async ({ page }) => {
  for (const path of ['/redesign', '/redesign/today', '/redesign/watch', '/redesign/incident/E2023-084925', '/redesign/field']) {
    await page.goto(path);
    await page.waitForSelector('[data-rq-app]');
    const text = await textOf(page);
    expect(text, `${path} should not mention AUC/AP/IoU`).not.toMatch(/\bAUC\b|\bIoU\b|\bAP\s+(vs|baseline)\b/i);
    expect(text, `${path} should not link to the removed Replay/evidence screen`).not.toContain('replay evidence');
    expect(text, `${path} should not render the removed "refuses to claim" section`).not.toContain('What RESQ refuses to claim');
  }
});

test('today: ranked cells never show a 24/48h horizon value', async ({ page }) => {
  await page.goto('/redesign/today');
  await page.waitForSelector('.hairline-list');
  const listText = await page.locator('.hairline-list').innerText();
  expect(listText).not.toMatch(/\b24\s*h\b|\b48\s*h\b/i);
});

test('incident: switching wind source changes the rendered scenario', async ({ page }) => {
  // The map is a real MapLibre canvas now (WebGL), so DOM-diffing the container no longer
  // detects a change — react-map-gl updates the GeoJSON source imperatively via setData, not
  // by touching the surrounding DOM. Instead, capture the actual scenario responses the page
  // fetches for each wind source and compare the georeferenced probability-band geometry.
  const responses: Record<string, unknown> = {};
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/redesign/incidents/') && url.includes('/scenario')) {
      const match = url.match(/wind_source=([^&]+)/);
      if (match) responses[match[1]] = await response.json().catch(() => null);
    }
  });

  await page.goto('/redesign/incident/E2023-084925');
  await page.waitForSelector('[data-testid="probability-grid"]');
  // Move to the last overpass where the fire has spread, so the grids have something to differ on.
  const slider = page.locator('#timeline');
  await slider.fill('7');
  await page.waitForTimeout(300);
  await page.getByLabel('Wind source').selectOption('era5_025');
  await page.waitForTimeout(300);

  expect(responses['era5land_native']).toBeTruthy();
  expect(responses['era5_025']).toBeTruthy();
  const before = JSON.stringify((responses['era5land_native'] as { probability_bands_geojson: unknown }).probability_bands_geojson);
  const after = JSON.stringify((responses['era5_025'] as { probability_bands_geojson: unknown }).probability_bands_geojson);
  expect(after).not.toEqual(before);
});

test('incident: wind arrow and ignition marker are real, georeferenced map features', async ({ page }) => {
  await page.goto('/redesign/incident/E2023-084925');
  await page.waitForSelector('[data-testid="probability-grid"]');
  await expect(page.getByRole('img', { name: /Nominal ignition point/i })).toBeVisible();
  await expect(page.getByRole('img', { name: /Wind .* m\/s toward/i })).toBeVisible();
});

test('incident: Uncalibrated-scenario badge is always present, not dismissible', async ({ page }) => {
  await page.goto('/redesign/incident/E2023-084925');
  const badge = page.getByText('Uncalibrated scenario — one simulation run, not a forecast.');
  await expect(badge).toBeVisible();
  // No close/dismiss control anywhere near the badge.
  await expect(page.locator('[role="note"]:has-text("Uncalibrated") button')).toHaveCount(0);
});

test('styleguide: renders and is axe-clean', async ({ page }) => {
  await page.goto('/redesign/styleguide');
  await page.waitForSelector('[data-rq-app]');
  const maps = page.getByTestId('map-shell');
  const count = await maps.count();
  for (let i = 0; i < count; i++) {
    await expect(maps.nth(i)).toHaveAttribute('data-map-idle', 'true', { timeout: 15_000 });
  }
  await page.screenshot({ path: '../docs/redesign/screenshots/phase2/styleguide_1440.png', fullPage: true });
  const results = await new AxeBuilder({ page }).include('[data-rq-app]').analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
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
