import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoster, type FAssignment, type FIncident, type FRanger } from '../src/features/ops/fieldModel.ts';

const NOW = Date.parse('2026-11-04T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const a = (id: number, over: Partial<FAssignment> = {}): FAssignment => ({ id, incident_id: id * 10, ranger_id: id, ranger_name: `Officer ${id}`, status: 'accepted', created_at: ago(90), updated_at: ago(10), observations: 0, community_slug: 'bolampatti', ...over });
const incidents: FIncident[] = [10, 20, 30, 40].map(id => ({ id, notes: `Event ${id}\nmore`, community: 'Bolampatti' }));
const rangers: FRanger[] = [1, 2, 3, 4, 5].map(id => ({ id, name: `Officer ${id}`, home_state: 'TN', community: id === 5 ? 'Mudumalai' : 'Bolampatti' }));

test('an officer asked 15 minutes ago or more with no reply is not answering; a fresh request is just out', () => {
  const r = buildRoster({ assignments: [a(1, { status: 'assigned', created_at: ago(35), updated_at: ago(35) }), a(2, { status: 'assigned', created_at: ago(3), updated_at: ago(3) })], rangers, incidents, now: NOW });
  assert.deepEqual(r.silent.map(x => x.officerId), [1]); assert.equal(r.silent[0].late, true); assert.equal(r.silent[0].ageMin, 35);
  assert.deepEqual(r.ground.map(x => x.officerId), [2]); assert.equal(r.ground[0].late, false);
});

test('on the ground: quiet for an hour is marked, the longest quiet first, and the place is the first line of the report', () => {
  const r = buildRoster({ assignments: [a(1, { updated_at: ago(8) }), a(2, { updated_at: ago(75), status: 'in_progress' }), a(3, { updated_at: ago(30) })], rangers, incidents, now: NOW });
  assert.deepEqual(r.ground.map(x => x.officerId), [2, 3, 1]); assert.equal(r.ground[0].late, true); assert.equal(r.ground[1].late, false);
  assert.equal(r.ground[0].place, 'Event 20');
});

test('free officers are those with no open assignment, and the community switch narrows everything', () => {
  const r = buildRoster({ assignments: [a(1), a(5, { community_slug: 'mudumalai' })], rangers, incidents, now: NOW });
  assert.deepEqual(r.free.map(x => x.officerId), [2, 3, 4]);
  const scoped = buildRoster({ assignments: [a(1), a(5, { community_slug: 'mudumalai' })], rangers, incidents, now: NOW, region: 'bolampatti', regionName: 'Bolampatti' });
  assert.deepEqual(scoped.ground.map(x => x.officerId), [1]); assert.deepEqual(scoped.free.map(x => x.officerId), [2, 3, 4]);   // officer 5 is in another community and busy anyway
});

test('finished assignments do not count as busy', () => {
  const r = buildRoster({ assignments: [a(1, { status: 'completed' }), a(2, { status: 'declined' })], rangers, incidents, now: NOW });
  assert.equal(r.ground.length + r.silent.length, 0); assert.equal(r.free.length, 5);
});
