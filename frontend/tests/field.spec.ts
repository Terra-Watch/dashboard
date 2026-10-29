import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const TASKS = [
  { assignment_id: 11, incident_id: 41, status: 'assigned', source: 'citizen', size: 'unknown', notes: 'Smoke on the ridge', latitude: 20.31, longitude: 85.82 },
  { assignment_id: 12, incident_id: 42, status: 'accepted', source: 'citizen', size: 'small', notes: 'Flames seen', latitude: 20.4, longitude: 85.9 },
];

test.describe('Range Officer', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'field_crew', 'Officer Rao');
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/public/contacts', route => route.fulfill(json({ configured: false, items: [] })));
  });

  test('signed-out visitors are sent to sign in and then back', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/field/tasks');
    await expect(page).toHaveURL(/\/login\?next=%2Ffield%2Ftasks/);
  });

  test('citizens cannot use the field area', async ({ page }) => {
    await signedInAs(page, 'citizen');
    await page.goto('/field/tasks');
    await expect(page.getByRole('heading', { name: 'This area is for Range Officers.' })).toBeVisible();
  });

  test('tasks are grouped, navigation has five destinations with Capture raised in the middle', async ({ page, context }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 20.3, longitude: 85.8 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/field/tasks');
    await expect(page.getByRole('heading', { name: 'Waiting for your answer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your active tasks' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(nav.getByRole('link').nth(2)).toHaveText(/Capture/);          // the raised button is the middle of five
    await expect(nav.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Capture' })).toBeVisible();
    await page.getByRole('button', { name: 'Show distance from me' }).click();
    await expect(page.getByText(/straight line/).first()).toBeVisible();
    await expect(page.getByText(/\d+(\.\d)? km [NESW]+/).first()).toBeVisible();
  });

  test('a new task can be accepted, or declined only with a reason', async ({ page }) => {
    const calls: unknown[] = [];
    let tasks = TASKS;
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: tasks })));
    await page.route('**/api/ranger/assignments/11/decision', route => { calls.push(JSON.parse(route.request().postData() ?? '{}')); tasks = tasks.map(t => t.assignment_id === 11 ? { ...t, status: 'accepted' } : t); return route.fulfill(json({ assignment: {} })); });
    await page.goto('/field/tasks/11');
    await page.getByRole('button', { name: 'Decline' }).click();
    const decline = page.getByRole('button', { name: 'Decline task' });
    await expect(decline).toBeDisabled();
    await page.getByLabel('Reason').fill('Off duty until Monday');
    await expect(decline).toBeEnabled();
    await page.getByRole('button', { name: 'Keep it' }).click();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => calls).toEqual([{ decision: 'accepted' }]);
    await expect(page.getByRole('heading', { name: 'Record what you find' })).toBeVisible();
  });

  test('declining sends the reason and ends the task view', async ({ page }) => {
    const calls: unknown[] = [];
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await page.route('**/api/ranger/assignments/11/decision', route => { calls.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ assignment: {} })); });
    await page.goto('/field/tasks/11');
    await page.getByRole('button', { name: 'Decline' }).click();
    await page.getByLabel('Reason').fill('Off duty until Monday');
    await page.getByRole('button', { name: 'Decline task' }).click();
    await expect(page.getByText('You declined this task. The Control Room has been told.')).toBeVisible();
    expect(calls).toEqual([{ decision: 'declined', reason: 'Off duty until Monday' }]);
  });

  test('observations need an outcome and words, are saved with a retry key, and finishing needs one', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = []; const completes: string[] = [];
    let observations: unknown[] = [];
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await page.route('**/api/ranger/assignments/12/verifications', route => route.fulfill(json({ items: observations })));
    await page.route('**/api/ranger/assignments/12/verification', route => { const body = JSON.parse(route.request().postData() ?? '{}'); bodies.push(body); observations = [{ id: 1, outcome: body.outcome, notes: body.notes, observed_at: body.observed_at }]; return route.fulfill(json({ verification: { id: 1 } }, 201)); });
    await page.route('**/api/ranger/assignments/12/complete', route => { completes.push('x'); return route.fulfill(json({ assignment: {} })); });
    await page.goto('/field/tasks/12');
    const finish = page.getByRole('button', { name: 'Finish field work' });
    await expect(finish).toBeDisabled();
    const save = page.getByRole('button', { name: 'Save observation' });
    await expect(save).toBeDisabled();
    await page.getByLabel('What did you find?').selectOption('confirmed');
    await page.getByLabel('What you saw').fill('Flames on the east slope, wind from the west');
    await save.click();
    await expect(page.getByText('Saved and sent to the Control Room.')).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ outcome: 'confirmed', notes: 'Flames on the east slope, wind from the west' });
    expect(String(bodies[0].idempotency_key)).toHaveLength(36);
    await expect(page.getByRole('list').filter({ hasText: 'Flames on the east slope' })).toBeVisible();
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(page.getByText('Field work is complete. The Control Room has been told.')).toBeVisible();
    expect(completes).toHaveLength(1);
  });

  test('offline, an observation is kept on the phone and the officer is told so', async ({ page }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await page.route('**/api/ranger/assignments/12/verifications', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/ranger/assignments/12/verification', route => route.abort('internetdisconnected'));
    await page.goto('/field/tasks/12');
    await page.getByLabel('What did you find?').selectOption('inconclusive');
    await page.getByLabel('What you saw').fill('Heavy haze, cannot tell');
    await page.getByRole('button', { name: 'Save observation' }).click();
    await expect(page.getByText('Saved on this phone. It will be sent when you have signal.')).toBeVisible();
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('resq_offline_queue') ?? '[]'));
    expect(queued).toHaveLength(1);
    expect(queued[0].path).toBe('/api/ranger/assignments/12/verification');
  });

  test('Me shows who you are and what is waiting to send; the notices have their own tab', async ({ page }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/auth/me', route => route.fulfill(json({ id: 7, name: 'Officer Rao', email: 'person@example.test', role: 'field_crew', home_state: 'OD', scopes: ['OD'] })));
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [{ id: 1, title: 'Smoke advisory', body: 'Avoid the ridge road.', severity: 'advisory', expires_at: '2030-01-01T00:00:00Z', published_at: '2026-10-16T05:30:00Z' }] })));
    await page.goto('/field/me');
    await expect(page.getByText('Everything has been sent.')).toBeVisible();
    await expect(page.getByText('person@example.test')).toBeVisible();
    await expect(page.getByText('Range Officer', { exact: true })).toBeVisible();
    await expect(page.getByText('Odisha')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.goto('/field/notices');
    await expect(page.getByText('Avoid the ridge road.')).toBeVisible();
  });

  test('Capture works without a task: a report with a place goes to the Control Room', async ({ page, context }) => {
    const sent: Array<Record<string, unknown>> = [];
    await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 20.3, longitude: 85.8 });
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/ranger/reports', route => { sent.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ id: 77, status: 'reported' }, 201)); });
    await page.route('**/api/ranger/reports/77/evidence', route => route.fulfill(json({ evidence: { id: 1 } }, 201)));
    await page.goto('/field/capture');
    await expect(page.getByText('Report something you found. It does not need a task.')).toBeVisible();
    const send = page.getByRole('button', { name: 'Send to the Control Room' });
    await page.getByLabel('What you saw').fill('Smoke rising behind the ridge');
    await expect(send).toBeDisabled();                                        // no place yet
    await page.getByRole('button', { name: 'Show distance from me' }).click();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText('Sent to the Control Room. They will check it.')).toBeVisible();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ notes: 'Smoke rising behind the ridge', size: 'unknown', latitude: 20.3, longitude: 85.8 });
    expect(String(sent[0].client_key).length).toBeGreaterThanOrEqual(8);
    await expect(page.getByRole('button', { name: 'Take or choose a photo' })).toBeVisible();   // a photo can now be added to this report
  });

  test('with a task, Capture offers both: for my task, or a new report', async ({ page }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await page.route('**/api/ranger/assignments/12/verifications', route => route.fulfill(json({ items: [] })));
    await page.goto('/field/capture');
    await expect(page.getByRole('heading', { name: 'Record what you find' })).toBeVisible();
    await page.getByRole('tab', { name: 'New report' }).click();
    await expect(page.getByRole('button', { name: 'Send to the Control Room' })).toBeVisible();
    await page.getByRole('tab', { name: 'For my task' }).click();
    await expect(page.getByRole('heading', { name: 'Record what you find' })).toBeVisible();
  });

  test('on a phone the bar is on screen and the raised Capture button is exactly in the middle', async ({ page }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: [] })));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/field/tasks');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    const box = await nav.getByRole('link', { name: 'Capture' }).boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - 390 / 2)).toBeLessThan(2);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme}, phone)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
      await page.route('**/api/ranger/assignments/12/verifications', route => route.fulfill(json({ items: [] })));
      await page.setViewportSize({ width: 360, height: 700 });
      for (const path of ['/field/tasks', '/field/tasks/12', '/field/tasks/11', '/field/capture', '/field/me']) {
        await page.goto(path); await page.waitForTimeout(300);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${path} ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
      }
    });
  }

  test('the map shows the task, signals marked not confirmed and wind, and never a scenario', async ({ page, context }) => {
    await page.route('**/api/ranger/assignments', route => route.fulfill(json({ items: TASKS })));
    await page.route('**/api/hotspots/near-task/11**', route => route.fulfill(json({ items: [{ id: 1, latitude: 20.32, longitude: 85.83, acq_datetime: new Date().toISOString(), age_minutes: 30, distance_km: 2 }], radius_km: 10 })));
    await page.route('**/api/weather/context**', route => route.fulfill(json({ wind_speed_ms: 3.2, wind_dir_deg: 225, valid_time: new Date().toISOString(), freshness: { age_seconds: 600, stale: false } })));
    await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 20.3, longitude: 85.8 });
    await page.goto('/field/map');
    await expect(page.getByText(/1 satellite signals within 10 km. They are not confirmed./)).toBeVisible();
    await expect(page.getByText(/Wind now/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Map on this phone' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save map for offline' })).toBeVisible();
    await expect(page.getByText(/scenario|spread/i)).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
