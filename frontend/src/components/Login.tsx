import { useState } from 'react';
import { API } from '../app/config';
import type { User } from '../app/types';
import { Contours } from './Contours';
import { Brand } from './Brand';

type LoginProps = { done: (user: User) => void; go: (path: string) => void };

export function Login({ done, go }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(''); setSubmitting(true);
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw Error('Email or password is incorrect.');
      const data = await response.json();
      localStorage.setItem('resq_token', data.access_token);
      localStorage.setItem('resq_user', JSON.stringify(data.user));
      done(data.user);
      go('/app/map');
    } catch (reason) {
      setError(reason instanceof TypeError ? 'Sign in is temporarily unavailable. Check your connection and try again.' : reason instanceof Error ? reason.message : 'Sign in is unavailable. Please try again.');
    } finally { setSubmitting(false);
    }
  }

  return <main className="auth-page"><Contours /><section className="login-card" aria-labelledby="login-title">
    <Brand dark />
    <p className="eyebrow">Wildfire Monitoring &amp; Incident Intelligence</p><h1 id="login-title">Sign in to TerraWatch</h1>
    <p className="muted">Staff sign-in is available only to invited accounts. Current monitoring and incident-management services are not yet enabled.</p>
    <form onSubmit={submit}>
      <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
      <label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}<button type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="auth-links"><button type="button" className="text-button" onClick={() => go('/forgot-password')}>Forgot password</button><button type="button" className="text-button" onClick={() => go('/request-access')}>Request access</button></div>
  </section></main>;
}
