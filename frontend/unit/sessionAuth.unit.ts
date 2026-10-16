import assert from 'node:assert/strict';
import test from 'node:test';
import { addCsrfHeader, clearExpiredToken, getAuthToken, getCsrfToken } from '../src/redesign/lib/sessionAuth.ts';

test('missing redesign session stays unauthenticated; no seeded account is created', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  assert.equal(await getAuthToken(), null);
  assert.equal(values.has('resq_token'), false);
  assert.equal(values.has('resq_user'), false);
});

test('redesign requests reuse only the token from explicit sign-in', async () => {
  const values = new Map([['resq_token', 'signed-in-token']]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null },
  });
  assert.equal(await getAuthToken(), 'signed-in-token');
});

test('forbidden permissions do not clear a valid session; unauthorized sessions do', () => {
  const values = new Map([['resq_token', 'signed-in-token']]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });

  clearExpiredToken(403);
  assert.equal(values.get('resq_token'), 'signed-in-token');
  clearExpiredToken(401);
  assert.equal(values.has('resq_token'), false);
});

test('CSRF token is read from the double-submit cookie without confusing similarly named cookies', () => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'other=resq_csrf=wrong; resq_csrf=csrf%2Bvalue' },
  });
  assert.equal(getCsrfToken(), 'csrf+value');
});

test('CSRF token is absent when the cookie is unavailable', () => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'session=abc' },
  });
  assert.equal(getCsrfToken(), null);
});

test('CSRF header is added only to state-changing methods', () => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { cookie: 'resq_csrf=csrf-token' },
  });
  const getHeaders = addCsrfHeader(new Headers(), 'GET');
  const postHeaders = addCsrfHeader(new Headers(), 'POST');
  assert.equal(getHeaders.has('x-resq-csrf'), false);
  assert.equal(postHeaders.get('x-resq-csrf'), 'csrf-token');
});
