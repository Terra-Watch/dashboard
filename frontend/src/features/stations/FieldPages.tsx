import { ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { LocateButton, usePosition } from '../field/Position';
import { Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint } from '../map/geojson';
import { Chart } from './Chart';
import { useStation, useStations } from './api';
import { ageLabel, byAttention, fmt, symbolOf, type Station } from './model';
import { DEFAULT_ON, byGroup, groupCounts, groupName, groupOf, reasonWords, visible, type Group } from '../ops/satelliteGroups';
import { Headline, Readings, Sounds, StatusChip } from './parts';

/** Stations within reach of the ranger: a map for where they are, then a list with the nearest and the ones needing a look first. Read-only. Position is taken only when the ranger taps. */
export function FieldStationsPage() {
  const { t } = useTranslation();
  const { position } = usePosition();
  const q = useStations(position);
  const [selected, setSelected] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  const sorted = useMemo(() => (position ? items : byAttention(items)), [items, position]);
  const points: MapPoint[] = useMemo(() => [
    ...items.map(s => ({ id: String(s.id), lat: s.latitude, lon: s.longitude, symbol: symbolOf(s), label: s.name })),
    ...(position ? [{ id: 'me', lat: position.lat, lon: position.lon, symbol: 'me' as const, label: t('field.me_pin', 'You') }] : []),
  ], [items, position, t]);
  const bounds = useMemo(() => boundsOf(points), [points]);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('stations.title', 'Lookout stations')} subtitle={q.data?.label ?? t('stations.subtitle', 'Readings come from sensors, not people. A high reading is a prompt to check, not a fire.')} actions={<LocateButton />} />
      {!position && <Notice kind="info">{t('stations.locate_hint', 'Tap "Use my position" to put the nearest stations first and see them on the map.')}</Notice>}
      {q.isError && <LoadError message={t('stations.load_failed', 'The stations could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.isLoading && <Skeleton lines={4} />}
      {q.data && items.length === 0 && <EmptyState title={t('stations.none', 'No stations are registered in your area yet.')} />}
      {items.length > 0 && <>
        <MapView label={t('stations.map', 'Lookout stations')} points={points} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[32vh] min-h-56" />
        <Legend kinds={['station_ok', 'station_high', 'station_off', ...(position ? ['me' as const] : [])]} />
        <ul className="space-y-2">{sorted.map(s => <li key={s.id}><Row s={s} active={selected === String(s.id)} /></li>)}</ul>
      </>}
    </div>
  );
}

function Row({ s, active }: { s: Station; active: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to={`/field/stations/${s.id}`} className={`block rounded-rq border p-3 active:bg-surface-2 ${active ? 'border-action ring-2 ring-action' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{s.name}</span>
        {s.distance_km !== undefined ? <span className="text-sm font-bold">{s.distance_km} km {s.bearing}</span> : <StatusChip s={s} />}
      </div>
      {s.distance_km !== undefined && <div className="mt-0.5"><StatusChip s={s} /></div>}
      <Headline s={s} />
      {s.age_s !== null && s.status === 'online' && <p className="mt-1 text-sm text-ink-muted">{t('stations.heard_ago', { age: ageLabel(s.age_s), defaultValue: 'heard {{age}} ago' })}</p>}
    </Link>
  );
}

export function FieldStationPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id); const { position } = usePosition();
  const q = useStation(id, 6, position);
  const s = q.data?.station;
  if (q.isError) return <div className="mx-auto max-w-2xl space-y-4"><Link to="/field/stations" className="font-semibold underline">{t('stations.back', 'All stations')}</Link><LoadError message={t('stations.not_found', 'This station was not found, or it is outside your area.')} onRetry={() => void q.refetch()} /></div>;
  if (!s) return <div className="mx-auto max-w-2xl"><Skeleton lines={4} /></div>;
  const series = q.data!.series;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/field/stations" className="inline-flex min-h-11 items-center font-semibold underline">{t('stations.back', 'All stations')}</Link>
      <PageTitle title={s.name} subtitle={q.data!.label} actions={<StatusChip s={s} />} />
      {s.distance_km !== undefined && <p className="font-semibold">{s.distance_km} km {s.bearing} {t('stations.from_you', 'from you')}</p>}
      {s.status !== 'online' && <Notice kind="warning">{s.status === 'never' ? t('stations.never_msg', 'Nothing has been heard from it yet.') : t('stations.silent_msg', { age: ageLabel(s.age_s), defaultValue: 'Last heard {{age}} ago. Treat it as not reporting, not as quiet.' })}</Notice>}
      <Sounds items={q.data!.sounds} />
      <Readings s={s} />
      <Card title={t('stations.last6', 'Last 6 hours')}><Chart label={t('stations.chart_pm', 'Smoke particles')} unit="µg/m³" times={series.map(p => p.t)} lines={[{ name: 'PM2.5', values: series.map(p => p.pm25), className: 'text-action' }, { name: 'PM10', values: series.map(p => p.pm10), className: 'text-ink-muted' }]} /></Card>
      <a className="inline-flex min-h-11 items-center gap-2 font-semibold underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}>{t('stations.directions', 'Directions to this station')} <ExternalLink aria-hidden="true" size={16} /></a>
    </div>
  );
}

type Near = { id: number; satellite: string; frp: number | null; age_minutes: number; distance_km: number; bearing: string; confidence: string; quality_group?: Group | null; quality_reasons?: string[] | null };

/** Satellite detections near the ranger. Heat seen from space; nobody has checked it. */
export function FieldSatellitePage() {
  const { t } = useTranslation();
  const { position } = usePosition(); const [hours, setHours] = useState(24); const [all, setAll] = useState(false);
  const tt = (k: string, d: string) => t(k, d) as string;
  const q = useQuery({ queryKey: ['field-satellite', position?.lat.toFixed(2), position?.lon.toFixed(2), hours], enabled: !!position, retry: false, refetchInterval: 300_000,
    queryFn: () => api<{ label: string; items: Near[] }>(`/api/hotspots/near?lat=${position!.lat}&lon=${position!.lon}&radius_km=40&since_hours=${hours}`) });
  const items = q.data?.items ?? []; const counts = groupCounts(items); const shown = byGroup(all ? items : visible(items, DEFAULT_ON));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('field.satellite', 'Satellite detections near you')} subtitle={q.data?.label ?? t('ops.satellite.subtitle', 'Heat seen from space. No person has checked it.')} actions={<LocateButton />} />
      {!position && <Notice kind="info">{t('field.satellite_locate', 'Tap "Use my position" to see detections within 40 km of you.')}</Notice>}
      <div role="group" aria-label={t('map.window', 'Time window')} className="inline-flex rounded-rq border border-control p-1">{[6, 24, 72].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-action text-on-action' : ''}`}>{h} h</button>)}</div>
      {q.isError && <LoadError message={t('field.satellite_failed', 'The detections could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.isLoading && <Skeleton lines={3} />}
      {q.data && q.data.items.length === 0 && <EmptyState title={t('field.satellite_none', 'No detections near you in this window.')} />}
      {counts.known_source + counts.outside_forest > 0 && <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="h-4 w-4" />{t('sat.show_sources', { n: counts.known_source + counts.outside_forest, defaultValue: 'Also show {{n}} known heat sources and detections outside forest' })}</label>}
      <ul className="space-y-2">{shown.map(i => (
        <li key={i.id} className="rounded-rq border border-line bg-surface p-3"><p className="font-bold">{i.distance_km} km {i.bearing}{i.quality_group ? <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs font-semibold">{groupName(groupOf(i), tt)}</span> : null}</p>
          <p className="text-sm text-ink-muted">{t('field.satellite_row', { age: ageLabel(i.age_minutes * 60), mw: fmt(i.frp, 0), defaultValue: '{{age}} ago · fire power {{mw}} MW' })}</p>
          {i.quality_group && reasonWords(i.quality_reasons, tt).length > 0 && <p className="text-xs text-ink-muted">{reasonWords(i.quality_reasons, tt).join(' · ')}</p>}</li>))}</ul>
    </div>
  );
}
