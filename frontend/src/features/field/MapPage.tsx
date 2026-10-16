import { useQuery } from '@tanstack/react-query';
import { Navigation } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint } from '../map/geojson';
import { bearingDeg, compassPoint, distanceKm, distanceText } from './geo';
import { OfflineMapControl } from './OfflineMap';
import { LocateButton, usePosition } from './Position';
import { useTasks } from './useTasks';

type Signal = { id: number; latitude: number; longitude: number; acq_datetime: string; age_minutes: number; distance_km: number };
type Wind = { wind_speed_ms: number; wind_dir_deg: number; valid_time: string; freshness: { age_seconds: number; stale: boolean | null } };

/** The map is secondary to the task (D4 section 2). It shows the task, the officer, signals near the task labelled as not confirmed, and the wind now. It never shows a scenario or a spread outline. */
export function FieldMapPage() {
  const { t } = useTranslation();
  const tasks = useTasks();
  const { position } = usePosition();
  const active = useMemo(() => (tasks.data ?? []).filter(task => task.latitude !== null && task.longitude !== null), [tasks.data]);
  const [chosen, setChosen] = useState<number | null>(null);
  const task = active.find(item => item.assignment_id === chosen) ?? active[0] ?? null;

  const signals = useQuery({
    queryKey: ['field-signals', task?.assignment_id], enabled: !!task, retry: false,
    queryFn: () => api<{ items: Signal[]; radius_km: number }>(`/api/hotspots/near-task/${task!.assignment_id}?radius_km=10`),
  });
  const wind = useQuery({
    queryKey: ['field-wind', task?.latitude, task?.longitude], enabled: !!task, retry: false,
    queryFn: () => api<Wind>(`/api/weather/context?lat=${task!.latitude}&lon=${task!.longitude}`),
  });

  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = [];
    if (task) out.push({ id: `task-${task.assignment_id}`, lat: task.latitude!, lon: task.longitude!, symbol: 'task', label: t('field.task_pin', 'Task') });
    for (const s of signals.data?.items ?? []) out.push({ id: `signal-${s.id}`, lat: s.latitude, lon: s.longitude, symbol: 'signal', ageMinutes: s.age_minutes });
    if (position) out.push({ id: 'me', lat: position.lat, lon: position.lon, symbol: 'me', label: t('field.me_pin', 'You') });
    return out;
  }, [task, signals.data, position, t]);
  const bounds = useMemo(() => boundsOf(points.filter(p => p.symbol !== 'signal')), [points]);

  const from = position ? { lat: position.lat, lon: position.lon } : null;
  const to = task ? { lat: task.latitude!, lon: task.longitude! } : null;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <PageTitle title={t('nav.map')} />
      {tasks.isLoading && <p role="status">{t('common.loading', 'Loading…')}</p>}
      {!tasks.isLoading && !task && <Notice kind="info">{t('field.map.no_task', 'You have no active task with a place. The map opens when a task is assigned.')} <Link className="underline" to="/field/tasks">{t('nav.tasks')}</Link></Notice>}
      {active.length > 1 && (
        <label className="block text-sm font-semibold">{t('field.map.which', 'Task')}
          <select className="mt-1 block min-h-11 w-full rounded-rq border border-line bg-surface px-3" value={task?.assignment_id ?? ''} onChange={event => setChosen(Number(event.target.value))}>
            {active.map(item => <option key={item.assignment_id} value={item.assignment_id}>{`#${item.incident_id} · ${item.status}`}</option>)}
          </select>
        </label>
      )}
      {task && from && to && (
        <p className="text-lg font-bold" aria-live="polite">
          {distanceText(distanceKm(from, to))} {compassPoint(bearingDeg(from, to))}
          <span className="block text-sm font-normal text-ink-muted">{t('field.straight_line', 'Straight line, not travel time.')}</span>
        </p>
      )}
      <MapView label={t('field.map.label', 'Map of your task')} points={points} bounds={bounds} className="h-[55vh] min-h-72" />
      <Legend kinds={['task', 'me', 'signal']} />
      <div className="flex flex-wrap items-center gap-2">
        <LocateButton />
        {to && <a className="inline-flex min-h-11 items-center gap-2 rounded-rq border border-line px-3 font-semibold" href={`geo:${to.lat},${to.lon}?q=${to.lat},${to.lon}`}><Navigation aria-hidden="true" size={18} />{t('field.open_nav', 'Open in navigation app')}</a>}
      </div>
      <div className="text-sm">
        {wind.data && <p><strong>{t('field.wind_now', 'Wind now')}</strong>: {compassPoint(wind.data.wind_dir_deg)} · {wind.data.wind_speed_ms.toFixed(1)} m/s · {Math.max(0, Math.round(wind.data.freshness.age_seconds / 60))} min{wind.data.freshness.stale ? ` · ${t('map.stale', 'stale')}` : ''}</p>}
        {wind.isError && <p className="text-ink-muted">{t('field.wind_none', 'Wind reading is not available now.')}</p>}
        {signals.data && <p>{signals.data.items.length ? t('field.signals_near', '{{n}} satellite signals within {{r}} km. They are not confirmed.', { n: signals.data.items.length, r: signals.data.radius_km }) : t('field.signals_none', 'No satellite signals within {{r}} km. This does not mean there is no fire.', { r: signals.data.radius_km })}</p>}
      </div>
      <OfflineMapControl />
    </div>
  );
}
