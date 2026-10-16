import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPassword, safeNext } from '../src/features/auth/rules.ts';
import { homePath } from '../src/ui/nav.ts';

test('password rules match the server rules', () => {
  assert.equal(checkPassword('short1').lengthOk, false);
  assert.equal(checkPassword('password123').notCommon, false);
  assert.equal(checkPassword('aaaaaaaaaaaa').notCommon, false);
  assert.equal(checkPassword('asha.rao-2026!', 'asha.rao@resq.local').notEmail, false);
  assert.equal(checkPassword('correct-horse-battery-staple-9', 'asha@x.in').ok, true);
});

test('after sign-in people only go to their own area, never off-site', () => {
  assert.equal(safeNext('/ops/incidents/4', 'control_room'), '/ops/incidents/4');
  assert.equal(safeNext('/control-room/incidents/4', 'control_room'), '/control-room/incidents/4');
  assert.equal(safeNext('/ops/queue', 'citizen'), homePath('citizen'));
  assert.equal(safeNext('//evil.example/x', 'citizen'), homePath('citizen'));
  assert.equal(safeNext('https://evil.example', 'citizen'), homePath('citizen'));
  assert.equal(safeNext('/citizen\\..\\x', 'citizen'), homePath('citizen'));
  assert.equal(safeNext(null, 'field'), homePath('field'));
  assert.equal(safeNext('/ops/queue', null), '/login');
});
