import { useState } from 'react';
import { API } from '../app/config';
import type { User } from '../app/types';
import { Contours } from './Contours';

type LoginProps = { done: (user: User) => void; go: (path: string) => void };

export function Login({ done, go }: LoginProps) {
  const [email, setEmail] = useState('admin@resq.local');
  const [password, setPassword] = useState('resq-demo');
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
      setError(reason instanceof Error ? reason.message : 'Sign in is unavailable.');
    } finally { setSubmitting(false);
    }
  }

  return <main className="auth-page"><Contours /><section className="login-card" aria-labelledby="login-title">
    <div className="brand brand-dark"><span className="brand-mark">R</span><span>RESQ</span></div>
    <p className="eyebrow">Forest operations</p><h1 id="login-title">See where to move early.</h1>
    <p className="muted">Daily ignition-risk planning for six Indian states.</p>
    <form onSubmit={submit}>
      <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
      <label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
      {error && <p className="error" role="alert">{error}</p>}<button type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="auth-links"><button type="button" className="text-button" onClick={() => go('/forgot-password')}>Forgot password</button><button type="button" className="text-button" onClick={() => go('/request-access')}>Request access</button></div>
    <p className="hint">Demo accounts use password `resq-demo`.</p>
  </section></main>;
}
