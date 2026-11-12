import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/http';
import type { Forecast } from './model';

export type Dates = { dates: string[]; latest: string; mode: 'live' | 'replay' };

/** The dates that have a forecast, and the forecast for one of them (the newest when none is chosen). */
export type Source = 'live' | 'archive';
const base = (source: Source) => (source === 'archive' ? '/api/area-forecast/archive' : '/api/area-forecast');
/** `archive` is the replayed days of 2025, each with the fires that were actually detected that day (for demos and checking). */
export const useDates = (source: Source = 'live') => useQuery({ queryKey: ['area-forecast', source, 'dates'], retry: false, queryFn: () => api<Dates>(`${base(source)}/dates`) });
export const useForecast = (date: string | null, source: Source = 'live') => useQuery({ queryKey: ['area-forecast', source, date ?? 'latest'], retry: false, staleTime: 5 * 60_000, enabled: source === 'live' || date !== null, queryFn: () => api<Forecast>(`${base(source)}/${date ?? 'latest'}`) });
