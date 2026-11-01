import { API } from '../app/config';
import { addCsrfHeader } from './sessionAuth';
import { endSession, refreshSession } from '../app/session';

export class ApiError extends Error {
  constructor(readonly status: number) {
    const message = status === 401
      ? 'Your session has expired or is invalid. Sign in again.'
      : status === 403
        ? 'You do not have permission to perform this action.'
        : status === 503
          ? 'This action is currently unavailable.'
          : 'We could not complete that request. Please try again.';
    super(message);
    this.name = 'ApiError';
  }
}

async function send<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('resq_token');
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  addCsrfHeader(headers, options.method ?? 'GET');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

/** Same renewal as app/http.ts: on a 401, renew the access token once and repeat the request; otherwise end the sign-in. */
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try { return await send<T>(path, options); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !localStorage.getItem('resq_user')) throw error;
    if (await refreshSession()) return send<T>(path, options);
    endSession();
    throw error;
  }
}

export async function uploadIncidentImage<T>(incidentId: number, file: File): Promise<T> {
  const form = new FormData();
  form.append('image', file);
  return api<T>(`/api/incidents/${incidentId}/images`, { method: 'POST', body: form });
}

export async function incidentImageUrl(incidentId: number, imageId: number): Promise<string> {
  const token = localStorage.getItem('resq_token');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}/api/incidents/${incidentId}/images/${imageId}`, { headers });
  if (!response.ok) throw new ApiError(response.status);
  return URL.createObjectURL(await response.blob());
}
