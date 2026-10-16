import { expect, test } from '@playwright/test';

const assignment = { assignment_id: 1, incident_id: 17, source: 'citizen', size: 'small', notes: 'North ridge observation', status: 'assigned', latitude: 20.31, longitude: 81.52 };

async function signInAsFieldCrew(page: import('@playwright/test').Page, role = 'field_crew') {
  await page.addInitScript((selectedRole) => {
    localStorage.setItem('resq_token', 'ranger-browser-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 42, name: 'Ranger fixture', email: 'ranger@example.test', role: selectedRole }));
  }, role);
}

test('unauthenticated Ranger routes use the existing staff sign-in flow', async ({ page }) => {
  await page.goto('/ranger/incidents');
  await expect(page).toHaveURL(/\/staff\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to TerraWatch' })).toBeVisible();
});

test('range officers cannot enter the field_crew Ranger application', async ({ page }) => {
  await signInAsFieldCrew(page, 'range_officer');
  await page.goto('/ranger');
  await expect(page.getByRole('heading', { name: 'Ranger access is restricted' })).toBeVisible();
  await expect(page.getByText(/field_crew permission/i)).toBeVisible();
});

test('field crew Ranger home and incident details use returned task data', async ({ page }) => {
  await signInAsFieldCrew(page);
  await page.route('**/api/ranger/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [assignment] }) }));
  await page.goto('/ranger');
  await expect(page.getByRole('heading', { name: /Ready for the field/i })).toBeVisible();
  await expect(page.getByText('citizen report · small')).toHaveCount(0);
  await page.getByRole('button', { name: 'View incidents' }).click();
  await expect(page).toHaveURL(/\/ranger\/incidents$/);
  await expect(page.getByRole('heading', { name: 'Incidents' })).toBeVisible();
  await expect(page.getByText('citizen report · small')).toBeVisible();
  await page.getByRole('button', { name: 'Open assignment' }).click();
  await expect(page).toHaveURL(/\/ranger\/incidents\/1$/);
  await expect(page.getByText('20.31000, 81.52000')).toBeVisible();
});

test('field report submits only through the supported endpoint and requires confirmation', async ({ page }) => {
  await signInAsFieldCrew(page);
  await page.route('**/api/ranger/assignments', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [assignment] }) }));
  let submitted = false;
  await page.route('**/api/ranger/assignments/1/verification', async route => {
    submitted = true;
    const body = JSON.parse(route.request().postData() ?? '{}');
    expect(body.notes).toBe('Smoke observed near the ridge.');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ verification: { id: 2 } }) });
  });
  await page.goto('/ranger/reports/new?task=1');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Observation note').fill('Smoke observed near the ridge.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Submit verification' }).click();
  await expect(page.getByText(/Verification submitted and confirmed/i)).toBeVisible();
  expect(submitted).toBe(true);
  await expect(page.getByText(/assessment complete|human verified|evidence uploaded/i)).toHaveCount(0);
});

test('Ranger evidence route requires an authorized assignment and supports secure upload', async ({ page }) => {
  await signInAsFieldCrew(page);
  await page.goto('/ranger/evidence');
  await expect(page.getByText(/server-authorized assignment/i)).toBeVisible();
  await page.goto('/ranger/evidence?assignment=1');
  await expect(page.getByRole('heading', { name: 'Capture evidence' })).toBeVisible();
  await expect(page.getByLabel('Photograph')).toBeVisible();
});

test('field task errors preserve truthful 503 handling and mobile navigation', async ({ page }) => {
  await signInAsFieldCrew(page);
  await page.route('**/api/ranger/assignments', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'temporarily unavailable' }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ranger/incidents');
  await expect(page.getByRole('alert')).toContainText(/unavailable|could not/i);
  await expect(page.getByRole('navigation', { name: 'Ranger mobile navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
