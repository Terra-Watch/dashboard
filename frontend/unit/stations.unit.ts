import assert from 'node:assert/strict';
import test from 'node:test';
import { ageLabel, counts, isHigh, soundName, symbolOf, type Station } from '../src/features/stations/model.ts';

const st = (o: Partial<Station>) => ({ status: 'online', pm25: 10, pm25_vs_normal: 1, ...o }) as Station;

test('high only at 2x normal', () => { assert.equal(isHigh(st({ pm25_vs_normal: 2.5 })), true); assert.equal(isHigh(st({ pm25_vs_normal: 1.9 })), false); });
test('symbol follows status', () => { assert.equal(symbolOf(st({})), 'station_ok'); assert.equal(symbolOf(st({ status: 'late' })), 'station_late'); assert.equal(symbolOf(st({ status: 'never' })), 'station_off'); });
test('counts and age label', () => { const c = counts([st({}), st({ status: 'late' }), st({ status: 'never' })]); assert.equal(c.online, 1); assert.equal(c.late, 1); assert.equal(c.offline, 1); assert.equal(ageLabel(null), null); assert.equal(ageLabel(300), '5 min'); });
test('sound kinds have plain names', () => { assert.equal(soundName('chainsaw'), 'Chainsaw'); assert.equal(soundName('blast'), 'Gunshot or blast'); });
