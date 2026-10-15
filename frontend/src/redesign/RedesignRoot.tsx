import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './pages/LandingPage';
import { TodayPage } from './pages/TodayPage';
import { WatchPage } from './pages/WatchPage';
import { IncidentPage } from './pages/IncidentPage';
import { FieldPage } from './pages/FieldPage';
import { Brand } from '../components/Brand';
import './styles/index.css';

const queryClient = new QueryClient();

const NAV: { path: string; label: string }[] = [
  { path: '/redesign', label: 'Home' },
  { path: '/redesign/today', label: 'Historical ranking' },
  { path: '/redesign/watch', label: 'Reports' },
  { path: '/redesign/incident/E2023-084925', label: 'Possible spread' },
  { path: '/redesign/field', label: 'Field notes' },
];

/** Transitional entry point for the new surfaces. The legacy shell remains until route,
 * identity, authorization, and workflow migration has been verified. */
export function RedesignRoot({ path, go }: { path: string; go: (next: string) => void }) {
  const [user] = useState<{ name: string; role: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('resq_user') || 'null');
    } catch {
      return null;
    }
  });

  let body = <LandingPage go={go} />;
  if (path === '/redesign/today') body = <TodayPage />;
  else if (path === '/redesign/watch') body = <WatchPage />;
  else if (path.startsWith('/redesign/incident/')) body = <IncidentPage incidentId={path.split('/').pop() || 'E2023-084925'} />;
  else if (path === '/redesign/field') body = <FieldPage />;

  return (
    <QueryClientProvider client={queryClient}>
      <div data-rq-app className="min-h-screen">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-contour bg-sheet px-5 py-3">
          <div className="flex items-center gap-4">
            <Brand dark />
            {user ? (
              <span className="hidden sm:inline-block rounded bg-paper px-2 py-0.5 text-xs text-ink-muted">
                Staff: <span className="font-semibold text-ink">{user.role}</span> · <a href="/app/map" className="underline hover:text-ink">Staff workspace</a>
              </span>
            ) : (
              <a href="/login" className="hidden sm:inline-block text-xs font-medium text-canopy hover:underline">
                Staff sign in
              </a>
            )}
          </div>
          <nav aria-label="Saved example navigation" className="flex flex-wrap gap-4 text-sm">
            {NAV.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(event) => { event.preventDefault(); go(item.path); }}
                className={path === item.path || (item.path.includes('incident') && path.startsWith('/redesign/incident')) ? 'font-bold text-ink' : 'text-ink-muted hover:text-ink'}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <p className="border-b border-contour bg-paper px-5 py-2 text-xs text-ink-muted">Saved examples only · not live monitoring, official warnings, dispatch, or verified incidents. <a className="underline" href="/demo">Open the public archive</a></p>
        {body}
      </div>
    </QueryClientProvider>
  );
}
