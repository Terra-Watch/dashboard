import { useQuery } from '@tanstack/react-query';
import { api } from '../../app/http';
import type { DayCell, Forecast, Typical } from './model';

export type Dates = { dates: string[]; latest: string; mode: 'live' | 'replay'; typical?: Typical };

/** The dates that have a forecast, and the forecast for one of them (the newest when none is chosen). */
export type Source = 'live' | 'archive';
const base = (source: Source) => (source === 'archive' ? '/api/area-forecast/archive' : '/api/area-forecast');
/** `archive` is the replayed days of 2025, each with the fires that were actually detected that day (for demos and checking). */
export const useDates = (source: Source = 'live') => useQuery({ queryKey: ['area-forecast', source, 'dates'], retry: false, queryFn: () => api<Dates>(`${base(source)}/dates`) });
export const useForecast = (date: string | null, source: Source = 'live') => useQuery({ queryKey: ['area-forecast', source, date ?? 'latest'], retry: false, staleTime: 5 * 60_000, enabled: source === 'live' || date !== null, queryFn: () => api<Forecast>(`${base(source)}/${date ?? 'latest'}`) });

/** The forest cells of one archived day, from the risk replay (the same model run as the area forecast). Off when the risk layer is switched off on the server. */
export const useDayCells = (day: string | null, enabled: boolean) => useQuery({
  queryKey: ['area-forecast', 'cells', day], retry: false, enabled: enabled && day !== null, staleTime: 10 * 60_000,
  queryFn: async (): Promise<DayCell[]> => {
    const g = await api<{ features: Array<{ geometry: { coordinates: [number, number] }; properties: { forest_frac?: number } }> }>(`/api/risk/geojson?target=${day}`);
    return g.features.map(f => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], forest: f.properties.forest_frac ?? null }));
  },
});
