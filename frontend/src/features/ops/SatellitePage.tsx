import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { ageText } from '../../ui/ladder';
import { formatWhen } from '../citizen/format';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint } from '../map/geojson';
import { clusterDetections } from './hotspotClusters';
import { DEFAULT_ON, GROUP_ORDER, byGroup, groupCounts, groupHelp, groupName, groupOf, reasonWords, symbolOfGroup, visible, type Group, type GroupId } from './satelliteGroups';

type Hotspot = { id: number; satellite: string; acq_datetime: string; latitude: number; longitude: number; frp: number | null; confidence: string; forest_state: string | null; age_minutes: number; quality_group?: Group | null; quality_p?: number | null; quality_reasons?: string[] | null };
type Freshness = { source: string; fetched_at: string; age_seconds: number; stale: boolean | null };
const WINDOWS = [6, 24, 72, 168] as const;
const SAT: Record<string, string> = { VIIRS_SNPP_NRT: 'Suomi NPP', VIIRS_NOAA20_NRT: 'NOAA-20', VIIRS_SNPP_SP: 'Suomi NPP', VIIRS_NOAA20_SP: 'NOAA-20' };

/** Its own space for what the satellites saw: clusters first, then every detection, with a map beside them. Heat seen from space; nobody has checked it. */
export function SatellitePage() {
  const { t } = useTranslation();
  const [hours, setHours] = useState<number>(24);
  const [state, setState] = useState('');
  const [forestOnly, setForestOnly] = useState(true);   // crop-stubble and other fires outside forest land fill the feed in autumn; the product is about forests
  const [selected, setSelected] = useState<string | null>(null);
  const [on, setOn] = useState<ReadonlySet<GroupId>>(DEFAULT_ON);
  const tt = (k: string, d: string) => t(k, d) as string;
  const q = useQuery({ queryKey: ['satellite-page', hours], retry: false, refetchInterval: 5 * 60 * 1000,
    queryFn: () => api<{ items: Hotspot[]; truncated: boolean; freshness: Freshness; label: string }>(`/api/hotspots?since_hours=${hours}`) });
  const all = q.data?.items ?? [];
  const states = useMemo(() => [...new Set(all.map(i => i.forest_state).filter((s): s is string => !!s))].sort(), [all]);
  const scoped = useMemo(() => all.filter(i => (!forestOnly || i.forest_state) && (!state || i.forest_state === state)), [all, state, forestOnly]);
  const counts = useMemo(() => groupCounts(scoped), [scoped]);
  const items = useMemo(() => byGroup(visible(scoped, on)), [scoped, on]);
  const clusters = useMemo(() => clusterDetections(visible(scoped, new Set<GroupId>(['likely', 'unconfirmed', 'ungrouped']))), [scoped]);        // known sources never make a cluster
  const points: MapPoint[] = useMemo(() => items.map(i => ({ id: `s${i.id}`, lat: i.latitude, lon: i.longitude, symbol: symbolOfGroup(groupOf(i)), ageMinutes: i.age_minutes })), [items]);
  const chosen = useMemo(() => items.find(i => `s${i.id}` === selected) ?? null, [items, selected]);
  const sorted = counts.ungrouped < scoped.length;
  const bounds = useMemo(() => boundsOf(points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [points]);
  const stale = q.data?.freshness?.stale === true;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageTitle title={t('ops.satellite.title', 'Satellite detections')} subtitle={q.data?.label ?? t('ops.satellite.subtitle', 'Heat seen from space. No person has checked it.')} />
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label={t('map.window', 'Time window')} className="inline-flex rounded-rq border border-control p-1">
          {WINDOWS.map(h => <button key={h} type="button" role="radio" aria-checked={hours === h} onClick={() => setHours(h)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-action text-on-action' : ''}`}>{h} h</button>)}
        </div>
        <label className="text-sm">{t('ops.satellite.state', 'State')}
          <select value={state} onChange={e => setState(e.target.value)} className="ml-2 min-h-11 rounded-rq border border-control px-3">
            <option value="">{t('ops.satellite.all_states', 'All')}</option>{states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={forestOnly} onChange={e => setForestOnly(e.target.checked)} className="h-4 w-4" />{t('ops.satellite.forest_only', 'Forest cells only')}</label>
        {q.data && <span className="text-sm text-ink-muted" role="status">{t('ops.satellite.updated', { when: formatWhen(q.data.freshness.fetched_at), defaultValue: 'Updated {{when}}' })} · {items.length} {t('ops.satellite.count', 'detections')}{forestOnly && all.length > items.length ? ` (${all.length - items.length} ${t('ops.satellite.hidden', 'outside forest cells hidden')})` : ''}</span>}
        <Link to="/ops/outlook" className="ml-auto text-sm font-semibold underline">{t('outlook.link', 'Spread outlook: likely next areas')}</Link>
        <Link to="/ops/map" className="text-sm font-semibold underline">{t('ops.satellite.on_map', 'See it on the main map')}</Link>
      </div>
      {sorted && (
        <section aria-label={tt('sat.groups', 'Detection groups')} className="space-y-1">
          <ul className="flex flex-wrap gap-2">{GROUP_ORDER.filter(g => g !== 'ungrouped' || counts.ungrouped > 0).map(g => (
            <li key={g}><label className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${on.has(g) ? 'border-ink bg-surface' : 'border-line text-ink-muted'}`} title={groupHelp(g, tt)}>
              <input type="checkbox" checked={on.has(g)} onChange={() => setOn(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; })} className="h-4 w-4" />
              {groupName(g, tt)} <span className="tabular-nums">{counts[g]}</span></label></li>))}</ul>
          <p className="text-xs text-ink-muted">{tt('sat.groups_note', 'Every detection is kept. The quality check only sorts them: it never deletes one. Known heat sources and detections outside forest are off by default and counted here.')}</p>
        </section>)}
      {stale && <Notice kind="warning">{t('ops.satellite.stale', 'The satellite feed has not updated recently, so this list may be behind.')}</Notice>}
      {q.data?.truncated && <Notice kind="warning">{t('ops.satellite.truncated', 'Too many detections to list: showing the newest 5,000. Choose a shorter window.')}</Notice>}
      {q.isError && <LoadError message={t('ops.satellite.error', 'The detections could not be loaded.')} onRetry={() => void q.refetch()} retryLabel={t('citizen.retry', 'Try again')} />}
      {q.isLoading && <Skeleton />}
      {q.data && (
        <>
          <section aria-labelledby="clusters-title" className="space-y-2">
            <h2 id="clusters-title" className="font-bold">{t('ops.satellite.clusters', 'Clusters')} <span className="font-normal text-ink-muted">{t('ops.satellite.clusters_hint', '5 or more detections within about 11 km')}</span></h2>
            {clusters.length === 0 ? <p className="text-ink-muted">{t('ops.satellite.no_clusters', 'No clusters in this window.')}</p> : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {clusters.slice(0, 9).map(c => (
                  <li key={c.key}><Card><p className="font-semibold">{c.count} {t('ops.satellite.detections', 'detections')}{c.state ? ` · ${c.state}` : ''}</p>
                    <p className="text-sm text-ink-muted">{c.lat.toFixed(2)}, {c.lon.toFixed(2)} · {t('ops.satellite.latest', 'latest')} {ageText(c.latest)}</p></Card></li>
                ))}
              </ul>
            )}
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="list-title">
              <h2 id="list-title" className="mb-2 font-bold">{t('ops.satellite.all', 'All detections')}</h2>
              {items.length === 0 ? <EmptyState title={t('ops.satellite.none', 'No detections in this window.')} /> : (
                <div className="max-h-[60vh] overflow-auto rounded-rq border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left"><tr><th className="p-2">{t('ops.satellite.col_seen', 'Seen')}</th><th className="p-2">{t('ops.satellite.col_place', 'Place')}</th><th className="p-2">{t('ops.satellite.col_state', 'State')}</th><th className="p-2">{t('ops.satellite.col_strength', 'Strength (MW)')}</th><th className="p-2">{t('ops.satellite.col_sat', 'Satellite')}</th>{sorted && <th className="p-2">{tt('sat.col_group', 'Group')}</th>}</tr></thead>
                    <tbody>{items.slice(0, 500).map(i => (
                      <tr key={i.id} className={selected === `s${i.id}` ? 'bg-action/10' : ''}>
                        <td className="p-2"><button type="button" className="min-h-11 text-left underline" onClick={() => setSelected(`s${i.id}`)}>{ageText(i.acq_datetime)}</button></td>
                        <td className="p-2">{i.latitude.toFixed(2)}, {i.longitude.toFixed(2)}</td><td className="p-2">{i.forest_state ?? '—'}</td>
                        <td className="p-2">{i.frp != null ? i.frp.toFixed(1) : '—'}</td><td className="p-2">{SAT[i.satellite] ?? i.satellite}</td>{sorted && <td className="p-2">{groupName(groupOf(i), tt)}</td>}
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
              {chosen && sorted && (
                <div className="mt-2 rounded-rq border border-line bg-surface p-3 text-sm" role="status">
                  <p className="font-bold">{groupName(groupOf(chosen), tt)} · {ageText(chosen.acq_datetime)}</p><p className="text-ink-muted">{groupHelp(groupOf(chosen), tt)}</p>
                  {reasonWords(chosen.quality_reasons, tt).length > 0 && <ul className="mt-1 list-disc pl-5">{reasonWords(chosen.quality_reasons, tt).map(r => <li key={r}>{r}</li>)}</ul>}
                  {chosen.quality_p != null && <p className="mt-1 text-xs text-ink-muted">{tt('sat.p_note', 'Chance that a burn scar follows within 1 km, from the quality check')}: {Math.round(chosen.quality_p * 100)}%</p>}
                </div>)}
              {items.length > 500 && <p className="mt-1 text-sm text-ink-muted">{t('ops.satellite.first_500', 'Showing the newest 500 in the list; all are on the map.')}</p>}
            </section>
            <MapView label={t('ops.satellite.title', 'Satellite detections')} points={points} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[60vh] min-h-80" />
          </div>
        </>
      )}
    </div>
  );
}
