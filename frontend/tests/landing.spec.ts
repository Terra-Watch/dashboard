import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test.beforeEach(async ({ page }) => { await page.route('**/api/public/status', route => route.fulfill({ status: 404, body: '' })); });

  test('the installed app opens a signed-in person on their own workspace; a visitor still sees the introduction', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.goto('/?source=pwa');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See where wildfire is likely tomorrow');
    await page.addInitScript(() => { localStorage.setItem('resq_token', 't'); localStorage.setItem('resq_user', JSON.stringify({ id: 3, name: 'Asha', email: 'a@x.in', role: 'field_crew' })); });
    await page.goto('/?source=pwa');
    await expect(page).toHaveURL(/\/field\/tasks/);
  });

  test('introduces the product, has no community link, and is honest when no public data exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See where wildfire is likely tomorrow');
    await expect(page.getByRole('link', { name: 'Report a fire' }).first()).toBeVisible();
    await expect(page.getByText('If anyone is in danger, call emergency services first.')).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: /community/i })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(/\bdemo(nstration)?s?\b|\bexperiment/i);
  });

  test('the flow shows the five steps of one fire, each with its question', async ({ page }) => {
    await page.goto('/');
    const flow = page.getByTestId('flow-steps');
    await expect(flow.getByRole('heading', { name: 'How one fire moves through TerraWatch' })).toBeVisible();
    for (const [title, question] of [['Forecast', 'Where is a fire likely tomorrow?'], ['Satellite', 'Is this detection a real fire?'], ['Active fires', 'Which fires matter now?'], ['Action', 'What do we do?'], ['Record', 'Was it right?']]) {
      await expect(flow.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(flow.getByText(question)).toBeVisible();
    }
    expect(await page.locator('body').innerText()).not.toMatch(/ladder|authentic|edited or AI/i);
  });

  test('language switch changes the page and the document language', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('menuitem', { name: 'हिन्दी' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('कल आग कहाँ की संभावना है');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('hi');
    await page.getByRole('button', { name: 'भाषा', exact: true }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See where wildfire is likely tomorrow');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme}, phone and desktop)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        await page.getByRole('heading', { name: 'How one fire moves through TerraWatch' }).scrollIntoViewIfNeeded();
        await page.waitForTimeout(700);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const serious = result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
        expect(serious.map(item => `${item.id}: ${item.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
      }
    });
  }
});

test('the landing page shows the spread outlook picture and the evidence numbers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Know where an active fire is likely to go next' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tested before it is shown' })).toBeVisible();
  await expect(page.getByText('17', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/The top band held \d+% of the/)).toBeVisible();
  await expect(page.getByText('What the outlook ranked')).toBeVisible();
  for (const [i, name] of ['See where wildfire is likely tomorrow', 'Tested before it is shown', 'See where fire is most likely tomorrow', 'Know where an active fire is likely to go next', 'Lookout stations that watch the forest between satellite passes', 'What TerraWatch does'].entries()) {
    const h = page.getByRole('heading', { name }).first(); await h.scrollIntoViewIfNeeded(); await page.waitForTimeout(1800);
    await page.screenshot({ path: `test-results/landing-${i}.png` });
  }
});
