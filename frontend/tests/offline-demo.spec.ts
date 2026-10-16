import { test, expect } from '@playwright/test';

test('TerraWatch identity is present in the public home, login, PWA metadata, and icon', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('TerraWatch | Wildfire Monitoring & Incident Intelligence');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Community' })).toBeVisible();

  await page.goto('/staff/login');
  await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('');
  await expect(page.getByLabel('Password')).toHaveValue('');
  await expect(page.getByText('Wildfire Monitoring & Incident Intelligence')).toBeVisible();

  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).short_name).toBe('TerraWatch');
  expect((await page.request.get('/terrawatch-icon.svg')).ok()).toBeTruthy();
});

test('former redesign demo URL redirects to the single canonical archive demo', async ({ page }) => {
  await page.goto('/redesign/demo');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
});

test('removed styleguide route returns to the user-facing example home', async ({ page }) => {
  await page.goto('/redesign/styleguide');
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
});

test('historical ranking page labels its date and does not imply a current forecast', async ({ page }) => {
  await page.goto('/redesign/today');
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: "Tomorrow's patrol priority" })).toHaveCount(0);
  await expect(page.getByText(/not a current forecast or a calibrated chance of fire/i)).toBeVisible();
});

test('saved example renders historical ranking and event snapshots without network services', async ({ page }) => {
  const backendRequests: string[] = [];
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\//.test(request.url())) backendRequests.push(request.url());
    if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname)) externalRequests.push(request.url());
  });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/demo');

  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
  await expect(page.getByText('Saved date 2024-03-10 · incomplete area coverage')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Possible fire spread in a saved example' })).toBeVisible();
  await expect(page.getByText(/area ranking and possible-spread example are separate/)).toBeVisible();
  await expect(page.getByLabel('Wildfire case')).toHaveValue('E2024-135332');
  await expect(page.getByLabel('Saved snapshot')).toContainText('2024-03-05 07:53 UTC');
  const maps = page.getByTestId('map-shell');
  await expect(maps).toHaveCount(2);
  for (let mapIndex = 0; mapIndex < await maps.count(); mapIndex += 1) {
    await expect(maps.nth(mapIndex)).toHaveAttribute('data-map-idle', 'true', { timeout: 15_000 });
  }

  await page.getByLabel('Saved snapshot').selectOption('5');
  await expect(page.getByText('Snapshot: 2024-03-06 20:04 UTC')).toBeVisible();
  await page.getByLabel('Wildfire case').selectOption('E2024-131853');
  await expect(page.getByLabel('Saved snapshot')).toContainText('2024-02-16 20:11 UTC');
  await expect(page.getByText(/outline marks places where satellites detected fire activity; it is not a complete fire perimeter/i)).toBeVisible();
  await page.getByLabel('Wildfire case').selectOption('E2023-084925');
  await expect(page.getByLabel('Wildfire case').locator('option:checked')).toContainText('Odisha — Mar 2023');
  await expect(page.getByLabel('Wildfire case').locator('option:checked')).not.toContainText('Similipal');
  expect(backendRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test('primary public and example screens do not expose developer-facing terminology', async ({ page }) => {
  const screens = ['/', '/staff/login', '/community', '/citizen', '/community/archive', '/redesign/today', '/redesign/watch', '/redesign/incident/E2023-084925'];
  const prohibited = /\b(?:API|backend|frontend|payload|schema|database|pipeline|artifact|deployment|repository|Cell2Fire|ERA5-Land|Sentinel-2|VIIRS|PMTiles|GeoJSON|HTTP\s*503|RESQ[0-9]|Bar\s+v3)\b|\bk\s*=|\b(rank|ranked) cells\b/i;
  for (const path of screens) {
    await page.goto(path);
    const visibleCopy = await page.locator('body').innerText();
    expect(visibleCopy, `${path} contains developer-facing terminology`).not.toMatch(prohibited);
  }
});
