import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './pages/LandingPage';
import { TodayPage } from './pages/TodayPage';
import { WatchPage } from './pages/WatchPage';
import { IncidentPage } from './pages/IncidentPage';
import { SimulationLabPage } from './pages/SimulationLabPage';
import { FieldPage } from './pages/FieldPage';
import { OfflineDemoPage } from './pages/OfflineDemoPage';
import { CitizenPage, CommunityPage, PublicArchivePage, PublicLandingPage } from './pages/PublicPortal';
import { Brand } from '../components/Brand';
import { getStoredUser, logoutUser } from './lib/api';
import { canAccessRedesignPath } from './lib/routes';
import './styles/index.css';

const queryClient = new QueryClient();

const NAV: { path: string; label: string; accessPath?: string }[] = [
  { path: '/redesign', label: 'Home' },
  { path: '/redesign/today', label: 'Historical ranking', accessPath: '/redesign/today' },
  { path: '/redesign/watch', label: 'Reports', accessPath: '/redesign/watch' },
  { path: '/redesign/incident/E2023-084925', label: 'Possible spread', accessPath: '/redesign/incident/E2023-084925' },
  { path: '/redesign/simulation', label: 'Saved spread example', accessPath: '/redesign/simulation' },
  { path: '/redesign/field', label: 'Field notes', accessPath: '/redesign/field' },
  { path: '/ranger', label: 'Ranger field work', accessPath: '/ranger' },
  { path: '/demo', label: 'Saved archive' },
];

/** Canonical entry point for the TerraWatch geospatial intelligence workspace. */
export function RedesignRoot({ path, go }: { path: string; go: (next: string) => void }) {
  const [user, setUser] = useState<{ name: string; role: string; email?: string } | null>(() => getStoredUser());

  useEffect(() => {
    setUser(getStoredUser());
  }, [path]);

  const handleSignOut = () => {
    logoutUser();
    setUser(null);
    go('/staff/login');
  };

  // These routes render saved, read-only examples and do not create an
  // authenticated workspace. Staff-only permissions still apply whenever a
  // signed-in account is present, and all write/API authorization remains on
  // the server.
  const publicSavedPath = path === '/redesign/today'
    || path === '/redesign/watch'
    || path.startsWith('/redesign/incident/');
  const routeAllowed = !user && publicSavedPath ? true : canAccessRedesignPath(path, user?.role);
  const visibleNav = NAV.filter((item) => !item.accessPath || (!user && item.accessPath !== '/redesign/simulation') || canAccessRedesignPath(item.accessPath, user?.role));

  if (path === '/' || path === '/redesign') return <PublicLandingPage go={go} />;
  if (path === '/community') return <CommunityPage go={go} />;
  if (path === '/citizen') return <CitizenPage go={go} />;
  if (path === '/community/archive' || path === '/demo') return <PublicArchivePage go={go} />;

  let body = <LandingPage go={go} />;
  if (!routeAllowed) {
    body = <section className="mx-auto max-w-2xl px-5 py-12" role="alert"><h1 className="font-serif text-2xl">{user ? 'This workspace is not available for your account.' : 'Sign in to open this workspace.'}</h1><p className="mt-2 text-sm text-ink-muted">TerraWatch checks permissions on the server. No role selector or client-side override is available.</p><a className="mt-5 inline-flex rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white" href="/staff/login">{user ? 'Return to sign in' : 'Staff sign in'}</a></section>;
  } else if (path === '/redesign/today') body = <TodayPage />;
  else if (path === '/redesign/watch') body = <WatchPage />;
  else if (path.startsWith('/redesign/incident/')) body = <IncidentPage incidentId={path.split('/').pop() || 'E2023-084925'} />;
  else if (path === '/redesign/simulation') body = <SimulationLabPage go={go} />;
  else if (path === '/redesign/field') body = <FieldPage />;
  else if (path === '/ranger') body = <FieldPage />;
  else if (path === '/demo') body = <OfflineDemoPage />;

  return (
    <QueryClientProvider client={queryClient}>
      <div data-rq-app className="min-h-screen flex flex-col bg-paper text-ink">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-contour bg-sheet px-5 py-3">
          <div className="flex items-center gap-4">
            <Brand dark />
            {user ? (
              <span className="hidden sm:inline-flex items-center gap-2 rounded bg-paper px-2.5 py-1 text-xs text-ink-muted border border-contour">
                <span>Account: <strong className="text-ink">{user.role}</strong></span>
                <span className="text-contour">|</span>
                {['admin', 'control_room_operator', 'incident_commander'].includes(user.role) && <><a href="/control-room" className="underline hover:text-ink">Control Room</a><span className="text-contour">|</span></>}
                <a href="/app/map" className="underline hover:text-ink">Staff workspace</a>
                <span className="text-contour">|</span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="font-medium text-danger hover:underline"
                >
                  Sign out
                </button>
              </span>
            ) : (
          <a href="/staff/login" className="hidden sm:inline-block text-xs font-semibold text-canopy hover:underline">
                Staff sign in
              </a>
            )}
          </div>
          <nav aria-label={path === '/demo' ? 'Public example navigation' : 'Saved example navigation'} className="flex flex-wrap gap-4 text-sm font-medium">
            {visibleNav.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(event) => { event.preventDefault(); go(item.path); }}
                className={path === item.path || (item.path.includes('incident') && path.startsWith('/redesign/incident')) ? 'font-bold text-canopy border-b-2 border-canopy pb-0.5' : 'text-ink-muted hover:text-ink'}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>
        <p className="border-b border-contour bg-paper px-5 py-2 text-xs text-ink-muted">Saved examples only · not live monitoring, official warnings, dispatch, or verified incidents. <a className="underline" href="/demo">Open the public archive</a></p>
        <main className="flex-1">
          {body}
        </main>
      </div>
    </QueryClientProvider>
  );
}
