import { test, expect } from '@playwright/test';

test('public community feed is separate from incident reporting', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/community/posts*', async route => {
    requests.push(route.request().url());
    await route.fulfill({ json: { items: [], page: 1, page_size: 20, total: 0, has_more: false } });
  });
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: /Public information, local context/i })).toBeVisible();
  await expect(page.getByText(/No community posts yet/i)).toBeVisible();
  await expect(page.locator('body')).toContainText(/never create a fire report, notify responders/i);
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toContain('/incidents');
});

test('community posting requires authentication and links to Citizen sign-in', async ({ page }) => {
  await page.route('**/api/community/posts*', route => route.fulfill({ json: { items: [], page: 1, page_size: 20, total: 0, has_more: false } }));
  await page.goto('/community');
  await page.getByRole('button', { name: 'Sign in to post' }).click();
  await expect(page).toHaveURL(/\/citizen\/login\?returnTo=%2Fcommunity/);
  await expect(page.getByRole('heading', { name: /Sign in to Citizen/i })).toBeVisible();
});
