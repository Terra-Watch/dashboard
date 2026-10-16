import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILT, MAX_NAV_ITEMS, NAV, activeItem, homePath, productRole, roleOfPath } from '../src/ui/nav.ts';
import { resources } from '../src/ui/i18n/locales.ts';

test('exactly three product roles map from every stored role; unknown roles get nothing', () => {
  assert.equal(productRole('citizen'), 'citizen');
  for (const stored of ['admin', 'incident_commander', 'control_room_operator', 'officer']) assert.equal(productRole(stored), 'control_room');
  for (const stored of ['field_crew', 'range_officer']) assert.equal(productRole(stored), 'field');
  assert.equal(productRole('viewer'), null);
  assert.equal(productRole(undefined), null);
});

test('each role has at most five destinations, unique ids and paths, and at most one primary action', () => {
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
  assert.equal(homePath('citizen', all), '/citizen/near-me');
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
