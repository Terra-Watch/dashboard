import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessRedesignPath } from '../src/redesign/lib/routes.ts';

test('redesign route affordances mirror the established server role allowlists', () => {
  assert.equal(canAccessRedesignPath('/redesign/today', 'range_officer'), true);
  assert.equal(canAccessRedesignPath('/redesign/watch', 'control_room_operator'), true);
  assert.equal(canAccessRedesignPath('/redesign/incident/E2023-084925', 'incident_commander'), true);
  assert.equal(canAccessRedesignPath('/redesign/field', 'field_crew'), true);
  assert.equal(canAccessRedesignPath('/redesign/incident/E2023-084925', 'range_officer'), false);
  assert.equal(canAccessRedesignPath('/redesign/field', 'control_room_operator'), false);
  assert.equal(canAccessRedesignPath('/ranger', 'field_crew'), true);
  assert.equal(canAccessRedesignPath('/ranger', 'range_officer'), false);
  assert.equal(canAccessRedesignPath('/redesign/watch', null), false);
});

test('admin bypass and public archive/saved scenario routes match the existing backend contract', () => {
  assert.equal(canAccessRedesignPath('/redesign/field', 'admin'), true);
  assert.equal(canAccessRedesignPath('/redesign/simulation', null), true);
  assert.equal(canAccessRedesignPath('/demo', null), true);
  assert.equal(canAccessRedesignPath('/redesign', null), true);
});
