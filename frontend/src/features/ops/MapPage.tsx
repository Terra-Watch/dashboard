import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { STATES, STATE_BOUNDS, formatWhen, stateName } from '../citizen/format';
import { Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import { SYMBOL_OF_RUNG, boundsOf, type MapPoint, type MapPolygon } from '../map/geojson';
import { TIME_WINDOWS, canShow, withinHours, type LayerId, type TimeWindow } from '../map/profiles';
import { useIncidents, useOpsRegion, type Incident } from './useOps';

type Hotspot = { id: number; satellite: string; acq_datetime: string; latitude: number; longitude: number; frp: number | null; age_minutes: number };
type Freshness = { source: string; fetched_at: string; age_seconds: number; stale: boolean | null };
type Wind = { wind_speed_ms: number; wind_dir_deg: number; valid_time: string; freshness: Freshness; temperature_c?: number; humidity_pct?: number };
type NoticeArea = { id: number; title: string; severity: string; area_geojson: { type: string; coordinates: number[][][] } | null };

const PRESETS: Array<{ id: string; label: string; layers: LayerId[] }> = [
  { id: 'situation', label: 'Situation', layers: ['incidents', 'reports', 'signals', 'advisories'] },
  { id: 'field', label: 'Field', layers: ['incidents', 'advisories'] },
];

function Chip({ label, freshness }: { label: string; freshness?: Freshness }) {
  const { t } = useTranslation();
  const age = freshness ? Math.max(0, Math.round(freshness.age_seconds / 60)) : null;
  const stale = freshness?.stale === true;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm ${stale ? 'border-warn bg-warn-tint font-semibold' : 'border-line text-ink-muted'}`}>{label}{age !== null ? ` · ${age < 60 ? `${age} min` : `${Math.round(age / 60)} h`}` : ` · ${t('map.not_connected', 'not connected')}`}{stale ? ` · ${t('map.stale', 'stale')}` : ''}</span>;
}

export function OpsMapPage() {
  const { t } = useTranslation();
  const region = useOpsRegion();
  const incidents = useIncidents();
  const [hours, setHours] = useState<TimeWindow>(24);
  const [preset, setPreset] = useState('situation');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const layers = new Set(PRESETS.find(item => item.id === preset)!.layers.filter(layer => canShow('control_room', layer)));

  const box = region ? STATE_BOUNDS[region] : [74, 15.6, 87.9, 26.9] as [number, number, number, number];
  const signals = useQuery({ queryKey: ['map-hotspots', box.join(), hours], retry: false, enabled: layers.has('signals'), queryFn: () => api<{ items: Hotspot[]; freshness: Freshness }>(`/api/hotspots?min_lon=${box[0]}&min_lat=${box[1]}&max_lon=${box[2]}&max_lat=${box[3]}&since_hours=${hours}`) });
  const wind = useQuery({ queryKey: ['map-wind', region], retry: false, queryFn: () => api<Wind>(`/api/weather/context?lat=${(box[1] + box[3]) / 2}&lon=${(box[0] + box[2]) / 2}`) });
  const notices = useQuery({ queryKey: ['map-notices'], retry: false, enabled: layers.has('advisories'), queryFn: () => api<{ items: NoticeArea[] }>('/api/notices?status=published') });

  const shown = useMemo(() => (incidents.data ?? []).filter(item => (!region || item.state === region) && item.latitude != null && item.longitude != null && (item.status === 'closed' ? false : withinHours(item.created_at, hours))), [incidents.data, region, hours]);
  const points: MapPoint[] = useMemo(() => [
    ...shown.filter(item => item.status === 'reported' ? layers.has('reports') : layers.has('incidents')).map(item => ({ id: `i${item.id}`, lat: item.latitude!, lon: item.longitude!, symbol: SYMBOL_OF_RUNG[rungOfStatus(item.status)], label: `#${item.id}` })),
    ...(layers.has('signals') ? (signals.data?.items ?? []).map(item => ({ id: `s${item.id}`, lat: item.latitude, lon: item.longitude, symbol: 'signal' as const, ageMinutes: item.age_minutes })) : []),
  ], [shown, signals.data, layers]);
  const polygons: MapPolygon[] = useMemo(() => (layers.has('advisories') ? (notices.data?.items ?? []) : []).filter(item => item.area_geojson?.coordinates?.[0]).map(item => ({ id: `n${item.id}`, ring: item.area_geojson!.coordinates[0] as Array<[number, number]>, tone: item.severity === 'warning' ? 'warning' as const : 'advisory' as const, label: item.title })), [notices.data, layers]);
  const bounds = useMemo(() => boundsOf(points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: box[1], lon: box[0] }, { lat: box[3], lon: box[2] }]), [points, box]);

  const selectedIncident: Incident | undefined = selected?.startsWith('i') ? incidents.data?.find(item => item.id === Number(selected.slice(1))) : undefined;
  const selectedSignal = selected?.startsWith('s') ? signals.data?.items.find(item => item.id === Number(selected.slice(1))) : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <PageTitle title={t('nav.map')} subtitle={region ? stateName(region) : t('ops.all_regions', 'All my regions')} actions={<div role="group" aria-label={t('map.view', 'View')} className="inline-flex rounded-rq border border-control p-1">{(['map', 'list'] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-11 rounded-rq px-4 font-semibold ${view === item ? 'bg-action text-on-action' : ''}`}>{item === 'map' ? t('map.map', 'Map') : t('map.list', 'List')}</button>)}</div>} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t('map.preset', 'What to show')} className="inline-flex rounded-rq border border-control p-1">{PRESETS.map(item => <button key={item.id} type="button" aria-pressed={preset === item.id} onClick={() => setPreset(item.id)} className={`min-h-11 rounded-rq px-4 font-semibold ${preset === item.id ? 'bg-action text-on-action' : ''}`}>{t(`map.preset.${item.id}`, item.label)}</button>)}</div>
        <div role="group" aria-label={t('map.window', 'Time window')} className="inline-flex rounded-rq border border-control p-1">{TIME_WINDOWS.map(item => <button key={item} type="button" aria-pressed={hours === item} onClick={() => setHours(item)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === item ? 'bg-action text-on-action' : ''}`}>{item} h</button>)}</div>
        <Chip label={t('map.satellite', 'Satellite')} freshness={signals.data?.freshness} />
        <Chip label={t('map.weather', 'Weather')} freshness={wind.data?.freshness} />
      </div>
      {wind.data && typeof wind.data.wind_speed_ms === 'number' && <p className="text-sm" role="status">{t('map.wind', { speed: wind.data.wind_speed_ms.toFixed(1), dir: Math.round(wind.data.wind_dir_deg), defaultValue: 'Wind {{speed}} m/s from {{dir}}°' })} · {t('map.read_at', 'read')} {formatWhen(wind.data.valid_time)}</p>}
      {signals.isError && layers.has('signals') && <Notice kind="warning">{t('map.signals_off', 'Satellite signals are not available right now.')}</Notice>}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className={view === 'list' ? 'hidden lg:block' : ''}>
          <MapView label={t('nav.map')} points={points} polygons={polygons} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[62vh] min-h-96" />
        </div>
        <div className="space-y-3">
          <Legend kinds={['signal', 'report', 'verified', 'responding', 'contained']} />
          {(selectedIncident || selectedSignal) && (
            <section aria-label={t('map.selected', 'Selected')} className="rounded-panel border border-line bg-surface p-4" data-testid="selected">
              {selectedIncident ? <>
                <h2 className="text-xl">#{selectedIncident.id} <RungBadge rung={rungOfStatus(selectedIncident.status)} age={ageText(selectedIncident.created_at)} /></h2>
                <p className="mt-2 whitespace-pre-wrap">{selectedIncident.notes || '—'}</p>
                <p className="mt-2 text-sm text-ink-muted">{stateName(selectedIncident.state)}</p>
                <Link to={`/ops/incidents/${selectedIncident.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-rq bg-action px-4 font-bold text-on-action">{t('map.open_incident', 'Open incident')}</Link>
              </> : selectedSignal && <>
                <h2 className="text-xl"><RungBadge rung="signal" age={ageText(selectedSignal.acq_datetime)} /></h2>
                <p className="mt-2 text-sm text-ink-muted">{selectedSignal.satellite} · {formatWhen(selectedSignal.acq_datetime)}</p>
                <p className="mt-1">{t('map.signal_note', 'Heat seen from space. It is not a confirmed fire until staff check it.')}</p>
              </>}
            </section>)}
        </div>
      </div>

      <section aria-labelledby="map-list-title" className={view === 'map' ? 'sr-only' : ''} data-testid="map-list">
          <h2 id="map-list-title" className="mb-2 text-xl">{t('map.same_items', 'The same items as a list')}</h2>
          {!points.length ? <p className="text-ink-muted">{t('map.none', 'Nothing in this view.')}</p> : <ul className="space-y-2">{points.map(point => <li key={point.id}><button type="button" onClick={() => { setSelected(point.id); setView('map'); }} className="flex min-h-11 w-full items-center gap-3 rounded-rq border border-line bg-surface px-3 text-left">{point.id.startsWith('i') ? `#${point.id.slice(1)} · ${t(`rung.${rungOfStatus(incidents.data?.find(item => item.id === Number(point.id.slice(1)))?.status)}`)}` : `${t('rung.signal')} · ${ageText(signals.data?.items.find(item => `s${item.id}` === point.id)?.acq_datetime)}`}</button></li>)}</ul>}
      </section>
      <p className="text-sm text-ink-muted">{t('map.states', 'Regions:')} {STATES.map(state => state.name).join(', ')}.</p>
    </div>
  );
}
