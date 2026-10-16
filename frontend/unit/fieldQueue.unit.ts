import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueReport } from '../src/redesign/lib/fieldQueue.ts';

test('field queue persists metadata only, never note or photo-reference content', () => {
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };

  enqueueReport('task-1', 'private observation', 'evidence.jpg');
  const persisted = JSON.parse(values.get('rq_field_queue') ?? '[]') as Array<{ note: string; photo_name: string | null }>;
  assert.equal(persisted[0].note, '');
  assert.equal(persisted[0].photo_name, null);
  assert.doesNotMatch(values.get('rq_field_queue') ?? '', /private observation|evidence\.jpg/);
});
