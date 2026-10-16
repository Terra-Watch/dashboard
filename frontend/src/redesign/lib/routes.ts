const ROUTE_ROLES: Array<{ matches: (path: string) => boolean; roles: readonly string[] }> = [
  { matches: (path) => path === '/redesign/today', roles: ['range_officer', 'control_room_operator', 'incident_commander'] },
  { matches: (path) => path === '/redesign/watch', roles: ['range_officer', 'control_room_operator', 'incident_commander'] },
  { matches: (path) => path.startsWith('/redesign/incident/'), roles: ['control_room_operator', 'incident_commander'] },
  { matches: (path) => path === '/redesign/field', roles: ['field_crew'] },
  { matches: (path) => path === '/ranger', roles: ['field_crew'] },
];

/** UI affordance matching existing API allowlists; backend authorization remains authoritative. */
export function canAccessRedesignPath(path: string, role: string | null | undefined): boolean {
  const route = ROUTE_ROLES.find((candidate) => candidate.matches(path));
  if (!route) return true;
  return role === 'admin' || (role != null && route.roles.includes(role));
}
