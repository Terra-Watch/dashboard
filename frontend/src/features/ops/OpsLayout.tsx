import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { signOut, useSession } from '../../app/session';
import { AppShell } from '../../ui/AppShell';
import { homePath } from '../../ui/nav';
import { STATES } from '../citizen/format';
import { setOpsRegion, useOpsRegion } from './useOps';

function RegionSwitch() {
  const { t } = useTranslation();
  const region = useOpsRegion();
  return (
    <label className="hidden items-center gap-2 text-sm font-semibold md:flex">
      <span className="sr-only md:not-sr-only">{t('ops.region', 'Region')}</span>
      <select value={region} onChange={event => setOpsRegion(event.target.value)} className="min-h-11 rounded-rq border border-control bg-surface px-2 font-normal text-ink">
        <option value="">{t('ops.all_regions', 'All my regions')}</option>
        {STATES.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}
      </select>
    </label>
  );
}

export function OpsLayout() {
  const { t } = useTranslation();
  const { user, role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (role !== 'control_room') return <main data-rq-app className="mx-auto max-w-xl p-8"><h1 className="text-2xl">{t('ops.wrong_area', 'This area is for Control Room staff.')}</h1><p className="mt-3"><Link className="font-semibold underline" to={homePath(role)}>{t('citizen.go_home', 'Go to your workspace')}</Link></p></main>;
  return <AppShell role="control_room" userName={user.name} onSignOut={() => void signOut().then(() => navigate('/', { replace: true }))} topSlot={<>{user.role === 'admin' && <Link to="/ops/admin" className="inline-flex min-h-11 items-center rounded-rq border border-control px-3 text-sm font-semibold hover:bg-surface-2">{t('ops.admin.link', 'People')}</Link>}<RegionSwitch /></>}><Outlet /></AppShell>;
}
