import { API } from '../../app/config';

export async function rqFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(response.status === 503
    ? 'This action is currently unavailable. Please try again later.'
    : 'We could not retrieve that information. Please try again.');
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
