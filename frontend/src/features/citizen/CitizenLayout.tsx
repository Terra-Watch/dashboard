import { Navigate, Outlet, useLocation, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { signOut, useSession } from '../../app/session';
import { readOfflineQueue } from '../../lib/offlineQueue';
import { AppShell } from '../../ui/AppShell';
import { homePath } from '../../ui/nav';

/** Everything under /citizen/*: signed-in citizens only, in the shared shell. */
export function CitizenLayout() {
  const { t } = useTranslation();
  const { user, role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (role !== 'citizen') return <main data-rq-app className="mx-auto max-w-xl p-8"><h1 className="text-2xl">{t('citizen.wrong_area', 'This area is for citizen accounts.')}</h1><p className="mt-3"><Link className="font-semibold underline" to={homePath(role)}>{t('citizen.go_home', 'Go to your workspace')}</Link></p></main>;
  return <AppShell role="citizen" userName={user.name} pending={readOfflineQueue().length} onSignOut={() => void signOut().then(() => navigate('/', { replace: true }))}><Outlet /></AppShell>;
}
