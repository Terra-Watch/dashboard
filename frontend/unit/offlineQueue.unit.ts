import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticatedActorId, queueIncident, readPendingIncidents, syncPendingIncidents } from '../src/lib/offlineQueue.ts';

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  return storage;
}

function tokenFor(sub: string) {
  const payload = btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${payload}.signature`;
}

test('same authenticated account retries its queued incident with only API fields', async () => {
  const storage = installStorage();
  storage.setItem('resq_token', tokenFor('user-17'));
  assert.equal(authenticatedActorId(), 'user-17');
  const payload = { client_key: 'key-1', source: 'Patrol', size: 'Small', notes: 'North ridge', state: 'OD' };
  queueIncident(payload);
  const pending = readPendingIncidents();
  assert.equal(pending[0].owner_id, 'user-17');

  const sent: unknown[] = [];
  const remaining = await syncPendingIncidents(pending, authenticatedActorId(), async value => { sent.push(value); });
  assert.deepEqual(sent, [payload]);
  assert.deepEqual(remaining, []);
});

test('different account cannot submit another account or unbound queued reports', async () => {
  const storage = installStorage();
  const owned = { client_key: 'key-a', source: 'Patrol', size: 'Small', notes: '', owner_id: 'user-a' };
  const unbound = { client_key: 'legacy', source: 'Call', size: 'Medium', notes: '' };
  storage.setItem('resq_pending_incidents', JSON.stringify([owned, unbound]));

  const sent: unknown[] = [];
  const remaining = await syncPendingIncidents(readPendingIncidents(), 'user-b', async value => { sent.push(value); });
  assert.deepEqual(sent, []);
  assert.deepEqual(remaining, [owned, unbound]);
});

test('legacy queued reports without required state remain queued and are not submitted', async () => {
  const storage = installStorage();
  storage.setItem('resq_token', tokenFor('user-a'));
  const legacy = { client_key: 'legacy-state-missing', source: 'Patrol', size: 'Small', notes: '', owner_id: 'user-a' };
  storage.setItem('resq_pending_incidents', JSON.stringify([legacy]));
  const sent: unknown[] = [];

  const remaining = await syncPendingIncidents(readPendingIncidents(), 'user-a', async payload => { sent.push(payload); });
  assert.deepEqual(sent, []);
  assert.deepEqual(remaining, [legacy]);
});

test('account switch during sync prevents later reports being submitted as the new actor', async () => {
  const storage = installStorage();
  storage.setItem('resq_token', tokenFor('user-a'));
  const first = { client_key: 'key-a1', source: 'Patrol', size: 'Small', notes: '', state: 'OD', owner_id: 'user-a' };
  const second = { client_key: 'key-a2', source: 'Call', size: 'Medium', notes: '', state: 'OD', owner_id: 'user-a' };
  const sent: string[] = [];

  const remaining = await syncPendingIncidents([first, second], 'user-a', async payload => {
    sent.push(payload.client_key);
    storage.setItem('resq_token', tokenFor('user-b'));
  });

  assert.deepEqual(sent, ['key-a1']);
  assert.deepEqual(remaining, [second]);
});

test('missing or malformed token identity fails closed for local queue matching', () => {
  assert.equal(authenticatedActorId('not-a-token'), null);
  const encodedWithoutSub = btoa(JSON.stringify({ role: 'officer' })).replace(/=/g, '');
  assert.equal(authenticatedActorId(`header.${encodedWithoutSub}.signature`), null);
});
