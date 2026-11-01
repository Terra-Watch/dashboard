import { api } from '../app/http';

/** Tell the server where this device is; the server decides which forest community that is. Best effort, never blocks the page. */
export function reportPosition(lat: number, lon: number): void {
  void api('/api/community/locate', { method: 'POST', json: { latitude: lat, longitude: lon } }).catch(() => undefined);
}
