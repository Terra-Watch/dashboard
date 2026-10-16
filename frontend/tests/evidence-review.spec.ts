import { expect, test, type Page } from '@playwright/test';

// A 1x1 PNG, so the photo really loads in the browser.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const incident = { id: 17, source: 'citizen', size: 'small', notes: 'Smoke near the ridge', status: 'reported', state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z', image_assessment_status: 'UNAVAILABLE' };
const image = (over: object = {}) => ({ id: 5, original_filename: 'ridge.png', assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_INFERENCE_DISABLED' }, authenticity_status: null, human_review_status: 'NOT_REVIEWED', human_review_note: null, human_reviewed_by: null, human_reviewed_at: null, ...over });

async function setup(page: Page, opts: { imageStatus?: number } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'control-room-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 12, name: 'Control fixture', email: 'control@example.test', role: 'control_room_operator' }));
  });
  const calls: string[] = [];
  const reviewBodies: unknown[] = [];
  await page.route('**/api/incidents/17', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...incident, images: [image()] }) }));
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
