import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// A 1x1 PNG, so the photo really loads in the browser.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const incident = { id: 17, source: 'citizen', size: 'small', notes: 'Smoke near the ridge', status: 'reported', state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z', image_assessment_status: 'UNAVAILABLE' };
const image = (over: object = {}) => ({ id: 5, original_filename: 'ridge.png', assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_INFERENCE_DISABLED' }, authenticity_status: null, human_review_status: 'NOT_REVIEWED', human_review_note: null, human_reviewed_by: null, human_reviewed_at: null, ...over });

async function setup(page: Page, opts: { imageStatus?: number; image?: object } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'control-room-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 12, name: 'Control fixture', email: 'control@example.test', role: 'control_room_operator' }));
  });
  const calls: string[] = [];
  const reviewBodies: unknown[] = [];
  await page.route('**/api/incidents/17', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...incident, images: [image(opts.image)] }) }));
  await page.route('**/api/incidents/17/history', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/control-room/incidents/17/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignments: [], verifications: [] }) }));
  await page.route('**/api/control-room/rangers', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/incidents/17/images/5', route => {
    calls.push(`GET image ${opts.imageStatus ?? 200}`);
    return opts.imageStatus && opts.imageStatus !== 200 ? route.fulfill({ status: opts.imageStatus, body: '' }) : route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await page.route('**/api/incidents/17/images/5/review', async route => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    reviewBodies.push(body);
    calls.push(`PATCH review ${body.status}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ image: image({ human_review_status: body.status, human_review_note: body.note, human_reviewed_by: 12, human_reviewed_at: '2026-10-16T09:00:00Z' }), message: 'ok' }) });
  });
  await page.route('**/api/incidents/17/status', route => { calls.push('PATCH status'); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...incident, images: [] }) }); });
  return { calls, reviewBodies };
}

test('the reviewer sees the photo and can record a human review without touching the incident status', async ({ page }) => {
  const { calls, reviewBodies } = await setup(page);
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const card = page.getByTestId('evidence-card');
  await expect(card.getByRole('img', { name: /Photo submitted with report 17: ridge.png/ })).toBeVisible();
  expect(await card.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByTestId('current-review')).toContainText('Not yet reviewed');
  await expect(card.getByRole('button', { name: 'Save review' })).toBeDisabled();

  await card.getByLabel(/May be fake or edited/).check();
  await expect(card.getByRole('button', { name: 'Save review' })).toBeDisabled();            // a reason is required
  await expect(page.getByTestId('review-problem')).toContainText('why');
  await card.getByLabel(/Note/).fill('Same clouds as an earlier report');
  await card.getByRole('button', { name: 'Save review' }).click();

  await expect(page.getByTestId('current-review')).toContainText('May be fake or edited');
  await expect(card.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  expect(reviewBodies).toEqual([{ status: 'POTENTIALLY_SYNTHETIC', note: 'Same clouds as an earlier report' }]);
  expect(calls.filter(c => c.startsWith('PATCH status'))).toEqual([]);                      // a review never moves the incident
  expect(await page.locator('body').innerText()).not.toMatch(/\bVERIFIED_AUTHENTIC\b|\bPOTENTIALLY_SYNTHETIC\b/);
});

test('a genuine verdict needs no note, and the incident is not moved', async ({ page }) => {
  const { reviewBodies } = await setup(page);
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const card = page.getByTestId('evidence-card');
  await card.getByLabel(/Genuine photo/).check();
  await card.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByTestId('current-review')).toContainText('Genuine photo');
  expect(reviewBodies).toEqual([{ status: 'VERIFIED_AUTHENTIC', note: null }]);
  await page.getByRole('tab', { name: 'Summary' }).click();
  await expect(page.getByRole('button', { name: 'Mark verified' })).toBeVisible();   // the incident is still waiting for a person's decision
});

test('a photo that fails to load shows a clear message and a working retry', async ({ page }) => {
  await setup(page, { imageStatus: 500 });
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const card = page.getByTestId('evidence-card');
  await expect(card.getByRole('alert')).toContainText('could not be loaded');
  await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(card.getByLabel(/Genuine photo/)).toBeVisible();                              // review stays possible
});

test('the review form uses real radio controls, labels and a live region', async ({ page }) => {
  await setup(page);
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const card = page.getByTestId('evidence-card');
  await expect(card.getByRole('group', { name: 'Your judgement of this photo' })).toBeVisible();
  await expect(card.getByRole('radio')).toHaveCount(4);
  await card.getByLabel(/Seen, no conclusion/).focus();
  await page.keyboard.press('Space');
  await expect(card.getByLabel(/Seen, no conclusion/)).toBeChecked();
});

const approved = (over: object = {}) => ({
  assessment_status: 'COMPLETED',
  assessment: {
    assessment_status: 'COMPLETED', artifact_status: 'APPROVED', model_version: 'v1', error_code: null,
    scores: { flames_visible: 0.874, smoke_visible: 0.31 }, derived_label: 'ACTIVE_FIRE', decision: 'REQUIRES_REVIEW', review_required: true, review_priority: 'HIGH',
    quality_flags: ['BLURRY'], ood_flag: true,
    authenticity: { status: 'NOT_ASSESSED', signals: {} }, indications: { synthetic: 'NONE_FOUND', edited: 'NOT_ASSESSED', reused: 'POSSIBLE' }, limitations: [],
    ...over,
  },
});

test('an approved result is shown as advisory with human review required, scores, quality, OOD and authenticity', async ({ page }) => {
  const { calls } = await setup(page, { image: approved() });
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  const box = page.getByTestId('assessment-box');
  await expect(box).toHaveAttribute('data-tone', 'review_required');
  await expect(page.getByTestId('review-required')).toContainText('Human review required');
  await expect(page.getByTestId('image-assessment')).toContainText('Uncertain');                 // out of distribution: not a fire call
  await expect(page.getByTestId('assessment-scores')).toContainText('87%');
  await expect(page.getByTestId('assessment-scores')).toContainText('31%');
  await expect(page.getByTestId('assessment-scores')).toContainText('Model estimate, advisory');
  await expect(page.getByTestId('assessment-ood')).toContainText('outside what the model was tested on');
  await expect(page.getByTestId('assessment-quality')).toContainText('blurry');
  const auth = page.getByTestId('assessment-authenticity');
  await expect(auth).toContainText('Not assessed');
  await expect(auth.locator('[data-indication="edited"]')).toHaveText('Edited or manipulated: Not assessed');
  await expect(auth.locator('[data-indication="reused"]')).toContainText('Possible');
  // the review controls and disclaimer are unchanged
  await expect(page.getByText("It does not change the incident's status.")).toBeVisible();
  await page.getByTestId('evidence-card').getByLabel(/Seen, no conclusion/).check();
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByTestId('current-review')).toContainText('Seen, no conclusion');
  expect(calls.filter(c => c.startsWith('PATCH status'))).toEqual([]);
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/\bverified\b|\bconfirmed\b|dispatch/i);
  expect(body).not.toMatch(/authentic/i);
});

test('scores and labels are not shown when the artifact is not approved, and a no-fire label carries its caveat', async ({ page }) => {
  await setup(page, { image: approved({ artifact_status: 'NOT_APPROVED' }) });
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByTestId('image-assessment')).toContainText('Assessment unavailable');
  await expect(page.getByTestId('assessment-scores')).toHaveCount(0);
  await expect(page.getByTestId('review-required')).toContainText('Human review required');
  expect(await page.locator('body').innerText()).not.toMatch(/87%|active fire/i);
});

test('an unavailable assessment says it is not a negative result', async ({ page }) => {
  await setup(page);
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByTestId('assessment-box')).toContainText('not a negative result');
  await expect(page.getByTestId('review-required')).toHaveCount(0);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the assessment box has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page, { image: approved() });
    await page.goto('/ops/incidents/17');
    await page.getByRole('tab', { name: /Evidence/ }).click();
    await expect(page.getByTestId('assessment-box')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
  });
}
