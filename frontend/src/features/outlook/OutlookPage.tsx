import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api, ApiError } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf } from '../map/geojson';
import { MapView } from '../map/MapView';
import { satelliteStyle, whatifTerrainStyle } from '../map/style';
import { ForecastTabs } from '../forecast/BoardPage';
import { BAND_ORDER, bandPolygons, burnedPolygons, footprintPolygons, placePoints, roadLines, type Overlay, type Run, type Summary } from '../firespread/model';
import { HEAT_STOPS, OUTLOOK_VIEWS, horizonKeys, readDarkTokens, readView, safeStorage, satelliteConfig, writeView, type OutlookViewId } from './view';

const SATELLITE = satelliteConfig(import.meta.env as Record<string, string | boolean | undefined>);
const POINT = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' } as const;
const GROUND = { tree: 'forest', shrub: 'scrub', grass: 'grassland', crop: 'farmland' } as const;

/** One plain sentence: where, over what ground. No distance and no time: the model ranks cells, it does not say how far or how fast. */
function answer(s: Summary, t: (k: string, d: string, o?: Record<string, unknown>) => string): string {
  const where = t(`outlook.dir.${s.bearing}`, POINT[s.bearing as keyof typeof POINT] ?? s.bearing);
  const ground = t(`outlook.ground.${s.cover}`, GROUND[s.cover]);
  const slope = s.slope_deg < 5 ? t('outlook.gentle', 'on gentle ground') : s.uphill_share != null && s.uphill_share >= 0.6 ? t('outlook.uphill', 'mostly uphill') : s.uphill_share != null && s.uphill_share <= 0.4 ? t('outlook.downhill', 'mostly downhill') : t('outlook.mixed', 'across the slope');
  return t('outlook.answer', 'Most likely to spread toward the {{where}}, through {{ground}}, {{slope}}.', { where, ground, slope });
}

/** Spread outlook: for an active fire, the cells most likely to burn in the next one to two days, drawn as a heat picture on dark terrain (or light, or satellite), with a one-line answer, what is in the way, and how far to trust it. */
export function OutlookPage() {
  const { t } = useTranslation();
  const tt = (k: string, d: string, o?: Record<string, unknown>) => t(k, { defaultValue: d, ...o }) as string;
  const [event, setEvent] = useState<string | null>(null);
  const [wanted, setWanted] = useState<number | null>(null);
  const [showBurned, setShowBurned] = useState(false);
  const [outlines, setOutlines] = useState(false);
  const [view, setView] = useState<OutlookViewId>(() => readView(safeStorage(), !!SATELLITE));
  useEffect(() => { writeView(safeStorage(), view); }, [view]);
  const [showPlaces, setShowPlaces] = useState(true);
  const [showRoads, setShowRoads] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const run = useQuery({ queryKey: ['fire-spread', 'latest'], retry: false, queryFn: () => api<Run>('/api/fire-spread/runs/latest') });
  const fires = useMemo(() => [...(run.data?.fires ?? [])].sort((a, b) => b.n_detections - a.n_detections), [run.data]);
  const fire = fires.find(f => f.event === event) ?? fires[0];
  const base = run.data && fire ? `/api/fire-spread/${run.data.run}/${fire.event}` : null;
  const keys = useMemo(() => horizonKeys(fire?.horizons), [fire]);
  /** Current runs carry one outlook (the next one to two days, stored under 48). An older run with two look-aheads still gets a switch. */
  const hours = wanted != null && keys.includes(wanted) ? wanted : keys[keys.length - 1] ?? 48;
  const single = keys.length <= 1;
  const horizon = fire?.horizons?.[String(hours)];
  const bands = useQuery({ queryKey: ['outlook', base, hours], enabled: !!base, retry: false, queryFn: () => api<Parameters<typeof bandPolygons>[0]>(`${base}/${hours}`) });
  const overlay = useQuery({ queryKey: ['outlook', base, 'overlay'], enabled: !!base && !!fire?.overlay_file, retry: false, staleTime: Infinity, queryFn: () => api<Overlay>(`${base}/overlay`) });
  const pixels = useQuery({ queryKey: ['outlook', base, 'pixels'], enabled: !!base, retry: false, queryFn: () => api<Parameters<typeof footprintPolygons>[0]>(`${base}/pixels`) });
  const burned = useQuery({ queryKey: ['outlook', base, hours, 'burned'], enabled: !!base && showBurned && !!horizon?.burned_file, retry: false, queryFn: () => api<Parameters<typeof burnedPolygons>[0]>(`${base}/burned/${hours}`) });
  const places = useQuery({ queryKey: ['outlook', base, hours, 'places'], enabled: !!base && !!horizon?.places_file, retry: false, queryFn: () => api<Parameters<typeof placePoints>[0]>(`${base}/layer/places/${hours}`) });
  const roads = useQuery({ queryKey: ['outlook', base, hours, 'roads'], enabled: !!base && showRoads && !!horizon?.roads_file, retry: false, queryFn: () => api<Parameters<typeof roadLines>[0]>(`${base}/layer/roads/${hours}`) });
  const placePts = useMemo(() => (places.data && fire ? placePoints(places.data, `${fire.event}-${hours}`) : []), [places.data, fire, hours]);
  const heat = fire?.overlay_file ? overlay.data ?? null : null;
  /** With the heat picture the bands are drawn only on request (as outlines of the same ranking); without it (older runs) they are the picture. */
  const drawBands = !fire?.overlay_file || outlines;
  const polygons = useMemo(() => [...(drawBands && bands.data && fire ? bandPolygons(bands.data, `${fire.event}-${hours}`) : []), ...(showBurned && burned.data && fire ? burnedPolygons(burned.data, `${fire.event}-${hours}`) : []), ...(pixels.data && fire ? footprintPolygons(pixels.data, fire.event) : [])], [bands.data, burned.data, pixels.data, showBurned, drawBands, fire, hours]);
  /** The extent of all three bands, so the map frames the fire and does not jump when a layer is switched on or off. */
  const frame = useMemo(() => (heat && bands.data && fire ? bandPolygons(bands.data, fire.event).flatMap(p => p.ring.map(([lon, lat]) => ({ lat, lon }))) : null), [heat, bands.data, fire]);
  const chosen = placePts.find(p => p.id === picked)?.place ?? null;
  const points = useMemo(() => (showPlaces ? placePts : []), [showPlaces, placePts]);
  const lines = useMemo(() => (showRoads && roads.data && fire ? roadLines(roads.data, `${fire.event}-${hours}`) : []), [showRoads, roads.data, fire, hours]);
  const bounds = useMemo(() => chosen ? boundsOf([{ lat: chosen.lat - 0.012, lon: chosen.lon - 0.012 }, { lat: chosen.lat + 0.012, lon: chosen.lon + 0.012 }]) : boundsOf(frame ? frame : polygons.length ? polygons.flatMap(p => p.ring.map(([lon, lat]) => ({ lat, lon }))) : fire ? [{ lat: fire.lat - 0.1, lon: fire.lon - 0.1 }, { lat: fire.lat + 0.1, lon: fire.lon + 0.1 }] : []), [polygons, fire, chosen, frame]);
  const skill = run.data?.skill?.horizons[String(hours)];
  const bandName: Record<number, string> = { 3: tt('outlook.band3', 'Most likely'), 2: tt('outlook.band2', 'Likely'), 1: tt('outlook.band1', 'Possible') };
  const replay = run.data?.mode === 'replay';
  const dark = view !== 'light';
  const tokens = useMemo(() => (dark ? readDarkTokens() : null), [dark]);
  const style = useMemo(() => (view === 'dark' && tokens ? whatifTerrainStyle(tokens.terrain) : view === 'satellite' && SATELLITE ? satelliteStyle(SATELLITE.url, SATELLITE.attribution, window.location.origin, SATELLITE.maxZoom) : null), [view, tokens]);
  const imageOverlay = useMemo(() => (heat ? { url: heat.heat, coordinates: heat.coordinates, opacity: view === 'light' ? 0.8 : 0.92 } : null), [heat, view]);
  const terrainOverlay = useMemo(() => (heat && view === 'dark' ? { url: heat.terrain, coordinates: heat.coordinates, opacity: 0.9 } : null), [heat, view]);
  const viewName: Record<OutlookViewId, string> = { dark: tt('outlook.view_dark', 'Dark terrain'), light: tt('outlook.view_light', 'Light'), satellite: tt('outlook.view_satellite', 'Satellite') };

  if (run.isLoading) return <div className="mx-auto max-w-6xl"><Skeleton lines={5} /></div>;
  if (run.error instanceof ApiError && run.error.status === 404) return <div className="mx-auto max-w-3xl"><EmptyState title={tt('outlook.none', 'No spread outlook is available yet')} /></div>;
  if (run.error || !run.data) return <div className="mx-auto max-w-3xl"><LoadError message={(run.error as Error | null)?.message ?? ''} onRetry={() => void run.refetch()} retryLabel={tt('citizen.retry', 'Try again')} /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ForecastTabs current="spread" />
      <PageTitle title={tt('outlook.title', 'Spread outlook')} subtitle={tt('outlook.subtitle', 'Archived fires scored by the model, to check how well it ranks where a fire spreads.')} />
      <Notice kind="info">{tt('outlook.past_note', 'This page checks the model on past fires. The coloured area is much larger than what usually burns, so it is a ranking, not a forecast of the burned area. For fires burning now, use Active fires.')} <Link to="/ops/fires" className="font-semibold underline">{tt('outlook.to_fires', 'Active fires')}</Link></Notice>
      {replay && <Notice kind="warning">{tt('outlook.replay', 'These are archived fires from {{when}}, scored as they would have been then. The live outlook is not running yet.', { when: formatWhen(run.data.at) })}</Notice>}
      {fires.length === 0 ? <EmptyState title={tt('outlook.no_fires', 'No active fires in this run.')} /> : (
        <>
          <section aria-label={tt('outlook.fires', 'Fires')}>
            <ul className="flex gap-2 overflow-x-auto pb-1">{fires.map(f => (
              <li key={f.event} className="shrink-0"><button type="button" aria-pressed={f.event === fire?.event} onClick={() => { setEvent(f.event); setShowBurned(false); setPicked(null); }} className={`min-h-11 rounded-rq border px-3 py-2 text-left ${f.event === fire?.event ? 'border-action bg-action/10' : 'border-line'}`}>
                <span className="block font-semibold">{f.state ?? `${f.lat.toFixed(2)}°N`}</span>
                <span className="block text-sm text-ink-muted">{tt('outlook.detections', '{{count}} satellite detections', { count: f.n_detections })} · {formatWhen(f.last_detection)}</span>
              </button></li>))}</ul>
          </section>
          {fire && (
            <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-3">
                <div className="rounded-panel border border-line bg-surface p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{single ? tt('outlook.next_days', 'Next 1 to 2 days') : tt('outlook.next', 'Next {{h}} hours', { h: hours })}</p>
                  <p className="mt-1 text-xl font-semibold" data-testid="answer">{horizon?.summary ? answer(horizon.summary, tt) : tt('outlook.no_summary', 'No summary for this fire.')}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {!single && (
                      <div role="group" aria-label={tt('outlook.horizon', 'Look ahead')} className="inline-flex rounded-rq border border-control p-1">
                        {keys.map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => { setWanted(h); setShowBurned(false); setPicked(null); }} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-ink text-surface' : ''}`}>{h} h</button>)}
                      </div>)}
                    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <legend className="sr-only">{tt('outlook.view', 'Map view')}</legend>
                      {OUTLOOK_VIEWS.map(v => <label key={v} className={`inline-flex min-h-11 items-center gap-1.5 ${v === 'satellite' && !SATELLITE ? 'text-ink-muted' : ''}`}><input type="radio" name="outlook-view" value={v} checked={view === v} disabled={v === 'satellite' && !SATELLITE} onChange={() => setView(v)} className="h-4 w-4" />{viewName[v]}</label>)}
                    </fieldset>
                    {heat && (
                      <div className="flex items-center gap-2 text-sm" role="img" aria-label={tt('outlook.legend_scale', 'Colour scale: brightest is most likely, deep red is possible')}>
                        <span>{bandName[3]}</span>
                        <span aria-hidden className="inline-block h-3 w-28 rounded-sm border border-line" style={{ background: `linear-gradient(to right, ${HEAT_STOPS.join(', ')})` }} />
                        <span>{bandName[1]}</span>
                      </div>)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-sm"><span aria-hidden className="inline-block h-3 w-5 rounded-sm border-2 border-ink" />{tt('outlook.start_key', 'Fire at the start')}</span>
                    {showBurned && <span className="inline-flex items-center gap-1.5 text-sm"><span aria-hidden className="inline-block h-3 w-5 rounded-sm border border-dashed border-ink" />{tt('outlook.burned_key', 'Burned (satellite)')}</span>}
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showPlaces} onChange={e => setShowPlaces(e.target.checked)} className="h-4 w-4" />{tt('outlook.show_places', 'Places')}</label>
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showRoads} onChange={e => setShowRoads(e.target.checked)} className="h-4 w-4" />{tt('outlook.show_roads', 'Roads')}</label>
                    {fire.overlay_file && <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={outlines} onChange={e => setOutlines(e.target.checked)} className="h-4 w-4" />{tt('outlook.outlines', 'Band outlines')}</label>}
                    {replay && horizon?.burned_file && <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showBurned} onChange={e => setShowBurned(e.target.checked)} className="h-4 w-4" />{tt('outlook.show_burned', 'Show what actually burned')}</label>}
                  </div>
                  {view === 'satellite' && SATELLITE && <p className="mt-1 text-xs text-ink-muted">{SATELLITE.note}</p>}
                  {!SATELLITE && <p className="mt-1 text-xs text-ink-muted">{tt('outlook.sat_off', 'Satellite imagery is not set up for this site.')}</p>}
                </div>
                <MapView label={tt('outlook.map', 'Likely next areas around the selected fire')} polygons={polygons} points={points} lines={lines} selectedId={picked} onSelect={id => setPicked(id && id.includes('-pl') ? id : null)} bounds={bounds} basemapStyle={style} colorsOverride={tokens?.mapColors} imageOverlay={imageOverlay} terrainOverlay={terrainOverlay} className="h-[62vh] min-h-96" />
                {(bands.isLoading || pixels.isLoading) && <Skeleton lines={1} />}
                {bands.error && <LoadError message={(bands.error as Error).message} onRetry={() => void bands.refetch()} retryLabel={tt('citizen.retry', 'Try again')} />}
              </div>
              <div className="space-y-4">
                {horizon?.affected && (
                  <Card title={tt('outlook.in_way', 'What is in the way')}>
                    <table className="w-full text-sm"><thead><tr className="text-left text-ink-muted"><th className="font-normal">{tt('outlook.band', 'Band')}</th><th className="text-right font-normal">{tt('outlook.people', 'People')}</th><th className="text-right font-normal">km²</th></tr></thead>
                      <tbody>{BAND_ORDER.map(b => { const f = horizon.affected!.bands[String(b)]; return f ? <tr key={b}><td>{bandName[b]}</td><td className="text-right font-semibold" data-testid={`people-${b}`}>{f.people.toLocaleString()}</td><td className="text-right">{f.area_km2}</td></tr> : null; })}</tbody></table>
                    <p className="mt-2 text-xs text-ink-muted">{tt('outlook.people_note', 'People from the WorldPop grid (about 1 km), spread over the cells of each band.')}</p>
                    <h3 className="mt-3 text-sm font-bold">{tt('outlook.named', 'Named places nearby')}</h3>
                    {placePts.length === 0 ? <p className="text-sm text-ink-muted">{tt('outlook.no_places', 'No named places in the OpenStreetMap extract here. Many forest areas are thinly mapped.')}</p> : (
                      <ul className="mt-1 space-y-1">{placePts.slice(0, 8).map(p => <li key={p.id}><button type="button" aria-pressed={picked === p.id} onClick={() => setPicked(picked === p.id ? null : p.id)} className={`min-h-11 w-full rounded-rq border px-2 py-1 text-left text-sm ${picked === p.id ? 'border-action bg-action/10' : 'border-line'}`}><span className="font-semibold">{p.place.name}</span> <span className="text-ink-muted">· {tt(`outlook.kind.${p.place.kind}`, p.place.kind)} · {p.place.distance_km} km {tt(`outlook.dir.${p.place.bearing}`, p.place.bearing)}{p.place.band ? ` · ${bandName[p.place.band]}` : ''}</span></button></li>)}</ul>)}
                    {horizon.affected.road_names.length > 0 && <p className="mt-3 text-sm"><span className="font-bold">{tt('outlook.roads_in', 'Roads in the bands')}: </span>{horizon.affected.road_names.join(', ')}</p>}
                    <p className="mt-2 text-xs text-ink-muted">{tt('outlook.osm_note', 'Places and roads are from OpenStreetMap, fetched when the run was made. Coverage is thin in many forest areas, so an empty list does not mean nobody lives there.')}</p>
                  </Card>)}
                <Card title={tt('outlook.about', 'This fire')}>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <dt className="text-ink-muted">{tt('outlook.where', 'Place')}</dt><dd className="font-semibold">{fire.state ?? '-'}</dd>
                    <dt className="text-ink-muted">{tt('outlook.seen', 'Detections')}</dt><dd className="font-semibold">{fire.n_detections}</dd>
                    <dt className="text-ink-muted">{tt('outlook.last', 'Last seen')}</dt><dd className="font-semibold">{formatWhen(fire.last_detection)}</dd>
                    <dt className="text-ink-muted">{tt('outlook.power', 'Fire power')}</dt><dd className="font-semibold">{Math.round(fire.frp_sum)} MW</dd>
                  </dl>
                  <Link to="/ops/satellite" className="mt-3 inline-block text-sm font-semibold underline">{tt('outlook.satellite', 'All satellite detections')}</Link>
                </Card>
                <Card title={tt('outlook.trust', 'How far to trust it')}>
                  {skill ? <p className="text-sm">{tt('outlook.skill', 'On {{cases}} fires from 2025 that the model had never seen, its top cells overlapped what burned {{ratio}} times as often as simply choosing the cells nearest the fire ({{model}}% against {{base}}%).', { cases: skill.cases, ratio: (skill.model_iou / skill.baseline_iou).toFixed(1), model: Math.round(skill.model_iou * 100), base: Math.round(skill.baseline_iou * 100) })}</p>
                    : <p className="text-sm text-ink-muted">{tt('outlook.skill_none', 'The measured skill is not available for this run.')}</p>}
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                    <li>{tt('outlook.limit1', 'It ranks cells within 8 km of the fire. It does not say how far or how fast the fire will go.')}</li>
                    <li>{single ? tt('outlook.limit5', 'One outlook covers the next one to two days. Models trained for 24 and for 48 hours ranked the cells almost the same, so they are combined. The map does not say when a cell will burn.') : tt('outlook.limit4', 'The bands are sized by how much usually burns: the top band holds about 2% of the cells asked about at 24 hours and about 3% at 48 hours. The 24 and 48 hour rankings are similar, so the maps differ mostly in size.')}</li>
                    <li>{tt('outlook.limit2', 'Wind is not used. It did not improve the ranking in testing.')}</li>
                    <li>{tt('outlook.limit3', 'The truth it was tested against is a satellite burned-area map, not a field-checked perimeter.')}</li>
                  </ul>
                </Card>
              </div>
            </div>)}
        </>)}
    </div>
  );
}
