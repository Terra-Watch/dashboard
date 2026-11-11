import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/http';
import type { Forecast } from './model';

export type Dates = { dates: string[]; latest: string; mode: 'live' | 'replay' };

/** The dates that have a forecast, and the forecast for one of them (the newest when none is chosen). */
export const useDates = () => useQuery({ queryKey: ['area-forecast', 'dates'], retry: false, queryFn: () => api<Dates>('/api/area-forecast/dates') });
export const useForecast = (date: string | null) => useQuery({ queryKey: ['area-forecast', date ?? 'latest'], retry: false, staleTime: 5 * 60_000, queryFn: () => api<Forecast>(`/api/area-forecast/${date ?? 'latest'}`) });
