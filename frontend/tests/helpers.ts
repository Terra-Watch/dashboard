import type { Page } from '@playwright/test';

export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function signedInAs(page: Page, role: string, name = 'Test Person') {
  await page.addInitScript(({ role, name }) => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 7, name, email: 'person@example.test', role }));
  }, { role, name });
}

export const COMMUNITIES = [
  { slug: 'similipal', name: 'Similipal test community', forest_name: 'Similipal Reserve', area: 'Mayurbhanj, Odisha', state: 'OD', latitude: 21.8, longitude: 86.3, radius_km: 10 },
  { slug: 'bolampatti', name: 'Bolampatti forest community', forest_name: 'Bolampatti Block I Reserved Forest', area: 'Coimbatore South, Tamil Nadu', state: 'TN', latitude: 10.90158, longitude: 76.90577, radius_km: 10 },
];
/** The list of communities every staff screen asks for. */
export async function mockCommunities(page: import('@playwright/test').Page) {
  await page.route('**/api/community/list', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: COMMUNITIES }) }));
}
