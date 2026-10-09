import type { Navigate } from '../app/types';

const states: Record<string, [string, string]> = {
  '/403': ['You do not have access to this page.', 'Ask an admin to change your role.'],
  '/404': ['This page does not exist.', 'Go to the map to continue.'],
  '/500': ['This page could not load.', 'Share the reference code with your administrator.'],
  '/offline': ['You are offline.', 'Saved incident reports will wait to sync when the connection returns.'],
  '/maintenance': ['RESQ is under maintenance.', 'Try again after the planned maintenance window.'],
  '/session-expired': ['Your session ended.', 'Sign in to continue.'],
};

export function SystemPage({ path, go }: { path: string; go: Navigate }) {
  const [title, copy] = states[path] ?? states['/404'];
  return <main className="auth-page"><section className="login-card" aria-labelledby="system-title"><div className="brand brand-dark"><span className="brand-mark">R</span><span>RESQ</span></div><p className="eyebrow">System status</p><h1 id="system-title">{title}</h1><p className="muted">{copy}</p><button onClick={() => go(path === '/session-expired' ? '/login' : '/')}>{path === '/session-expired' ? 'Return to sign in' : 'Go to RESQ home'}</button><footer>Advisory forecast. Confirm with field observations.</footer></section></main>;
}
