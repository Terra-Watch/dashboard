import { useEffect, useState } from 'react';
import { appRoutes, locales, pages, publicRoutes } from './config';
import type { User } from './types';
import { CommandPalette } from '../components/CommandPalette';
import { DebugFps } from '../components/DebugFps';
import { Login } from '../components/Login';
import { AuthPage } from '../pages/AuthPage';
import { BriefPage } from '../pages/BriefPage';
import { InteractivePages, NotificationsPage } from '../pages/InteractivePages';
import { MapPage } from '../pages/MapPage';
import { OperationsPage } from '../pages/OperationsPage';
import { PublicPage } from '../pages/PublicPage';
import { ShellPage } from '../pages/ShellPage';
import { RequestAccessPage } from '../pages/RequestAccessPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { OfflineDemoPage } from '../redesign/pages/OfflineDemoPage';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';
import { AdminPage, IncidentsListPage, PlanListPage, ReportsPage } from '../features/operations';
import { SystemPage } from '../pages/SystemPage';
import { authenticatedActorId, readPendingIncidents, savePendingIncidents, syncPendingIncidents } from '../lib/offlineQueue';
import { clearSession } from '../lib/session';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import { RedesignRoot } from '../redesign/RedesignRoot';

export function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('resq_user') || 'null'));
  const [path, setPath] = useState(location.pathname || '/');
  const [theme, setTheme] = useState(localStorage.getItem('resq_theme') || 'auto');
  const [locale, setLocale] = useState('English');
  const [palette, setPalette] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('resq_theme', theme); }, [theme]);
  useEffect(() => {
    if (path === '/redesign/demo') {
      history.replaceState({}, '', '/demo');
      setPath('/demo');
      return;
    }
    const knownRedesignPath = path === '/redesign'
      || path === '/redesign/today'
      || path === '/redesign/watch'
      || path === '/redesign/field'
      || /^\/redesign\/incident\/[^/]+$/.test(path);
    if (path.startsWith('/redesign/') && !knownRedesignPath) {
      history.replaceState({}, '', '/redesign');
      setPath('/redesign');
    }
  }, [path]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); } if (event.key === 'Escape') setPalette(false); };
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('keydown', onKey); window.addEventListener('popstate', onPopState);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPopState); };
  }, []);
  useEffect(() => {
    async function syncPending() {
      const pending = readPendingIncidents();
      const actorId = authenticatedActorId();
      if (!pending.length || !actorId) return;
      const remaining = await syncPendingIncidents(pending, actorId, payload =>
        api('/api/incidents', { method: 'POST', body: JSON.stringify(payload) }),
      );
      savePendingIncidents(remaining);
    }
    window.addEventListener('online', syncPending); void syncPending();
    return () => window.removeEventListener('online', syncPending);
  }, [user]);
  useEffect(() => { const onOnline = () => setOnline(true); const onOffline = () => setOnline(false); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); }; }, []);
  function go(next: string) { history.pushState({}, '', next); setPath(next); }

  // The redesigned public landing is the canonical entry point. Keep the
  // legacy operational routes below available until each workflow is replaced.
  if (path === '/') {
    history.replaceState({}, '', '/redesign');
    return <RedesignRoot path="/redesign" go={go} />;
  }
  if (path === '/redesign' || path.startsWith('/redesign/')) return <RedesignRoot path={path} go={go} />;
  if (path === '/demo') return <OfflineDemoPage />;
  if (['/403', '/404', '/500', '/offline', '/maintenance', '/session-expired'].includes(path)) return <SystemPage path={path} go={go} />;
  if (path === '/login' || (path.startsWith('/app') && !user)) return <Login done={setUser} go={go} />;
  if (!user && path === '/request-access') return <RequestAccessPage go={go} />;
  if (!user && ['/accept-invite', '/forgot-password', '/reset-password', '/verify-2fa', '/session-expired'].includes(path)) return <AuthPage go={go} />;
  if (!user && publicRoutes[path]) return <PublicPage title={publicRoutes[path][0]} copy={publicRoutes[path][1]} go={go} />;
  if (!user && path === '/about-forecast') return <PublicPage title="How the forecast works" copy={publicRoutes['/about-forecast'][1]} go={go} />;
  if (!user) return <PublicPage title="This page does not exist." copy="Go to the TerraWatch home page." go={go} />;

  const current = pages.find(([href]) => path.startsWith(href));
  const officerOnly = ['/app/plan', '/app/alerts/rules', '/app/incidents/new', '/app/spread', '/app/teams', '/app/reports'];
  const adminOnly = ['/app/admin'];
  // Mirror the existing route-level affordance guard in navigation only.
  // This is not an authorization boundary; API authorization remains authoritative.
  const visiblePages = pages.filter(([href]) => href !== '/app/plan' || ['admin', 'officer'].includes(user.role));
  if ((officerOnly.some(route => path === route || path.startsWith(`${route}/`)) && !['admin', 'officer'].includes(user.role)) || (adminOnly.some(route => path === route || path.startsWith(`${route}/`)) && user.role !== 'admin')) return <div className="app"><main className="content"><ForbiddenPage go={go} /></main></div>;
  const content = path === '/app/map' ? <MapPage />
    : path === '/app/brief' ? <BriefPage />
    : path === '/app/plan' ? <PlanListPage />
    : path === '/app/plan/new' ? <InteractivePages kind="plan" />
    : path === '/app/alerts' ? <InteractivePages kind="alerts" />
    : path === '/app/alerts/rules' ? <InteractivePages kind="alert-rules" />
    : path === '/app/incidents' ? <IncidentsListPage />
    : path === '/app/incidents/new' ? <InteractivePages kind="incidents" />
    : path === '/app/spread' ? <InteractivePages kind="spread" />
    : path === '/app/assistant' ? <InteractivePages kind="assistant" />
    : path === '/app/settings' ? <InteractivePages kind="settings" />
    : path === '/app/notifications' ? <NotificationsPage />
    : path === '/app/admin' ? <AdminPage />
    : path === '/app/reports' ? <ReportsPage />
    : appRoutes[path] ? <OperationsPage title={appRoutes[path][0]} copy={appRoutes[path][1]} actions={[]} />
    : current ? <ShellPage title={current[1]} copy="This workspace is ready for the next TerraWatch phase." />
    : <ShellPage title="Page not found" copy="This page does not exist. Go to the map." />;

  return <div className="app">
    <aside className="rail"><Brand /><p className="nav-label">Staff workspace</p><nav aria-label="Primary navigation">{visiblePages.map(([href, label, icon]) => <a className={path.startsWith(href) ? 'active' : ''} href={href} onClick={event => { event.preventDefault(); go(href); }} key={href}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></a>)}</nav><div className="redesign-nav-entry" style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--contour, #e2e8f0)' }}><a href="/redesign" onClick={event => { event.preventDefault(); go('/redesign'); }} style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--canopy, #0f766e)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}><span>✦</span><span>New Redesign Portal</span></a></div><div className="profile"><strong>{user.name}</strong><span aria-label="Signed-in account role">Account role: {user.role}</span><button className="signout" onClick={() => { clearSession(); setUser(null); go('/'); }}>Sign out</button></div></aside>
    <main className="content"><header className="topbar"><button className="mobile-brand" onClick={() => go('/app/map')}><span className="brand-mark brand-mark-terra" aria-hidden="true">TW</span> TerraWatch</button><div className="top-context"><span className="eyebrow">Wildfire Monitoring &amp; Incident Intelligence</span><span className="date">India</span></div><div className="top-actions"><button className="quiet-button" onClick={() => setPalette(true)}>Search <kbd>⌘K</kbd></button><button className="quiet-button" aria-label="Notifications" onClick={() => go('/app/notifications')}>◌</button><select aria-label="Language" value={locale} onChange={event => setLocale(event.target.value)}>{locales.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value)}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></div></header><div className="banner demo-banner">{online ? 'Sample data from a past date. Choose a 2023–2024 date.' : 'You are offline. Saved incident reports will wait to sync.'}</div><RouteErrorBoundary key={path}>{content}</RouteErrorBoundary><footer>Historical examples are not current fire reports. Confirm active fires with local authorities.</footer></main>
    <nav className="bottom-tabs" aria-label="Mobile navigation">{visiblePages.slice(0, 5).map(([href, label, icon]) => <a className={path.startsWith(href) ? 'active' : ''} href={href} onClick={event => { event.preventDefault(); go(href); }} key={href}><span>{icon}</span>{label}</a>)}</nav>{palette && <CommandPalette close={() => setPalette(false)} go={go} />}<DebugFps />
  </div>;
}
