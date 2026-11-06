import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { json, signedInAs } from './helpers';

const RUN = '../backend/runtime_data/fire_spread/replay-gated-20250425T2103';
const events = JSON.parse(readFileSync(`${RUN}/events.json`, 'utf8'));
const skill = JSON.parse(readFileSync(`${RUN}/skill.json`, 'utf8'));
const file = (name: string) => JSON.parse(readFileSync(`${RUN}/${name}`, 'utf8'));

test.describe('Spread outlook', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/fire-spread/runs/latest', r => r.fulfill(json({ ...events, skill })));
    await page.route(/\/api\/fire-spread\/[^/]+\/[^/]+\/layer\/(places|roads)\/\d+$/, r => { const p = r.request().url().split('/'); r.fulfill(json(file(`${p[p.length - 4]}_${p[p.length - 2]}_${p[p.length - 1]}h.geojson`))); });
    await page.route(/\/api\/fire-spread\/[^/]+\/[^/]+\/pixels$/, r => r.fulfill(json(file(`${r.request().url().split('/').slice(-2)[0]}_pixels.geojson`))));
    await page.route(/\/api\/fire-spread\/[^/]+\/[^/]+\/burned\/\d+$/, r => { const p = r.request().url().split('/'); r.fulfill(json(file(`${p[p.length - 3]}_burned_${p[p.length - 1]}h.geojson`))); });
    await page.route(/\/api\/fire-spread\/[^/]+\/[^/]+\/(24|48)$/, r => { const p = r.request().url().split('/'); r.fulfill(json(file(`${p[p.length - 2]}_${p[p.length - 1]}h.geojson`))); });
    await page.route('**/api/notices**', r => r.fulfill(json({ items: [] })));
    await page.route('**/api/hotspots**', r => r.fulfill(json({ items: [], freshness: { source: 'nasa-firms', fetched_at: new Date().toISOString(), age_seconds: 1, stale: null } })));
  });

  test('gives a one-line answer, switches horizon and shows what burned for an archived fire', async ({ page }) => {
    await page.goto('/ops/outlook');
    await expect(page.getByRole('heading', { name: 'Spread outlook' })).toBeVisible();
    await expect(page.getByText(/archived fires/)).toBeVisible();
    await expect(page.getByTestId('answer')).toContainText('Most likely to spread toward the');
    await page.getByRole('button', { name: '48 h' }).click();
    await expect(page.getByText('Next 48 hours')).toBeVisible();
    await page.getByLabel('Show what actually burned').check();
    await expect(page.getByText(/times as often as simply choosing/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What is in the way' })).toBeVisible();
    await expect(page.getByTestId('people-3')).toBeVisible();
    await page.getByLabel('Likely', { exact: true }).uncheck();                      // a band can be hidden
    await expect(page.getByLabel('Likely', { exact: true })).not.toBeChecked();
    await page.getByLabel('Roads').check();
    await page.screenshot({ path: '../../paper_fire_spread/results/outlook_page.png', fullPage: true });
  });

  test('the old what-if address lands on the outlook, and the page has no accessibility violations', async ({ page }) => {
    await page.goto('/app/whatif');
    await expect(page).toHaveURL(/\/ops\/outlook$/);
    await expect(page.getByTestId('answer')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
