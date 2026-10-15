import { test, expect } from '@playwright/test';

const alerts = [1, 2].map(id => ({
  id,
  kind: 'New report',
  message: `Report ${id} received.`,
  severity: 'warning',
  status: 'generated',
  read: false,
  state: 'OD',
  created_at: '2026-10-15T00:00:00Z',
}));

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Control room', role: 'admin' }));
  });
}

test('concurrent alert actions keep each alert locked until its own request completes', async ({ page }) => {
  await signInAsAdmin(page);
  await page.route('**/api/alerts', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(alerts),
  }));
  const releases = new Map<number, () => Promise<void>>();
  await page.route('**/api/alerts/*/acknowledge', async route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    await new Promise<void>(resolve => {
      releases.set(id, () => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...alerts[id - 1], status: 'acknowledged', read: true }),
      }).then(resolve));
    });
  });

  await page.goto('/app/alerts');
  const firstAction = page.locator('.record-row').nth(0).getByRole('button', { name: 'Acknowledge' });
  const secondAction = page.locator('.record-row').nth(1).getByRole('button', { name: 'Acknowledge' });
  await expect(firstAction).toBeVisible();
  await expect(secondAction).toBeVisible();
  await firstAction.click();
  await secondAction.click();
  await expect.poll(() => releases.size).toBe(2);
  await expect(page.getByRole('button', { name: 'Acknowledging…' })).toHaveCount(2);

  await releases.get(1)!();
  await expect(page.getByLabel('Status: acknowledged')).toHaveCount(1);
  await expect(page.locator('.record-row').nth(1).getByRole('button', { name: 'Acknowledging…' })).toBeDisabled();
  await releases.get(2)!();
  await expect(page.getByLabel('Status: acknowledged')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0);
});

test('authorization failure leaves alert state unchanged and reports the API error', async ({ page }) => {
  await signInAsAdmin(page);
  await page.route('**/api/alerts', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([alerts[0]]),
  }));
  await page.route('**/api/alerts/1/acknowledge', route => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Not authorized for this alert.' }),
  }));

  await page.goto('/app/alerts');
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.getByRole('alert')).toContainText('You do not have permission');
  await expect(page.getByRole('alert')).not.toContainText('Please try again later');
  await expect(page.getByRole('alert')).not.toContainText('Not authorized for this alert.');
  await expect(page.getByLabel('Status: generated')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge' })).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('expired session is distinguished from a generic request failure', async ({ page }) => {
  await signInAsAdmin(page);
  await page.route('**/api/alerts', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Session expired' }),
  }));

  await page.goto('/app/alerts');
  await expect(page.getByRole('alert')).toContainText('Your session has expired or is invalid. Sign in again.');
  await expect(page.getByRole('alert')).not.toContainText('Session expired');
});
