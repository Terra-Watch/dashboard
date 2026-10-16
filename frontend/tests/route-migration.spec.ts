import { test, expect } from '@playwright/test';

test('public root resolves to the redesigned landing experience', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CITIZEN / COMMUNITY', exact: true })).toBeVisible();
});

test('public archive route survives direct navigation and refresh', async ({ page }) => {
  await page.goto('/demo');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
});

test('redesign landing route survives direct navigation and refresh', async ({ page }) => {
  await page.goto('/redesign');
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();
});

test('historical redesign demo alias resolves to the canonical public archive', async ({ page }) => {
  await page.goto('/redesign/demo');
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole('heading', { name: 'Historical fire-risk ranking' })).toBeVisible();
});

test('removed styleguide alias returns to redesign home without changing route families', async ({ page }) => {
  await page.goto('/redesign/styleguide');
  await expect(page).toHaveURL(/\/redesign$/);
  await expect(page.getByRole('heading', { name: /Know what is public/i })).toBeVisible();

  await page.goto('/redesigned');
  await expect(page).toHaveURL(/\/redesigned$/);
  await expect(page.getByRole('heading', { name: 'This page does not exist.' })).toBeVisible();
});
