import type { Page } from '@playwright/test';

export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function signedInAs(page: Page, role: string, name = 'Test Person') {
  await page.addInitScript(({ role, name }) => {
    localStorage.setItem('resq_token', 'browser-test-token');
    localStorage.setItem('resq_user', JSON.stringify({ id: 7, name, email: 'person@example.test', role }));
  }, { role, name });
}
