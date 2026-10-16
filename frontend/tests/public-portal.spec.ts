import { test, expect } from '@playwright/test';

test.describe('public portal information architecture', () => {
  test('root presents the three experiences without staff authentication', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'CITIZEN / COMMUNITY', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'RANGER / FIELD OFFICER', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CONTROL ROOM', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue as Citizen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ranger Login' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Control Room Login' })).toBeVisible();
  });

  test('entry cards use the supported citizen and shared staff authentication flows', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continue as Citizen' }).click();
    await expect(page).toHaveURL(/\/citizen\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Ranger Login' }).click();
    await expect(page).toHaveURL(/\/staff\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Control Room Login' }).click();
    await expect(page).toHaveURL(/\/staff\/login\?workspace=control-room$/);
    await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  });

  test('public community and archive remain separate while Citizen application routes are protected', async ({ page }) => {
    await page.goto('/community');
    await expect(page.getByRole('heading', { name: /Public information for preparedness/i })).toBeVisible();
    await page.getByRole('link', { name: 'Archive' }).click();
    await expect(page).toHaveURL(/\/community\/archive$/);
    await expect(page.getByText('Historical example', { exact: true })).toBeVisible();
    await page.goto('/citizen');
    await expect(page).toHaveURL(/\/citizen\/login\?returnTo=/);
    await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();
  });

  test('all Citizen application features redirect to Citizen authentication', async ({ page }) => {
    for (const route of ['/citizen/community', '/citizen/community/create', '/citizen/community/post/1', '/citizen/map', '/citizen/report', '/citizen/reports', '/citizen/profile', '/citizen/safety']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/citizen\/login\?returnTo=/);
      await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();
    }
  });

  test('staff login is explicit while protected staff routes remain gated', async ({ page }) => {
    await page.goto('/staff/login');
    await expect(page).toHaveURL(/\/staff\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
    await page.goto('/app/incidents');
    await expect(page).toHaveURL(/\/app\/incidents$/);
    await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  });

  test('unauthenticated Ranger access uses the staff sign-in flow', async ({ page }) => {
    await page.goto('/ranger');
    await expect(page).toHaveURL(/\/staff\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
  });

  test('public mobile navigation has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'CITIZEN / COMMUNITY', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
