import { Navigate, Outlet, useLocation, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { signOut, useSession } from '../../app/session';
import { readOfflineQueue } from '../../lib/offlineQueue';
import { flushOutbox, outboxCount } from '../../lib/outbox';
import { useEffect, useState } from 'react';
import { AppShell } from '../../ui/AppShell';
import { homePath } from '../../ui/nav';

/** Everything under /citizen/*: signed-in citizens only, in the shared shell. */
export function CitizenLayout() {
  const { t } = useTranslation();
  const { user, role } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(0);
  useEffect(() => { const look = () => void outboxCount().then(setSaved); look(); const timer = window.setInterval(look, 4000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { void flushOutbox(); const again = () => void flushOutbox(); window.addEventListener('online', again); return () => window.removeEventListener('online', again); }, []);
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (role !== 'citizen') return <main data-rq-app className="mx-auto max-w-xl p-8"><h1 className="text-2xl">{t('citizen.wrong_area', 'This area is for citizen accounts.')}</h1><p className="mt-3"><Link className="font-semibold underline" to={homePath(role)}>{t('citizen.go_home', 'Go to your workspace')}</Link></p></main>;
  return <AppShell role="citizen" userName={user.name} pending={readOfflineQueue().length + saved} onSignOut={() => void signOut().then(() => navigate('/', { replace: true }))}><Outlet /></AppShell>;
}
