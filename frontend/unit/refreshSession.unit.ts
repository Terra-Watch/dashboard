import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } } });
const { renewToken } = await import('../src/lib/tokenRefresh.ts');
const refreshSession = () => renewToken('');

function fakeFetch(ok: boolean) {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; await new Promise(r => setTimeout(r, 5)); return { ok, json: async () => (ok ? { access_token: `token-${calls}` } : { detail: 'Session expired' }) }; }) as unknown as typeof fetch;
  return () => calls;
}

test('parallel refreshes make one server call, because the server rotates the cookie on every use', async () => {
  const calls = fakeFetch(true);
  const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
  assert.deepEqual(results, [true, true, true]);
  assert.equal(calls(), 1);
  assert.equal(values.get('resq_token'), 'token-1');
});

test('a later refresh makes a new call', async () => {
  await new Promise(r => setTimeout(r, 10));
  const calls = fakeFetch(true);
  assert.equal(await refreshSession(), true);
  assert.equal(calls(), 1);
});

test('a refused refresh returns false and leaves the old token alone', async () => {
  await new Promise(r => setTimeout(r, 10));
  values.set('resq_token', 'old');
  fakeFetch(false);
  assert.equal(await refreshSession(), false);
  assert.equal(values.get('resq_token'), 'old');
});
