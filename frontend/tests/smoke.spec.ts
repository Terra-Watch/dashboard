import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('redesigned public landing opens and links to the saved archive', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TerraWatch', { exact: true }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: 'Explore past fire information.' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore the saved example' }).click();
  await expect(page).toHaveURL(/\/demo(?:\?.*)?$/);
});

test('redesign route matching does not capture similarly named paths', async ({ page }) => {
  await page.goto('/redesigned');
  await expect(page).toHaveURL(/\/redesigned$/);
  await expect(page.getByRole('heading', { name: 'This page does not exist.' })).toBeVisible();

  await page.goto('/redesign');
  await expect(page.getByRole('navigation', { name: 'Saved example navigation' })).toBeVisible();
});

test('public landing has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  expect(results.violations.filter(violation => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('sign-in support links are keyboard reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  await page.getByRole('button', { name: 'Forgot password' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test('successful sign-in leaves the login screen', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'test-token', user: { name: 'Forest control', role: 'admin', email: 'admin@resq.local' } }) }));
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@resq.local');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/map(?:\?.*)?$/);
});

test('spread page is a saved example and never submits a new run', async ({ page }) => {
  const runRequests: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Example officer', role: 'officer' }));
  });
  page.on('request', request => {
    if (request.url().includes('/api/spread/jobs')) runRequests.push(request.method());
  });
  await page.goto('/app/spread');
  await expect(page.getByRole('heading', { name: 'Explore possible fire spread' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View the saved historical example' })).toHaveAttribute('href', '/demo');
  await expect(page.locator('.shell-page input, .shell-page select')).toHaveCount(0);
  expect(runRequests).toEqual([]);
});

test('alert type filter limits the displayed alerts to the selected returned type', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Example viewer', role: 'viewer' }));
  });
  await page.route('**/api/alerts', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, kind: 'New report', message: 'A new report was received.', read: false, created_at: '2026-10-15T00:00:00Z' },
      { id: 2, kind: 'Assignment', message: 'A report was assigned.', read: false, created_at: '2026-10-14T00:00:00Z' },
    ]),
  }));
  await page.goto('/app/alerts');
  await expect(page.getByText('A new report was received.')).toBeVisible();
  await expect(page.getByText('A report was assigned.')).toBeVisible();
  await page.getByLabel('Alert type').selectOption('New report');
  await expect(page.getByText('A new report was received.')).toBeVisible();
  await expect(page.getByText('A report was assigned.')).toHaveCount(0);
  await page.getByLabel('Alert type').selectOption('all');
  await expect(page.getByText('A report was assigned.')).toBeVisible();
});

test('alert acknowledgement and resolution reflect API results and announce outcomes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Example operator', role: 'admin' }));
  });
  const alert = { id: 7, kind: 'New report', message: 'A report was received.', severity: 'warning', status: 'generated', read: false, state: 'OD', created_at: '2026-10-15T00:00:00Z' };
  await page.route('**/api/alerts', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([alert]) }));
  await page.route('**/api/alerts/7/acknowledge', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...alert, status: 'acknowledged', read: true }),
  }));
  await page.route('**/api/alerts/7/resolve', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...alert, status: 'resolved', read: true }),
  }));

  await page.goto('/app/alerts');
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.getByRole('status')).toContainText('Alert 7 acknowledged');
  await expect(page.getByLabel('Status: acknowledged')).toBeVisible();
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByRole('status')).toContainText('Alert 7 resolved');
  await expect(page.getByLabel('Status: resolved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
});

test('PWA shell registers and canonical archive demo works on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/demo');
  await page.evaluate(async () => { if (navigator.serviceWorker) await navigator.serviceWorker.ready; });
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
  await expect(page.getByLabel('Wildfire case')).toBeVisible();
  await expect(page.getByLabel('Saved snapshot')).toBeVisible();
});

test('offline incident reports queue without overwriting each other', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'offline-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Field officer', role: 'officer', email: 'officer@resq.local' }));
  });
  await page.route('**/api/incidents', route => route.abort());
  await page.goto('/app/incidents/new');
  await page.getByLabel('State / division').selectOption('OD');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved locally and waiting to sync.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as reported' })).toBeEnabled();
  await page.getByLabel('State / division').selectOption('CG');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await page.waitForTimeout(100);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('resq_pending_incidents') || '[]'));
  expect(queued).toHaveLength(2);
  expect(queued.map((item: { state: string }) => item.state)).toEqual(['OD', 'CG']);
});

test('incident form requires a state and does not queue HTTP validation or server failures', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'offline-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Field officer', role: 'officer' }));
  });
  let requests = 0;
  await page.route('**/api/incidents', route => {
    requests += 1;
    return route.fulfill({ status: requests === 1 ? 422 : 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Request rejected' }) });
  });
  await page.goto('/app/incidents/new');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.getByRole('alert')).toContainText('Select a state or division');
  expect(requests).toBe(0);

  await page.getByLabel('State / division').selectOption('OD');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.success-state')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save as reported' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('resq_pending_incidents'))).toBeNull();
});

test('incident success state distinguishes server acceptance from a local queue', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Field officer', role: 'officer' }));
  });
  await page.route('**/api/incidents', route => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ id: 4, status: 'reported', state: 'OD' }),
  }));
  await page.goto('/app/incidents/new');
  await page.getByLabel('State / division').selectOption('OD');
  await page.getByRole('button', { name: 'Save as reported' }).click();
  await expect(page.getByRole('status')).toContainText('accepted by the server');
  await expect(page.getByRole('button', { name: 'Save as reported' })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('resq_pending_incidents'))).toBeNull();
});

test('concurrent incident transitions keep each row locked until its own API request finishes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Control room', role: 'admin' }));
  });
  const incidents = [1, 2].map(id => ({
    id, source: 'Field report', size: 'Small', notes: '', status: 'reported', state: 'OD',
    created_at: '2026-10-15T00:00:00Z',
  }));
  await page.route('**/api/incidents', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(incidents),
  }));

  const releases = new Map<number, () => Promise<void>>();
  await page.route('**/api/incidents/*/status', async route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    await new Promise<void>(resolve => {
      releases.set(id, () => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...incidents[id - 1], status: 'verified' }),
      }).then(resolve));
    });
  });

  await page.goto('/app/incidents');
  const first = page.getByLabel('Update report 1');
  const second = page.getByLabel('Update report 2');
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await first.selectOption('verified');
  await second.selectOption('verified');
  await expect.poll(() => releases.size).toBe(2);
  await expect(first).toBeDisabled();
  await expect(second).toBeDisabled();

  await releases.get(1)!();
  await expect(page.getByLabel('Update report 1')).toBeEnabled();
  await expect(page.getByLabel('Update report 2')).toBeDisabled();
  await releases.get(2)!();
  await expect(page.getByLabel('Status: Verified')).toHaveCount(2);
});

test('legacy map and priority list selection remain synchronized without refetching geometry', async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Example officer', role: 'admin' }));
  });
  let geometryRequests = 0;
  const records = [
    { cell_id: 11, state: 'OD', rank_percentile: 98, band: 'Very high', top_drivers: [] },
    { cell_id: 12, state: 'CG', rank_percentile: 84, band: 'High', top_drivers: [] },
  ];
  await page.route('**/api/risk/daily**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ forest_cell_count: 2, model: 'fixture', records, coverage_complete: true }),
  }));
  await page.route('**/api/risk/geojson**', route => {
    geometryRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/geo+json',
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: records.map((record, index) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: index === 0 ? [80.2, 21.5] : [80.8, 21.1] },
          properties: { ...record },
        })),
      }),
    });
  });

  await page.addInitScript(() => { delete (Navigator.prototype as { serviceWorker?: ServiceWorkerContainer }).serviceWorker; });
  await page.goto('/app/map');
  const workspace = page.getByTestId('legacy-map-workspace');
  await expect(workspace).toHaveAttribute('data-risk-geometry-ready', 'true', { timeout: 15_000 });
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  const canvas = page.locator('canvas.maplibregl-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Legacy map canvas has no layout box');
  await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(workspace).toHaveAttribute('data-selected-cell-id', '11');
  const first = page.getByTestId('priority-item-11');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Cell 11 · OD' })).toBeVisible();

  await page.getByTestId('priority-item-12').click();
  await expect(workspace).toHaveAttribute('data-selected-cell-id', '12');
  await expect(page.getByTestId('priority-item-12')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('priority-item-11')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Cell 12 · CG' })).toBeVisible();
  expect(geometryRequests).toBe(1);
});
