import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test.beforeEach(async ({ page }) => { await page.route('**/api/public/status', route => route.fulfill({ status: 404, body: '' })); });

  test('the installed app opens a signed-in person on their own workspace; a visitor still sees the introduction', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.goto('/?source=pwa');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See fires early');
    await page.addInitScript(() => { localStorage.setItem('resq_token', 't'); localStorage.setItem('resq_user', JSON.stringify({ id: 3, name: 'Asha', email: 'a@x.in', role: 'field_crew' })); });
    await page.goto('/?source=pwa');
    await expect(page).toHaveURL(/\/field\/tasks/);
  });

  test('introduces the product, has no community link, and is honest when no public data exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See fires early');
    await expect(page.getByRole('link', { name: 'Report a fire' })).toBeVisible();
    await expect(page.getByText('Public map data is not available yet.')).toBeVisible();
    await expect(page.getByText('If anyone is in danger, call emergency services first.')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: /community/i })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/\bdemo(nstration)?s?\b|\bexperiment/i);
  });

  test('the ladder player steps through every rung and shows who acts, what staff see and what the public sees', async ({ page }) => {
    await page.goto('/');
    const player = page.getByTestId('ladder-player');
    await player.getByRole('button', { name: /Verified/ }).click();
    await expect(player.getByText('Control Room staff check the evidence and decide it is real.')).toBeVisible();
    await expect(player.getByText('A coarse area and a delayed time, if public sharing is approved.')).toBeVisible();
    await player.getByRole('button', { name: 'Next step' }).click();
    await expect(player.getByText('A Range Officer accepts the task, goes to the place and records what they see.')).toBeVisible();
    await player.getByRole('button', { name: /Satellite signal/ }).click();
    await expect(player.getByText('A satellite sensor sees heat. No person has looked yet.')).toBeVisible();
    await expect(player.getByText('Nothing yet.')).toBeVisible();
  });

  test('auto-play exists, but not for people who prefer reduced motion', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next step' })).toBeVisible();
  });

  test('role explorer shows each role\'s real navigation', async ({ page }) => {
    await page.goto('/');
    const explorer = page.getByTestId('role-explorer');
    await expect(explorer.getByRole('button', { name: /Near me/ })).toBeVisible();
    await explorer.getByRole('tab', { name: 'Control Room' }).click();
    for (const name of ['Queue', 'Map', 'Field', 'Notices', 'Handover']) await expect(explorer.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
    await explorer.getByRole('button', { name: /^Notices/ }).click();
    await expect(explorer.getByRole('button', { name: /^Notices/ })).toHaveAttribute('aria-pressed', 'true');
    await explorer.getByRole('tab', { name: 'Range Officer' }).click();
    await expect(explorer.getByRole('button', { name: /^Capture/ })).toBeVisible();
    await expect(explorer.getByRole('button', { name: /^Community/ })).toHaveCount(0);
  });

  test('public and staff views of the map differ: unchecked items appear only to staff', async ({ page }) => {
    await page.goto('/');
    const map = page.getByTestId('privacy-map');
    await expect(map.getByText('Coarse public area', { exact: true })).toBeVisible();
    await expect(map.getByText('Unchecked report', { exact: true })).toHaveCount(0);
    await map.getByRole('button', { name: 'Staff view' }).click();
    await expect(map.getByText('Unchecked report', { exact: true })).toBeVisible();
    await expect(map.getByText('Satellite signal', { exact: true })).toBeVisible();
    await expect(map.getByText('Coarse public area', { exact: true })).toHaveCount(0);
  });

  test('language switch changes the page and the document language', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('menuitem', { name: 'हिन्दी' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('आग को जल्दी देखें');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('hi');
    await page.getByRole('button', { name: 'भाषा', exact: true }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See fires early');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme}, phone and desktop)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await page.getByTestId('privacy-map').scrollIntoViewIfNeeded();
        await page.getByRole('heading', { name: 'How a report is handled' }).scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const serious = result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
        expect(serious.map(item => `${item.id}: ${item.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
      }
    });
  }
});
