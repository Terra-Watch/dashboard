import assert from 'node:assert/strict';
import test from 'node:test';
import { BAR_ITEMS, BUILT, MAX_NAV_ITEMS, NAV, activeItem, homePath, productRole, roleOfPath } from '../src/ui/nav.ts';
import { resources } from '../src/ui/i18n/locales.ts';

test('exactly three product roles map from every stored role; unknown roles get nothing', () => {
  assert.equal(productRole('citizen'), 'citizen');
  for (const stored of ['admin', 'incident_commander', 'control_room_operator', 'officer']) assert.equal(productRole(stored), 'control_room');
  for (const stored of ['field_crew', 'range_officer']) assert.equal(productRole(stored), 'field');
  assert.equal(productRole('viewer'), null);
  assert.equal(productRole(undefined), null);
});

test('each role has at most seven destinations, unique ids and paths, and at most one primary action', () => {
  for (const [role, items] of Object.entries(NAV)) {
    assert.ok(items.length >= 4 && items.length <= MAX_NAV_ITEMS, role);
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
    assert.equal(new Set(items.map(item => item.path)).size, items.length);
    assert.ok(items.filter(item => item.primary).length <= 1);
    assert.ok(items.every(item => roleOfPath(item.path) === (role as keyof typeof NAV)));
  }
});

test('home path per role and incident pages stay inside the Queue destination', () => {
  const all = { citizen: true, control_room: true, field: true };
  assert.equal(homePath('citizen', all), '/citizen');
  assert.equal(homePath('control_room', all), '/ops/queue');
  assert.equal(homePath('field', all), '/field/tasks');
  assert.equal(homePath(null), '/login');
  assert.equal(homePath('citizen', { ...BUILT, citizen: false }), '/citizen');          // until the new screens exist, people land on the current ones
  assert.equal(activeItem('control_room', '/ops/incidents/12')?.id, 'queue');
  assert.equal(activeItem('field', '/field/tasks/7')?.id, 'tasks');
  assert.equal(activeItem('citizen', '/citizen/report')?.id, 'report');
  assert.equal(activeItem('citizen', '/elsewhere'), undefined);
});

test('every navigation label exists in every language', () => {
  const labels = Object.values(NAV).flat().map(item => item.labelKey.split('.')[1]);
  for (const [code, bundle] of Object.entries(resources)) for (const label of labels) assert.ok((bundle.translation.nav as Record<string, string>)[label], `${code} is missing nav.${label}`);
});

test('the raised primary button sits in the middle of the bottom bar, and every role has one account page', async () => {
  const { profilePath } = await import('../src/ui/nav.ts');
  for (const [role, items] of Object.entries(NAV)) {
    const bar = items.length > 5 ? [...items.slice(0, BAR_ITEMS), { id: 'more' }] : items;     // what the phone shows: four items plus "More" when there are more than five
    const at = bar.findIndex(item => 'primary' in item && item.primary);
    if (at >= 0) assert.equal(at, (bar.length - 1) / 2, `${role}: the primary action must be the middle item of an odd-sized bar`);
  }
  assert.deepEqual(NAV.field.map(item => item.id), ['tasks', 'map', 'capture', 'forecast', 'stations', 'notices', 'me']);
  assert.equal(profilePath('citizen'), '/citizen/account');
  assert.equal(profilePath('field'), '/field/me');
  assert.equal(profilePath('control_room'), '/ops/me');
  assert.equal(profilePath(null), '/login');
  assert.equal(roleOfPath(profilePath('control_room')), 'control_room');
});

test('with more than five destinations the phone bar keeps four and the capture button stays in the bar', () => {
  for (const role of ['control_room', 'field'] as const) assert.ok(NAV[role].length > 5);
  assert.ok(NAV.field.slice(0, 4).some(item => item.primary), 'ranger capture button must be one of the first four');
  assert.deepEqual(NAV.control_room.slice(0, 4).map(i => i.id), ['queue', 'map', 'stations', 'satellite']);
  assert.deepEqual(NAV.field.map(i => i.id).slice(0, 5), ['tasks', 'map', 'capture', 'forecast', 'stations']);
});

test('the control room lists the fire forecast, with the spread outlook as its second tab, and the old what-if page is gone', () => {
  assert.ok(NAV.control_room.some(item => item.id === 'forecast' && item.path === '/ops/forecast'));
  assert.equal(activeItem('control_room', '/ops/outlook')?.id, 'forecast');
  assert.equal(activeItem('field', '/field/satellite')?.id, 'forecast');
  assert.ok(!NAV.control_room.some(item => item.path.includes('whatif')));
  assert.equal(roleOfPath('/ops/outlook'), 'control_room');
});
