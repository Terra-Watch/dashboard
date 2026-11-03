import { ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { LocateButton, usePosition } from '../field/Position';
import { Chart } from './Chart';
import { useStation, useStations } from './api';
import { ageLabel, fmt, isHigh, type Station } from './model';
import { Readings, StatusChip } from './parts';

/** Stations near the ranger, nearest first. Read-only. The position is taken only when the ranger taps. */
export function FieldStationsPage() {
  const { t } = useTranslation();
  const { position } = usePosition();
  const q = useStations(position);
  const items = q.data?.items ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('stations.title', 'Lookout stations')} subtitle={q.data?.label ?? t('stations.subtitle', 'Readings come from sensors, not people. A high reading is a prompt to check, not a fire.')} actions={<LocateButton />} />
      {!position && <Notice kind="info">{t('stations.locate_hint', 'Tap "Use my position" to put the nearest stations first.')}</Notice>}
      {q.isError && <LoadError message={t('stations.load_failed', 'The stations could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.isLoading && <Skeleton lines={4} />}
      {q.data && items.length === 0 && <EmptyState title={t('stations.none', 'No stations are registered in your area yet.')} />}
      <ul className="space-y-2">{items.map(s => <li key={s.id}><Row s={s} /></li>)}</ul>
    </div>
  );
}

function Row({ s }: { s: Station }) {
  const { t } = useTranslation();
  return (
    <Link to={`/field/stations/${s.id}`} className="block rounded-rq border border-line bg-surface p-3 active:bg-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{s.name}</span><StatusChip s={s} /></div>
      {s.distance_km !== undefined && <p className="text-sm font-semibold">{s.distance_km} km {s.bearing}</p>}
      <p className="text-sm tabular-nums">PM2.5 <b>{fmt(s.pm25)}</b> · {fmt(s.temp_c, 1, ' °C')} · {fmt(s.humidity_pct, 0, ' %')}{isHigh(s) && <span className="ml-2 font-semibold">▲ {t('stations.high', { x: s.pm25_vs_normal?.toFixed(1), defaultValue: '{{x}}× normal' })}</span>}</p>
      {s.age_s !== null && <p className="text-sm text-ink-muted">{t('stations.heard_ago', { age: ageLabel(s.age_s), defaultValue: 'heard {{age}} ago' })}</p>}
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
      <Readings s={s} />
      <Card title={t('stations.last6', 'Last 6 hours')}><Chart label={t('stations.chart_pm', 'Smoke particles')} unit="µg/m³" times={series.map(p => p.t)} lines={[{ name: 'PM2.5', values: series.map(p => p.pm25), className: 'text-action' }, { name: 'PM10', values: series.map(p => p.pm10), className: 'text-ink-muted' }]} /></Card>
      <a className="inline-flex min-h-11 items-center gap-2 font-semibold underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}`}>{t('stations.directions', 'Directions to this station')} <ExternalLink aria-hidden="true" size={16} /></a>
    </div>
  );
}

type Near = { id: number; satellite: string; frp: number | null; age_minutes: number; distance_km: number; bearing: string; confidence: string };

/** Satellite detections near the ranger. Heat seen from space; nobody has checked it. */
export function FieldSatellitePage() {
  const { t } = useTranslation();
  const { position } = usePosition(); const [hours, setHours] = useState(24);
  const q = useQuery({ queryKey: ['field-satellite', position?.lat.toFixed(2), position?.lon.toFixed(2), hours], enabled: !!position, retry: false, refetchInterval: 300_000,
    queryFn: () => api<{ label: string; items: Near[] }>(`/api/hotspots/near?lat=${position!.lat}&lon=${position!.lon}&radius_km=40&since_hours=${hours}`) });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('field.satellite', 'Satellite detections near you')} subtitle={q.data?.label ?? t('ops.satellite.subtitle', 'Heat seen from space. No person has checked it.')} actions={<LocateButton />} />
      {!position && <Notice kind="info">{t('field.satellite_locate', 'Tap "Use my position" to see detections within 40 km of you.')}</Notice>}
      <div role="group" aria-label={t('map.window', 'Time window')} className="inline-flex rounded-rq border border-control p-1">{[6, 24, 72].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-action text-on-action' : ''}`}>{h} h</button>)}</div>
      {q.isError && <LoadError message={t('field.satellite_failed', 'The detections could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.isLoading && <Skeleton lines={3} />}
      {q.data && q.data.items.length === 0 && <EmptyState title={t('field.satellite_none', 'No detections near you in this window.')} />}
      <ul className="space-y-2">{(q.data?.items ?? []).map(i => (
        <li key={i.id} className="rounded-rq border border-line bg-surface p-3"><p className="font-bold">{i.distance_km} km {i.bearing}</p>
          <p className="text-sm text-ink-muted">{t('field.satellite_row', { age: ageLabel(i.age_minutes * 60), mw: fmt(i.frp, 0), defaultValue: '{{age}} ago · fire power {{mw}} MW' })}</p></li>))}</ul>
    </div>
  );
}
