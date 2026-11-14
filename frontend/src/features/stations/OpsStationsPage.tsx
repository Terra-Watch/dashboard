import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint } from '../map/geojson';
import { useStations, useUnknownNodes } from './api';
import { byAttention, counts, fixWords, maintenance, symbolOf, type Station } from './model';
import { Headline, Readings, StatusChip } from './parts';

/** Control room: every lookout station, the ones needing a look first. A row leads with what the station is saying, not its raw numbers; selecting one opens a quick look beside the map without losing the list. Readings are from sensors, not people. */
export function OpsStationsPage() {
  const { t } = useTranslation();
  const q = useStations();
  const [tab, setTab] = useState<'stations' | 'network'>('stations'); const [state, setState] = useState(''); const [status, setStatus] = useState(''); const [selected, setSelected] = useState<string | null>(null);
  const all = q.data?.items ?? [];
  const states = useMemo(() => [...new Set(all.map(s => s.state))].sort(), [all]);
  const items = useMemo(() => byAttention(all).filter(s => (!state || s.state === state) && (!status || (status === 'offline' ? s.status === 'offline' || s.status === 'never' : s.status === status))), [all, state, status]);
  const c = counts(all);
  const unknown = useUnknownNodes(tab === 'network');
  const fixes = useMemo(() => byAttention(all).map(x => ({ s: x, fix: maintenance(x as Station & { reported?: { offset_km: number } | null }) })).filter(x => x.fix.length), [all]);
  const points: MapPoint[] = useMemo(() => items.map(s => ({ id: String(s.id), lat: s.latitude, lon: s.longitude, symbol: symbolOf(s), label: s.name })), [items]);
  const bounds = useMemo(() => boundsOf(points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [points]);
  const sel = all.find(s => String(s.id) === selected) ?? null;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageTitle title={t('stations.title', 'Lookout stations')} subtitle={q.data?.label ?? t('stations.subtitle', 'Readings come from sensors, not people. A high reading is a prompt to check, not a fire.')} />
      <div role="group" aria-label={t('stations.views', 'Views')} className="inline-flex rounded-rq border border-control p-1">
        {(['stations', 'network'] as const).map(v => <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)} className={`min-h-11 rounded-rq px-4 font-semibold ${tab === v ? 'bg-ink text-surface' : ''}`}>{v === 'stations' ? t('stations.tab_stations', 'Stations') : t('stations.tab_network', 'Network')}</button>)}
      </div>
      {tab === 'network' && (
        <section aria-label={t('stations.tab_network', 'Network')} className="space-y-3">
          <p className="text-sm text-ink-muted">{t('stations.network_note', 'What a technician should look at: stations that are silent, low on battery, on a weak radio link, or not where they are registered.')}</p>
          {fixes.length === 0 ? <Notice kind="info">{t('stations.network_ok', 'Nothing needs a visit right now.')}</Notice> : (
            <ul className="space-y-2">{fixes.map(({ s, fix }) => <li key={s.id} className="rounded-rq border border-line bg-surface p-3"><Link to={`/ops/stations/${s.id}`} className="font-bold underline">{s.name}</Link> <span className="text-sm text-ink-muted">{s.state} · {t('stations.node', { n: s.node_id, defaultValue: 'node {{n}}' })}</span>
              <p className="text-sm">{fix.map(f => fixWords(f, (k, d, o) => t(k, { defaultValue: d, ...o }))).join(' · ')}{s.battery_mv !== null ? ` · ${s.battery_mv} mV` : ''}{s.rssi !== null ? ` · ${s.rssi} dBm` : ''}</p></li>)}</ul>)}
          {(unknown.data?.items.length ?? 0) > 0 && (
            <div><h2 className="font-bold">{t('stations.unknown', 'Heard but not registered')}</h2>
              <ul className="mt-1 space-y-1 text-sm">{unknown.data!.items.map(u => <li key={u.node_id}>{t('stations.node', { n: u.node_id, defaultValue: 'node {{n}}' })} · {t('stations.unknown_heard', { n: u.heard, defaultValue: 'heard {{n}} times' })}{u.reported_lat !== null ? ` · ${u.reported_lat?.toFixed(3)}, ${u.reported_lon?.toFixed(3)}` : ''}</li>)}</ul></div>)}
        </section>)}
      {tab === 'stations' && <>
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
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <ul className="space-y-2" aria-label={t('stations.list', 'Stations')}>
            {items.map(s => <li key={s.id}><StationRow s={s} active={selected === String(s.id)} onPick={() => setSelected(String(s.id))} /></li>)}
            {items.length === 0 && <li><Notice kind="info">{t('stations.no_match', 'No station matches these filters.')}</Notice></li>}
          </ul>
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <MapView label={t('stations.map', 'Lookout stations')} points={points} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[40vh] min-h-72 lg:h-[45vh]" />
            {sel ? <StationQuickLook s={sel} onClose={() => setSelected(null)} /> : <p className="text-sm text-ink-muted">{t('stations.pick_hint', 'Select a station in the list or on the map for a quick look.')}</p>}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

function StationRow({ s, active, onPick }: { s: Station; active: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onPick} aria-pressed={active} className={`block w-full rounded-rq border p-3 text-left hover:bg-surface-2 ${active ? 'border-action ring-2 ring-action' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{s.name}</span><StatusChip s={s} /></div>
      <Headline s={s} />
      <p className="mt-1 text-sm text-ink-muted">{s.state} · {t('stations.node', { n: s.node_id, defaultValue: 'node {{n}}' })}</p>
    </button>
  );
}

/** A quick look beside the map, without leaving the list: the statement, the readings, and a way to see the trend or raise a check. */
function StationQuickLook({ s, onClose }: { s: Station; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('map.selected', 'Selected')} className="rounded-panel border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div><h2 className="text-lg font-bold">{s.name}</h2><StatusChip s={s} /></div>
        <button type="button" onClick={onClose} aria-label={t('map.close', 'Close')} className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none">×</button>
      </div>
      <Headline s={s} />
      <div className="mt-3"><Readings s={s} /></div>
      <Link to={`/ops/stations/${s.id}`} className="mt-3 inline-block font-semibold underline">{t('stations.open_full', 'Open full history and create a check')}</Link>
    </section>
  );
}
