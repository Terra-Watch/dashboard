import { useSyncExternalStore } from 'react';
import { API } from './config';
import { getCsrfToken } from '../lib/sessionAuth';
import { productRole, type ProductRole } from '../ui/nav';

export type SessionUser = { id: number; email: string; name: string; role: string; home_state?: string | null };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function read(): SessionUser | null {
  try { const raw = localStorage.getItem('resq_user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
let cached = read();
const refresh = () => { cached = read(); notify(); };
if (typeof window !== 'undefined') window.addEventListener('storage', refresh);

/** The signed-in person (or null). The server stays the authority: this only decides what to show. */
export function useSession(): { user: SessionUser | null; role: ProductRole | null } {
  const user = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => cached);
  return { user, role: productRole(user?.role) };
}

export class SignInError extends Error { constructor(public kind: 'invalid' | 'locked' | 'network' | 'other', message: string) { super(message); } }

async function post(path: string, body: unknown) {
  let response: Response;
  try { response = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' }); }
  catch { throw new SignInError('network', 'network'); }
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function remember(data: { access_token: string; user: SessionUser }) {
  localStorage.setItem('resq_token', data.access_token);
  localStorage.setItem('resq_user', JSON.stringify(data.user));
  refresh();
  return data.user;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const { response, data } = await post('/api/auth/sign-in', { email: email.trim(), password });
  if (response.status === 429) throw new SignInError('locked', 'locked');
  if (response.status === 401) throw new SignInError('invalid', 'invalid');
  if (!response.ok) throw new SignInError('other', typeof data.detail === 'string' ? data.detail : 'other');
  return remember(data);
}

export async function registerCitizen(input: { name: string; email: string; password: string; acceptedTerms: boolean }): Promise<SessionUser> {
  const { response, data } = await post('/api/auth/citizen/register', { name: input.name.trim(), email: input.email.trim(), password: input.password, accepted_terms: input.acceptedTerms });
  if (!response.ok) throw new SignInError('other', typeof data.detail === 'string' ? data.detail : 'Could not create the account.');
  return remember(data);
}

export async function requestPasswordReset(email: string): Promise<'email' | 'unavailable'> {
  const { response, data } = await post('/api/auth/citizen/password-reset/request', { email: email.trim() });
  if (!response.ok) throw new SignInError('other', 'other');
  return data.delivery === 'email' ? 'email' : 'unavailable';
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  const { response, data } = await post(`/api/auth/password-reset/${encodeURIComponent(token)}/complete`, { password });
  if (response.status === 400) throw new SignInError('invalid', 'invalid');
  if (!response.ok) throw new SignInError('other', typeof data.detail === 'string' ? data.detail : 'other');
}

/** Ends the session on the server (best effort) and always clears it on this device. Saved offline work is kept. */
export async function signOut(): Promise<void> {
  try { await fetch(`${API}/api/auth/logout`, { method: 'POST', headers: { 'x-resq-csrf': getCsrfToken() ?? '' }, credentials: 'include' }); }
  catch { /* the device is signed out even if the network is not there */ }
  finally { localStorage.removeItem('resq_token'); localStorage.removeItem('resq_user'); refresh(); }
}
