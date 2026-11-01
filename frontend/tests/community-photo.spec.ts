import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const post = (id: number, over: object = {}) => ({ id, content: 'Smoke over the ridge this evening', status: 'published', created_at: new Date().toISOString(), edited_at: null, topic: 'information', language: 'en', region: null, verified: false, helpful_count: 0, helpful_by_me: false, author: { id: 9, name: 'Ravi K.' }, comment_count: 0, ...over });

test.describe('Community posts with a photo', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'citizen', 'Asha Rao');
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
    await page.route('**/api/community/mine', route => route.fulfill(json({ community: { slug: 'bolampatti', name: 'Bolampatti forest community', forest_name: 'Bolampatti Block I Reserved Forest', area: 'Coimbatore South, Tamil Nadu' } })));
    await page.route('**/api/community/chat**', route => route.fulfill(json({ items: [], has_more: false, room: { region: 'default', slow_mode_seconds: 0, frozen: false } })));
    await page.route('**/api/community/posts/*/image', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG }));
  });

  test('the photo button is there when the service has photos on, and the photo is sent after the post', async ({ page }) => {
    const sent: string[] = [];
    await page.route('**/api/community/posts', route => route.request().method() === 'POST'
      ? route.fulfill(json({ post: { id: 31, status: 'published' } }, 201)) : route.fulfill(json({ items: [], images_enabled: true })));
    await page.route('**/api/community/posts/31/image', route => { sent.push(route.request().method()); return route.fulfill(json({ image: { id: 1 }, post_status: 'published', message: 'Image added.' }, 201)); });
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await page.getByRole('button', { name: 'Ask a question or share a local tip' }).click();
    await page.getByLabel('Your post').fill('Smoke over the ridge this evening');
    await page.locator('input[type=file]').setInputFiles({ name: 'ridge.jpg', mimeType: 'image/jpeg', buffer: JPEG });
    await expect(page.getByText('ridge.jpg')).toBeVisible();
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText('Posted. Only signed-in members can see it.')).toBeVisible();
    expect(sent).toEqual(['POST']);
  });

  test('without photos switched on there is no photo button', async ({ page }) => {
    await page.route('**/api/community/posts', route => route.fulfill(json({ items: [], images_enabled: false })));
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await page.getByRole('button', { name: 'Ask a question or share a local tip' }).click();
    await expect(page.getByLabel('Your post')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a photo (optional)' })).toHaveCount(0);
  });

  test('a photo that passed the automatic check carries a positive note; one without a mark carries none', async ({ page }) => {
    await page.route('**/api/community/posts', route => route.fulfill(json({ items: [
      post(1, { image: { url: '/api/community/posts/1/image', mime: 'image/jpeg', checked: 'automatic' } }),
      post(2, { content: 'Second post here', image: { url: '/api/community/posts/2/image', mime: 'image/jpeg', checked: null } }),
      post(3, { content: 'Third post here', image: { url: '/api/community/posts/3/image', mime: 'image/jpeg', checked: 'moderator' } })], images_enabled: true })));
    await page.goto('/citizen/community');
    await page.getByRole('tab', { name: 'Discussion' }).click();
    await expect(page.getByText(/Automatic photo check: no sign of editing or AI generation found/)).toHaveCount(1);
    await expect(page.getByText('A moderator looked at this photo.')).toHaveCount(1);
    await expect(page.getByRole('img', { name: 'Photo shared with this post' })).toHaveCount(3);
  });
});
