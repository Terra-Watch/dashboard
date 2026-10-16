import { API } from '../../app/config';
import { addCsrfHeader, clearExpiredToken, getAuthToken } from './sessionAuth';
import { queueRequest } from '../../lib/offlineQueue';
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

// Critical endpoints that should be queued when offline
const CRITICAL_ENDPOINTS = [
  /^\/api\/citizen\/reports$/,
  /^\/api\/citizen\/reports\/\d+\/evidence$/,
  /^\/api\/ranger\/assignments\/\d+\/verification$/,
  /^\/api\/ranger\/assignments\/\d+\/evidence$/,
];

function isCriticalEndpoint(path: string): boolean {
  return CRITICAL_ENDPOINTS.some(pattern => pattern.test(path));
}

function extractIdempotencyKey(path: string, body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    // Citizen reports use client_key
    if ('client_key' in obj && typeof obj.client_key === 'string') {
      return obj.client_key;
    }
    // Ranger verifications use idempotency_key (or should generate one)
    if ('idempotency_key' in obj && typeof obj.idempotency_key === 'string') {
      return obj.idempotency_key;
    }
  }
  return undefined;
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

  try {
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
  } catch (error) {
    // Queue critical POST requests when offline
    if (method === 'POST' && isCriticalEndpoint(path) && error instanceof TypeError) {
      const body = options.body ? JSON.parse(options.body as string) : undefined;
      const idempotencyKey = extractIdempotencyKey(path, body);
      queueRequest({
        method: 'POST',
        path,
        body,
        idempotency_key: idempotencyKey,
      });
      throw new Error('Request saved for later sync. You are currently offline.');
    }
    throw error;
  }
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

/** Sync offline queue for redesign routes. Call on app mount and online event. */
export async function syncOfflineQueue(): Promise<void> {
  const { syncQueue } = await import('../../lib/offlineQueue');
  await syncQueue(async (path: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    const method = (options.method ?? 'GET').toUpperCase();
    addCsrfHeader(headers, method);
    const token = await getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  });
}
