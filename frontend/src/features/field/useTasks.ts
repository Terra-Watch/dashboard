import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/http';

export type Task = { assignment_id: number; incident_id: number; status: 'assigned' | 'accepted' | 'in_progress'; source: string; size: string; notes: string; latitude: number | null; longitude: number | null };

export const TASKS_KEY = ['field-tasks'] as const;
export function useTasks() {
  return useQuery({ queryKey: TASKS_KEY, queryFn: async () => (await api<{ items: Task[] }>('/api/ranger/assignments')).items, refetchInterval: 60_000 });
}
