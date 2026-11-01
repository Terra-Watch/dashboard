import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

// A one-pixel JPEG, big enough to decode in the browser.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

test.describe('Citizen report: send, then see it', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'citizen', 'Asha Rao');
    await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = success => success({ coords: { latitude: 13.6154, longitude: 79.4122, accuracy: 20 } } as GeolocationPosition); });
    await page.route('**/api/public/**', route => route.fulfill(json({ enabled: false, items: [] })));
    await page.route('**/api/inbox', route => route.fulfill(json({ items: [], unread: 0 })));
  });

  test('after sending, the report page shows the acknowledgement, the photo count and the photo itself', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let uploaded = 0;
    await page.route('**/api/citizen/reports', route => route.request().method() === 'POST'
      ? route.fulfill(json({ created: true, report: { id: 55, status: 'reported' } }, 201))
      : route.fulfill(json({ items: [] })));
    await page.route('**/api/citizen/reports/55/evidence', route => { uploaded += 1; return route.fulfill(json({ evidence: { id: 9 } }, 201)); });
    await page.route('**/api/citizen/reports/55/evidence/9', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG }));
    await page.route('**/api/citizen/reports/55', route => route.fulfill(json({ report: { id: 55, status: 'reported', close_reason: null, state: 'AP', latitude: 13.6, longitude: 79.4, observed_at: '2026-11-01T05:00:00Z', created_at: '2026-11-01T05:00:00Z', evidence: [{ id: 9, original_filename: 'photo.jpg' }] } })));
    await page.route('**/api/citizen/reports/55/timeline', route => route.fulfill(json({ items: [{ kind: 'received', at: '2026-11-01T05:00:00Z' }] })));

    await page.goto('/citizen/report');
    await page.locator('input[type=file]').setInputFiles({ name: 'smoke.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await expect(page.getByRole('img', { name: /Photo 1/ })).toBeVisible();
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Send report' }).click();

    await expect(page).toHaveURL(/\/citizen\/reports\/55$/);
    await expect(page.getByText('Report received. Reference #55')).toBeVisible();
    await expect(page.getByText(/1 of 1 photo\(s\) uploaded\./)).toBeVisible();
    await expect(page.getByRole('img', { name: 'A photo you sent with this report' })).toBeVisible();
    expect(uploaded).toBe(1);
    expect(errors).toEqual([]);
  });
});
