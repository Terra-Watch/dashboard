import { API } from './config';
import { addCsrfHeader, clearExpiredToken, getAuthToken } from '../lib/sessionAuth';
import { queueRequest } from '../lib/offlineQueue';
import { endSession, refreshSession } from './session';

/** A failed request with the server's own words, so screens can say what actually went wrong. */
export class ApiError extends Error {
  constructor(public status: number, public detail: string) { super(detail); }
}
/** The request could not leave the device (offline). `queued` is true when it was saved to send later. */
export class OfflineError extends Error {
  constructor(public queued: boolean) { super(queued ? 'queued' : 'offline'); }
}

type Options = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal; queueIfOffline?: { idempotencyKey?: string } };

function detailOf(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return status === 401 ? 'Sign in to continue.' : status === 403 ? 'Your account is not allowed to do that.' : status === 404 ? 'That was not found.' : status === 429 ? 'Too many requests. Wait a moment and try again.' : 'Something went wrong. Try again.';
}

/** JSON in, JSON out. Adds the bearer token and CSRF header. Optionally saves a POST for later when the device is offline. */
async function send<T>(path: string, { method = 'GET', json, form, signal, queueIfOffline }: Options = {}): Promise<T> {
  const headers = new Headers();
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  addCsrfHeader(headers, method);
  const token = await getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { method, headers, credentials: 'include', signal, body: form ?? (json !== undefined ? JSON.stringify(json) : undefined) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (method === 'POST' && queueIfOffline && json !== undefined) { queueRequest({ method: 'POST', path, body: json, idempotency_key: queueIfOffline.idempotencyKey }); throw new OfflineError(true); }
    throw new OfflineError(false);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) { clearExpiredToken(response.status); throw new ApiError(response.status, detailOf(body, response.status)); }
  return body as T;
}


/** JSON in, JSON out. A 401 on a signed-in device first tries to renew the 15-minute access token from the refresh cookie and repeats the request once; if that fails the sign-in is ended so the person is asked to sign in again. */
export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  try { return await send<T>(path, options); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || path.startsWith('/api/auth/') || !localStorage.getItem('resq_user')) throw error;
    if (await refreshSession()) return send<T>(path, options);
    endSession();
    throw error;
  }
}
