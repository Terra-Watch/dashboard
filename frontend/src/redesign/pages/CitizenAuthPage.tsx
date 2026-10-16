import { useMemo, useState, type FormEvent } from 'react';
import { Brand } from '../../components/Brand';
import { safeCitizenReturnTo } from '../lib/citizenAuth';
import { API } from '../../app/config';

type Navigate = (path: string) => void;
export type CitizenAuthMode = 'login' | 'register';

export function CitizenAuthPage({ mode, go }: { mode: CitizenAuthMode; go: Navigate }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const returnTo = useMemo(() => safeCitizenReturnTo(new URLSearchParams(window.location.search).get('returnTo')), []);
  const register = mode === 'register';
  const switchPath = register ? '/citizen/login' : '/citizen/register';
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (register && password !== confirmation) { setMessage('Passwords do not match. Nothing was submitted.'); return; }
    if (register && !consent) { setMessage('Consent is required before requesting a Citizen account. Nothing was submitted.'); return; }
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch(`${API}/api/auth/citizen/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(register ? { email, name, password } : { email, password }), credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Citizen authentication failed.');
      localStorage.setItem('resq_token', data.access_token);
      localStorage.setItem('resq_user', JSON.stringify(data.user));
      window.location.assign(returnTo);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Citizen authentication is unavailable. Nothing was submitted.');
    } finally { setSubmitting(false); }
  }

  return <main data-rq-app data-citizen-auth className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-8 sm:py-14"><div className="mx-auto max-w-lg"><a href="/" onClick={event => { event.preventDefault(); go('/'); }} aria-label="TerraWatch home"><Brand dark /></a><section className="mt-8 rounded-rq border border-contour bg-sheet p-5 shadow-sm sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-canopy">Citizen application</p><h1 className="mt-2 font-serif text-3xl">{register ? 'Create a Citizen account' : 'Sign in to Citizen'}</h1><p className="mt-3 text-sm leading-6 text-ink-muted">Your Citizen account protects your reports, evidence, and status history. Staff and Ranger credentials cannot be used here.</p><form onSubmit={event => void submit(event)} className="mt-6 space-y-4"><fieldset><legend className="sr-only">{register ? 'Create Citizen account' : 'Sign in'}</legend>{register && <div><label htmlFor="citizen-name" className="block text-sm font-semibold">Display name</label><input id="citizen-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" required className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-base" /></div>}<div className={register ? 'mt-4' : ''}><label htmlFor="citizen-email" className="block text-sm font-semibold">Email</label><input id="citizen-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-base" /></div><div className="mt-4"><label htmlFor="citizen-password" className="block text-sm font-semibold">Password</label><input id="citizen-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? 'new-password' : 'current-password'} required className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-base" /></div>{register && <><div className="mt-4"><label htmlFor="citizen-password-confirm" className="block text-sm font-semibold">Confirm password</label><input id="citizen-password-confirm" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" required className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-base" /></div><label className="mt-4 flex items-start gap-3 text-sm text-ink-muted"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4" />I agree to the Citizen application terms and privacy notice.</label></>}</fieldset>{message && <p role="alert" className="rounded-rq border border-warn/50 bg-paper p-3 text-sm leading-6 text-ink-muted">{message}</p>}<button type="submit" disabled={submitting} className="min-h-11 w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep disabled:opacity-50">{submitting ? 'Working…' : register ? 'Create Citizen account' : 'Sign in'}</button></form><div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-contour pt-4 text-sm"><button type="button" onClick={() => go(`${switchPath}?returnTo=${encodeURIComponent(returnTo)}`)} className="font-semibold text-canopy underline">{register ? 'Already have an account? Sign in' : 'Need an account? Register'}</button>{!register && <button type="button" onClick={() => setMessage('Password recovery is unavailable because Citizen authentication is not connected. No request was sent.')} className="font-semibold text-ink-muted underline">Forgot password</button>}</div><button type="button" onClick={() => go('/staff/login')} className="mt-5 text-sm font-semibold text-ink-muted underline">Staff sign in is separate</button></section></div></main>;
}
