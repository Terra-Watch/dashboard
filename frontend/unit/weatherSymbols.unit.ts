import assert from 'node:assert/strict';
import test from 'node:test';
import { describeWeather } from '../src/features/map/weatherSymbols.ts';

test('common conditions get an icon and plain words', () => {
  assert.deepEqual(describeWeather(0, 1), { icon: '☀️', label: 'Clear' });
  assert.equal(describeWeather(0, 0)?.icon, '🌙');
  assert.equal(describeWeather(63)?.label, 'Rain');
  assert.equal(describeWeather(81)?.label, 'Showers');
  assert.equal(describeWeather(95)?.icon, '⛈️');
  assert.equal(describeWeather(45)?.label, 'Fog');
});

test('no condition from the service means no icon', () => {
  assert.equal(describeWeather(null), null);
  assert.equal(describeWeather(undefined), null);
});
