import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

// A one-pixel JPEG, big enough to decode in the browser.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

// The report screen only takes live camera photos: the browser is given a fake camera, and the phone's compass is faked as "facing west".
test.use({ permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test.describe('Citizen report: send, then see it', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'citizen', 'Asha Rao');
    await page.addInitScript(() => { if (!('DeviceOrientationEvent' in window)) (window as unknown as Record<string, unknown>).DeviceOrientationEvent = class extends Event {};   // headless Chromium has no motion sensors
      setInterval(() => ['deviceorientationabsolute', 'deviceorientation'].forEach(name => window.dispatchEvent(Object.assign(new Event(name), { alpha: 90, beta: 90, gamma: 0, absolute: true }))), 50); });
    await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = success => success({ coords: { latitude: 13.6154, longitude: 79.4122, accuracy: 20 } } as GeolocationPosition); });
    await page.route('**/api/public/**', route => route.fulfill(json({ enabled: false, items: [] })));
    await page.route('**/api/inbox', route => route.fulfill(json({ items: [], unread: 0 })));
  });

  test('after sending, the report page shows the acknowledgement, the photo count and the photo itself', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let uploaded = 0;
    let sent: Record<string, unknown> = {};
    await page.route('**/api/citizen/reports', route => route.request().method() === 'POST'
      ? (sent = route.request().postDataJSON(), route.fulfill(json({ created: true, report: { id: 55, status: 'reported' } }, 201)))
      : route.fulfill(json({ items: [] })));
    await page.route('**/api/citizen/reports/55/evidence', route => { uploaded += 1; return route.fulfill(json({ evidence: { id: 9 } }, 201)); });
    await page.route('**/api/citizen/reports/55/evidence/9', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG }));
    await page.route('**/api/citizen/reports/55', route => route.fulfill(json({ report: { id: 55, status: 'reported', close_reason: null, state: 'AP', latitude: 13.6, longitude: 79.4, observed_at: '2026-11-01T05:00:00Z', created_at: '2026-11-01T05:00:00Z', evidence: [{ id: 9, original_filename: 'photo.jpg' }] } })));
    await page.route('**/api/citizen/reports/55/timeline', route => route.fulfill(json({ items: [{ kind: 'received', at: '2026-11-01T05:00:00Z' }] })));

    await page.goto('/citizen/report');
    await expect(page.locator('input[type=file]')).toHaveCount(0);   // no way to pick a file from the gallery
    await page.getByRole('button', { name: 'Open the camera' }).click();
    await expect(page.getByText('Facing W (270°)')).toBeVisible();
    await page.getByRole('button', { name: 'Take photo' }).click();
    await expect(page.getByRole('img', { name: /Photo 1/ })).toBeVisible();
    await expect(page.getByText(/taken facing W \(270°\)/)).toBeVisible();
    await page.getByRole('radio', { name: 'More than 3 km' }).click();
    await page.getByRole('radio', { name: 'Smoke is rising' }).click();
    await page.getByRole('button', { name: 'Send report' }).click();

    await expect(page).toHaveURL(/\/citizen\/reports\/55$/);
    await expect(page.getByText('Report received. Reference #55')).toBeVisible();
    await expect(page.getByText(/1 of 1 photo\(s\) uploaded\./)).toBeVisible();
    await expect(page.getByRole('img', { name: 'A photo you sent with this report' })).toBeVisible();
    expect(uploaded).toBe(1);
    expect(sent).toMatchObject({ bearing_deg: 270, bearing_source: 'compass', distance_band: 'far', observer_latitude: 13.6154, observer_longitude: 79.4122, observer_accuracy_m: 20 });
    expect(errors).toEqual([]);
  });
});
