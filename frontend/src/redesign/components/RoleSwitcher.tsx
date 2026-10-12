import { ROLE_LABEL, type Role } from '../lib/types';

const ROLES: Role[] = ['range_officer', 'control_room', 'field_crew', 'incident_commander', 'reviewer'];
const STORAGE_KEY = 'rq_role';

export function readRole(): Role {
  return (localStorage.getItem(STORAGE_KEY) as Role) || 'range_officer';
}

/** Client-side role preview only — no real auth. See docs/redesign/11_build_plan.md's "real auth" later phase. */
export function RoleSwitcher({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-ink-muted">Viewing as</span>
      <select
        aria-label="Viewing as (role preview, not real access control)"
        value={role}
        onChange={(event) => {
          const next = event.target.value as Role;
          localStorage.setItem(STORAGE_KEY, next);
          onChange(next);
        }}
        className="rounded-rq border border-contour bg-sheet px-2 py-1.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy"
      >
        {ROLES.map((item) => (
          <option key={item} value={item}>{ROLE_LABEL[item]}</option>
        ))}
      </select>
    </label>
  );
}
