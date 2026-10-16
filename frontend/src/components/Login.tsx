import { useState } from 'react';
import { API } from '../app/config';
import type { User } from '../app/types';
import { Contours } from './Contours';
import { Brand } from './Brand';

type LoginProps = {
  done: (user: User) => void;
  go: (path: string) => void;
  workspace?: 'control-room' | 'range-officer';
  onAuthenticated?: (user: User) => void;
};

export function Login({ done, go, onAuthenticated }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function performLogin(loginEmail: string, loginPass: string) {
    setError('');
    setSubmitting(true);
    try {
      let response = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass }),
        credentials: 'include',
      });

      if (!response.ok) {
        const redesignResponse = await fetch(`${API}/api/auth/redesign/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginEmail.trim(), password: loginPass }),
          credentials: 'include',
        });
        if (redesignResponse.ok) {
          response = redesignResponse;
        }
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Email or password is incorrect.');
      }

      const data = await response.json();
      localStorage.setItem('resq_token', data.access_token);
      localStorage.setItem('resq_user', JSON.stringify(data.user));
      done(data.user);
      onAuthenticated?.(data.user);
      if (!onAuthenticated) go('/app/map');
    } catch (reason) {
      setError(
        reason instanceof TypeError
          ? 'Sign in is temporarily unavailable. Check your connection and try again.'
          : reason instanceof Error
            ? reason.message
            : 'Sign in is unavailable. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Contours />
      <section className="login-card max-w-lg" aria-labelledby="login-title">
        <Brand dark />
        <p className="eyebrow mt-3">Wildfire Monitoring &amp; Incident Intelligence</p>
        <h1 id="login-title" className="text-2xl font-serif font-bold text-ink mt-1">Sign in to TerraWatch</h1>
        <p className="muted mt-1 text-sm text-ink-muted">
          Staff and research workspace. Authentication enforces role-based access and geographic jurisdiction.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); void performLogin(email, password); }} className="mt-4 space-y-3">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              id="login-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-rq border border-contour bg-sheet px-3 py-2 text-sm text-ink focus:border-canopy focus:outline-none"
              placeholder="operator@resq.local"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              id="login-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-rq border border-contour bg-sheet px-3 py-2 text-sm text-ink focus:border-canopy focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="w-full rounded-rq border border-canopy bg-canopy py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep transition-colors disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-links mt-4 pt-3 border-t border-contour/50 flex justify-between text-xs text-ink-muted">
          <button type="button" className="text-button" onClick={() => go('/forgot-password')}>
            Forgot password
          </button>
          <button type="button" className="text-button" onClick={() => go('/request-access')}>
            Request access
          </button>
        </div>
      </section>
    </main>
  );
}
