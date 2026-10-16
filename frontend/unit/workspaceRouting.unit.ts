import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticatedWorkspaceEntry, authenticatedWorkspacePath, PUBLIC_PORTAL_PATH, requestedLoginWorkspace } from '../src/app/workspaceRouting.ts';

test('login query selects only a known workspace presentation and defaults to picker', () => {
  assert.equal(requestedLoginWorkspace(''), 'picker');
  assert.equal(requestedLoginWorkspace('?workspace=control-room'), 'control-room');
  assert.equal(requestedLoginWorkspace('?workspace=range-officer'), 'range-officer');
  assert.equal(requestedLoginWorkspace('?workspace=admin'), 'picker');
  assert.equal(requestedLoginWorkspace('?workspace=field-crew'), 'picker');
});

test('authenticated roles route only to their existing authorized workspace', () => {
  assert.equal(authenticatedWorkspacePath({ role: 'control_room_operator' }), '/redesign/today');
  assert.equal(authenticatedWorkspacePath({ role: 'incident_commander' }), '/redesign/today');
  assert.equal(authenticatedWorkspacePath({ role: 'range_officer' }), '/redesign/today');
  assert.equal(authenticatedWorkspacePath({ role: 'field_crew' }), '/ranger');
  assert.equal(authenticatedWorkspacePath({ role: 'admin' }), '/app/admin');
  assert.equal(authenticatedWorkspacePath({ role: 'officer' }), '/app/map');
  assert.equal(authenticatedWorkspacePath({ role: 'unknown' }), null);
  assert.equal(PUBLIC_PORTAL_PATH, '/');
});

test('range-officer entry stays within scoped read access and mismatched accounts are routed by server role', () => {
  assert.deepEqual(authenticatedWorkspaceEntry({ role: 'range_officer' }, 'range-officer'), { path: '/redesign/today' });
  const mismatch = authenticatedWorkspaceEntry({ role: 'field_crew' }, 'range-officer');
  assert.equal(mismatch?.path, '/ranger');
  assert.match(mismatch?.notice ?? '', /Field workspace/);
  assert.equal(authenticatedWorkspaceEntry({ role: 'range_officer' }, 'control-room')?.path, '/redesign/today');
  assert.match(authenticatedWorkspaceEntry({ role: 'range_officer' }, 'control-room')?.notice ?? '', /Control Room workspace/);
});
