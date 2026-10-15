import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearSession } from '../src/lib/session.ts';

test('sign out removes credentials but preserves queued reports and preferences', () => {
  const values = new Map<string, string>([
    ['resq_token', 'secret-token'],
    ['resq_user', '{"id":7}'],
    ['resq_pending_incidents', '[{"client_key":"retry-1"}]'],
    ['resq_theme', 'dark'],
  ]);
  const storage = { removeItem: (key: string) => values.delete(key) };

  clearSession(storage);

  assert.equal(values.has('resq_token'), false);
  assert.equal(values.has('resq_user'), false);
  assert.equal(values.get('resq_pending_incidents'), '[{"client_key":"retry-1"}]');
  assert.equal(values.get('resq_theme'), 'dark');
});
