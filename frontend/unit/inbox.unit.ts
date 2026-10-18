import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxTarget, kindLabel } from '../src/ui/inboxTarget.ts';

test('Control Room goes to the incident; field goes to the task; unknown things go nowhere', () => {
  assert.equal(inboxTarget('control_room', { entity_type: 'incident', entity_id: '41' }), '/ops/incidents/41');
  assert.equal(inboxTarget('control_room', { entity_type: 'incident_assignment', entity_id: '9' }), '/ops/field');
  assert.equal(inboxTarget('field', { entity_type: 'incident_assignment', entity_id: '9' }), '/field/tasks/9');
  assert.equal(inboxTarget('field', { entity_type: 'incident', entity_id: '9' }), '/field/tasks');
  assert.equal(inboxTarget('control_room', { entity_type: 'incident', entity_id: 'abc' }), null);
  assert.equal(inboxTarget('control_room', { entity_type: null, entity_id: null }), null);
  assert.equal(inboxTarget('citizen', { entity_type: 'incident', entity_id: '1' }), null);
});
test('kinds have plain labels and unknown kinds are still readable', () => {
  assert.equal(kindLabel('report_unattended'), 'Report with no officer');
  assert.equal(kindLabel('something_new'), 'Update');
});
