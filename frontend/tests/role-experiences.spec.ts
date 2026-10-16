import { test, expect } from '@playwright/test';

async function signInAs(page: import('@playwright/test').Page, role: string) {
  await page.addInitScript((selectedRole) => {
    localStorage.setItem('resq_token', 'browser-role-fixture');
    localStorage.setItem('resq_user', JSON.stringify({ name: 'Browser fixture', role: selectedRole }));
  }, role);
}

test('public landing exposes separate community, citizen, and staff entry points', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CITIZEN / COMMUNITY', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'RANGER / FIELD OFFICER', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CONTROL ROOM', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue as Citizen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ranger Login' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Control Room Login' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue as Citizen' }).click();
  await expect(page).toHaveURL(/\/citizen\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();
  await page.goto('/community');
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole('heading', { name: /Public information for preparedness/i })).toBeVisible();
  await page.getByRole('link', { name: 'Staff sign in' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
});

test('public archive stays separate from the authenticated staff workspace', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.route('**/api/**', route => route.abort());

  await page.goto('/demo');
  await expect(page.getByRole('navigation', { name: 'Public navigation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
  await expect(page.getByTestId('sample-data-badge')).toHaveAttribute('title', 'Saved historical information. Nothing on this page is live.');
  await expect(page.getByRole('link', { name: 'Staff sign in' })).toHaveAttribute('href', '/staff/login');

  await page.goto('/app/map');
  await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('viewer navigation hides Plan while its existing route guard still blocks direct navigation', async ({ page }) => {
  await signInAs(page, 'viewer');
  await page.goto('/app/map');
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(nav.getByRole('link', { name: 'Plan' })).toHaveCount(0);
  await expect(page.getByLabel('Signed-in account role')).toContainText('viewer');

  // This verifies only the current UI guard; it is not evidence of server-side API authorization.
  await page.goto('/app/plan');
  await expect(page.getByText(/do not have permission/i)).toBeVisible();
});

test('officer and admin navigation retain the existing Plan affordance', async ({ page }) => {
  for (const role of ['officer', 'admin']) {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await signInAs(page, role);
    await page.goto('/app/map');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Plan' })).toBeVisible();
  }
});

test('mobile navigation mirrors the existing role affordance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'viewer');
  await page.goto('/app/map');
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNav.getByRole('link', { name: 'Plan' })).toHaveCount(0);

  const officerPage = await page.context().newPage();
  await officerPage.setViewportSize({ width: 390, height: 844 });
  await signInAs(officerPage, 'officer');
  await officerPage.goto('/app/map');
  await expect(officerPage.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Plan' })).toBeVisible();
});
