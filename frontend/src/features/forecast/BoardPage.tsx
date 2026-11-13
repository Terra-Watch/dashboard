import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf, type MapPoint, type MapPolygon } from '../map/geojson';
import { MapView } from '../map/MapView';
import { useDates, useDayCells, useForecast, useForestShapes, type Source } from './api';
import { LEVELS, areaPolygons, chanceWords, changeWords, COMPARE, FOREST_STEPS, areaBounds, sceneWords, cellPolygons, compareName, forestPolygons, forestName, dayWord, fireMarks, matchesCompare, fireSeenWords, levelRank, outcomeWords, recordWords, typicalWords, type Area, type Compare, type LevelId } from './model';
import { ForecastLegend } from '../map/Legend';
import { ActionList, LevelChip, LookList, Reasons, WeakNote, useTt } from './parts';

/** Control-room tabs: tomorrow's forecast and the outlook for fires that are burning now. */
export function ForecastTabs({ current }: { current: 'forecast' | 'fires' | 'spread' }) {
  const tt = useTt();
  const cls = (on: boolean) => `min-h-11 inline-flex items-center rounded-rq px-4 font-semibold ${on ? 'bg-ink text-surface' : 'border border-control'}`;
  return (
    <nav aria-label={tt('forecast.tabs', 'Forecast views')} className="mb-3 flex gap-2">
      <Link to="/ops/forecast" aria-current={current === 'forecast' ? 'page' : undefined} className={cls(current === 'forecast')}>{tt('forecast.tab_forecast', 'Tomorrow')}</Link>
      <Link to="/ops/fires" aria-current={current === 'fires' ? 'page' : undefined} className={cls(current === 'fires')}>{tt('forecast.tab_fires', 'Active fires')}</Link>
      <Link to="/ops/outlook" aria-current={current === 'spread' ? 'page' : undefined} className={cls(current === 'spread')}>{tt('forecast.tab_past', 'Past fires')}</Link>
    </nav>
  );
}

/** The archived day a demo opens on: a busy day, so the forecast and what was detected can be compared. */
const DEMO_DAY = '2025-03-10';
/** Demo builds show the archive; set VITE_FORECAST_VIEW=live to open on the live forecast. */
const DEFAULT_SOURCE: Source = import.meta.env.VITE_FORECAST_VIEW === 'live' ? 'live' : 'archive';

/** Control-room forecast board: the areas of a division on a map and in a table, with the level, the chance, what is usual, and what to do. */
export function BoardPage() {
  const tt = useTt();
  const [source, setSource] = useState<Source>(DEFAULT_SOURCE);
  const dates = useDates(source);
  const [date, setDate] = useState<string | null>(null); const [sceneId, setSceneId] = useState<string | null>(null);
  const scenes = source === 'archive' ? dates.data?.scenes ?? [] : [];
  // the demo opens on the first scene: one state on one day, small enough to read
  useEffect(() => { if (source === 'archive' && scenes.length && sceneId === null) { setSceneId(scenes[0].id); setDate(scenes[0].date); setState(scenes[0].state); } }, [source, scenes, sceneId]);
  const day = date ?? (source === 'archive' && dates.data ? (dates.data.dates.includes(DEMO_DAY) ? DEMO_DAY : dates.data.latest) : null);
  const q = useForecast(day, source);
  const [state, setState] = useState(''); const [showNone, setShowNone] = useState(false); const [compare, setCompare] = useState<Compare>('all'); const [forest, setForest] = useState(0); const [showBoxes, setShowBoxes] = useState(true); const [showOutlines, setShowOutlines] = useState(false); const [showForest, setShowForest] = useState(false); const [showFires, setShowFires] = useState(true); const [sel, setSel] = useState<number | null>(null);
  const f = q.data; const all = f?.areas ?? [];
  const archived = !!f?.outcome;
  const dayCells = useDayCells(day, archived); const shapes = useForestShapes().data;
  const states = useMemo(() => [...new Set(all.map(a => a.state))].sort(), [all]);
  const rows = useMemo(() => all.filter(a => (!state || a.state === state) && (compare !== 'all' ? matchesCompare(a, compare) : showNone || a.level !== 'none')).sort((a, b) => levelRank(b.level) - levelRank(a.level) || b.chance - a.chance), [all, state, showNone, compare]);
  const chosen = rows.find(a => a.id === sel) ?? null;
  // the forecast where the model scored: forest cells shaded by their area's level; the 55 km outlines are optional, and the fallback when the cells are not available
  const forecastShapes = useMemo<MapPolygon[]>(() => {
    const cells = dayCells.data?.length ? cellPolygons(dayCells.data, rows, forest, 'fc', shapes) : [];
    return [...(archived && showForest && dayCells.data?.length ? forestPolygons(dayCells.data, forest, state, 'fo', shapes) : []), ...(showBoxes ? (cells.length ? cells : areaPolygons(rows)) : []), ...(archived && showOutlines && cells.length ? areaPolygons(rows) : [])];
  }, [dayCells.data, shapes, rows, forest, state, showBoxes, showOutlines, showForest, archived]);
  const polygons = useMemo<MapPolygon[]>(() => [...forecastShapes, ...(chosen ? [{ id: `sel-${chosen.id}`, ring: [[chosen.bbox[0], chosen.bbox[1]], [chosen.bbox[2], chosen.bbox[1]], [chosen.bbox[2], chosen.bbox[3]], [chosen.bbox[0], chosen.bbox[3]], [chosen.bbox[0], chosen.bbox[1]]] as Array<[number, number]>, tone: 'observed' as const }] : [])], [rows, chosen, forecastShapes]);
  const looks = useMemo<MapPoint[]>(() => (chosen?.look ?? []).map((l, i) => ({ id: `look-${chosen!.id}-${i}`, lat: l.lat, lon: l.lon, symbol: 'task' as const, label: l.place?.name ?? String(i + 1) })), [chosen]);
  // On an archived day: a mark in every area where a fire was actually detected, whatever level it was given.
  const seen = useMemo<MapPoint[]>(() => (archived && f && showFires ? fireMarks(f, all.filter(a => (!state || a.state === state) && matchesCompare(a, compare)), forest) : []), [f, all, archived, state, compare, showFires, forest]);
  const points = useMemo(() => [...seen, ...looks], [seen, looks]);
  const bounds = useMemo(() => boundsOf(chosen ? [{ lat: chosen.bbox[1], lon: chosen.bbox[0] }, { lat: chosen.bbox[3], lon: chosen.bbox[2] }] : rows.length ? rows.flatMap(a => [{ lat: a.bbox[1], lon: a.bbox[0] }, { lat: a.bbox[3], lon: a.bbox[2] }]) : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [rows, chosen]);
  const weak = useMemo(() => [...new Set(rows.filter(a => !a.reliable && a.level !== 'none').map(a => a.state))].sort(), [rows]);

  if (dates.isLoading || q.isLoading || (source === 'archive' && !f && !dates.isError)) return <div className="mx-auto max-w-6xl"><Skeleton lines={5} /></div>;
  if (dates.isError || q.isError || !f) return <div className="mx-auto max-w-3xl space-y-3"><ForecastTabs current="forecast" /><EmptyState title={tt('forecast.none', 'No fire forecast is available yet')}>{tt('forecast.none_hint', 'The forecast job has not issued a run for your area.')}</EmptyState></div>;
  const summary = f.summary;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageTitle title={tt('forecast.board_title', 'Fire forecast')} subtitle={tt('forecast.board_sub', 'The chance that a fire is detected in each forest area on the chosen day, and what to do about it.')} />
      <ForecastTabs current="forecast" />
      <div role="group" aria-label={tt('forecast.source', 'Forecast source')} className="flex gap-2">
        {(['archive', 'live'] as const).map(k => <button key={k} type="button" aria-pressed={source === k} onClick={() => { setSource(k); setDate(null); setSceneId(null); setState(''); setSel(null); }} className={`min-h-11 rounded-rq px-4 font-semibold ${source === k ? 'bg-ink text-surface' : 'border border-control'}`}>{k === 'archive' ? tt('forecast.src_archive', 'Archive (demo)') : tt('forecast.src_live', 'Live')}</button>)}
      </div>
      {archived && <Notice kind="info">{tt('forecast.archive_note', 'Archive demo: a past day of 2025, shown as it would have been issued the day before, next to the fires the satellite then actually detected. It is not tomorrow\'s forecast.')}</Notice>}
      {archived && typicalWords(dates.data?.typical, tt) && <p className="text-sm text-ink-muted">{typicalWords(dates.data?.typical, tt)}</p>}
      {archived && state && sceneWords(all.filter(a => a.state === state), `${state} · ${f.date}`, tt) ? <Notice kind="success">{sceneWords(all.filter(a => a.state === state), `${scenes.find(x => x.id === sceneId)?.label ?? `${state} · ${f.date}`}`, tt)}</Notice> : outcomeWords(f.outcome, f.date, tt) && <Notice kind="success">{outcomeWords(f.outcome, f.date, tt)}</Notice>}
      {!archived && f.mode === 'replay' && <Notice kind="warning">{tt('forecast.replay', 'This is an archived day from 2025, shown as it would have been issued. It is not tomorrow\'s forecast.')}</Notice>}
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {LEVELS.filter(l => l !== 'none').map(l => <span key={l} className="inline-flex items-center gap-1.5"><LevelChip level={l} /><b className="tabular-nums">{summary[l]}</b></span>)}
        <span className="text-sm text-ink-muted">{tt('forecast.n_none', '{{n}} areas with no rating', { n: summary.none })}</span>
        {archived && scenes.length > 0 && <label className="text-sm">{tt('forecast.scene_pick', 'Scene')} <select value={sceneId ?? ''} onChange={e => { const sc = scenes.find(x => x.id === e.target.value); setSceneId(e.target.value); setSel(null); if (sc) { setDate(sc.date); setState(sc.state); } else setState(''); }} className="min-h-11 rounded-rq border border-control bg-surface px-2">{scenes.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}<option value="">{tt('forecast.scene_all', 'Whole country')}</option></select></label>}
        <label className="ml-auto text-sm">{tt('forecast.date', 'Forecast for')} <select value={day ?? f.date} onChange={e => { setDate(e.target.value); setSceneId(''); setSel(null); }} className="min-h-11 rounded-rq border border-control bg-surface px-2">{(dates.data?.dates ?? [f.date]).map(d => <option key={d} value={d}>{dayWord(d, tt) === d ? d : `${dayWord(d, tt)} · ${d}`}</option>)}</select></label>
        <label className="text-sm">{tt('forecast.state', 'State')} <select value={state} onChange={e => { setState(e.target.value); setSceneId(scenes.find(x => x.date === day && x.state === e.target.value)?.id ?? ''); setSel(null); }} className="min-h-11 rounded-rq border border-control bg-surface px-2"><option value="">{tt('forecast.all', 'All')}</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>
        {archived && <label className="text-sm">{tt('forecast.compare', 'Compare')} <select value={compare} onChange={e => { setCompare(e.target.value as Compare); setSel(null); }} className="min-h-11 rounded-rq border border-control bg-surface px-2">{COMPARE.map(c => <option key={c} value={c}>{compareName(c, tt)}</option>)}</select></label>}
        {archived && <label className="text-sm">{tt('forecast.forest_cells', 'Fire squares')} <select value={forest} onChange={e => setForest(Number(e.target.value))} className="min-h-11 rounded-rq border border-control bg-surface px-2">{FOREST_STEPS.map(x => <option key={x} value={x}>{forestName(x, tt)}</option>)}</select></label>}
        {archived && <><label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showForest} onChange={e => setShowForest(e.target.checked)} className="h-4 w-4" />{tt('forecast.layer_forest', 'Forest cells')}</label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)} className="h-4 w-4" />{tt('forecast.layer_forecast', 'Forecast (model output)')}</label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showOutlines} onChange={e => setShowOutlines(e.target.checked)} className="h-4 w-4" />{tt('forecast.layer_outlines', 'Outline the 55 km areas')}</label>
          <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showFires} onChange={e => setShowFires(e.target.checked)} className="h-4 w-4" />{tt('forecast.layer_fires', 'Fires detected')}</label></>}
        <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showNone} onChange={e => setShowNone(e.target.checked)} className="h-4 w-4" />{tt('forecast.show_none', 'Show areas with no rating')}</label>
      </div>
      <p className="text-sm text-ink-muted">{tt('forecast.issued', 'Issued {{when}} · model {{model}} · week {{week}} of the year', { when: formatWhen(f.issued_at), model: String(f.model?.id ?? ''), week: f.week_of_year })}{f.scope !== 'all' ? ` · ${tt('forecast.scope_' + f.scope, f.scope === 'community' ? 'your communities only' : 'your states only')}` : ''}</p>
      {recordWords(f.yesterday, tt) && <Notice kind="info">{recordWords(f.yesterday, tt)}</Notice>}
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          <MapView label={tt('forecast.map', 'Forecast areas')} polygons={polygons} points={points} bounds={bounds} className="h-[58vh] min-h-96" />
          <p className="text-xs text-ink-muted">{tt('forecast.map_note', 'The shaded land is the forest inside each 11 km cell the model scored (towns, villages and fields are left out), shaded by the level of the 55 km area it sits in; a dashed outline is in a state where the forecast is less reliable. The shading is not the exact place of a fire.')}{archived && ' ' + tt('forecast.map_fire_note', 'A red diamond is a forest square (about 11 km) where a fire was actually detected that day.')}</p>
          {archived && <ForecastLegend forest={showForest} />}
          {weak.length > 0 && <Notice kind="info">{tt('forecast.weak_states', 'Less reliable in: {{states}}.', { states: weak.join(', ') })}</Notice>}
        </div>
        <div className="space-y-3">
          {rows.length === 0 ? <EmptyState title={tt('forecast.quiet', 'No area is rated Moderate or above')}>{tt('forecast.quiet_hint', 'A quiet day. Tick "Show areas with no rating" to see all areas.')}</EmptyState> : (
            <div className="max-h-[46vh] overflow-auto rounded-rq border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">{tt('forecast.table', 'Areas by level, highest first')}</caption>
                <thead className="sticky top-0 bg-surface-2 text-left"><tr><th className="p-2">{tt('forecast.col_area', 'Area')}</th><th className="p-2">{tt('forecast.col_level', 'Level')}</th><th className="p-2 text-right">{tt('forecast.col_chance', 'Chance')}</th><th className="p-2 text-right">{tt('forecast.col_expected', 'Fire spots')}</th><th className="p-2 text-right">{tt('forecast.col_usual', 'Usual')}</th>{archived && <th className="p-2 text-right">{tt('forecast.col_seen', 'Fire detected')}</th>}</tr></thead>
                <tbody>{rows.slice(0, 200).map(a => (
                  <tr key={a.id} className={`border-t border-line ${a.id === chosen?.id ? 'bg-action/10' : ''}`}>
                    <td className="p-2"><button type="button" aria-pressed={a.id === chosen?.id} onClick={() => setSel(a.id === sel ? null : a.id)} className="min-h-11 text-left font-semibold underline-offset-2 hover:underline">{a.name}<span className="block text-xs font-normal text-ink-muted">{a.state}{changeWords(a, tt) ? ` · ${changeWords(a, tt)}` : ''}</span></button></td>
                    <td className="p-2"><LevelChip level={a.level} /></td>
                    <td className="p-2 text-right tabular-nums">{Math.round(a.chance * 100)}%</td>
                    <td className="p-2 text-right tabular-nums">{a.expected_fires.toFixed(1)}</td>
                    <td className="p-2 text-right tabular-nums text-ink-muted">{a.usual_fires === null ? '-' : a.usual_fires.toFixed(1)}</td>
                    {archived && <td className="p-2 text-right">{a.fire_detected ? <b>{tt('forecast.yes', 'Yes')}</b> : <span className="text-ink-muted">{tt('forecast.no', 'No')}</span>}</td>}
                  </tr>))}</tbody>
              </table>
            </div>)}
          {rows.length > 200 && <p className="text-xs text-ink-muted">{tt('forecast.first200', 'The first 200 areas are listed; use the state filter to see others.')}</p>}
          {chosen ? <Detail area={chosen} actions={f.actions} /> : rows.length > 0 && <p className="text-sm text-ink-muted">{tt('forecast.pick', 'Choose an area in the table to see why, what to do and where to look.')}</p>}
        </div>
      </div>
      <Card title={tt('forecast.trust', 'How far to trust it')}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>{tt('forecast.trust1', 'The level is the chance that a fire is detected by satellite in the area on that day, new or continuing. It is checked against what was detected, not against ground reports.')}</li>
          <li>{tt('forecast.trust2', 'It does not say where inside the area, how big, or how long. Fires already burning come from the satellite detections and the outlook tab.')}</li>
          <li>{tt('forecast.trust3', 'Rated areas had a fire detected on the day about 4 times in 10 at High and about 8 times in 10 at Extreme in 2025; areas with no rating almost never did.')}</li>
          <li>{tt('forecast.trust4', 'Wind and ground reports from lookout stations are not used yet.')}</li>
        </ul>
      </Card>
    </div>
  );
}

function Detail({ area, actions }: { area: Area; actions: NonNullable<ReturnType<typeof useForecast>['data']>['actions'] }) {
  const tt = useTt();
  return (
    <Card title={area.name} headingLevel={3}>
      <div className="flex flex-wrap items-center gap-3"><LevelChip level={area.level as LevelId} big /><span className="text-lg font-bold">{chanceWords(area.chance, tt)}</span><span className="text-sm text-ink-muted">{tt('forecast.detail_chance', 'chance of a fire detected here on this day')}</span></div>
      <p className="mt-2 text-sm">{tt('forecast.detail_expected', 'About {{n}} fire spots expected out of {{c}} forest squares.', { n: area.expected_fires.toFixed(1), c: area.cells })}</p>
      {fireSeenWords(area, tt) && <p className={`mt-2 text-sm ${area.fire_detected ? 'font-bold' : 'text-ink-muted'}`}>{fireSeenWords(area, tt)}</p>}
      <div className="mt-2"><Reasons area={area} /></div>
      <div className="mt-3"><WeakNote area={area} /></div>
      <div className="mt-3"><h3 className="text-sm font-bold">{tt('forecast.do_today', 'Do today')}</h3><ActionList area={area} actions={actions} /></div>
      <div className="mt-3"><LookList area={area} /></div>
    </Card>
  );
}
