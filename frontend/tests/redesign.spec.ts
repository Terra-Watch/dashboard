import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SCREENS: { path: string; name: string; hasMap: boolean }[] = [
  { path: '/', name: 'landing', hasMap: false },
  { path: '/redesign/today', name: 'today', hasMap: true },
  { path: '/redesign/watch', name: 'watch', hasMap: true },
  { path: '/redesign/incident/E2023-084925', name: 'incident', hasMap: true },
  { path: '/redesign/field', name: 'field', hasMap: true },
];

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

test.use({ serviceWorkers: 'block' });

async function stubSampleReadApis(page: Page) {
  await page.route('**/api/risk/geojson*', (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [81.5, 20.3] }, properties: { cell_id: 1, state: 'OD', rank_percentile: 90, band: 'High' } }],
    }),
  }));
  await page.route('**/api/redesign/detections', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      sample_data: true,
      note: 'Saved sample information.',
      items: [{
        id: 'sample-1',
        incident_id: 'E2023-084925',
        source: 'VIIRS',
        state: 'OD',
        detected_at: '2024-03-10T06:00:00Z',
        lat: 20.3,
        lon: 81.5,
        label: 'Example observation',
        status: 'new',
      }],
    }),
  }));
  await page.route('**/api/redesign/field/tasks', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [{ task_id: 'sample-task', incident_id: 'sample-incident', label: 'Example field task', status: 'new', lat: 20.3, lon: 81.5 }] }),
  }));
  await page.route('**/api/redesign/incidents/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/scenario')) return route.continue();
    const match = url.pathname.match(/\/incidents\/([^/]+)\/scenario/);
    const incId = match ? match[1] : 'E2023-084925';
    const source = url.searchParams.get('wind_source') ?? 'era5land_native';
    const overpassK = Number(url.searchParams.get('overpass_k') ?? 0);
    const offset = source === 'era5_025' ? 0.01 : 0;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        incident_id: incId, sample_data: true, uncalibrated: true,
        wind_source: source, overpass_k: overpassK, overpass_count: 8,
        overpass_time_utc: new Date(Date.UTC(2024, 2, 10, 6 + overpassK * 6)).toISOString(),
        hours_since_t0: overpassK * 6,
        probability_bands_grid: [[0, 1]], bounds: [83.8, 19.2, 84.1, 19.5],
        ignition: { lat: 19.3, lon: 83.9 },
        probability_bands_geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [83.9 + offset, 19.3] }, properties: { band: 'High' } }] },
        wind_arrow: { lat: 19.3, lon: 83.9, direction_deg: 90, speed_ms: 1.2, source_time_utc: '2024-03-10T06:00:00Z' },
        assumptions: { fuel: 'Saved example', weather: 'Past weather', terrain: 'Saved terrain' },
      }),
    });
  });
}

async function authenticateFieldWorkspace(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'playwright-field-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 7, email: 'field@example.test', name: 'Field tester', role: 'field_crew' }));
  });
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test.beforeEach(async ({ page }) => {
      if (screen.path === '/redesign/field') await authenticateFieldWorkspace(page);
      await stubSampleReadApis(page);
    });

    test(`${screen.name}: sample-data disclaimer and axe clean`, async ({ page }) => {
      await page.goto(screen.path);
      await page.waitForSelector('[data-rq-app]');
      await page.waitForTimeout(700); // let the landing page's one-time fade-in settle before scanning contrast
      if (screen.path !== '/') await expect(page.getByTestId('sample-data-badge').first()).toBeVisible();

      const text = await textOf(page);
      expect(text.toLowerCase()).toContain('not live monitoring');

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
  await stubSampleReadApis(page);
  await page.goto('/redesign/incident/E2023-084925');
  await expect(page.getByTestId('scenario-caveat')).toContainText('separate from the historical area ranking');
  // The proximity-baseline toggle/outline and the Replay/evidence screen were removed per the
  // user's amendment (research content, not something the user-facing product should surface).
  await expect(page.getByText('Show proximity baseline outline')).toHaveCount(0);
  await expect(page.locator('a[href="/redesign/replay"]')).toHaveCount(0);
});

test('no AUC/AP/IoU numbers or research framing appear anywhere in the app', async ({ page }) => {
  await stubSampleReadApis(page);
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
  await stubSampleReadApis(page);
  await page.goto('/redesign/today');
  await page.waitForSelector('.hairline-list');
  const listText = await page.locator('.hairline-list').innerText();
  expect(listText).not.toMatch(/\b24\s*h\b|\b48\s*h\b/i);
});

test('incident: saved weather-source choices are identified as comparisons', async ({ page }) => {
  await stubSampleReadApis(page);
  await page.goto('/redesign/incident/E2023-084925');
  await page.waitForSelector('[data-testid="probability-grid"]');
  await page.getByText('Research weather-source comparison', { exact: true }).click();
  const source = page.getByLabel('Saved weather record');
  await expect(source.locator('option')).toHaveCount(3);
  await expect(source.locator('option[value="era5_025"]')).toContainText('ERA5 historical weather record');
  await expect(page.getByText('These comparisons are not operational forecasts.')).toBeVisible();
});

test('incident: wind arrow and ignition marker are real, georeferenced map features', async ({ page }) => {
  await stubSampleReadApis(page);
  await page.goto('/redesign/incident/E2023-084925');
  await page.waitForSelector('[data-testid="probability-grid"]');
  await expect(page.getByRole('img', { name: /Nominal ignition point/i })).toBeVisible();
  await expect(page.getByRole('img', { name: /Wind .* m\/s toward/i })).toBeVisible();
});

test('incident: Uncalibrated-scenario badge is always present, not dismissible', async ({ page }) => {
  await stubSampleReadApis(page);
  await page.goto('/redesign/incident/E2023-084925');
  const badge = page.getByText('Saved example — not an operational forecast.');
  await expect(badge).toBeVisible();
  // No close/dismiss control anywhere near the badge.
  await expect(page.locator('[role="note"]:has-text("Saved example") button')).toHaveCount(0);
});

test('retired styleguide URL redirects to the public redesign landing page', async ({ page }) => {
  await page.goto('/redesign/styleguide');
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
});

test('field: notes remain local and triage actions are not offered', async ({ page }) => {
  await stubSampleReadApis(page);
  await authenticateFieldWorkspace(page);
  await page.goto('/redesign/field');
  await expect(page.getByText(/Queue metadata is stored on this device; note and photo-reference content stays in memory/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft on this device' })).toBeVisible();
  await page.goto('/redesign/watch');
  await expect(page.getByRole('button', { name: 'Verify' })).toHaveCount(0);
});

test('redesign landing offers clearly differentiated entry experiences for Citizen, Control Room, and Range Officer', async ({ page }) => {
  await page.goto('/redesign');
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CITIZEN / COMMUNITY', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'RANGER / FIELD OFFICER', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CONTROL ROOM', exact: true })).toBeVisible();
  await expect(page.getByText(/Public information and restricted operations are separate/i)).toBeVisible();
});

test('field: mobile and tablet viewports preserve accessibility, draft controls, and no horizontal overflow', async ({ page }) => {
  const viewports = [
    { width: 390, height: 844, name: 'Mobile' },
    { width: 768, height: 1024, name: 'Tablet' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await stubSampleReadApis(page);
    await authenticateFieldWorkspace(page);
    await page.goto('/redesign/field');

    // Assert no unintended horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `${vp.name} viewport has horizontal overflow`).toBe(false);

    // Assert essential controls are reachable and usable
    const noteArea = page.getByLabel('Note');
    await expect(noteArea).toBeVisible();
    await noteArea.fill(`Field note test for ${vp.name}`);

    const saveButton = page.getByRole('button', { name: 'Save draft on this device' });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Accessible confirmation appears
    await expect(page.getByRole('status').filter({ hasText: 'Draft note saved locally on this device' })).toBeVisible();

    // Local drafts queue updates
    await expect(page.getByTestId('field-drafts-section')).toContainText('Local drafts (1)');
    await expect(page.getByTestId('field-drafts-section')).toContainText('Local draft · not uploaded');

    // Clean up queue between viewport checks
    await page.evaluate(() => localStorage.removeItem('rq_field_queue'));
  }
});

test('field: per-task note state does not overwrite another task', async ({ page }) => {
  await stubSampleReadApis(page);
  await authenticateFieldWorkspace(page);
  await page.route('**/api/redesign/field/tasks', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      items: [
        { task_id: 'task-alpha', incident_id: 'inc-1', label: 'Sector North Task', status: 'new', lat: 20.3, lon: 81.5 },
        { task_id: 'task-beta', incident_id: 'inc-2', label: 'Sector South Task', status: 'new', lat: 20.4, lon: 81.6 },
      ],
    }),
  }));
  await page.goto('/redesign/field');

  const noteAlpha = page.locator('#note-task-alpha');
  const noteBeta = page.locator('#note-task-beta');

  await noteAlpha.fill('Observation for Alpha');
  await noteBeta.fill('Observation for Beta');

  expect(await noteAlpha.inputValue()).toBe('Observation for Alpha');
  expect(await noteBeta.inputValue()).toBe('Observation for Beta');

  // Saving Alpha does not clear or overwrite Beta
  const cardAlpha = page.getByTestId('field-task-task-alpha');
  await cardAlpha.getByRole('button', { name: 'Save draft on this device' }).click();

  await expect(cardAlpha.getByRole('status')).toContainText('Draft note saved locally');
  expect(await noteAlpha.inputValue()).toBe('');
  expect(await noteBeta.inputValue()).toBe('Observation for Beta');

  await page.evaluate(() => localStorage.removeItem('rq_field_queue'));
});

test('field: explicit UI states for loading, error, empty, and offline banner', async ({ page }) => {
  await stubSampleReadApis(page);
  await authenticateFieldWorkspace(page);
  let failing = true;
  await page.route('**/api/redesign/field/tasks', (route) => {
    if (failing) return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto('/redesign/field');
  await expect(page.getByTestId('field-error')).toBeVisible();
  await expect(page.getByText('Example tasks could not be loaded.')).toBeVisible();

  // Retry after connection recovers loads empty state
  failing = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('field-empty')).toBeVisible();
  await expect(page.getByText('No active tasks in this example.')).toBeVisible();
});

test('incident: selecting a different saved incident updates incident ID and resets timeline', async ({ page }) => {
  await stubSampleReadApis(page);
  await page.goto('/redesign/incident/E2023-084925');

  await expect(page.getByLabel('Saved incident case')).toHaveValue('E2023-084925');
  const grid = page.getByTestId('probability-grid');
  await expect(grid).toHaveAttribute('data-overpass-k', '0');

  // Select Telangana
  await page.getByLabel('Saved incident case').selectOption('E2024-131853');
  await expect(page).toHaveURL(/\/redesign\/incident\/E2024-131853$/);
  await expect(grid).toHaveAttribute('data-overpass-k', '0');
});

test('watch: selecting detection on map or list highlights details and links to spread scenario', async ({ page }) => {
  await stubSampleReadApis(page);
  await page.goto('/redesign/watch');

  await expect(page.getByTestId('selected-detection-panel')).toHaveCount(0);

  // Click detection card in list
  await page.getByLabel('Detection sample-1').click();
  const panel = page.getByTestId('selected-detection-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Example observation');
  await expect(panel.getByRole('link', { name: /Inspect possible spread scenario/i })).toBeVisible();

  // Clear selection
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('selected-detection-panel')).toHaveCount(0);
});

test('field: photo evidence assessment accurately reflects unavailable service and human review fallback', async ({ page }) => {
  await stubSampleReadApis(page);
  await authenticateFieldWorkspace(page);
  await page.goto('/redesign/field');

  // Input file
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'observation-sample.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('minimal-jpeg-data'),
  });

  const assessment = page.getByTestId('evidence-assessment-status');
  await expect(assessment).toBeVisible();
  await expect(assessment).toContainText('Fire Evidence Assessor');
  await expect(assessment).toContainText('Service unavailable (not connected)');
  await expect(assessment).toContainText('Fire / smoke assessment: Unavailable');
  await expect(assessment).toContainText('AI generation check: Unavailable');
  await expect(assessment).toContainText('Image manipulation check: Unavailable');
  await expect(assessment).toContainText('Duplicate detection: Unavailable');
  await expect(assessment).toContainText('Human review:');

  // Confirm no fabricated confidence scores or percentages appear
  const assessmentText = await assessment.innerText();
  expect(assessmentText).not.toMatch(/\b\d{1,3}\s*%/);

  // Normal report draft saving continues to work
  const note = page.getByLabel('Note');
  await note.fill('Photo attached to draft note');
  await page.getByRole('button', { name: 'Save draft on this device' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft note saved locally on this device' })).toBeVisible();

  await page.evaluate(() => localStorage.removeItem('rq_field_queue'));
});
