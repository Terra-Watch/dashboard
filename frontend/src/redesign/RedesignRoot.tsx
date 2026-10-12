import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './pages/LandingPage';
import { StyleguidePage } from './pages/StyleguidePage';
import { TodayPage } from './pages/TodayPage';
import { WatchPage } from './pages/WatchPage';
import { IncidentPage } from './pages/IncidentPage';
import { FieldPage } from './pages/FieldPage';
import { RoleSwitcher, readRole } from './components/RoleSwitcher';
import type { Role } from './lib/types';
import './styles/index.css';

const queryClient = new QueryClient();

const NAV: { path: string; label: string }[] = [
  { path: '/redesign', label: 'Home' },
  { path: '/redesign/today', label: 'Today' },
  { path: '/redesign/watch', label: 'Watch' },
  { path: '/redesign/incident/E2023-084925', label: 'Incident' },
  { path: '/redesign/field', label: 'Field' },
  { path: '/redesign/styleguide', label: 'Styleguide' },
];

/** Entry point for the redesign-v2 surfaces, mounted at /redesign/* in the existing App shell
 *  (frontend/src/app/App.tsx) without touching the legacy routes. See docs/redesign/04_information_architecture.md. */
export function RedesignRoot({ path, go }: { path: string; go: (next: string) => void }) {
  const [role, setRole] = useState<Role>(() => readRole());

  let body = <LandingPage go={go} />;
  if (path === '/redesign/today') body = <TodayPage />;
  else if (path === '/redesign/watch') body = <WatchPage />;
  else if (path.startsWith('/redesign/incident/')) body = <IncidentPage incidentId={path.split('/').pop() || 'E2023-084925'} />;
  else if (path === '/redesign/field') body = <FieldPage />;
  else if (path === '/redesign/styleguide') body = <StyleguidePage />;

  return (
    <QueryClientProvider client={queryClient}>
      <div data-rq-app className="min-h-screen">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-contour bg-sheet px-5 py-3">
          <nav aria-label="RESQ redesign navigation" className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(event) => { event.preventDefault(); go(item.path); }}
                className={path === item.path || (item.path.includes('incident') && path.startsWith('/redesign/incident')) ? 'font-bold text-ink' : 'text-ink-muted'}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <RoleSwitcher role={role} onChange={setRole} />
        </div>
        {body}
      </div>
    </QueryClientProvider>
  );
}
