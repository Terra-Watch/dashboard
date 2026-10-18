/** Navigation per product role (docs/design/D3-clean-sheet-design.md, section 3). Pure data so it can be tested without a browser. */
export type ProductRole = 'citizen' | 'control_room' | 'field';
export type IconId = 'map-pin' | 'plus' | 'clipboard-list' | 'users' | 'user' | 'inbox' | 'map' | 'radio' | 'megaphone' | 'clipboard-check' | 'list-todo' | 'camera';
export type NavItem = { id: string; path: string; icon: IconId; labelKey: string; primary?: boolean };

const STORED_ROLE_TO_PRODUCT: Record<string, ProductRole> = {
  citizen: 'citizen',
  admin: 'control_room', incident_commander: 'control_room', control_room_operator: 'control_room', officer: 'control_room',
  field_crew: 'field', range_officer: 'field',
};

/** The three product roles. Stored role names stay as they are for now; this is the only place that maps them. */
export function productRole(stored: string | null | undefined): ProductRole | null {
  return (stored && STORED_ROLE_TO_PRODUCT[stored]) || null;
}

export const NAV: Record<ProductRole, NavItem[]> = {
  citizen: [
    { id: 'near-me', path: '/citizen/near-me', icon: 'map-pin', labelKey: 'nav.near_me' },
    { id: 'my-reports', path: '/citizen/reports', icon: 'clipboard-list', labelKey: 'nav.my_reports' },
    { id: 'report', path: '/citizen/report', icon: 'plus', labelKey: 'nav.report', primary: true },
    { id: 'community', path: '/citizen/community', icon: 'users', labelKey: 'nav.community' },
    { id: 'account', path: '/citizen/account', icon: 'user', labelKey: 'nav.account' },
  ],
  control_room: [
    { id: 'queue', path: '/ops/queue', icon: 'inbox', labelKey: 'nav.queue' },
    { id: 'map', path: '/ops/map', icon: 'map', labelKey: 'nav.map' },
    { id: 'field', path: '/ops/field', icon: 'radio', labelKey: 'nav.field' },
    { id: 'notices', path: '/ops/notices', icon: 'megaphone', labelKey: 'nav.notices' },
    { id: 'handover', path: '/ops/handover', icon: 'clipboard-check', labelKey: 'nav.handover' },
  ],
  field: [
    { id: 'tasks', path: '/field/tasks', icon: 'list-todo', labelKey: 'nav.tasks' },
    { id: 'map', path: '/field/map', icon: 'map', labelKey: 'nav.map' },
    { id: 'capture', path: '/field/capture', icon: 'camera', labelKey: 'nav.capture', primary: true },
    { id: 'me', path: '/field/me', icon: 'user', labelKey: 'nav.me' },
  ],
};

export const MAX_NAV_ITEMS = 5;

/** Which roles already have their new screens. Until a role is built, people land on its existing screens. Remove with the old screens. */
export const BUILT: Record<ProductRole, boolean> = { citizen: true, control_room: true, field: true };
const LEGACY_HOME: Record<ProductRole, string> = { citizen: '/citizen', control_room: '/control-room', field: '/ranger' };
const NEW_HOME: Record<ProductRole, string> = { citizen: '/citizen/near-me', control_room: '/ops/queue', field: '/field/tasks' };

export function homePath(role: ProductRole | null, built: Record<ProductRole, boolean> = BUILT): string {
  return role ? (built[role] ? NEW_HOME[role] : LEGACY_HOME[role]) : '/login';
}

export function roleOfPath(path: string): ProductRole | null {
  return path.startsWith('/citizen') ? 'citizen' : path.startsWith('/ops') || path.startsWith('/control-room') ? 'control_room' : path.startsWith('/field') || path.startsWith('/ranger') ? 'field' : null;
}

/** The nav item that owns this path (a path under /ops/incidents/12 belongs to the queue). */
export function activeItem(role: ProductRole, path: string): NavItem | undefined {
  const own = NAV[role].find(item => path === item.path || path.startsWith(item.path + '/'));
  if (own) return own;
  if (role === 'control_room' && path.startsWith('/ops/incidents')) return NAV.control_room[0];
  if (role === 'field' && path.startsWith('/field/tasks')) return NAV.field[0];
  return undefined;
}
