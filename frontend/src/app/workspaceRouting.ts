import type { User } from './types';

export type LoginWorkspace = 'picker' | 'control-room' | 'range-officer';
export type WorkspaceEntry = { path: string; notice?: string };

/** Workspace query selects the sign-in presentation only; it grants no access. */
export function requestedLoginWorkspace(search: string): LoginWorkspace {
  const requested = new URLSearchParams(search).get('workspace');
  if (requested === 'control-room' || requested === 'range-officer') return requested;
  return 'picker';
}

/** Route only from the role returned by the authentication service. */
export function authenticatedWorkspaceEntry(user: Pick<User, 'role'>, requested: LoginWorkspace = 'picker'): WorkspaceEntry | null {
  let path: string;
  let actualWorkspace: LoginWorkspace | 'field' | 'admin' | 'legacy';
  switch (user.role) {
    case 'control_room_operator':
    case 'incident_commander':
      actualWorkspace = 'control-room';
      path = '/redesign/today';
      break;
    case 'range_officer':
      // Scoped Today/risk reads are allowed; field tasks and reports are not.
      actualWorkspace = 'range-officer';
      path = '/redesign/today';
      break;
    case 'field_crew':
      // The Ranger route is specifically allowlisted for field_crew.
      actualWorkspace = 'field';
      path = '/ranger';
      break;
    case 'admin':
      // Admin workspace is reached only after successful server authentication.
      actualWorkspace = 'admin';
      path = '/app/admin';
      break;
    case 'officer':
      // Legacy role: retain its existing legacy map entry; no redesign mapping.
      actualWorkspace = 'legacy';
      path = '/app/map';
      break;
    default:
      return null;
  }

  const mismatch = requested !== 'picker' && requested !== actualWorkspace;
  return {
    path,
    ...(mismatch ? { notice: `This account is authorized for its ${actualWorkspace === 'field' ? 'Field' : actualWorkspace === 'admin' ? 'Administrator' : actualWorkspace === 'legacy' ? 'staff' : 'Control Room'} workspace. You have been routed there based on the role returned by the service.` } : {}),
  };
}

/** Convenience path resolver for callers that do not need mismatch messaging. */
export function authenticatedWorkspacePath(user: Pick<User, 'role'>): string | null {
  return authenticatedWorkspaceEntry(user)?.path ?? null;
}

export const PUBLIC_PORTAL_PATH = '/';
