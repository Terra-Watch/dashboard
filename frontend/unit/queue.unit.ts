import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQueue, lateCount, needsYou, type QAssignment, type QIncident, type QStation } from '../src/features/ops/queueModel.ts';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const inc = (id: number, over: Partial<QIncident> = {}): QIncident => ({ id, source: 'citizen', notes: `report ${id}`, status: 'reported', state: 'TN', community: 'Bolampatti', community_slug: 'bolampatti',
  latitude: 10.9 + id * 0.5, longitude: 76.9, observed_at: null, created_at: ago(10), updated_at: ago(10), image_assessment_status: null, ...over });
const asg = (id: number, incident_id: number, over: Partial<QAssignment> = {}): QAssignment => ({ id, incident_id, ranger_id: 7, ranger_name: 'Meena R.', status: 'accepted', created_at: ago(40), updated_at: ago(40), observations: 0, ...over });
const base = { assignments: [], stations: [], detections: [], corroboration: null, now: NOW };

test('an unchecked report goes to decide and is late after 30 minutes', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { created_at: ago(5) }), inc(2, { created_at: ago(45) })] });
  assert.equal(q.decide.length, 2);
  assert.equal(q.decide.find(e => e.incidentId === 2)?.late, true);
  assert.equal(q.decide.find(e => e.incidentId === 1)?.late, false);
});

test('decide ranks first-hand reports, then corroboration, then a photo, then the longest waiting', () => {
  const q = buildQueue({ ...base, incidents: [
    inc(1, { created_at: ago(90) }), inc(2, { created_at: ago(20), image_assessment_status: 'COMPLETED' }), inc(3, { created_at: ago(5), source: 'patrol' }),
    inc(4, { created_at: ago(30), latitude: 10.9 + 0.5 * 5, longitude: 76.9 }), inc(5, { created_at: ago(28), latitude: 10.9 + 0.5 * 5 + 0.001, longitude: 76.9 }),
  ], corroboration: { radius_km: 2, window_minutes: 120 } });
  assert.deepEqual(q.decide.map(e => e.incidentId), [3, 4, 5, 2, 1]);   // first-hand; the two linked reports (older first); photo; then the rest
  assert.equal(q.decide.find(e => e.incidentId === 4)?.facts.reports, 1);
  assert.deepEqual(q.decide.find(e => e.incidentId === 4)?.links, [5]);
});

test('verified with nobody assigned goes to send; so does an officer who has not answered', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { status: 'verified', updated_at: ago(18) }), inc(2, { status: 'verified', updated_at: ago(60) })], assignments: [asg(9, 2, { status: 'assigned', created_at: ago(35) })] });
  assert.deepEqual(q.send.map(e => e.incidentId).sort(), [1, 2]);
  const waiting = q.send.find(e => e.incidentId === 2)!;
  assert.equal(waiting.facts.officer, 'Meena R.'); assert.equal(waiting.facts.officerWaitMin, 35); assert.equal(waiting.late, true);
  assert.equal(q.send.find(e => e.incidentId === 1)?.late, false);
});

test('an officer who has written since the last staff change puts the event under back', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { status: 'responding', updated_at: ago(60) })], assignments: [asg(9, 1, { observations: 2, updated_at: ago(14) })] });
  assert.equal(q.back.length, 1); assert.equal(q.back[0].ageMin, 14); assert.equal(q.watch.length, 0);
  const stale = buildQueue({ ...base, incidents: [inc(1, { status: 'responding', updated_at: ago(5) })], assignments: [asg(9, 1, { observations: 2, updated_at: ago(14) })] });
  assert.equal(stale.back.length, 0); assert.equal(stale.watch.length, 1);   // the operator acted after the note
});

test('watching is late only for a responding event quiet for an hour', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { status: 'responding', updated_at: ago(70) }), inc(2, { status: 'responding', updated_at: ago(10) }), inc(3, { status: 'contained', updated_at: ago(300) })],
    assignments: [asg(1, 1, { updated_at: ago(70) }), asg(2, 2, { updated_at: ago(10) }), asg(3, 3, { updated_at: ago(300) })] });
  assert.equal(q.watch.find(e => e.incidentId === 1)?.late, true);
  assert.equal(q.watch.find(e => e.incidentId === 2)?.late, false);
  assert.equal(q.watch.find(e => e.incidentId === 3)?.late, false);
  assert.equal(lateCount(q), 1);
});

test('closed incidents never appear, and contained ones need no officer', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { status: 'closed' }), inc(2, { status: 'contained' })] });
  assert.equal(needsYou(q), 0); assert.equal(q.watch.length, 1);
});

const station = (id: number, over: Partial<QStation> = {}): QStation => ({ id, name: `Lookout ${id}`, latitude: 11.5, longitude: 77.5, state: 'TN', status: 'online', last_sound: null, pm25: 20, pm25_vs_normal: 1, ...over });

test('station sound alerts and air-quality spikes are signals unless an open incident is already near', () => {
  const q = buildQueue({ ...base, incidents: [inc(1, { latitude: 11.5, longitude: 77.501 })],
    stations: [station(1, { last_sound: { kind: 'chainsaw', confidence: 84, age_s: 540 } }), station(2, { latitude: 12.5, pm25: 61, pm25_vs_normal: 3.4 }), station(3), station(4, { status: 'offline', pm25_vs_normal: 5 })] });
  assert.equal(q.signals.length, 2);
  const sound = q.signals.find(e => e.stationId === 1)!;
  assert.equal(sound.facts.sound?.kind, 'chainsaw'); assert.equal(sound.ageMin, 9); assert.equal(sound.facts.nearIncident, 1);   // shown, but says a report is already open nearby
  assert.equal(q.signals.find(e => e.stationId === 2)?.facts.pmRatio, 3.4);
});

test('a satellite cluster is a signal unless an open incident is near it; muted signals stay out', () => {
  const dets = Array.from({ length: 6 }, (_, i) => ({ id: i, latitude: 11.2, longitude: 76.7, acq_datetime: ago(190 - i), forest_state: 'TN' }));
  assert.equal(buildQueue({ ...base, incidents: [], detections: dets }).signals.length, 1);
  assert.equal(buildQueue({ ...base, incidents: [inc(1, { latitude: 11.2, longitude: 76.7 })], detections: dets }).signals.length, 0);
  const key = buildQueue({ ...base, incidents: [], detections: dets }).signals[0].key;
  assert.equal(buildQueue({ ...base, incidents: [], detections: dets, muted: new Set([key]) }).signals.length, 0);
  assert.equal(buildQueue({ ...base, incidents: [], detections: dets.map(d => ({ ...d, forest_state: null })) }).signals.length, 0);   // outside forest cells
});
