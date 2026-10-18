import { expect, test } from '@playwright/test';

// The control-room UI must never present an experimental, unavailable or pending assessment as an approved finding.
async function signInAsControlRoom(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('resq_token', 'control-room-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 12, name: 'Control fixture', email: 'control@example.test', role: 'control_room_operator' }));
  });
}

const base = { id: 17, source: 'citizen', size: 'small', notes: 'Smoke near the ridge', status: 'reported', state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z' };
const image = (id: number, over: object) => ({ id, original_filename: `photo-${id}.jpg`, human_review_status: 'NOT_REVIEWED', model_version: 'x', ...over });
const images = [
  // a forged experimental row: its own JSON claims APPROVED + a fire label; the UI must go by the row status
  image(1, { assessment_status: 'EXPERIMENTAL', assessment: { raw_logits: { flames_visible: 1.8648, smoke_visible: -2.1549 }, artifact_status: 'APPROVED', derived_label: 'ACTIVE_FIRE', ood_flag: false } }),
  image(2, { assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_INFERENCE_DISABLED', derived_label: null } }),
  image(3, { assessment_status: 'PENDING', assessment: {} }),
];

async function mock(page: import('@playwright/test').Page) {
  await signInAsControlRoom(page);
  await page.route('**/api/incidents', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...base, image_assessment_status: 'EXPERIMENTAL' }]) }));
  await page.route('**/api/incidents/17', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...base, image_assessment_status: 'EXPERIMENTAL', images }) }));
  await page.route('**/api/incidents/17/history', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/control-room/incidents/17/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignments: [], verifications: [] }) }));
  await page.route('**/api/control-room/rangers', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/incidents/17/images/**', route => route.fulfill({ status: 404, body: '' }));
}

test('experimental, unavailable and pending assessments are labelled and never shown as an approved finding', async ({ page }) => {
  await mock(page);
  await page.goto('/ops/incidents/17');
  await page.getByRole('tab', { name: /Evidence/ }).click();
  await expect(page.getByRole('heading', { name: 'Incident #17' })).toBeVisible();
  const cells = page.getByTestId('image-assessment');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toContainText('EXPERIMENTAL / NOT FOR OPERATIONAL USE');
  await expect(cells.nth(1)).toContainText('Assessment unavailable');
  await expect(cells.nth(1)).toContainText('switched off');
  await expect(cells.nth(2)).toContainText('Assessment pending');
  await expect(page.getByTestId('review-required').first()).toContainText('Human review required');
  await expect(page.getByTestId('assessment-scores')).toHaveCount(0);
  await expect(page.getByTestId('experimental-output')).toHaveCount(1);
  await expect(page.getByTestId('experimental-output')).toContainText('uncalibrated, not probabilities');
  await expect(page.getByTestId('experimental-output')).toContainText('flames 1.86, smoke -2.15');
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/active fire/i);
  expect(body).not.toMatch(/assessment complete/i);
});

test('the queue never calls an experimental assessment complete', async ({ page }) => {
  await mock(page);
  await page.goto('/ops/queue');
  await expect(page.getByText('Experimental output, not for operational use').first()).toBeVisible();
  expect((await page.locator('body').innerText())).not.toMatch(/assessment complete|completed/i);
});
