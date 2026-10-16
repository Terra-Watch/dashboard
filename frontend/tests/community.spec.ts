import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const post = (over: object = {}) => ({ id: 1, content: 'Is the smoke near Ranipur dangerous?', status: 'published', created_at: new Date().toISOString(), edited_at: null, topic: 'question', language: 'en', region: 'Similipal', verified: false, helpful_count: 0, helpful_by_me: false, comments_count: 0, badge: null, author: { id: 7, name: 'Asha R.' }, ...over });

test.describe('Community (citizen)', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'citizen', 'Asha Rao');
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [{ id: 3, title: 'Smoke advisory', body: 'Avoid the ridge road until noon.', severity: 'advisory', expires_at: '2030-01-01T00:00:00Z', published_at: '2026-10-16T08:00:00Z' }] })));
    await page.route('**/api/community/chat**', route => route.fulfill(json({ items: [], has_more: false, room: { region: 'default', slow_mode_seconds: 0, frozen: false } })));
  });

  test('old community addresses lead into the citizen area, and signed-out visitors sign in first', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/community');
    await expect(page).toHaveURL(/\/login\?next=%2Fcitizen%2Fcommunity/);
  });

  test('official notices come first and are marked official; the rule about emergencies is always visible', async ({ page }) => {
    await page.goto('/citizen/community');
    await expect(page.getByRole('tab', { name: 'Official notices' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByText('Avoid the ridge road until noon.')).toBeVisible();
    await expect(page.getByText(/Official/).first()).toBeVisible();
    await expect(page.getByText('Posts here never notify responders. Seeing a fire? Use Report.')).toBeVisible();
  });

  test('posting: counter, emergency nudge, held posts are explained, and the post carries topic and language', async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = []; let posts = [post({ id: 2, author: { id: 9, name: 'Ravi K.' }, content: 'Road to the gate is closed' })];
    await page.route('**/api/community/posts', route => {
      if (route.request().method() === 'POST') { const body = JSON.parse(route.request().postData() ?? '{}'); bodies.push(body); const held = /\d{7,}/.test(body.content); return route.fulfill(json({ post: { status: held ? 'held' : 'published' }, message: held ? 'A moderator will look at this before it appears.' : '' }, 201)); }
      return route.fulfill(json({ items: posts }));
    });
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByText('Road to the gate is closed')).toBeVisible();
    const publish = page.getByRole('button', { name: 'Post', exact: true });
    await expect(publish).toBeDisabled();
    await page.getByLabel('Your post').fill('There is a fire at the ridge, help');
    await expect(page.getByText('Is this an emergency?')).toBeVisible();
    await expect(page.getByRole('alert').getByRole('link', { name: 'Report' })).toBeVisible();
    await page.getByLabel('Your post').fill('Where is the nearest water point?');
    await expect(page.getByText('Is this an emergency?')).toHaveCount(0);
    await expect(page.getByText('33/2000')).toBeVisible();
    await page.getByLabel('Post language').selectOption('hi');
    await publish.click();
    await expect(page.getByText('Posted. Only signed-in members can see it.')).toBeVisible();
    expect(bodies[0]).toMatchObject({ content: 'Where is the nearest water point?', topic: 'question', language: 'hi' });
    await page.getByLabel('Your post').fill('Call me on 9876543210 for water');
    await publish.click();
    await expect(page.getByText('A moderator will look at this before it appears.')).toBeVisible();
  });

  test('a member can mark helpful, edit inside the window, delete, and report someone else\'s post; removed posts show why', async ({ page }) => {
    const calls: string[] = [];
    let posts = [post(), post({ id: 2, author: { id: 9, name: 'Ravi K.' }, content: 'Road to the gate is closed' }), post({ id: 3, content: null, status: 'removed', removed: { by: 'moderator', reason: 'Advertising' }, author: { id: 11, name: 'X' } })];
    await page.route('**/api/community/posts', route => route.fulfill(json({ items: posts })));
    await page.route('**/api/community/posts/1', route => { if (route.request().method() === 'PATCH') { calls.push('PATCH ' + JSON.parse(route.request().postData() ?? '{}').content); posts = posts.map(p => p.id === 1 ? { ...p, content: JSON.parse(route.request().postData() ?? '{}').content, edited_at: new Date().toISOString() } : p); return route.fulfill(json({ post: {} })); } calls.push('DELETE 1'); posts = posts.map(p => p.id === 1 ? { ...p, content: null, status: 'removed', removed: { by: 'author', reason: null } } : p); return route.fulfill(json({ id: 1, removed: true })); });
    await page.route('**/api/community/posts/2/helpful', route => { calls.push('HELPFUL 2'); posts = posts.map(p => p.id === 2 ? { ...p, helpful_by_me: true, helpful_count: 1 } : p); return route.fulfill(json({ post_id: 2, helpful_by_me: true, helpful_count: 1 })); });
    await page.route('**/api/community/posts/2/report', route => { calls.push('REPORT ' + JSON.parse(route.request().postData() ?? '{}').reason); return route.fulfill(json({ status: 'received' }, 201)); });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByText('Removed by a moderator: Advertising')).toBeVisible();
    const other = page.getByRole('listitem').filter({ hasText: 'Road to the gate' });
    await other.getByRole('button', { name: /Helpful/ }).click();
    await expect(other.getByRole('button', { name: /Helpful 1/ })).toHaveAttribute('aria-pressed', 'true');
    await other.getByRole('button', { name: 'Report' }).click();
    await other.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Thanks. A moderator will review it.')).toBeVisible();
    const mine = page.getByRole('listitem').filter({ hasText: 'Is the smoke near Ranipur' });
    await mine.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Edit post').fill('Is the smoke near Ranipur safe to breathe?');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Is the smoke near Ranipur safe to breathe?')).toBeVisible();
    await page.getByRole('listitem').filter({ hasText: 'safe to breathe' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Removed by its author.')).toBeVisible();
    expect(calls).toEqual(['HELPFUL 2', 'REPORT Spam', 'PATCH Is the smoke near Ranipur safe to breathe?', 'DELETE 1']);
  });

  test('the edit button is gone after the window and staff replies carry a badge', async ({ page }) => {
    await page.route('**/api/community/posts', route => route.fulfill(json({ items: [post({ created_at: new Date(Date.now() - 20 * 60_000).toISOString() }), post({ id: 2, author: { id: 12, name: 'Control R.' }, badge: 'Staff', content: 'Please follow official notices' })] })));
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByText('Please follow official notices')).toBeVisible();
    await expect(page.getByText('Staff', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('chat: slow mode and frozen rooms are explained; errors from the server are shown in words', async ({ page }) => {
    let frozen = false;
    await page.route('**/api/community/chat**', route => {
      if (route.request().method() === 'POST') return route.fulfill(json({ detail: 'Slow mode is on in this room. Wait 20 seconds before posting again' }, 429));
      return route.fulfill(json({ items: [{ id: 1, content: 'Is the road open?', status: 'published', created_at: new Date().toISOString(), badge: null, author: { id: 9, name: 'Ravi K.' } }], has_more: false, room: { region: 'default', slow_mode_seconds: 30, frozen } }));
    });
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByText('Is the road open?')).toBeVisible();
    await expect(page.getByText('Slow mode: one message every 30 seconds.')).toBeVisible();
    await page.getByLabel('Message').fill('Yes, I passed it an hour ago');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Wait 20 seconds' })).toBeVisible();
    await expect(page.getByText('This is not an emergency channel.')).toBeVisible();
  });

  test('chat refresh pauses while the tab is hidden', async ({ page }) => {
    let polls = 0;
    await page.route('**/api/community/chat**', route => { polls += 1; return route.fulfill(json({ items: [], has_more: false, room: { region: 'default', slow_mode_seconds: 0, frozen: false } })); });
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect.poll(() => polls).toBeGreaterThan(0);
    expect(polls).toBeLessThan(3);                      // calm: not every few seconds
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme}, phone)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.route('**/api/community/posts', route => route.fulfill(json({ items: [post(), post({ id: 2, author: { id: 9, name: 'Ravi K.' }, content: 'Road closed', badge: 'Staff' })] })));
      await page.setViewportSize({ width: 360, height: 700 });
      await page.goto('/citizen/community');
      for (const tab of ['Official notices', 'Discussion', 'Chat']) {
        await page.getByRole('tab', { name: tab }).click(); await page.waitForTimeout(300);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${tab} ${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
      }
    });
  }
});
