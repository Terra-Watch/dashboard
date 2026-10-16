import { expect, test } from '@playwright/test';

async function signInAsControlRoom(page: import('@playwright/test').Page, role = 'control_room_operator') {
  await page.addInitScript((selectedRole) => {
    localStorage.setItem('resq_token', 'control-room-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 12, name: 'Control fixture', email: 'control@example.test', role: selectedRole }));
  }, role);
}

const incident = { id: 17, source: 'citizen', size: 'small', notes: 'Smoke near the ridge', status: 'reported', state: 'OD', created_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z', image_assessment_status: 'UNAVAILABLE' };

test('unauthenticated Control Room routes use shared staff authentication', async ({ page }) => {
  await page.goto('/control-room');
  await expect(page).toHaveURL(/\/staff\/login\?workspace=control-room$/);
});

test('Control Room queue uses persisted incident data and no invented counts', async ({ page }) => {
  await signInAsControlRoom(page);
  await page.route('**/api/incidents', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([incident]) }));
  await page.goto('/control-room');
  await expect(page.getByRole('heading', { name: 'Control Room' })).toBeVisible();
  await expect(page.getByText('Open incidents').locator('..').getByText('1')).toBeVisible();
  await page.getByRole('button', { name: 'Open incident queue' }).click();
  await expect(page).toHaveURL(/\/control-room\/incidents$/);
  await expect(page.getByText('Report 17')).toBeVisible();
});

test('Control Room incident detail requires actual API responses before state changes', async ({ page }) => {
  await signInAsControlRoom(page);
  await page.route('**/api/incidents/17', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...incident, images: [] }) }));
  await page.route('**/api/incidents/17/history', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) }));
  await page.route('**/api/control-room/incidents/17/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignments: [], verifications: [] }) }));
  await page.route('**/api/control-room/rangers', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 42, name: 'Ranger fixture' }] }) }));
  let transitionRequest = false;
  await page.route('**/api/incidents/17/status', async route => { transitionRequest = true; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...incident, status: 'verified', images: [] }) }); });
  await page.goto('/control-room/incidents/17');
  await expect(page.getByRole('heading', { name: 'Report 17' })).toBeVisible();
  await page.getByLabel('Change incident state').selectOption('verified');
  await expect(page.getByRole('status')).toContainText(/now Verified/);
  expect(transitionRequest).toBe(true);
});
