import { expect, test } from '@playwright/test';

test('Citizen login and registration use separate server endpoints', async ({ page }) => {
  const authRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/auth/')) authRequests.push(request.url()); });
  await page.route('**/api/auth/citizen/login', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid email or password.' }) }));
  await page.goto('/citizen/login?returnTo=%2Fcitizen%2Fcommunity');
  await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();
  await page.getByLabel('Email').fill('person@example.test');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/Invalid email or password/i);
  expect(authRequests.some(url => url.includes('/api/auth/citizen/login'))).toBe(true);
  await page.getByRole('button', { name: /Need an account/i }).click();
  await expect(page).toHaveURL(/\/citizen\/register\?returnTo=/);
  await page.route('**/api/auth/citizen/register', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ detail: 'An account for this email already exists' }) }));
  await page.getByLabel('Display name').fill('Test Citizen');
  await page.getByLabel('Confirm password').fill('not-a-real-password');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create Citizen account' }).click();
  await expect(page.getByRole('alert')).toContainText(/already exists/i);
  expect(authRequests.some(url => url.includes('/api/auth/citizen/register'))).toBe(true);
});

test('every protected Citizen feature redirects with an internal return target', async ({ page }) => {
  for (const route of ['/citizen', '/citizen/community', '/citizen/community/create', '/citizen/community/post/42', '/citizen/map', '/citizen/report', '/citizen/reports', '/citizen/profile', '/citizen/safety']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/citizen\/login\?returnTo=/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toMatch(/^\/citizen/);
    await expect(page.getByRole('heading', { name: 'Sign in to Citizen' })).toBeVisible();
  }
});

test('staff or Ranger local roles cannot enter the Citizen application', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'staff-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 7, name: 'Ranger', role: 'field_crew' }));
  });
  await page.goto('/citizen/community');
  await expect(page).toHaveURL(/\/citizen\/community$/);
  await expect(page.getByRole('heading', { name: 'Citizen access is restricted' })).toBeVisible();
});
