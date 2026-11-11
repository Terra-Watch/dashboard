import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/http';
import type { Nearby, StationResponse, StationsResponse } from './model';

const POLL = 15_000;
type Pos = { lat: number; lon: number } | null | undefined;
const q = (p: Pos) => (p ? `?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}` : '');

export const useStations = (pos?: Pos) => useQuery({ queryKey: ['stations', pos ? `${pos.lat.toFixed(2)},${pos.lon.toFixed(2)}` : 'all'], retry: false, refetchInterval: POLL,
  queryFn: () => api<StationsResponse>(`/api/stations${q(pos)}`) });

export const useStation = (id: number, hours: number, pos?: Pos) => useQuery({ queryKey: ['station', id, hours], retry: false, refetchInterval: POLL,
  queryFn: () => api<StationResponse>(`/api/stations/${id}?hours=${hours}${pos ? `&lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}` : ''}`) });

export const useNearby = (id: number, enabled = true) => useQuery({ queryKey: ['station-nearby', id], retry: false, enabled, refetchInterval: 60_000,
  queryFn: () => api<Nearby>(`/api/stations/${id}/nearby`) });

export function useCreateCheck(id: number) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (note: string) => api<{ created: boolean; incident_id: number }>(`/api/stations/${id}/check`, { method: 'POST', json: { note } }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['station-nearby', id] }); void client.invalidateQueries({ queryKey: ['incidents'] }); } });
}

export type UnknownNode = { node_id: number; first_heard: string; last_heard: string; heard: number; reported_lat: number | null; reported_lon: number | null };
export const useUnknownNodes = (enabled = true) => useQuery({ queryKey: ['stations-unknown'], retry: false, enabled, refetchInterval: 60_000, queryFn: () => api<{ items: UnknownNode[] }>('/api/stations/unknown') });
