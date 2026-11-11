import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/http';
import type { Board, FireDetail, MarkStatus } from './model';

export const useBoard = (includeSingle: boolean) => useQuery({ queryKey: ['fires', includeSingle], retry: false, refetchInterval: 60_000, queryFn: () => api<Board>(`/api/fires?include_single=${includeSingle}`) });
export const useFire = (id: string) => useQuery({ queryKey: ['fire', id], retry: false, refetchInterval: 60_000, queryFn: () => api<FireDetail>(`/api/fires/${id}`) });

export function useCrew() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api<{ created: boolean; incident_id: number }>(`/api/fires/${id}/crew`, { method: 'POST', json: {} }), onSuccess: () => { void client.invalidateQueries({ queryKey: ['fires'] }); void client.invalidateQueries({ queryKey: ['incidents'] }); } });
}

export function useMark() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (v: { id: string; status: MarkStatus; note?: string }) => api<{ fire: string; status: string }>(`/api/fires/${v.id}/mark`, { method: 'POST', json: { status: v.status, note: v.note ?? '' } }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['fires'] }); void client.invalidateQueries({ queryKey: ['fire'] }); } });
}
