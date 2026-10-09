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
import { DemoPage } from '../pages/DemoPage';
import { api } from '../lib/api';
import { AdminPage, IncidentsListPage, PlanListPage, ReportsPage } from '../features/operations';
import { SystemPage } from '../pages/SystemPage';
import { readPendingIncidents, savePendingIncidents } from '../lib/offlineQueue';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';

export function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('resq_user') || 'null'));
  const [path, setPath] = useState(location.pathname || '/');
  const [theme, setTheme] = useState(localStorage.getItem('resq_theme') || 'auto');
  const [locale, setLocale] = useState('English');
  const [palette, setPalette] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('resq_theme', theme); }, [theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); } if (event.key === 'Escape') setPalette(false); };
    const onPopState = () => setPath(location.pathname);
    window.addEventListener('keydown', onKey); window.addEventListener('popstate', onPopState);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPopState); };
  }, []);
  useEffect(() => {
    async function syncPending() {
      const pending = readPendingIncidents();
      if (!pending.length || !localStorage.getItem('resq_token')) return;
      const remaining = [];
      for (const incident of pending) { try { await api('/api/incidents', { method: 'POST', body: JSON.stringify(incident) }); } catch { remaining.push(incident); } }
      savePendingIncidents(remaining);
    }
    window.addEventListener('online', syncPending); void syncPending();
    return () => window.removeEventListener('online', syncPending);
  }, [user]);
  useEffect(() => { const onOnline = () => setOnline(true); const onOffline = () => setOnline(false); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); }; }, []);
  function go(next: string) { history.pushState({}, '', next); setPath(next); }

  if (['/403', '/404', '/500', '/offline', '/maintenance', '/session-expired'].includes(path)) return <SystemPage path={path} go={go} />;
  if (path === '/login' || (path.startsWith('/app') && !user)) return <Login done={setUser} go={go} />;
  if (!user && path === '/request-access') return <RequestAccessPage go={go} />;
  if (!user && ['/accept-invite', '/forgot-password', '/reset-password', '/verify-2fa', '/session-expired'].includes(path)) return <AuthPage go={go} />;
  if (!user && path === '/demo') return <DemoPage />;
  if (!user && publicRoutes[path]) return <PublicPage title={publicRoutes[path][0]} copy={publicRoutes[path][1]} landing={path === '/'} go={go} />;
  if (!user && path === '/about-forecast') return <PublicPage title="How the forecast works" copy={publicRoutes['/about-forecast'][1]} go={go} />;
  if (!user) return <PublicPage title="This page does not exist." copy="Go to the RESQ home page." go={go} />;

  const current = pages.find(([href]) => path.startsWith(href));
  const officerOnly = ['/app/plan', '/app/alerts/rules', '/app/incidents/new', '/app/spread', '/app/teams', '/app/reports'];
  const adminOnly = ['/app/admin'];
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
    : current ? <ShellPage title={current[1]} copy="This workspace is ready for the next RESQ phase." />
    : <ShellPage title="Page not found" copy="This page does not exist. Go to the map." />;

  return <div className="app">
    <aside className="rail"><div className="brand"><span className="brand-mark">R</span><span>RESQ</span></div><p className="nav-label">Field console</p><nav aria-label="Primary navigation">{pages.map(([href, label, icon]) => <a className={path.startsWith(href) ? 'active' : ''} href={href} onClick={event => { event.preventDefault(); go(href); }} key={href}><span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span></a>)}</nav><div className="profile"><strong>{user.name}</strong><span>{user.role}</span><button className="signout" onClick={() => { localStorage.clear(); setUser(null); go('/'); }}>Sign out</button></div></aside>
    <main className="content"><header className="topbar"><button className="mobile-brand" onClick={() => go('/app/map')}><span className="brand-mark">R</span> RESQ</button><div className="top-context"><span className="eyebrow">Indian forest operations</span><span className="date">Forest control room · India</span></div><div className="top-actions"><button className="quiet-button" onClick={() => setPalette(true)}>Search <kbd>⌘K</kbd></button><button className="quiet-button" aria-label="Notifications" onClick={() => go('/app/notifications')}>◌</button><select aria-label="Language" value={locale} onChange={event => setLocale(event.target.value)}>{locales.map(item => <option key={item}>{item}</option>)}</select><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value)}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></div></header><div className="banner demo-banner">{online ? 'Sample data from a past date. Choose a 2023–2024 date.' : 'You are offline. Saved incident reports will wait to sync.'}</div><RouteErrorBoundary key={path}>{content}</RouteErrorBoundary><footer>Advisory forecast. Confirm with field observations.</footer></main>
    <nav className="bottom-tabs" aria-label="Mobile navigation">{pages.slice(0, 5).map(([href, label, icon]) => <a className={path.startsWith(href) ? 'active' : ''} href={href} onClick={event => { event.preventDefault(); go(href); }} key={href}><span>{icon}</span>{label}</a>)}</nav>{palette && <CommandPalette close={() => setPalette(false)} go={go} />}<DebugFps />
  </div>;
}
