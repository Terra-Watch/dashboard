import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const user = (role: string) => ({ id: 5, email: 'x@example.test', name: 'Asha', role });

async function fill(page: Page, email = 'asha@example.test', password = 'a long enough passphrase') {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
}

test.describe('sign-in', () => {
  test('is one page for everyone, with plain errors that never say which part was wrong', async ({ page }) => {
    await page.route('**/api/auth/sign-in', route => route.fulfill(json({ detail: 'Invalid email or password.' }, 401)));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Staff accounts are created by an administrator.')).toBeVisible();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter your email and password.');
    await fill(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('That email or password is not right.');
  });

  test('lockout and network failures have their own messages', async ({ page }) => {
    let status = 429;
    await page.route('**/api/auth/sign-in', route => status === 0 ? route.abort() : route.fulfill(json({ detail: 'x' }, status)));
    await page.goto('/login'); await fill(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many attempts.');
    status = 0;
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('could not reach the server');
  });

  test('password can be shown and hidden', async ({ page }) => {
    await page.goto('/login');
    const field = page.getByLabel('Password', { exact: true });
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(field).toHaveAttribute('type', 'password');
  });

  for (const [role, destination] of [['citizen', '/citizen'], ['field_crew', '/field'], ['incident_commander', '/ops']] as const) {
    test(`the account decides where you land (${role})`, async ({ page }) => {
      await page.route('**/api/auth/sign-in', route => route.fulfill(json({ access_token: 'tok', token_type: 'bearer', user: user(role) })));
      await page.route('**/api/**', route => route.fulfill(json({ items: [], assignments: [] })));
      await page.route('**/api/auth/sign-in', route => route.fulfill(json({ access_token: 'tok', token_type: 'bearer', user: user(role) })));
      await page.goto('/login'); await fill(page);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL(url => url.pathname.startsWith(destination));
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('resq_user') ?? '{}').role)).toBe(role);
    });
  }

  test('"next" is honoured inside the person\'s own area and never sends them off-site', async ({ page }) => {
    await page.route('**/api/auth/sign-in', route => route.fulfill(json({ access_token: 'tok', token_type: 'bearer', user: user('citizen') })));
    await page.route('**/api/citizen/**', route => route.fulfill(json({ items: [] })));
    await page.goto('/login?next=//evil.example/x'); await fill(page);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(url => url.pathname.startsWith('/citizen'));
    expect(new URL(page.url()).hostname).toBe('127.0.0.1');
  });

  test('old sign-in addresses lead to the one page', async ({ page }) => {
    for (const old of ['/staff/login', '/citizen/login']) { await page.goto(old); await expect(page).toHaveURL(/\/login$/); }
    await page.goto('/citizen/register'); await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('create a citizen account', () => {
  test('needs a valid email, a strong password and the privacy consent, and shows the rules live', async ({ page }) => {
    const bodies: unknown[] = [];
    await page.route('**/api/auth/citizen/register', route => { bodies.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill(json({ access_token: 't', token_type: 'bearer', user: user('citizen') }, 201)); });
    await page.route('**/api/citizen/**', route => route.fulfill(json({ items: [] })));
    await page.goto('/register');
    const submit = page.getByRole('button', { name: 'Create account' });
    await expect(submit).toBeDisabled();
    await page.getByLabel('Your name').fill('Asha Rao');
    await page.getByLabel('Email').fill('asha.rao@example.test');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await expect(page.getByText('Not a common password')).not.toContainText('✓');
    await expect(submit).toBeDisabled();
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
    await expect(page.getByText('10+ characters')).toContainText('✓');
    await expect(submit).toBeDisabled();                                  // consent still missing
    await page.getByRole('checkbox').check();
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL(url => url.pathname.startsWith('/citizen'));
    expect(bodies).toEqual([{ name: 'Asha Rao', email: 'asha.rao@example.test', password: 'correct-horse-battery-staple', accepted_terms: true }]);
  });

  test('a server refusal is shown in words', async ({ page }) => {
    await page.route('**/api/auth/citizen/register', route => route.fulfill(json({ detail: 'An account for this email already exists' }, 409)));
    await page.goto('/register');
    await page.getByLabel('Your name').fill('Asha'); await page.getByLabel('Email').fill('asha@example.test');
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple'); await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('already exists');
  });
});

test.describe('forgot and reset password', () => {
  test('says honestly when email delivery is not set up', async ({ page }) => {
    await page.route('**/api/auth/citizen/password-reset/request', route => route.fulfill(json({ status: 'received', delivery: 'unavailable' }, 202)));
    await page.goto('/forgot'); await page.getByLabel('Email').fill('asha@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('alert')).toContainText('not available right now');
  });
  test('gives the same neutral answer when delivery works', async ({ page }) => {
    await page.route('**/api/auth/citizen/password-reset/request', route => route.fulfill(json({ status: 'received', delivery: 'email' }, 202)));
    await page.goto('/forgot'); await page.getByLabel('Email').fill('anyone@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists for that email');
  });
  test('reset needs a token, enforces the password rules, and handles an expired link', async ({ page }) => {
    await page.goto('/reset'); await expect(page.getByRole('alert')).toContainText('invalid or has expired');
    let status = 200;
    await page.route('**/api/auth/password-reset/abc/complete', route => route.fulfill(json({ status: 'password_updated' }, status)));
    await page.goto('/reset?token=abc');
    const save = page.getByRole('button', { name: 'Save new password' });
    await page.getByRole('textbox', { name: 'New password' }).fill('short'); await expect(save).toBeDisabled();
    await page.getByRole('textbox', { name: 'New password' }).fill('a-brand-new-long-passphrase'); await expect(save).toBeEnabled();
    status = 400; await save.click();
    await expect(page.getByRole('alert')).toContainText('invalid or has expired');
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`auth pages have no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ['/login', '/register', '/forgot', '/reset?token=abc']) {
      await page.goto(path);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical').map(item => `${path} ${item.id}`)).toEqual([]);
    }
  });
}
