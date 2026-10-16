import { API } from '../app/config';
import { addCsrfHeader, getAuthToken } from './sessionAuth';

/** Send what was saved while the device was offline. Called when the app opens and when the connection returns. */
export async function syncOfflineQueue(): Promise<void> {
  const { syncQueue } = await import('./offlineQueue');
  await syncQueue(async (path: string, options: RequestInit) => {
    const headers = new Headers(options.headers);
    const method = (options.method ?? 'GET').toUpperCase();
    addCsrfHeader(headers, method);
    const token = await getAuthToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  });
}
