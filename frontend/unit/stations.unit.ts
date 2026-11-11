import assert from 'node:assert/strict';
import test from 'node:test';
import { ageLabel, byAttention, maintenance, counts, statementWords, isHigh, soundName, symbolOf, type Station } from '../src/features/stations/model.ts';

const st = (o: Partial<Station>) => ({ status: 'online', pm25: 10, pm25_vs_normal: 1, ...o }) as Station;

test('high only at 2x normal', () => { assert.equal(isHigh(st({ pm25_vs_normal: 2.5 })), true); assert.equal(isHigh(st({ pm25_vs_normal: 1.9 })), false); });
test('symbol follows status', () => { assert.equal(symbolOf(st({})), 'station_ok'); assert.equal(symbolOf(st({ status: 'late' })), 'station_late'); assert.equal(symbolOf(st({ status: 'never' })), 'station_off'); });
test('counts and age label', () => { const c = counts([st({}), st({ status: 'late' }), st({ status: 'never' })]); assert.equal(c.online, 1); assert.equal(c.late, 1); assert.equal(c.offline, 1); assert.equal(ageLabel(null), null); assert.equal(ageLabel(300), '5 min'); });
test('sound kinds have plain names', () => { assert.equal(soundName('chainsaw'), 'Chainsaw'); assert.equal(soundName('blast'), 'Gunshot or blast'); });
test('statements read plainly and checks come first', () => {
  const t = (_k: string, d: string, o?: Record<string, unknown>) => d.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? ''));
  const a = st({ name: 'A', statement: { key: 'normal', params: {}, tone: 'ok' } }); const b = st({ name: 'B', statement: { key: 'smoke_rising', params: { minutes: 30 }, tone: 'check' } });
  const c = st({ name: 'C', status: 'offline', age_s: 7200, statement: { key: 'silent', params: { age_s: 7200 }, tone: 'gap' } });
  assert.deepEqual(byAttention([a, c, b]).map(s => s.name), ['B', 'C', 'A']);
  assert.match(statementWords(b, t), /30 minutes/); assert.match(statementWords(c, t), /Silent for 2 h/); assert.match(statementWords(a, t), /normal/);
});
test('maintenance lists what a technician should visit for', () => {
  assert.deepEqual(maintenance(st({ battery_mv: 3300, rssi: -118, snr: 2 } as Partial<Station>)), ['battery', 'signal']);
  assert.deepEqual(maintenance(st({ status: 'offline', battery_mv: 3900, rssi: -90, snr: 5 } as Partial<Station>)), ['silent']);
  assert.deepEqual(maintenance(st({ battery_mv: 3900, rssi: -90, snr: 5, reported: { offset_km: 3 } } as unknown as Partial<Station>)), ['position']);
  assert.deepEqual(maintenance(st({ battery_mv: null, rssi: null, snr: null } as Partial<Station>)), []);
});
