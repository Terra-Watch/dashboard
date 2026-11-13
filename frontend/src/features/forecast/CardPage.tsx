import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf, type MapPoint } from '../map/geojson';
import { MapView } from '../map/MapView';
import { useStations } from '../stations/api';
import { byAttention, statementWords } from '../stations/model';
import { useDates, useForecast, type Source } from './api';
import { areaPolygons, burningWords, cardDates, chanceWords, dayWord, levelRank, shareText, type Action, type Area } from './model';
import { ActionList, LevelChip, LookList, Reasons, WeakNote, useTt } from './parts';

/** Ranger: tomorrow in my area. One card per area of the ranger's community, highest level first, with what to do, the places to check and a message to forward. */
export function CardPage() {
  const tt = useTt();
  // Live when a forecast has been issued; otherwise the archive (replayed days of 2025 with the fires actually detected), so a ranger always has a forecast to read and a demo has one to show.
  const liveDates = useDates('live'); const archDates = useDates('archive');
  const [choice, setChoice] = useState<Source | null>(null);
  const source: Source = choice ?? (liveDates.data?.dates.length ? 'live' : 'archive');
  const dates = source === 'live' ? liveDates : archDates;
  const [picked, setPicked] = useState<string | null>(null); const [sceneId, setSceneId] = useState<string | null>(null);
  const scenes = source === 'archive' ? archDates.data?.scenes ?? [] : [];
  const scene = scenes.find(x => x.id === sceneId) ?? scenes[0] ?? null;
  const offered = useMemo(() => (!dates.data ? [] : source === 'archive' ? [scene?.date ?? dates.data.latest] : cardDates(dates.data.dates, dates.data.latest)), [dates.data, source, scene]);
  const date = picked && offered.includes(picked) ? picked : offered[0] ?? null;
  const q = useForecast(date, source);
  const [showNone, setShowNone] = useState(false); const [showAll, setShowAll] = useState(false);
  const f = q.data;
  const areas = useMemo(() => [...(f?.areas ?? [])].filter(a => source !== 'archive' || !scene || a.state === scene.state).sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.chance - a.chance), [f, source, scene]);
  const active = areas.filter(a => a.level !== 'none'); const quiet = areas.filter(a => a.level === 'none');
  const switcher = (
    <div role="group" aria-label={tt('forecast.source', 'Forecast source')} className="inline-flex rounded-rq border border-control p-1">
      {(['live', 'archive'] as const).map(k => <button key={k} type="button" aria-pressed={source === k} onClick={() => { setChoice(k); setPicked(null); setSceneId(null); }} className={`min-h-11 rounded-rq px-4 font-semibold ${source === k ? 'bg-ink text-surface' : ''}`}>{k === 'live' ? tt('forecast.src_live', 'Live') : tt('forecast.src_archive', 'Archive (demo)')}</button>)}
    </div>);
  if (liveDates.isLoading || archDates.isLoading || q.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton lines={5} /></div>;
  if (dates.isError || q.isError || !f) return <div className="mx-auto max-w-2xl space-y-3"><PageTitle title={tt('forecast.card_title', 'Fire forecast for my area')} />{switcher}<EmptyState title={tt('forecast.none', 'No fire forecast is available yet')}>{tt('forecast.none_hint_field', 'It will appear here when the forecast is issued. Check again in the morning.')}</EmptyState></div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={tt('forecast.card_title_day', '{{day}} in my area', { day: dayWord(f.date, tt) })} subtitle={tt('forecast.card_sub', 'Forecast for {{date}}, issued {{when}}.', { date: f.date, when: formatWhen(f.issued_at) })} />
      {switcher}
      {source === 'archive' && scenes.length > 0 && (
        <div role="group" aria-label={tt('forecast.scene_pick', 'Demo day')} className="flex flex-wrap gap-2">
          {scenes.map(x => <button key={x.id} type="button" aria-pressed={x.id === (scene?.id ?? '')} onClick={() => { setSceneId(x.id); setPicked(null); setShowNone(false); }} className={`min-h-11 rounded-rq border border-control px-3 text-sm font-semibold ${x.id === (scene?.id ?? '') ? 'bg-ink text-surface' : ''}`}>{x.label}</button>)}
        </div>)}
      {source === 'live' && offered.length > 1 && (
        <div role="group" aria-label={tt('forecast.pick_day', 'Day')} className="inline-flex rounded-rq border border-control p-1">
          {offered.map(d => <button key={d} type="button" aria-pressed={d === f.date} onClick={() => { setPicked(d); setShowNone(false); }} className={`min-h-11 rounded-rq px-4 font-semibold ${d === f.date ? 'bg-ink text-surface' : ''}`}>{dayWord(d, tt)}</button>)}
        </div>)}
      {f.mode === 'replay' && <Notice kind="warning">{tt('forecast.replay', 'This is an archived day from 2025, shown as it would have been issued. It is not tomorrow\'s forecast.')}</Notice>}
      {areas.length === 0 && <EmptyState title={tt('forecast.no_areas', 'No forecast areas are set for you yet')}>{tt('forecast.no_areas_hint', 'Ask the control room to give you a community.')}</EmptyState>}
      {areas.length > 0 && active.length === 0 && <Notice kind="info">{tt('forecast.quiet_day', 'No area is rated Moderate or above for this day. Nothing extra to do from the forecast.')}</Notice>}
      <ul className="space-y-3">{(showAll ? active : active.slice(0, 5)).map(a => <li key={a.id}><Card1 area={a} date={f.date} actions={f.actions} archived={source === 'archive'} /></li>)}</ul>
      {active.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(v => !v)} className="min-h-11 w-full rounded-rq border border-control px-4 font-semibold">{showAll ? tt('forecast.show_top', 'Show the top 5 only') : tt('forecast.show_all', 'Show all {{n}} areas', { n: active.length })}</button>}
      {quiet.length > 0 && (
        <details className="rounded-rq border border-line bg-surface p-3" open={showNone} onToggle={e => setShowNone((e.target as HTMLDetailsElement).open)}>
          <summary className="min-h-11 cursor-pointer font-semibold">{tt('forecast.n_none', '{{n}} areas with no rating', { n: quiet.length })}</summary>
          <ul className="mt-2 space-y-1 text-sm">{quiet.map(a => <li key={a.id}>{a.name} · {a.state} · {chanceWords(a.chance, tt)}{burningWords(a, tt) ? ` · ${burningWords(a, tt)}` : ''}</li>)}</ul>
        </details>)}
      <StationPanel />
      <p className="text-sm text-ink-muted">{tt('forecast.card_note', 'The level is the chance that a satellite detects a fire in the area on this day. It does not say where exactly or how big. A person on the ground decides.')} <Link to="/field/fires" className="font-semibold underline">{tt('forecast.fires_near', 'Fires near me')}</Link> · <Link to="/field/satellite" className="font-semibold underline">{tt('forecast.detections_near', 'Detections near me')}</Link></p>
    </div>
  );
}

function Card1({ area, date, actions, archived }: { area: Area; date: string; actions: Action[]; archived?: boolean }) {
  const tt = useTt(); const [map, setMap] = useState(false); const [shared, setShared] = useState('');
  const text = useMemo(() => shareText(area, date, tt, actions), [area, date, actions]);        // eslint-disable-line react-hooks/exhaustive-deps
  async function share() {
    try {
      if (navigator.share) { await navigator.share({ text }); setShared(tt('forecast.shared', 'Shared')); }
      else { await navigator.clipboard.writeText(text); setShared(tt('forecast.copied', 'Copied: paste it into WhatsApp or a message')); }
    } catch { setShared(tt('forecast.share_failed', 'Could not share. Select and copy the places by hand.')); }
  }
  const points: MapPoint[] = (area.look ?? []).map((l, i) => ({ id: `l-${area.id}-${i}`, lat: l.lat, lon: l.lon, symbol: 'task', label: l.place?.name ?? String(i + 1) }));
  const bounds = boundsOf([{ lat: area.bbox[1], lon: area.bbox[0] }, { lat: area.bbox[3], lon: area.bbox[2] }]);
  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-label={area.name}>
      <header><p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{area.state}</p><h2 className="text-xl font-bold">{area.name}</h2></header>
      <div className="flex flex-wrap items-center gap-3"><LevelChip level={area.level} big /><span className="font-semibold">{tt('forecast.card_chance', '{{chance}} chance of a fire in the area', { chance: chanceWords(area.chance, tt) })}</span></div>
      {archived && area.fire_detected !== undefined && <p role="status" className="rounded-rq bg-surface-2 px-3 py-2 text-sm font-semibold">{area.fire_detected ? tt('forecast.fire_seen', 'A fire was detected in this area that day.') : tt('forecast.fire_not_seen', 'No fire was detected in this area that day.')}</p>}
      <LookList area={area} limit={5} />
      <div><h3 className="text-sm font-bold">{tt('forecast.do_today', 'Do today')}</h3><ActionList area={area} actions={actions} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/field/capture" className="inline-flex min-h-11 items-center rounded-rq bg-action px-4 font-semibold text-on-action">{tt('forecast.record_find', 'Report what I find')}</Link>
        <button type="button" onClick={() => void share()} className="min-h-11 rounded-rq border border-control px-4 font-semibold">{tt('forecast.share', 'Share on WhatsApp or SMS')}</button>
        <button type="button" aria-expanded={map} onClick={() => setMap(m => !m)} className="min-h-11 rounded-rq border border-control px-4 font-semibold">{map ? tt('forecast.hide_map', 'Hide map') : tt('forecast.show_map', 'Show map')}</button>
        {shared && <span role="status" className="text-sm text-ink-muted">{shared}</span>}
      </div>
      {map && <MapView label={tt('forecast.map_of', 'Map of {{name}}', { name: area.name })} polygons={areaPolygons([area])} points={points} bounds={bounds} className="h-72" />}
      <details className="rounded-rq border border-line p-2">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">{tt('forecast.why', 'Why this level')}</summary>
        <div className="mt-2 space-y-2"><Reasons area={area} /><WeakNote area={area} /></div>
      </details>
    </article>
  );
}

/** Ranger: the lookout stations in the ranger's area that need a look today (smoke up, a chainsaw, silent). Nothing is shown when all is normal. */
function StationPanel() {
  const tt = useTt(); const q = useStations();
  const need = byAttention(q.data?.items ?? []).filter(s => s.statement && s.statement.tone !== 'ok').slice(0, 4);
  if (!need.length) return null;
  return (
    <section aria-label={tt('forecast.stations_panel', 'Lookout stations')} className="rounded-rq border border-line bg-surface p-3">
      <h2 className="font-bold">{tt('forecast.stations_panel', 'Lookout stations')}</h2>
      <ul className="mt-1 space-y-1 text-sm">{need.map(s => <li key={s.id}><Link to={`/field/stations/${s.id}`} className="font-semibold underline">{s.name}</Link>: {statementWords(s, tt)}</li>)}</ul>
      <Link to="/field/stations" className="mt-1 inline-block text-sm font-semibold underline">{tt('forecast.all_stations', 'All stations')}</Link>
    </section>
  );
}
