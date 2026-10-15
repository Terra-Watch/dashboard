import { API } from '../app/config';

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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('resq_token');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}
