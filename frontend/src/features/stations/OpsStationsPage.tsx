import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint } from '../map/geojson';
import { useStations } from './api';
import { byAttention, counts, fmt, isHigh, statementWords, symbolOf, type Station } from './model';
import { SoundChip, StatusChip } from './parts';

/** All lookout stations in the person's area: a list with status first, and a map. Readings are from sensors, not people. */
export function OpsStationsPage() {
  const { t } = useTranslation();
  const q = useStations();
  const [state, setState] = useState(''); const [status, setStatus] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const all = q.data?.items ?? [];
  const states = useMemo(() => [...new Set(all.map(s => s.state))].sort(), [all]);
  const items = useMemo(() => byAttention(all).filter(s => (!state || s.state === state) && (!status || (status === 'offline' ? s.status === 'offline' || s.status === 'never' : s.status === status))), [all, state, status]);
  const c = counts(all);
  const points: MapPoint[] = useMemo(() => items.map(s => ({ id: String(s.id), lat: s.latitude, lon: s.longitude, symbol: symbolOf(s), label: s.name })), [items]);
  const bounds = useMemo(() => boundsOf(points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [points]);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageTitle title={t('stations.title', 'Lookout stations')} subtitle={q.data?.label ?? t('stations.subtitle', 'Readings come from sensors, not people. A high reading is a prompt to check, not a fire.')} />
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <span className="rounded-full border border-ok px-2.5 py-0.5 text-sm font-semibold">● {t('stations.n_online', { n: c.online, defaultValue: '{{n}} online' })}</span>
        <span className="rounded-full border border-warn px-2.5 py-0.5 text-sm font-semibold">◐ {t('stations.n_late', { n: c.late, defaultValue: '{{n}} late' })}</span>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-sm font-semibold">○ {t('stations.n_offline', { n: c.offline, defaultValue: '{{n}} offline' })}</span>
        {c.high > 0 && <span className="rounded-full border border-warn bg-warn-tint px-2.5 py-0.5 text-sm font-semibold">▲ {t('stations.n_high', { n: c.high, defaultValue: '{{n}} reading high' })}</span>}
        <label className="ml-auto text-sm">{t('stations.state', 'State')} <select value={state} onChange={e => setState(e.target.value)} className="min-h-11 rounded-rq border border-control bg-surface px-2"><option value="">{t('stations.all', 'All')}</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="text-sm">{t('stations.status', 'Status')} <select value={status} onChange={e => setStatus(e.target.value)} className="min-h-11 rounded-rq border border-control bg-surface px-2">
          <option value="">{t('stations.all', 'All')}</option><option value="online">{t('stations.online', 'Online')}</option><option value="late">{t('stations.late', 'Late')}</option><option value="offline">{t('stations.offline', 'Offline')}</option></select></label>
      </div>
      {q.isError && <LoadError message={t('stations.load_failed', 'The stations could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.isLoading && <Skeleton lines={4} />}
      {q.data && all.length === 0 && <EmptyState title={t('stations.none', 'No stations are registered in your area yet.')}>{t('stations.none_hint', 'An administrator registers a station under Admin, using the node number printed by its gateway.')}</EmptyState>}
      {all.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="space-y-2" aria-label={t('stations.list', 'Stations')}>
            {items.map(s => <li key={s.id}><StationRow s={s} active={selected === String(s.id)} /></li>)}
            {items.length === 0 && <li><Notice kind="info">{t('stations.no_match', 'No station matches these filters.')}</Notice></li>}
          </ul>
          <MapView label={t('stations.map', 'Lookout stations')} points={points} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[60vh] min-h-80" />
        </div>
      )}
    </div>
  );
}

function StationRow({ s, active }: { s: Station; active: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to={`/ops/stations/${s.id}`} className={`block rounded-rq border p-3 hover:bg-surface-2 ${active ? 'border-action ring-2 ring-action' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{s.name}</span><StatusChip s={s} /></div>
      {s.statement && <p className={`mt-1 text-sm ${s.statement.tone === 'check' ? 'font-semibold' : ''}`}>{s.statement.tone === 'check' ? '▲ ' : s.statement.tone === 'gap' ? '○ ' : ''}{statementWords(s, (k, d, o) => t(k, { defaultValue: d, ...o }))}</p>}
      {s.last_sound && <p className="mt-1"><SoundChip s={s} /></p>}
      <p className="mt-1 text-sm tabular-nums">PM2.5 <b>{fmt(s.pm25)}</b> · PM10 {fmt(s.pm10)} · {fmt(s.temp_c, 1, ' °C')} · {fmt(s.humidity_pct, 0, ' %')}
        {isHigh(s) && <span className="ml-2 rounded border border-warn bg-warn-tint px-1.5 font-semibold">▲ {t('stations.high', { x: s.pm25_vs_normal?.toFixed(1), defaultValue: '{{x}}× normal' })}</span>}</p>
      <p className="text-sm text-ink-muted">{s.state} · {t('stations.node', { n: s.node_id, defaultValue: 'node {{n}}' })}{s.rssi !== null ? ` · ${s.rssi} dBm` : ''}</p>
    </Link>
  );
}
