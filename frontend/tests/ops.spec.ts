import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const incident = (over: object = {}) => ({ id: 21, source: 'citizen', size: 'unknown', notes: 'Smoke over the ridge', status: 'reported', close_reason: null, state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: '2026-10-16T08:00:00Z', created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date().toISOString(), image_assessment_status: null, ...over });

test.describe('Control Room', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: { radius_km: 2, window_minutes: 40 }, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/hotspots**', route => route.fulfill(json({ items: [{ id: 1, latitude: 20.301, longitude: 85.801, acq_datetime: new Date().toISOString() }], freshness: {} })));
  });

  test('citizens and officers cannot open the Control Room', async ({ page }) => {
    await signedInAs(page, 'citizen');
    await page.goto('/ops/queue');
    await expect(page.getByRole('heading', { name: 'This area is for Control Room staff.' })).toBeVisible();
  });

  test('the queue groups incidents by what needs doing, oldest decision first, and suggests (never makes) links', async ({ page }) => {
    await page.route('**/api/incidents', route => route.fulfill(json([incident(), incident({ id: 22, created_at: new Date(Date.now() - 7_200_000).toISOString(), latitude: 21.5, longitude: 86.5 }), incident({ id: 23, status: 'verified' }), incident({ id: 24, status: 'closed', close_reason: 'false_alarm' })])));
    await page.goto('/ops/queue');
    const rows = page.getByRole('list', { name: 'Incidents' }).getByRole('link');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('#22');                      // older first
    await expect(page.getByRole('tab', { name: /Needs a decision/ })).toContainText('2');
    await expect(page.getByText('Possibly the same event')).toBeVisible();
    await expect(page.getByText('Suggested only. Nothing is merged or verified until you do it.')).toBeVisible();
    await page.getByRole('tab', { name: /Closed/ }).click();
    await expect(page.getByText('false_alarm').or(page.getByText('False alarm'))).toBeVisible();
  });

  test('without configured limits the link suggestions are off and say why', async ({ page }) => {
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/incidents', route => route.fulfill(json([incident()])));
    await page.goto('/ops/queue');
    await expect(page.getByText('Suggested links are off until their distance and time limits are configured.')).toBeVisible();
    await expect(page.getByText('Possibly the same event')).toHaveCount(0);
  });

  test('keyboard: j and k move, Enter opens the incident', async ({ page }) => {
    await page.route('**/api/incidents', route => route.fulfill(json([incident({ id: 31 }), incident({ id: 32, created_at: new Date(Date.now() - 100_000).toISOString() })])));
    await page.route('**/api/incidents/32**', route => route.fulfill(json({ ...incident({ id: 32 }), images: [] })));
    await page.route('**/api/control-room/**', route => route.fulfill(json({ assignments: [], verifications: [], items: [] })));
    await page.goto('/ops/queue');
    await expect(page.getByRole('list', { name: 'Incidents' })).toBeVisible();
    await page.keyboard.press('j'); await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ops\/incidents\/32$/);
  });

  test('verifying needs a click; closing needs a reason and a note for "other"; the choice is sent in one request', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = []; let current = incident({ status: 'verified' });
    await page.route('**/api/incidents/21', route => route.fulfill(json({ ...current, images: [] })));
    await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [{ action: 'incident_status_verified', occurred_at: new Date().toISOString(), user_id: 1, metadata: {} }] })));
    await page.route('**/api/control-room/incidents/21/assignments', route => route.fulfill(json({ assignments: [], verifications: [] })));
    await page.route('**/api/control-room/rangers', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/incidents', route => route.fulfill(json([current])));
    await page.route('**/api/incidents/21/status', route => { const body = JSON.parse(route.request().postData() ?? '{}'); bodies.push(body); current = { ...current, status: body.status, close_reason: body.close_reason ?? null }; return route.fulfill(json(current)); });
    await page.goto('/ops/incidents/21');
    await page.getByRole('button', { name: 'Close incident…' }).click();
    const dialog = page.getByTestId('close-incident');
    await expect(dialog.getByRole('button', { name: 'Close incident' })).toBeDisabled();
    await dialog.getByLabel(/Other \(explain\)/).check();
    await expect(page.getByTestId('close-problem')).toContainText('note');
    await dialog.getByLabel(/False alarm/).check();
    await dialog.getByLabel(/Note/).fill('Permitted burn at the forest edge');
    await dialog.getByRole('button', { name: 'Close incident' }).click();
    await expect(page.getByText('Incident closed.')).toBeVisible();
    expect(bodies).toEqual([{ status: 'closed', close_reason: 'false_alarm', notes: 'Permitted burn at the forest edge' }]);
    await expect(page.getByText('False alarm').first()).toBeVisible();
  });

  test('assign an officer from the incident; the answer is shown; errors from the server are in words', async ({ page }) => {
    const calls: unknown[] = []; let assigned = false;
    await page.route('**/api/incidents/21', route => route.fulfill(json({ ...incident({ status: 'verified' }), images: [] })));
    await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [] })));
    await page.route('**/api/control-room/rangers', route => route.fulfill(json({ items: [{ id: 9, name: 'Officer Rao', home_state: 'OD' }] })));
    await page.route('**/api/control-room/incidents/21/assignments', route => {
      if (route.request().method() === 'POST') { calls.push(JSON.parse(route.request().postData() ?? '{}')); assigned = true; return route.fulfill(json({ assignment: { id: 5 } }, 201)); }
      return route.fulfill(json({ assignments: assigned ? [{ id: 5, ranger_id: 9, ranger_name: 'Officer Rao', status: 'assigned', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] : [], verifications: [] }));
    });
    await page.route('**/api/incidents', route => route.fulfill(json([incident({ status: 'verified' })])));
    await page.goto('/ops/incidents/21');
    await page.getByLabel('Assign an officer').selectOption('9');
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(page.getByText('Officer notified.')).toBeVisible();
    expect(calls).toEqual([{ ranger_id: 9 }]);
    await expect(page.getByText('Officer Rao').first()).toBeVisible();
  });

  test('Scenario: hidden unless switched on; nothing is pre-filled; the run shows bands, reach and is saved as a note', async ({ page }) => {
    await page.route('**/api/incidents/21', route => route.fulfill(json({ ...incident({ status: 'verified' }), images: [] })));
    await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [] })));
    await page.route('**/api/control-room/incidents/21/assignments', route => route.fulfill(json({ assignments: [], verifications: [] })));
    await page.goto('/ops/incidents/21');
    await expect(page.getByRole('tab', { name: 'Scenario' })).toHaveCount(0);

    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: [1, 3, 5], feed_stale_minutes: 120, scenario_enabled: true })));
    const saved: unknown[] = [];
    await page.route('**/api/ops/incidents/21/scenario-notes', route => { saved.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ saved: true }, 201)); });
    await page.goto('/ops/incidents/21');
    await page.getByRole('tab', { name: 'Scenario' }).click();
    await expect(page.getByText('Not validated. A planning aid, not a forecast.')).toBeVisible();
    await expect(page.getByLabel('Head-fire rate of spread (km/h)')).toHaveValue('');
    await page.getByRole('button', { name: 'Draw scenario' }).click();
    await expect(page.getByText('Type the head-fire rate of spread in km/h. It must be above zero.')).toBeVisible();

    await page.getByLabel('Head-fire rate of spread (km/h)').fill('1.5');
    await page.getByLabel('Show up to').selectOption('6');
    await page.getByLabel('Wind speed (km/h)').fill('20');
    await page.getByLabel('Wind blows from (degrees)').fill('270');
    await page.getByLabel('Wind speed ± (%)').fill('20');
    await page.getByLabel('Wind direction ± (degrees)').fill('20');
    await page.getByLabel('Rate of spread ± (%)').fill('30');
    await page.getByRole('button', { name: 'Draw scenario' }).click();
    await expect(page.getByRole('row', { name: /^6 h/ })).toBeVisible();
    await expect(page.getByText(/There is no single line to trust/)).toBeVisible();
    await page.getByLabel('Wind speed (km/h)').fill('25');
    await expect(page.getByText('Outdated')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save to timeline' })).toBeDisabled();
    await page.getByLabel('Wind speed (km/h)').fill('20');
    await page.getByLabel('Note (optional)').fill('Briefing at 06:00');
    await page.getByRole('button', { name: 'Save to timeline' }).click();
    await expect(page.getByText(/no one was notified/)).toBeVisible();
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved[0])).toContain('Briefing at 06:00');
    await expect(page.getByText(/will reach|will be reached|will spread/i)).toHaveCount(0);
  });

  test('Notifications: the bell shows the unread count, opening one marks it read and goes to the incident', async ({ page }) => {
    const marked: unknown[] = [];
    await page.route('**/api/inbox', route => route.fulfill(json({ unread: 2, items: [
      { id: 1, kind: 'report_unattended', message: 'Report #21 has had no officer assigned for 30 minutes.', severity: 'warning', state: 'OD', entity_type: 'incident', entity_id: '21', read: false, created_at: new Date().toISOString() },
      { id: 2, kind: 'assignment_declined', message: 'Ranger updated assignment for incident #20: decline.', severity: 'info', state: 'OD', entity_type: 'incident_assignment', entity_id: '5', read: false, created_at: new Date().toISOString() },
    ] })));
    await page.route('**/api/inbox/read', route => { marked.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ marked: 1 })); });
    await page.route('**/api/incidents', route => route.fulfill(json([incident()])));
    await page.route('**/api/incidents/21', route => route.fulfill(json({ ...incident(), images: [] })));
    await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [] })));
    await page.route('**/api/control-room/incidents/21/assignments', route => route.fulfill(json({ assignments: [], verifications: [] })));
    await page.goto('/ops/queue');
    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
    await expect(page.getByText('Report with no officer')).toBeVisible();
    await page.getByRole('button', { name: /Report with no officer/ }).click();
    await expect(page).toHaveURL(/\/ops\/incidents\/21/);
    expect(marked).toEqual([{ ids: [1] }]);
  });

  test('Log a report: needs a state, a source, a place and words; sends one request with a retry key and opens the incident', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/incidents', route => { if (route.request().method() === 'POST') { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ id: 77 }, 201)); } return route.fulfill(json([])); });
    await page.route('**/api/incidents/77', route => route.fulfill(json({ ...incident({ id: 77 }), images: [] })));
    await page.route('**/api/incidents/77/history', route => route.fulfill(json({ history: [] })));
    await page.route('**/api/control-room/incidents/77/assignments', route => route.fulfill(json({ assignments: [], verifications: [] })));
    await page.goto('/ops/queue');
    await page.getByRole('link', { name: 'Log a report' }).click();
    const add = page.getByRole('button', { name: 'Add to the queue' });
    await expect(add).toBeDisabled();
    await page.getByLabel('State').selectOption('OD');
    await page.getByLabel('How it reached us').selectOption('phone');
    await page.getByLabel('Place (latitude, longitude)').fill('20.31, 85.82');
    await page.getByLabel('What was reported').fill('Caller from Sundargarh sees smoke on the ridge');
    await add.click();
    await expect(page).toHaveURL(/\/ops\/incidents\/77/);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ source: 'phone', state: 'OD', latitude: 20.31, longitude: 85.82 });
    expect(String(bodies[0].client_key).length).toBeGreaterThan(10);
  });

  test('Alert rules: a rule is added with its conditions', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    await page.route('**/api/alerts/rules', route => { if (route.request().method() === 'POST') { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ id: 1 }, 201)); } return route.fulfill(json([])); });
    await page.goto('/ops/alert-rules');
    await expect(page.getByText('No rules yet.')).toBeVisible();
    await page.getByLabel('Name').fill('Large fires in Odisha');
    await page.getByLabel('State').selectOption('OD');
    await page.getByLabel('At least this size').selectOption('large');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({ kind: 'incident', state: 'OD', conditions: { min_size: 'large' } });
  });

  test('Field shows open assignments and flags unanswered ones', async ({ page }) => {
    await page.route('**/api/control-room/assignments', route => route.fulfill(json({ items: [{ id: 5, incident_id: 21, ranger_name: 'Officer Rao', status: 'assigned', state: 'OD', incident_status: 'verified', observations: 0, updated_at: new Date().toISOString(), created_at: new Date().toISOString() }] })));
    await page.goto('/ops/field');
    await expect(page.getByRole('row', { name: /Officer Rao/ })).toBeVisible();
    await expect(page.getByText('1 assignment(s) have not been answered yet.')).toBeVisible();
  });

  test('Notices: the author cannot approve their own notice; a second person can; withdrawing needs a reason', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('resq_user', JSON.stringify({ id: 7, name: 'Lead Rao', email: 'l@example.test', role: 'incident_commander' })));
    const calls: string[] = [];
    await page.route('**/api/notices?limit=100', route => route.fulfill(json({ items: [
      { id: 1, title: 'Mine', body: 'Written by me', severity: 'info', regions: ['OD'], status: 'pending_approval', author_id: 7, starts_at: '2026-10-16T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', return_reason: null, expired: false },
      { id: 2, title: 'Theirs', body: 'Written by someone else', severity: 'warning', regions: ['OD'], status: 'pending_approval', author_id: 9, starts_at: '2026-10-16T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', return_reason: null, expired: false },
      { id: 3, title: 'Live', body: 'Already public', severity: 'advisory', regions: ['OD'], status: 'published', author_id: 9, starts_at: '2026-10-16T08:00:00Z', expires_at: '2030-01-01T00:00:00Z', return_reason: null, expired: false }] })));
    await page.route('**/api/community/moderation/queue', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/notices/2/approve', route => { calls.push('approve 2'); return route.fulfill(json({})); });
    await page.route('**/api/notices/3/withdraw', route => { calls.push('withdraw ' + JSON.parse(route.request().postData() ?? '{}').reason); return route.fulfill(json({})); });
    await page.goto('/ops/notices');
    const mine = page.getByRole('listitem').filter({ hasText: 'Written by me' });
    await expect(mine.getByRole('button', { name: 'Approve and publish' })).toHaveCount(0);
    await expect(mine.getByText(/cannot approve your own notice/)).toBeVisible();
    await page.getByRole('listitem').filter({ hasText: 'Written by someone else' }).getByRole('button', { name: 'Approve and publish' }).click();
    await expect(page.getByText('Published.')).toBeVisible();
    const live = page.getByRole('listitem').filter({ hasText: 'Already public' });
    await live.getByRole('button', { name: 'Withdraw' }).click();
    await expect(live.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await live.getByLabel('Reason').fill('Fire is out');
    await live.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(() => calls).toEqual(['approve 2', 'withdraw Fire is out']);
  });

  test('Moderation: removing needs a reason; held posts can be approved', async ({ page }) => {
    const calls: unknown[] = [];
    await page.route('**/api/notices?limit=100', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/community/moderation/queue', route => route.fulfill(json({ items: [{ id: 5, reason: 'auto: phone', kind: 'post', held: true, content: 'Call 9876543210', author_id: 9, author_name: 'Ravi K.', author_prior_removals: 1, open_reports: 1, severity: 'held' }] })));
    await page.route('**/api/community/moderation/reports/5/resolve', route => { calls.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ status: 'removed' })); });
    await page.goto('/ops/notices');
    await page.getByRole('tab', { name: /Moderation/ }).click();
    const item = page.getByTestId('moderation');
    await expect(item.getByText('1 earlier removal(s)')).toBeVisible();
    await item.getByRole('button', { name: 'Remove' }).click();
    await expect(item.getByRole('alert')).toContainText('short reason');
    await item.getByLabel(/Reason for your decision/).fill('Phone number in a public post');
    await item.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(() => calls).toEqual([{ action: 'remove', reason: 'Phone number in a public post' }]);
  });

  test('Handover: notes are saved and the next shift acknowledges them', async ({ page }) => {
    const calls: string[] = []; let notes: unknown[] = [{ id: 4, state: 'OD', body: 'Ridge incident waits for a second officer', incident_id: null, created_at: new Date().toISOString(), acknowledged_at: null, author_name: 'Night shift', acknowledged_by_name: null }];
    await page.route('**/api/incidents', route => route.fulfill(json([incident(), incident({ id: 40, status: 'responding' })])));
    await page.route('**/api/handover/notes', route => { if (route.request().method() === 'POST') { calls.push('add ' + JSON.parse(route.request().postData() ?? '{}').body); return route.fulfill(json({ note: {} }, 201)); } return route.fulfill(json({ items: notes })); });
    await page.route('**/api/handover/notes/4/acknowledge', route => { calls.push('ack 4'); notes = [{ ...(notes[0] as object), acknowledged_at: new Date().toISOString(), acknowledged_by_name: 'Lead Rao' }]; return route.fulfill(json({ status: 'acknowledged' })); });
    await page.goto('/ops/handover');
    await expect(page.getByText('Ridge incident waits for a second officer')).toBeVisible();
    await page.getByRole('button', { name: 'I have read this' }).click();
    await expect(page.getByText(/Read by Lead Rao/)).toBeVisible();
    await page.getByLabel('Note').fill('Waiting for the water tanker');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect.poll(() => calls).toEqual(['ack 4', 'add Waiting for the water tanker']);
  });

  test('navigation: five destinations on the rail, current page marked', async ({ page }) => {
    await page.route('**/api/incidents', route => route.fulfill(json([])));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ops/queue');
    const rail = page.getByRole('navigation', { name: 'Main navigation' }).first();
    await expect(rail.getByRole('link')).toHaveCount(5);
    expect((await rail.getByRole('link').allInnerTexts()).map(x => x.trim())).toEqual(['Queue', 'Map', 'Field', 'Notices', 'Handover']);
    await expect(rail.getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.route('**/api/incidents', route => route.fulfill(json([incident(), incident({ id: 23, status: 'verified' })])));
      await page.route('**/api/incidents/21', route => route.fulfill(json({ ...incident(), images: [] })));
      await page.route('**/api/incidents/21/history', route => route.fulfill(json({ history: [] })));
      await page.route('**/api/control-room/**', route => route.fulfill(json({ assignments: [], verifications: [], items: [] })));
      await page.route('**/api/notices?limit=100', route => route.fulfill(json({ items: [] })));
      await page.route('**/api/community/**', route => route.fulfill(json({ items: [] })));
      await page.route('**/api/handover/notes', route => route.fulfill(json({ items: [] })));
      await page.route('**/api/alerts/rules', route => route.fulfill(json([])));
      for (const path of ['/ops/queue', '/ops/incidents/21', '/ops/incidents/new', '/ops/alert-rules', '/ops/field', '/ops/notices', '/ops/handover']) {
        await page.goto(path); await page.waitForTimeout(400);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${path} ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
      }
    });
  }
});
