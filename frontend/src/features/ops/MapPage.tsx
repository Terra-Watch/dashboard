import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { PageTitle, LoadError } from '../../ui/Page';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { formatWhen } from '../citizen/format';
import { cellCentre } from '../map/geojson';
import { WindLayer, type MapInstance } from '../map/WindLayer';
import type { WindGrid } from '../map/windField';
import { IncidentPreview } from '../incidents/IncidentPreview';
import { ForecastLegend, Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import { SYMBOL_OF_RUNG, boundsOf, type MapPoint, type MapPolygon } from '../map/geojson';
import { TIME_WINDOWS, canShow, minutesSinceMidnight, withinHours, type LayerId, type TimeWindow } from '../map/profiles';
import { communityBox, useCommunities } from '../../lib/community';
import { useOpsSettings, useIncidents, useOpsRegion, type Incident } from './useOps';
import { basemapStyle, satelliteStyle } from '../map/style';
import { readMapColors, isDark } from '../map/colors';
import { useStations } from '../stations/api';
import { statementWords, symbolOf } from '../stations/model';
import { useDates, useForecast } from '../forecast/api';
import { COMPARE, FOREST_STEPS, areaPolygons, cellPolygons, compareName, forestPolygons, forestName, fireMarks, matchesCompare, outcomeWords, typicalWords, type Compare } from '../forecast/model';

type Hotspot = { id: number; satellite: string; acq_datetime: string; latitude: number; longitude: number; frp: number | null; age_minutes: number };
type Freshness = { source: string; fetched_at: string; age_seconds: number; stale: boolean | null };
type Wind = { wind_speed_ms: number; wind_dir_deg: number; valid_time: string; freshness: Freshness; temperature_c?: number; humidity_pct?: number };
type NoticeArea = { id: number; title: string; severity: string; area_geojson: { type: string; coordinates: number[][][] } | null };

const PRESETS: Array<{ id: string; label: string; layers: LayerId[] }> = [
  { id: 'situation', label: 'Situation', layers: ['incidents', 'reports', 'signals', 'advisories', 'risk_forecast'] },
  { id: 'field', label: 'Field', layers: ['incidents', 'advisories'] },
];

type RiskRun = { model_id: string | null; model_version?: string; date: string; mode: 'live' | 'replay'; status: string; issued_at?: string; coverage?: { cells_scored: number; cells_in_grid: number | null; complete: boolean; missing_states: string[] }; degraded?: string[] };
type RiskStatus = { max_age_hours: number; runs: Partial<Record<'live' | 'replay', { forecast_date: string; age_hours: number; stale: boolean; status: string; mode: string; issued_at: string; degraded: string[] }>> };

function RiskRunChip({ run, status, error }: { run?: RiskRun; status?: RiskStatus; error: boolean }) {
  const { t } = useTranslation();
  const latest = status?.runs.live ?? status?.runs.replay;
  if (error) return <Notice kind="warning">{t('map.risk_status_off', 'The forecast status could not be read.')}</Notice>;
  if (!latest) return <p role="status" className="text-sm text-ink-muted sm:col-span-2 xl:col-span-4">{t('map.risk_none', 'No forecast has been issued yet.')}</p>;
  const replay = (run?.mode ?? latest.mode) === 'replay';
  const text = replay
    ? t('map.risk_replay', { date: run?.date ?? latest.forecast_date, defaultValue: 'Archived replay for {{date}}, not a live forecast.' })
    : t('map.risk_live', { date: latest.forecast_date, when: formatWhen(latest.issued_at), defaultValue: 'Forecast for {{date}}, issued {{when}}.' });
  const notes = [
    latest.stale && !replay ? t('map.risk_stale', { hours: latest.age_hours, defaultValue: 'Stale: the last run is {{hours}} hours old.' }) : '',
    latest.status === 'partial' ? t('map.risk_partial', 'Partial: some cells could not be scored.') : '',
    ...(run?.degraded ?? latest.degraded ?? []).map(d => d === 'gfs_missing' ? t('map.risk_gfs', 'Weather-forecast input was missing.') : d === 'ndvi_climatology' ? t('map.risk_ndvi', 'Vegetation uses a seasonal average.') : ''),
  ].filter(Boolean);
  const bad = (latest.stale && !replay) || latest.status === 'partial' || notes.length > 0;
  return <p role="status" className={`rounded-rq border px-3 py-2 text-sm sm:col-span-2 xl:col-span-4 ${latest.stale && !replay ? 'border-warn' : 'border-line'}`}>{bad && latest.stale && !replay ? '⚠ ' : ''}{text}{notes.length > 0 && <span className="block text-ink-muted">{notes.join(' ')}</span>}</p>;
}

function Chip({ label, freshness, status = 'ok' }: { label: string; freshness?: Freshness; status?: 'ok' | 'off' | 'loading' | 'error' }) {
  const { t } = useTranslation();
  const hasAge = status === 'ok' && freshness != null && typeof freshness.age_seconds === 'number';
  const age = hasAge ? Math.max(0, Math.round(freshness!.age_seconds / 60)) : null;
  const stale = status === 'ok' && freshness?.stale === true;
  // say what is true: a layer that is switched off is not "not connected", and a feed with no rows yet is not "0 min" old
  const state = status === 'off' ? t('map.layer_off', 'layer off') : status === 'loading' ? t('map.chip_loading', 'loading') : status === 'error' ? t('map.not_available', 'not available')
    : age !== null ? (age < 60 ? `${age} min` : `${Math.round(age / 60)} h`) : t('map.no_data_yet', 'no data yet');
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm ${stale ? 'border-warn bg-warn-tint font-semibold' : 'border-line text-ink-muted'}`}>{label} · {state}{stale ? ` · ${t('map.stale', 'stale')}` : ''}</span>;
}

export function OpsMapPage() {
  const { t } = useTranslation();
  const region = useOpsRegion();
  const communities = useCommunities();
  const incidents = useIncidents();
  const settings = useOpsSettings();
  const [hours, setHours] = useState<TimeWindow>(0);
  const [preset, setPreset] = useState('situation');
  const [riskDay, setRiskDay] = useState<'today' | 'tomorrow'>('tomorrow');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [riskHighOnly, setRiskHighOnly] = useState(false);
  const [showWind, setShowWind] = useState(true);
  const [showBearings, setShowBearings] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const stations = useStations();
  const [mapInstance, setMapInstance] = useState<MapInstance | null>(null);
  // Demo: an archived day of 2025 with the fires the satellite actually detected that day, in place of live items.
  const [demo, setDemo] = useState(false); const [showForecast, setShowForecast] = useState(true); const [showFires, setShowFires] = useState(true); const [compare, setCompare] = useState<Compare>('all'); const [forest, setForest] = useState(0); const [showCells, setShowCells] = useState(false); const [showOutlines, setShowOutlines] = useState(false); const [showForest, setShowForest] = useState(true); const [demoDate, setDemoDate] = useState<string | null>(null);
  const demoDates = useDates('archive');
  const demoDay = demo ? demoDate ?? (demoDates.data ? (demoDates.data.dates.includes('2025-03-18') ? '2025-03-18' : demoDates.data.latest) : null) : null;
  const demoForecast = useForecast(demoDay, 'archive');
  // the model's rank for every forest cell of the demo day (the same replay as the area boxes), drawn as the risk circles
  const demoCells = useQuery({ queryKey: ['demo-cells', demoDay], retry: false, enabled: demo && demoDay !== null && settings.data?.risk_forecast_enabled === true,
    queryFn: () => api<{ features: Array<{ geometry: { type: string; coordinates: any }; properties: { cell_id: number; state: string; rank_percentile: number; band: string; forest_frac?: number } }> }>(`/api/risk/geojson?target=${demoDay}`) });
  const layers = new Set(PRESETS.find(item => item.id === preset)!.layers.filter(layer => canShow('control_room', layer)));

  // Satellite basemap toggle
  const satelliteEnabled = import.meta.env.VITE_SATELLITE_BASEMAP === 'true';
  const satelliteTileUrl = import.meta.env.VITE_SATELLITE_TILE_URL as string | undefined;
  const satelliteAttribution = import.meta.env.VITE_SATELLITE_ATTRIBUTION as string | undefined;
  const hillshadeTileUrl = import.meta.env.VITE_HILLSHADE_TILE_URL as string | undefined;
  
  const [basemapType, setBasemapType] = useState<'map' | 'satellite'>(() => {
    if (!satelliteEnabled) return 'map';
    try {
      const stored = localStorage.getItem('resq_basemap_pref');
      return stored === 'satellite' && satelliteTileUrl ? 'satellite' : 'map';
    } catch {
      return 'map';
    }
  });

  const [satelliteFailed, setSatelliteFailed] = useState(false);

  const currentBasemapStyle = useMemo(() => {
    if (basemapType === 'satellite' && satelliteTileUrl && satelliteAttribution) {
      return satelliteStyle(satelliteTileUrl, satelliteAttribution, undefined, undefined, hillshadeTileUrl);
    }
    // Return null for default basemap - MapView will use its own basemapStyle()
    return null;
  }, [basemapType, satelliteTileUrl, satelliteAttribution, hillshadeTileUrl]);

  useEffect(() => {
    if (!satelliteEnabled) return;
    try {
      localStorage.setItem('resq_basemap_pref', basemapType);
    } catch {
      // localStorage may be unavailable
    }
  }, [basemapType, satelliteEnabled]);

  useEffect(() => {
    if (basemapType === 'satellite' && !navigator.onLine) {
      setSatelliteFailed(true);
      setBasemapType('map');
      try {
        localStorage.removeItem('resq_basemap_pref');
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [basemapType]);

  const chosen = (communities.data?.items ?? []).find(c => c.slug === region);
  const box = chosen ? communityBox(chosen) : [74, 15.6, 87.9, 26.9] as [number, number, number, number];
  const signals = useQuery({ queryKey: ['map-hotspots', box.join(), hours], retry: false, enabled: layers.has('signals'), queryFn: () => api<{ items: Hotspot[]; freshness: Freshness }>(`/api/hotspots?min_lon=${box[0]}&min_lat=${box[1]}&max_lon=${box[2]}&max_lat=${box[3]}&since_hours=${hours || Math.max(1, Math.ceil(minutesSinceMidnight() / 60))}`).then(r => hours ? r : { ...r, items: r.items.filter(i => i.age_minutes <= minutesSinceMidnight()) }) });
  const wind = useQuery({ queryKey: ['map-wind', region], retry: false, queryFn: () => api<Wind>(`/api/weather/context?lat=${(box[1] + box[3]) / 2}&lon=${(box[0] + box[2]) / 2}`) });
  // always the whole of India, not the current region: a grid that follows the region leaves most of the country without wind and draws a visible rectangle
  const windGrid = useQuery({
    queryKey: ['map-wind-grid', 'india'], retry: false, staleTime: 25 * 60 * 1000, refetchInterval: 30 * 60 * 1000, enabled: showWind,
    queryFn: () => api<WindGrid & { freshness: Freshness }>('/api/weather/wind-grid?min_lon=66&min_lat=5&max_lon=100&max_lat=38&n=12'),
  });

  const notices = useQuery({ queryKey: ['map-notices'], retry: false, enabled: layers.has('advisories'), queryFn: () => api<{ items: NoticeArea[] }>('/api/notices?status=published') });
  
  const riskEnabled = settings.data?.risk_forecast_enabled === true;
  const riskStatus = useQuery({
    queryKey: ['risk-status'], retry: false, refetchInterval: 10 * 60 * 1000,
    enabled: layers.has('risk_forecast') && riskEnabled,
    queryFn: () => api<RiskStatus>('/api/risk/status'),
  });
  const latestRun = riskStatus.data?.runs.live ?? riskStatus.data?.runs.replay;
  // an operator pin wins; otherwise show the newest run the server has, not "today" (a run may not exist yet)
  const newestDate = settings.data?.risk_forecast_date || latestRun?.forecast_date || new Date().toISOString().slice(0, 10);
  // "today" = the forecast issued yesterday for today, to hold against today's detections
  const riskDate = riskDay === 'today' ? new Date(Date.parse(newestDate) - 86_400_000).toISOString().slice(0, 10) : newestDate;
  
  const riskForecast = useQuery({
    queryKey: ['risk-forecast', riskDate, riskHighOnly],
    retry: false,
    enabled: layers.has('risk_forecast') && riskEnabled,
    queryFn: () => api<{ type: string; run?: RiskRun; features: Array<{ type: string; geometry: { type: string; coordinates: any }; properties: { cell_id: number; state: string; rank_percentile: number; band: string; forest_frac?: number } }> }>(`/api/risk/geojson?target=${riskDate}${riskHighOnly ? '&risk_band=high' : ''}`),
  });

  const shown = useMemo(() => (incidents.data ?? []).filter(item => (!region || item.community_slug === region) && item.latitude != null && item.longitude != null && (item.status === 'closed' ? false : withinHours(item.created_at, hours))), [incidents.data, region, hours]);
  const livePoints: MapPoint[] = useMemo(() => [
    ...shown.filter(item => item.status === 'reported' ? layers.has('reports') : layers.has('incidents')).map(item => ({ id: `i${item.id}`, lat: item.latitude!, lon: item.longitude!, symbol: SYMBOL_OF_RUNG[rungOfStatus(item.status)], label: `#${item.id}` })),
    ...(showStations ? (stations.data?.items ?? []).filter(x => (!region || true) && x.latitude != null).map(x => ({ id: `t${x.id}`, lat: x.latitude, lon: x.longitude, symbol: symbolOf(x), label: x.name })) : []),
    ...(layers.has('signals') ? (signals.data?.items ?? []).map(item => ({ id: `s${item.id}`, lat: item.latitude, lon: item.longitude, symbol: 'signal' as const, ageMinutes: item.age_minutes })) : []),
  ], [shown, signals.data, layers, showStations, stations.data, region]);
  const riskCells = useMemo(() => {
    const source = demo ? (showCells ? demoCells.data : undefined) : (layers.has('risk_forecast') && riskEnabled ? riskForecast.data : undefined);
    if (!source?.features) return [];
    return source.features.filter(f => (f.properties.forest_frac ?? 1) >= forest).map(f => ({
      id: f.properties.cell_id,
      ...cellCentre(f.geometry),
      rank_percentile: f.properties.rank_percentile,
      band: f.properties.band,
      state: f.properties.state,
    }));
  }, [demo, showCells, demoCells.data, layers, riskEnabled, riskForecast.data, forest]);
  type Bearings = { label: string; wedges: Array<{ incident_id: number; coords: Array<[number, number]> }>; areas: Array<{ incident_ids: number[]; count: number; area_km2: number; coords: Array<[number, number]> }> };
  const bearings = useQuery({ queryKey: ['report-bearings', 6], retry: false, staleTime: 30_000, refetchInterval: 60_000, enabled: showBearings, queryFn: () => api<Bearings>('/api/bearings?since_hours=6') });
  const bearingPolygons: MapPolygon[] = useMemo(() => showBearings && bearings.data ? [
    ...bearings.data.wedges.map(w => ({ id: `bw${w.incident_id}`, ring: w.coords, tone: 'envelope' as const })),
    ...bearings.data.areas.map((a, i) => ({ id: `ba${i}`, ring: a.coords, tone: 'warning' as const, label: t('map.bearing_area', { count: a.count, km: a.area_km2, defaultValue: '{{count}} reports point here (about {{km}} km²)' }) })),
  ] : [], [bearings.data, showBearings, t]);
  const livePolygons: MapPolygon[] = useMemo(() => [...bearingPolygons, ...(layers.has('advisories') ? (notices.data?.items ?? []) : []).filter(item => item.area_geojson?.coordinates?.[0]).map(item => ({ id: `n${item.id}`, ring: item.area_geojson!.coordinates[0] as Array<[number, number]>, tone: item.severity === 'warning' ? 'warning' as const : 'advisory' as const, label: item.title }))], [notices.data, layers, bearingPolygons]);
  const demoFire = demo ? demoForecast.data : undefined;
  const points = useMemo<MapPoint[]>(() => (demo ? (demoFire && showFires ? fireMarks(demoFire, demoFire.areas.filter(a => matchesCompare(a, compare)), forest) : []) : livePoints), [demo, demoFire, showFires, compare, forest, livePoints]);
  // the forecast where the model scored: forest cells shaded by their area's level; the 55 km outlines are optional, and are the fallback when the cells are not available
  const demoAreas = useMemo(() => (demoFire ? demoFire.areas.filter(a => matchesCompare(a, compare)) : []), [demoFire, compare]);
  const demoCellList = useMemo(() => (demoCells.data?.features ?? []).map(f => ({ ...cellCentre(f.geometry), forest: f.properties.forest_frac ?? null })), [demoCells.data]);
  const polygons = useMemo<MapPolygon[]>(() => {
    if (!demo) return livePolygons;
    if (!demoFire && !demoCellList.length) return [];
    const cells = demoCellList.length ? cellPolygons(demoCellList, demoAreas, forest) : [];
    return [...(showForest ? forestPolygons(demoCellList, forest) : []), ...(showForecast ? (cells.length ? cells : areaPolygons(demoAreas)) : []), ...(showOutlines && cells.length ? areaPolygons(demoAreas) : [])];
  }, [demo, demoFire, demoAreas, demoCellList, showForecast, showOutlines, showForest, forest, livePolygons]);
  const bounds = useMemo(() => boundsOf(demo ? [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }] : points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: box[1], lon: box[0] }, { lat: box[3], lon: box[2] }]), [points, box]);

  const selectedIncident: Incident | undefined = selected?.startsWith('i') ? incidents.data?.find(item => item.id === Number(selected.slice(1))) : undefined;
  const selectedStation = selected?.startsWith('t') ? stations.data?.items.find(item => item.id === Number(selected.slice(1))) : undefined;
  const selectedSignal = selected?.startsWith('s') ? signals.data?.items.find(item => item.id === Number(selected.slice(1))) : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <PageTitle title={t('nav.map')} subtitle={chosen ? chosen.name : t('ops.all_communities', 'All communities')} actions={<div role="group" aria-label={t('map.view', 'View')} className="inline-flex rounded-rq border border-control p-1">{(['map', 'list'] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-11 rounded-rq px-4 font-semibold ${view === item ? 'bg-action text-on-action' : ''}`}>{item === 'map' ? t('map.map', 'Map') : t('map.list', 'List')}</button>)}</div>} />
      <div className="grid gap-3 rounded-panel border border-line bg-surface p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('map.mode', 'Data')}</p><div role="group" aria-label={t('map.mode', 'Data')} className="inline-flex rounded-rq border border-control p-1">{([false, true] as const).map(on => <button key={String(on)} type="button" aria-pressed={demo === on} onClick={() => { setDemo(on); setSelected(null); }} className={`min-h-11 rounded-rq px-4 font-semibold ${demo === on ? 'bg-ink text-surface' : ''}`}>{on ? t('map.mode_demo', 'Demo (archive)') : t('map.mode_live', 'Live')}</button>)}</div></div>
        {demo && demoDates.data && <label className="mt-5 text-sm">{t('map.demo_day', 'Day')} <select value={demoDay ?? ''} onChange={e => setDemoDate(e.target.value)} className="min-h-11 rounded-rq border border-control bg-surface px-2">{demoDates.data.dates.map(d => <option key={d} value={d}>{d}</option>)}</select></label>}
        {(demo || (layers.has('risk_forecast') && riskEnabled)) && <label className="mt-5 text-sm">{t('map.forest_cells', 'Forest cells')} <select value={forest} onChange={e => setForest(Number(e.target.value))} className="min-h-11 rounded-rq border border-control bg-surface px-2">{FOREST_STEPS.map(x => <option key={x} value={x}>{forestName(x, (k, d, o) => t(k, { defaultValue: d, ...o }))}</option>)}</select></label>}
        {demo && <label className="mt-5 text-sm">{t('forecast.compare', 'Compare')} <select value={compare} onChange={e => setCompare(e.target.value as Compare)} className="min-h-11 rounded-rq border border-control bg-surface px-2">{COMPARE.map(c => <option key={c} value={c}>{compareName(c, (k, d, o) => t(k, { defaultValue: d, ...o }))}</option>)}</select></label>}
        {demo && <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm"><input type="checkbox" checked={showForest} onChange={e => setShowForest(e.target.checked)} className="h-4 w-4" /><span>{t('map.demo_forest', 'Forest cells')}</span></label>}
        {demo && <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm"><input type="checkbox" checked={showCells} onChange={e => setShowCells(e.target.checked)} className="h-4 w-4" /><span>{t('map.demo_cells', 'Rank circles (model rank)')}</span></label>}
        {demo && <><label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm"><input type="checkbox" checked={showForecast} onChange={e => setShowForecast(e.target.checked)} className="h-4 w-4" /><span>{t('map.demo_forecast', 'Forecast (model output)')}</span></label>
          <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm"><input type="checkbox" checked={showOutlines} onChange={e => setShowOutlines(e.target.checked)} className="h-4 w-4" /><span>{t('map.demo_outlines', 'Outline the 55 km areas')}</span></label>
          <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm"><input type="checkbox" checked={showFires} onChange={e => setShowFires(e.target.checked)} className="h-4 w-4" /><span>{t('map.demo_fires', 'Fires detected')}</span></label></>}
        {demo && <div className="space-y-1 sm:col-span-2 xl:col-span-4" role="status">
          <p className="rounded-rq border border-line px-3 py-2 text-sm">{t('map.demo_note', 'Demo: a past day of 2025. The shaded squares are the forest cells the model scored, shaded by the level of their 55 km area as it was rated the day before; red diamonds are forest squares (about 10 km) where the satellite then actually detected a fire. Live items are hidden.')}</p>
          {demoCells.isError && showCells && <Notice kind="warning">{t('map.demo_cells_off', 'The forest cells could not be loaded (the risk layer may be switched off on this server).')}</Notice>}
          {demoDates.isError || demoForecast.isError ? <Notice kind="warning">{t('map.demo_off', 'The archive could not be loaded.')}</Notice> : demoFire && <p className="text-sm">{outcomeWords(demoFire.outcome, demoFire.date, (k, d, o) => t(k, { defaultValue: d, ...o }))}</p>}
          {typicalWords(demoDates.data?.typical, (k, d, o) => t(k, { defaultValue: d, ...o })) && <p className="text-sm text-ink-muted">{typicalWords(demoDates.data?.typical, (k, d, o) => t(k, { defaultValue: d, ...o }))}</p>}
        </div>}
        <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('map.preset', 'What to show')}</p><div role="group" aria-label={t('map.preset', 'What to show')} className="inline-flex max-w-full rounded-rq border border-control p-1">{PRESETS.map(item => <button key={item.id} type="button" aria-pressed={preset === item.id} onClick={() => setPreset(item.id)} className={`min-h-11 rounded-rq px-4 font-semibold ${preset === item.id ? 'bg-action text-on-action' : ''}`}>{t(`map.preset.${item.id}`, item.label)}</button>)}</div></div>
        <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('map.window', 'Time window')}</p><div role="group" aria-label={t('map.window', 'Time window')} className="inline-flex max-w-full rounded-rq border border-control p-1">{TIME_WINDOWS.map(item => <button key={item} type="button" aria-pressed={hours === item} onClick={() => setHours(item)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === item ? 'bg-action text-on-action' : ''}`}>{item ? `${item} h` : t('map.today', 'Today')}</button>)}</div></div>
        {satelliteEnabled && (
          <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{t('basemap.label', 'Basemap')}</p><div role="radiogroup" aria-label={t('basemap.label', 'Basemap')} className="inline-flex rounded-rq border border-control p-1">
            <button key="map" type="button" role="radio" aria-checked={basemapType === 'map'} onClick={() => setBasemapType('map')} className={`min-h-11 rounded-rq px-4 font-semibold ${basemapType === 'map' ? 'bg-action text-on-action' : ''}`}>{t('basemap.map', 'Map')}</button>
            <button key="satellite" type="button" role="radio" aria-checked={basemapType === 'satellite'} onClick={() => setBasemapType('satellite')} className={`min-h-11 rounded-rq px-4 font-semibold ${basemapType === 'satellite' ? 'bg-action text-on-action' : ''}`}>{t('basemap.satellite', 'Satellite')}</button>
          </div></div>
        )}
        <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm">
          <input type="checkbox" checked={showWind} onChange={(e) => setShowWind(e.target.checked)} className="h-4 w-4" />
          <span>{t('map.wind_flow', 'Animated wind')}</span>
        </label>
        <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm">
          <input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} className="h-4 w-4" />
          <span>{t('map.stations', 'Lookout stations')}</span>
        </label>
        <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm">
          <input type="checkbox" checked={showBearings} onChange={(e) => setShowBearings(e.target.checked)} className="h-4 w-4" />
          <span>{t('map.bearings', 'Where reports point')}</span>
        </label>
        {showBearings && bearings.data && <p role="status" className="text-sm text-ink-muted sm:col-span-2 xl:col-span-4">{bearings.data.wedges.length === 0 ? t('map.bearings_none', 'No recent reports with a direction.') : `${t('map.bearings_count', { count: bearings.data.wedges.length, areas: bearings.data.areas.length, defaultValue: '{{count}} recent reports with a direction, {{areas}} areas where they agree.' })} ${bearings.data.label}`}</p>}
        {!demo && layers.has('risk_forecast') && riskEnabled && (
          <div role="group" aria-label={t('map.risk_day', 'Forecast day')} className="mt-5 inline-flex rounded-rq border border-control p-1">{(['today', 'tomorrow'] as const).map(d => <button key={d} type="button" aria-pressed={riskDay === d} onClick={() => setRiskDay(d)} className={`min-h-11 rounded-rq px-4 font-semibold ${riskDay === d ? 'bg-action text-on-action' : ''}`}>{d === 'today' ? t('map.risk_today', 'Forecast for today') : t('map.risk_tomorrow', 'Forecast for tomorrow')}</button>)}</div>
        )}
        {!demo && layers.has('risk_forecast') && riskEnabled && (
          <label className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-3 py-2 text-sm">
            <input type="checkbox" checked={riskHighOnly} onChange={(e) => setRiskHighOnly(e.target.checked)} className="h-4 w-4" />
            <span>{t('map.risk_high_only', 'High risk only')}</span>
          </label>
        )}
        {!demo && layers.has('risk_forecast') && riskEnabled && <RiskRunChip run={riskForecast.data?.run} status={riskStatus.data} error={riskStatus.isError} />}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4"><Chip label={t('map.satellite', 'Satellite')} freshness={signals.data?.freshness} status={!layers.has('signals') ? 'off' : signals.isError ? 'error' : signals.isLoading ? 'loading' : 'ok'} /><Link to="/ops/satellite" className="text-sm font-semibold underline">{t('map.satellite_list', 'All satellite detections')}</Link><Chip label={t('map.weather', 'Weather')} freshness={wind.data?.freshness} status={wind.isError ? 'error' : wind.isLoading ? 'loading' : 'ok'} /></div>
      </div>
      {showWind && <WindLayer map={mapInstance} grid={windGrid.data} onSatellite={basemapType === 'satellite'} />}
      {wind.data && typeof wind.data.wind_speed_ms === 'number' && <p className="text-sm" role="status">{t('map.wind', { speed: wind.data.wind_speed_ms.toFixed(1), dir: Math.round(wind.data.wind_dir_deg), defaultValue: 'Wind {{speed}} m/s from {{dir}}°' })} · {t('map.read_at', 'read')} {formatWhen(wind.data.valid_time)}</p>}
      {wind.isLoading && <p role="status" className="text-sm text-ink-muted">{t('map.loading_weather', 'Updating weather…')}</p>}
      {wind.isError && <Notice kind="warning">{t('map.weather_off', 'Weather is not available right now.')}</Notice>}
      {signals.isError && layers.has('signals') && <Notice kind="warning">{t('map.signals_off', 'Satellite signals are not available right now.')}</Notice>}
      {notices.isError && layers.has('advisories') && <Notice kind="warning">{t('map.advisories_off', 'Advisories are not available right now.')}</Notice>}
      {riskForecast.isError && layers.has('risk_forecast') && riskEnabled && <LoadError message={t('map.risk_off', 'The risk layer could not be loaded.')} onRetry={() => void riskForecast.refetch()} retryLabel={t('citizen.retry', 'Try again')} />}
      {satelliteFailed && <Notice kind="warning">{t('basemap.offline_notice', 'Satellite tiles are not available offline. Switching to map.')}</Notice>}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className={`relative ${view === 'list' ? 'hidden lg:block' : ''}`}>
          <MapView onMapReady={setMapInstance} label={t('nav.map')} points={points} polygons={polygons} riskCells={riskCells} selectedId={selected} onSelect={setSelected} bounds={bounds} className="h-[62vh] min-h-96" basemapStyle={currentBasemapStyle} />
          {selectedIncident && (
            <section aria-label={t('map.selected', 'Selected')} data-testid="selected" className="absolute inset-x-2 bottom-2 z-10 max-h-[85%] overflow-auto rounded-panel border border-line bg-surface p-4 shadow-lg md:inset-x-auto md:left-3 md:w-[26rem]">
              <button type="button" onClick={() => setSelected(null)} aria-label={t('map.close', 'Close')} className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full border border-line bg-surface text-xl leading-none">×</button>
              <IncidentPreview basic={selectedIncident} />
            </section>)}
        </div>
        <div className="space-y-3">
          {demo ? <ForecastLegend cells={showCells} forest={showForest} /> : <Legend kinds={['signal', 'station_ok', 'station_high', 'station_off', 'report', 'verified', 'responding', 'contained']} showRisk={layers.has('risk_forecast') && riskEnabled} />}
          {selectedStation && (
            <section aria-label={t('map.selected', 'Selected')} className="rounded-panel border border-line bg-surface p-4" data-testid="selected">
              <h2 className="text-xl">{selectedStation.name}</h2>
              <p className="mt-2">{statementWords(selectedStation, (k, d, o) => t(k, { defaultValue: d, ...o }))}</p>
              <p className="mt-2"><Link to={`/ops/stations/${selectedStation.id}`} className="font-semibold underline">{t('map.station_open', 'Open the station')}</Link></p>
            </section>)}
          {selectedSignal && (
            <section aria-label={t('map.selected', 'Selected')} className="rounded-panel border border-line bg-surface p-4" data-testid="selected">
              <h2 className="text-xl"><RungBadge rung="signal" age={ageText(selectedSignal.acq_datetime)} /></h2>
              <p className="mt-2 text-sm text-ink-muted">{selectedSignal.satellite} · {formatWhen(selectedSignal.acq_datetime)}</p>
              <p className="mt-1">{t('map.signal_note', 'Heat seen from space. It is not a confirmed fire until staff check it.')}</p>
            </section>)}
        </div>
      </div>

      <section aria-labelledby="map-list-title" className={view === 'map' ? 'sr-only' : ''} data-testid="map-list">
          <h2 id="map-list-title" className="mb-2 text-xl">{t('map.same_items', 'The same items as a list')}</h2>
          {!points.length ? <p className="text-ink-muted">{t('map.none', 'Nothing in this view.')}</p> : <ul className="space-y-2">{points.slice(0, 300).map(point => <li key={point.id}><button type="button" onClick={() => { setSelected(point.id); setView('map'); }} className="flex min-h-11 w-full items-center gap-3 rounded-rq border border-line bg-surface px-3 text-left">{point.id.startsWith('seen-') ? `${t('map.fire_seen', 'Fire detected')} · ${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}` : point.id.startsWith('t') ? (point.label ?? point.id) : point.id.startsWith('i') ? `#${point.id.slice(1)} · ${t(`rung.${rungOfStatus(incidents.data?.find(item => item.id === Number(point.id.slice(1)))?.status)}`)}` : `${t('rung.signal')} · ${ageText(signals.data?.items.find(item => `s${item.id}` === point.id)?.acq_datetime)}`}</button></li>)}</ul>}
      </section>
      <p className="text-sm text-ink-muted">{t('map.communities', 'Communities:')} {(communities.data?.items ?? []).map(c => c.name).join(', ')}.</p>
    </div>
  );
}
