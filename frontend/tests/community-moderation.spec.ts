import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Moderators see an advisory media check on community images. It never uses fire or smoke wording and never decides.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const item = (id: number, over: object = {}) => ({ id, reason: 'reported', kind: 'post', held: false, content: `Post ${id}`, author_id: 9, author_name: 'Ravi K.', author_prior_removals: 0, open_reports: 1, severity: 'normal', image: { id: id * 10, url: `/api/community/images/${id * 10}` }, ...over });
const check = (status: string, over: object = {}) => ({ status, indications: { synthetic: 'NOT_ASSESSED', edited: 'NOT_ASSESSED', reused: 'NOT_ASSESSED' }, quality_flags: [], moderator_review_recommended: false, advisory: true, model_version: 'v1', error_code: null, limitations: [], ...over });

async function open(page: Page, items: unknown[]) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'moderator-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 7, name: 'Lead Rao', email: 'l@example.test', role: 'incident_commander' }));
  });
  await page.route('**/api/notices?limit=100', route => route.fulfill(json({ items: [] })));
  await page.route('**/api/community/moderation/queue', route => route.fulfill(json({ items })));
  await page.route('**/api/community/images/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.goto('/ops/notices');
  await page.getByRole('tab', { name: /Moderation/ }).click();
}

test('each media-check status has its own advisory wording, with the persistent advisory line', async ({ page }) => {
  const cases: Array<[string, object, string]> = [
    ['AUTHENTIC_NO_CONCERN', {}, 'No concern found (advisory)'],
    ['POSSIBLE_SYNTHETIC', { moderator_review_recommended: true }, 'Possible AI-generated or synthetic'],
    ['POSSIBLE_EDITED', {}, 'Possible edited or manipulated'],
    ['REUSED', {}, 'Possible reused image'],
    ['INCONCLUSIVE', { quality_flags: ['BLURRY'] }, 'Inconclusive'],
    ['UNAVAILABLE', { error_code: 'MODEL_TIMEOUT' }, 'Assessment unavailable — not a negative result'],
  ];
  await open(page, cases.map(([status, over], index) => item(index + 1, { community_image_assessment: check(status, over) })));
  const cards = page.getByTestId('moderation-media');
  await expect(cards).toHaveCount(cases.length);
  for (const [index, [, , text]] of cases.entries()) {
    await expect(cards.nth(index).getByTestId('community-assessment-status')).toHaveText(text);
    await expect(cards.nth(index).getByTestId('community-advisory')).toHaveText('Advisory only. A moderator decides.');
    await expect(cards.nth(index).getByRole('img', { name: 'Image attached to this post' })).toBeVisible();
  }
  await expect(cards.nth(1)).toContainText('moderator should look at this image');
  await expect(cards.nth(5)).toContainText('took too long');
  const body = await page.getByTestId('moderation').innerText();
  expect(body).not.toMatch(/fire|smoke|flame/i);
  expect(body).not.toMatch(/\bverified\b|\bconfirmed\b/i);
});

test('an image with no assessment is unavailable, and a post without an image shows no media check', async ({ page }) => {
  await open(page, [item(1), item(2, { image: null, community_image_assessment: check('POSSIBLE_EDITED') })]);
  await expect(page.getByTestId('moderation-media')).toHaveCount(1);
  await expect(page.getByTestId('community-assessment-status')).toHaveText('Assessment unavailable — not a negative result');
});

test('the moderator can still decide; the advisory check does not act', async ({ page }) => {
  const calls: unknown[] = [];
  await page.route('**/api/community/moderation/reports/3/resolve', route => { calls.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ status: 'removed' })); });
  await open(page, [item(3, { community_image_assessment: check('POSSIBLE_SYNTHETIC') })]);
  expect(calls).toEqual([]);
  await page.getByLabel(/Reason for your decision/).fill('Looks generated');
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => calls).toEqual([{ action: 'remove', reason: 'Looks generated' }]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the media check has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, [item(1, { community_image_assessment: check('POSSIBLE_EDITED', { quality_flags: ['BLURRY'] }) }), item(2, { community_image_assessment: check('INCONCLUSIVE') })]);
    await expect(page.getByTestId('moderation-media')).toHaveCount(2);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
  });
}
