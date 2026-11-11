import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf, type MapPoint } from '../map/geojson';
import { MapView } from '../map/MapView';
import { useForecast } from './api';
import { areaPolygons, chanceWords, levelRank, recordWords, shareText, type Action, type Area } from './model';
import { ActionList, LevelChip, LookList, Reasons, WeakNote, useTt } from './parts';

/** Ranger: tomorrow in my area. One card per area of the ranger's community, highest level first, with what to do, the places to check and a message to forward. */
export function CardPage() {
  const tt = useTt();
  const q = useForecast(null);
  const [showNone, setShowNone] = useState(false);
  const f = q.data;
  const areas = useMemo(() => [...(f?.areas ?? [])].sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.chance - a.chance), [f]);
  const active = areas.filter(a => a.level !== 'none'); const quiet = areas.filter(a => a.level === 'none');
  if (q.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton lines={5} /></div>;
  if (q.isError || !f) return <div className="mx-auto max-w-2xl space-y-3"><PageTitle title={tt('forecast.card_title', 'Tomorrow in my area')} /><EmptyState title={tt('forecast.none', 'No fire forecast is available yet')}>{tt('forecast.none_hint_field', 'It will appear here when the forecast is issued. Check again in the morning.')}</EmptyState></div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={tt('forecast.card_title', 'Tomorrow in my area')} subtitle={tt('forecast.card_sub', 'Forecast for {{date}}, issued {{when}}.', { date: f.date, when: formatWhen(f.issued_at) })} />
      {f.mode === 'replay' && <Notice kind="warning">{tt('forecast.replay', 'This is an archived day from 2025, shown as it would have been issued. It is not tomorrow\'s forecast.')}</Notice>}
      {recordWords(f.yesterday, tt) && <Notice kind="info">{recordWords(f.yesterday, tt)}</Notice>}
      {areas.length === 0 && <EmptyState title={tt('forecast.no_areas', 'No forecast areas are set for you yet')}>{tt('forecast.no_areas_hint', 'Ask the control room to give you a community.')}</EmptyState>}
      {areas.length > 0 && active.length === 0 && <Notice kind="info">{tt('forecast.quiet_day', 'No area is rated Moderate or above for tomorrow. Nothing extra to do from the forecast.')}</Notice>}
      <ul className="space-y-3">{active.map(a => <li key={a.id}><Card1 area={a} date={f.date} actions={f.actions} /></li>)}</ul>
      {quiet.length > 0 && (
        <details className="rounded-rq border border-line bg-surface p-3" open={showNone} onToggle={e => setShowNone((e.target as HTMLDetailsElement).open)}>
          <summary className="min-h-11 cursor-pointer font-semibold">{tt('forecast.n_none', '{{n}} areas with no rating', { n: quiet.length })}</summary>
          <ul className="mt-2 space-y-1 text-sm">{quiet.map(a => <li key={a.id}>{a.name} · {a.state} · {chanceWords(a.chance, tt)}</li>)}</ul>
        </details>)}
      <p className="text-sm text-ink-muted">{tt('forecast.card_note', 'The level is the chance that a satellite detects a fire in the area tomorrow. It does not say where exactly or how big. A person on the ground decides.')} <Link to="/field/satellite" className="font-semibold underline">{tt('forecast.detections_near', 'Detections near me')}</Link></p>
    </div>
  );
}

function Card1({ area, date, actions }: { area: Area; date: string; actions: Action[] }) {
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
      <p className="text-sm">{tt('forecast.card_expected', 'About {{n}} fire spots expected.', { n: Math.round(area.expected_fires) })}</p>
      <Reasons area={area} />
      <WeakNote area={area} />
      <div><h3 className="text-sm font-bold">{tt('forecast.do_today', 'Do today')}</h3><ActionList area={area} actions={actions} /></div>
      <LookList area={area} limit={5} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void share()} className="min-h-11 rounded-rq bg-action px-4 font-semibold text-on-action">{tt('forecast.share', 'Share on WhatsApp or SMS')}</button>
        <button type="button" aria-expanded={map} onClick={() => setMap(m => !m)} className="min-h-11 rounded-rq border border-control px-4 font-semibold">{map ? tt('forecast.hide_map', 'Hide map') : tt('forecast.show_map', 'Show map')}</button>
        {shared && <span role="status" className="text-sm text-ink-muted">{shared}</span>}
      </div>
      {map && <MapView label={tt('forecast.map_of', 'Map of {{name}}', { name: area.name })} polygons={areaPolygons([area])} points={points} bounds={bounds} className="h-72" />}
    </article>
  );
}
