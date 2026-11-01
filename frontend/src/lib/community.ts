import { useQuery } from '@tanstack/react-query';
import { api } from '../app/http';

/** Tell the server where this device is; the server decides which forest community that is. Best effort, never blocks the page. */
export function reportPosition(lat: number, lon: number): void {
  void api('/api/community/locate', { method: 'POST', json: { latitude: lat, longitude: lon } }).catch(() => undefined);
}

export type Community = { slug: string; name: string; forest_name: string; area: string; state: string; latitude: number; longitude: number; radius_km: number };

export const useCommunities = () => useQuery({ queryKey: ['communities'], queryFn: () => api<{ items: Community[] }>('/api/community/list'), staleTime: 300_000 });
export const useMyCommunity = () => useQuery({ queryKey: ['my-community'], queryFn: () => api<{ community: Community | null }>('/api/community/mine'), staleTime: 60_000 });
/** The map box around a community's circle: [west, south, east, north]. */
export const communityBox = (c: Community): [number, number, number, number] => {
  const dlat = c.radius_km / 111; const dlon = c.radius_km / (111 * Math.cos(c.latitude * Math.PI / 180));
  return [c.longitude - dlon, c.latitude - dlat, c.longitude + dlon, c.latitude + dlat];
};
