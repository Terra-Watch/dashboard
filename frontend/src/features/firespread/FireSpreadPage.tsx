import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, ApiError } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf } from '../map/geojson';
import { MapView } from '../map/MapView';
import { BAND_ORDER, bandPolygons, pixelPoints, type Run } from './model';

const HORIZONS = [24, 48] as const;
const SWATCH: Record<number, string> = { 3: 'bg-danger/70', 2: 'bg-danger/40', 1: 'bg-warn/40' };

/** Where the next cells of an active fire are most likely to burn. A ranking of the cells near the fire, not a probability and not driven by wind. */
export function FireSpreadPage() {
  const { t } = useTranslation();
  const [event, setEvent] = useState<string | null>(null);
  const [hours, setHours] = useState<(typeof HORIZONS)[number]>(48);
  const run = useQuery({ queryKey: ['fire-spread', 'latest'], retry: false, queryFn: () => api<Run>('/api/fire-spread/runs/latest') });
  const fires = useMemo(() => [...(run.data?.fires ?? [])].sort((a, b) => b.n_detections - a.n_detections), [run.data]);
  const fire = fires.find(f => f.event === event) ?? fires[0];
  const base = run.data && fire ? `/api/fire-spread/${run.data.run}/${fire.event}` : null;
  const bands = useQuery({ queryKey: ['fire-spread', base, hours], enabled: !!base, retry: false, queryFn: () => api<Parameters<typeof bandPolygons>[0]>(`${base}/${hours}`) });
  const pixels = useQuery({ queryKey: ['fire-spread', base, 'pixels'], enabled: !!base, retry: false, queryFn: () => api<Parameters<typeof pixelPoints>[0]>(`${base}/pixels`) });
  const polygons = useMemo(() => (bands.data && fire ? bandPolygons(bands.data, `${fire.event}-${hours}`) : []), [bands.data, fire, hours]);
  const points = useMemo(() => (pixels.data && fire ? pixelPoints(pixels.data, fire.event) : []), [pixels.data, fire]);
  const bounds = useMemo(() => boundsOf(polygons.length ? polygons.flatMap(p => p.ring.map(([lon, lat]) => ({ lat, lon }))) : fire ? [{ lat: fire.lat - 0.1, lon: fire.lon - 0.1 }, { lat: fire.lat + 0.1, lon: fire.lon + 0.1 }] : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [polygons, fire]);
  const skill = run.data?.skill?.horizons[String(hours)];
  const bandName: Record<number, string> = { 3: t('firespread.band3', 'Highest'), 2: t('firespread.band2', 'High'), 1: t('firespread.band1', 'Moderate') };

  if (run.isLoading) return <div className="mx-auto max-w-6xl"><Skeleton lines={5} /></div>;
  if (run.error instanceof ApiError && run.error.status === 404) return <div className="mx-auto max-w-3xl"><EmptyState title={t('firespread.none', 'No fire spread run is available yet')} /></div>;
  if (run.error || !run.data) return <div className="mx-auto max-w-3xl"><LoadError message={(run.error as Error | null)?.message ?? ''} onRetry={() => void run.refetch()} retryLabel={t('citizen.retry', 'Try again')} /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageTitle title={t('firespread.title', 'Fire spread')} subtitle={t('firespread.subtitle', 'Where the next cells of an active fire are most likely to burn. A ranking, not a probability, and not driven by wind.')} />
      {run.data.mode === 'replay' && <Notice kind="warning">{t('firespread.replay', 'Archived replay, not live.')} {formatWhen(run.data.at)}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={t('firespread.horizon', 'Look ahead')} className="inline-flex rounded-rq border border-control p-1">
          {HORIZONS.map(h => <button key={h} type="button" role="radio" aria-checked={hours === h} onClick={() => setHours(h)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-ink text-surface' : ''}`}>{t(`firespread.h${h}`, `${h} hours`)}</button>)}
        </div>
        <ul aria-label={t('firespread.legend', 'Likelihood bands')} className="flex flex-wrap gap-3 text-sm">
          {BAND_ORDER.map(b => <li key={b} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block h-3 w-5 rounded-sm border border-line ${SWATCH[b]}`} />{bandName[b]}</li>)}
        </ul>
        <Link to="/ops/satellite" className="ml-auto text-sm font-semibold underline">{t('firespread.satellite', 'Satellite detections')}</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title={t('firespread.fires', 'Active fires')} className="max-h-[60vh] overflow-auto">
          {fires.length === 0 ? <p className="text-sm text-ink-muted">{t('firespread.no_fires', 'No active fires in this run.')}</p> : (
            <ul className="space-y-2">{fires.map(f => (
              <li key={f.event}><button type="button" aria-pressed={f.event === fire?.event} onClick={() => setEvent(f.event)} className={`min-h-11 w-full rounded-rq border px-3 py-2 text-left ${f.event === fire?.event ? 'border-ink bg-ink/5' : 'border-control'}`}>
                <span className="block font-semibold">{f.lat.toFixed(2)}°N, {f.lon.toFixed(2)}°E</span>
                <span className="block text-sm text-ink-muted">{t('firespread.detections', { count: f.n_detections, defaultValue: '{{count}} satellite detections' })} · {formatWhen(f.last_detection)}</span>
              </button></li>))}</ul>)}
        </Card>
        <div className="space-y-4">
          <MapView label={t('firespread.map', 'Likely next areas around the selected fire')} polygons={polygons} points={points} bounds={bounds} className="h-[55vh] min-h-80" />
          {(bands.isLoading || pixels.isLoading) && <Skeleton lines={1} />}
          {bands.error && <LoadError message={(bands.error as Error).message} onRetry={() => void bands.refetch()} retryLabel={t('citizen.retry', 'Try again')} />}
        </div>
      </div>
      <Card title={t('firespread.skill.title', 'How well has this worked?')}>
        {skill ? <p>{t('firespread.skill.body', { model: skill.model_iou.toFixed(2), base: skill.baseline_iou.toFixed(2), cases: skill.cases, defaultValue: 'On {{cases}} fires the model had never seen, its top cells overlapped the burned ground by {{model}}, against {{base}} for simply taking the cells nearest the fire (1 is perfect). The burned patches are small: a miss of 1 km already scores about 0.12.' })}</p>
          : <p className="text-sm text-ink-muted">{t('firespread.skill.none', 'The measured skill is not available for this run.')}</p>}
        <p className="mt-2 text-sm text-ink-muted">{run.data.note}</p>
      </Card>
    </div>
  );
}
