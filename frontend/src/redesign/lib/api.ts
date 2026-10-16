import { API } from '../../app/config';
import { addCsrfHeader, clearExpiredToken, getAuthToken } from './sessionAuth';
export { getAuthToken } from './sessionAuth';

export function getStoredUser(): { id: number; email: string; name: string; role: string; home_state?: string | null } | null {
  try {
    const raw = localStorage.getItem('resq_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<{ access_token: string; user: { id: number; email: string; name: string; role: string; home_state?: string | null } }> {
  const response = await fetch(`${API}/api/auth/redesign/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
    credentials: 'include',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || (response.status === 401 ? 'Invalid email or password.' : 'Sign in failed.'));
  }
  const data = await response.json();
  localStorage.setItem('resq_token', data.access_token);
  localStorage.setItem('resq_user', JSON.stringify(data.user));
  return data;
}

export async function logoutUser(): Promise<void> {
  try {
    const csrf = document.cookie
      .split('; ')
      .find((row) => row.startsWith('resq_csrf='))
      ?.split('=')[1] ?? '';
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-resq-csrf': csrf },
      credentials: 'include',
    });
  } catch {
    // Ignore network failure on logout
  } finally {
    localStorage.removeItem('resq_token');
    localStorage.removeItem('resq_user');
  }
}

export async function rqFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const method = (options.method ?? 'GET').toUpperCase();
  addCsrfHeader(headers, method);
  const token = await getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: options.credentials ?? 'include' });
  if (!response.ok) {
    clearExpiredToken(response.status);
    throw new Error(response.status === 401
      ? 'Sign in is required to access this information.'
      : response.status === 403
        ? 'Your account is not authorized to access this information.'
        : response.status === 503
          ? 'This action is currently unavailable. Please try again later.'
          : 'We could not retrieve that information. Please try again.');
  }
  return response.json() as Promise<T>;
}

export function deviceId(): string {
  const key = 'rq_device_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
  }
  return id;
}
