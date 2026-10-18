import { AlertTriangle, Download, Pause, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { LogoLoader } from '../../ui/Loading';
import { useOpsSettings } from '../ops/useOps';
import { MapView, type MapLine } from '../map/MapView';
import { satelliteStyle, whatifTerrainStyle } from '../map/style';
import type { MapPoint } from '../map/geojson';
import { AREAS, DEFAULT_AREA } from './whatif/areas.ts';
import { assetRows, formatHours, reachKm, type AssetRow } from './whatif/assets.ts';
import { composeExport } from './whatif/exportImage.ts';
import { pushPoint, rasterFireLines, type Cell } from './whatif/fireline.ts';
import { checkIgnition, MAX_IGNITIONS, nudge, snapIgnition, type IgnitionRefusal } from './whatif/ignition.ts';
import { cellCentre, imageQuad, lonLatToCell, packBounds } from './whatif/layout.ts';
import { burnedAreaKm2 } from './whatif/mtt.ts';
import { buildNote, DISCLAIMER } from './whatif/note.ts';
import { createOverlay, OVERLAY_SCALE, paintRun, type LineStyle } from './whatif/overlay.ts';
import { PackError } from './whatif/pack.ts';
import { loadPack, type LoadedPack } from './whatif/packLoader.ts';
import { legendTicks, readRampStops, readTokenColor, rampColor, type RGB } from './whatif/ramp.ts';
import { hillshade, terrainPixels } from './whatif/hillshade.ts';
import { MAP_VIEWS, readView, safeStorage, satelliteConfig, writeView, type MapViewId } from './whatif/mapView.ts';
import { readDarkTokens } from './whatif/viewTokens.ts';
import { SimClient } from './whatif/simClient.ts';
import type { SimResult } from './whatif/types.ts';
import { CASE_IDS, compassName, headBearing, neighboursFor, normaliseDeg, round1, STRONG_WIND_KMH, type WindCase } from './whatif/wind.ts';
import { WindControl } from './WindControl';

const MAX_HOURS = [6, 12, 24, 48] as const;
const SPEEDS = [0.5, 1, 2, 4] as const;
const CASE_TOKEN = ['unconfirmed', 'danger', 'ok'] as const;
const CASE_STYLE: LineStyle[] = ['solid', 'dashed', 'dotted'];
const CASE_BORDER = ['solid', 'dashed', 'dotted'] as const;
const INPUT = 'mt-1 block w-full min-h-11 rounded-rq border border-control bg-surface px-3 py-2 text-base text-ink';
const DEFAULT_WIND: WindCase = { speedKmh: 10, fromDeg: 270, shift: null };

/** `for` is the set of inputs the run was made from: a run is current only while it is the live set. */
type Run = { status: 'idle' | 'running' | 'ok' | 'error'; arrivalH: Float32Array | null; message?: string; skipped?: number; inputKey?: string };
type Say = { kind: 'info' | 'warning' | 'danger' | 'success'; text: string } | null;
type MapLike = { getCenter(): { lat: number; lng: number }; getCanvas(): HTMLCanvasElement; triggerRepaint(): void };

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Control Room only, and only while the Scenario setting is on. Everything runs in this browser from static area files: no incident, alert, assignment or public map is read or written. */
export function WhatIfPage() {
  const { t } = useTranslation();
  const settings = useOpsSettings();
  const [areaId, setAreaId] = useState(DEFAULT_AREA);
  const [load, setLoad] = useState<{ status: 'loading' } | { status: 'ready'; pack: LoadedPack } | { status: 'error'; message: string }>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    loadPack(areaId).then(pack => { if (alive) setLoad({ status: 'ready', pack }); }).catch((e: unknown) => {
      if (!alive) return;
      const code = e instanceof PackError ? e.code : 'unknown';
      const why: Record<string, string> = {
        network: t('whatif.err_network', 'The files could not be fetched. Check the connection.'),
        not_found: t('whatif.err_missing', 'The files for this area are not available yet.'),
        bad_manifest: t('whatif.err_manifest', 'The area description could not be read.'),
        hash_mismatch: t('whatif.err_hash', 'A file did not match its checksum, so it was not used.'),
        size_mismatch: t('whatif.err_size', 'A file has the wrong size, so it was not used.'),
      };
      setLoad({ status: 'error', message: why[code] ?? t('whatif.err_unknown', 'The area could not be loaded.') });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  if (settings.isPending) return <LogoLoader label={t('common.loading', 'Loading…')} />;
  if (settings.data?.scenario_enabled !== true) {
    return <EmptyState title={t('whatif.off_title', 'What-if fire spread is not switched on')}>{t('whatif.off_body', 'An administrator can turn on the scenario tools for this deployment.')}</EmptyState>;
  }

  const chosen = AREAS.find(a => a.id === areaId);
  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-4">
      <PageTitle title={t('whatif.title', 'What-if fire spread')} subtitle={t('whatif.subtitle', 'Place an ignition, set the wind and see how a fire could grow over real terrain, and which villages and roads it could reach. A planning and training aid.')} />
      <Disclaimer />
      <Card title={t('whatif.area', 'Area')} className="max-w-3xl">
        <div className="max-w-md">
          <SelectField label={t('whatif.area_pick', 'Area')} value={areaId} onChange={e => setAreaId(e.target.value)}>
            {AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
        </div>
        {load.status === 'loading' && <div className="mt-3"><LogoLoader compact label={t('whatif.loading', 'Loading the area files…')} /></div>}
        {load.status === 'error' && <Notice kind="danger" className="mt-3" title={t('whatif.err_title', 'This area could not be loaded')}>{t('whatif.err_body', '“{{name}}”: {{why}} Choose another area from the list.', { name: chosen?.name ?? areaId, why: load.message })}</Notice>}
      </Card>
      {load.status === 'ready' && <Workspace key={load.pack.id} pack={load.pack} />}
    </div>
  );
}

function Disclaimer() {
  const { t } = useTranslation();
  return (
    <div role="note" data-testid="disclaimer" className="sticky top-14 z-20 flex gap-3 rounded-rq border border-warn/40 border-l-4 border-l-warn bg-warn-tint p-3 text-sm text-ink shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <AlertTriangle aria-hidden="true" size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <p>{t('whatif.disclaimer', DISCLAIMER)}</p>
    </div>
  );
}

function Workspace({ pack }: { pack: LoadedPack }) {
  const { t } = useTranslation();
  const { grid, manifest, assets } = pack;
  const layout = manifest.layout;
  const W = grid.width, H = grid.height;

  const [ignitions, setIgnitions] = useState<Cell[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cases, setCases] = useState<WindCase[]>([DEFAULT_WIND]);
  const [active, setActive] = useState(0);
  const [maxHours, setMaxHours] = useState<number>(24);
  const [hour, setHour] = useState(6);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [lines, setLines] = useState<Cell[][]>([]);
  const [draft, setDraft] = useState<Cell[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [say, setSay] = useState<Say>(null);
  const [runs, setRuns] = useState<Run[]>([{ status: 'idle', arrivalH: null }, { status: 'idle', arrivalH: null }, { status: 'idle', arrivalH: null }]);
  const [showMapAssets, setShowMapAssets] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const sat = useMemo(() => satelliteConfig(import.meta.env as Record<string, string | boolean | undefined>), []);
  const [view, setViewState] = useState<MapViewId>(() => readView(safeStorage(), sat !== null));
  const setView = (v: MapViewId) => { setViewState(v); writeView(safeStorage(), v); };
  const [terrainUrl, setTerrainUrl] = useState<string | null>(null);
  const mapRef = useRef<MapLike | null>(null);
  const draftRef = useRef<Cell[]>([]);
  draftRef.current = draft;
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = W * OVERLAY_SCALE; c.height = H * OVERLAY_SCALE; return c; }, [W, H]);

  const fireMask = useMemo(() => rasterFireLines(lines, W, H), [lines, W, H]);
  const clients = useMemo(() => CASE_IDS.map(() => new SimClient(grid)), [grid]);
  useEffect(() => () => clients.forEach(c => c.dispose()), [clients]);
  useEffect(() => {
    const bump = () => setThemeTick(n => n + 1);
    window.addEventListener('tw-theme', bump);
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', bump);
    return () => { window.removeEventListener('tw-theme', bump); mq.removeEventListener('change', bump); };
  }, []);

  // Re-run when anything that matters changes, after a short pause so typing a number does not start a run per key.
  const inputKey = useMemo(() => JSON.stringify({ ignitions, cases, maxHours, lines }), [ignitions, cases, maxHours, lines]);
  useEffect(() => {
    if (ignitions.length === 0) { setRuns(r => r.map(x => ({ ...x, status: 'idle', arrivalH: null, message: undefined, inputKey: undefined }))); return; }
    const timer = setTimeout(() => {
      cases.forEach((wind, idx) => {
        setRuns(r => r.map((x, i) => (i === idx ? { ...x, status: 'running' } : x)));
        void clients[idx].run({ ignitions, wind, maxHours, fireLines: fireMask }).then(outcome => {
          if (!outcome) return;
          setRuns(r => r.map((x, i) => (i !== idx ? x : outcome.ok ? { status: 'ok', arrivalH: outcome.arrivalH, skipped: outcome.skippedIgnitions, inputKey } : { status: 'error', arrivalH: null, message: outcome.message, inputKey })));
        });
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [clients, ignitions, cases, maxHours, fireMask, inputKey]);

  useEffect(() => { setHour(h => Math.min(h, maxHours)); }, [maxHours]);

  // Play: whole hours at a time when the person prefers reduced motion.
  useEffect(() => {
    if (!playing) return;
    const reduce = prefersReducedMotion();
    const every = reduce ? 1000 : 100;
    const step = reduce ? Math.max(1, Math.round(speed)) : speed * (every / 1000);
    const id = setInterval(() => setHour(h => { const n = Math.min(maxHours, h + step); if (n >= maxHours) setPlaying(false); return n; }), every);
    return () => clearInterval(id);
  }, [playing, speed, maxHours]);

  const tx = useCallback((r: IgnitionRefusal): string => ({
    outside: t('whatif.ig_outside', 'That place is outside the area. Click inside the shaded square.'),
    not_burnable: t('whatif.ig_not_burnable', 'Fire cannot start there: the cell is water, built-up, bare ground or unmapped. Choose another place.'),
    fire_line: t('whatif.ig_fire_line', 'That cell is on a fire line, which does not burn. Choose another place.'),
    duplicate: t('whatif.ig_duplicate', 'There is already an ignition in that cell.'),
    too_many: t('whatif.ig_too_many', 'At most {{n}} ignitions can be placed. Remove one first.', { n: MAX_IGNITIONS }),
  })[r], [t]);

  const addIgnition = (cell: Cell | null) => {
    if (!cell) { setSay({ kind: 'warning', text: tx('outside') }); return; }
    const refusal = checkIgnition(grid, cell, ignitions, fireMask);
    if (refusal) { setSay({ kind: 'warning', text: tx(refusal) }); return; }
    setIgnitions(list => [...list, cell]);
    setSelected(ignitions.length);
    setSay({ kind: 'success', text: t('whatif.ig_added', 'Ignition {{n}} placed in the cell at column {{col}}, row {{row}}.', { n: ignitions.length + 1, col: cell.col, row: cell.row }) });
  };

  const finishLine = () => {
    const d = draftRef.current;
    if (d.length < 2) { setSay({ kind: 'warning', text: t('whatif.fl_short', 'A fire line needs at least two points.') }); return; }
    setLines(l => [...l, d]);
    setDraft([]);
    setDrawing(false);
    setSay({ kind: 'success', text: t('whatif.fl_done', 'Fire line added. Fire cannot cross it unless there is a gap.') });
  };

  const onMapClick = (lat: number, lon: number) => {
    if (drawing) {
      const cell = lonLatToCell(layout, lon, lat);
      if (!cell) { setSay({ kind: 'warning', text: tx('outside') }); return; }
      setDraft(d => pushPoint(d, cell));
      return;
    }
    const r = snapIgnition(grid, layout, lon, lat, ignitions, fireMask);
    if (r.ok) addIgnition(r.cell); else setSay({ kind: 'warning', text: tx(r.reason) });
  };

  const atCentre = (): Cell | null => {
    const m = mapRef.current;
    return m ? lonLatToCell(layout, m.getCenter().lng, m.getCenter().lat) : null;
  };

  const moveSelected = (dc: number, dr: number) => {
    if (selected === null) return;
    const to = nudge(ignitions[selected], dc, dr, W, H);
    if (to.col === ignitions[selected].col && to.row === ignitions[selected].row) return;
    const others = ignitions.filter((_, i) => i !== selected);
    const refusal = checkIgnition(grid, to, others, fireMask);
    if (refusal) { setSay({ kind: 'warning', text: tx(refusal) }); return; }
    setIgnitions(list => list.map((c, i) => (i === selected ? to : c)));
    setSay({ kind: 'info', text: t('whatif.ig_moved', 'Ignition {{n}} moved to column {{col}}, row {{row}}.', { n: selected + 1, col: to.col, row: to.row }) });
  };

  const onIgnitionKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const d = e.shiftKey ? 5 : 1;
    const move: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (move[k]) { e.preventDefault(); moveSelected(move[k][0], move[k][1]); }
  };

  const setCase = (idx: number, next: WindCase) => setCases(cs => cs.map((c, i) => (i === idx ? next : c)));
  const addCase = () => { if (cases.length < 3) { setCases(cs => [...cs, { ...cs[active], shift: cs[active].shift ? { ...cs[active].shift! } : null }]); setActive(cases.length); } };
  const removeCase = (idx: number) => { setCases(cs => cs.filter((_, i) => i !== idx)); setRuns(r => [...r.filter((_, i) => i !== idx), { status: 'idle', arrivalH: null }]); setActive(0); };

  // ---- derived numbers ----
  const resultOf = (run: Run): SimResult | null => (run.arrivalH ? { arrivalH: run.arrivalH, maxHours, reachedCells: 0, engine: '', width: W, height: H } : null);
  const metrics = cases.map((c, i) => {
    const res = resultOf(runs[i]);
    if (!res) return null;
    const reach = reachKm(res.arrivalH, W, H, grid.cellSizeM, ignitions, hour, headBearing(c.fromDeg));
    return { burned: burnedAreaKm2(res, grid, hour), ...reach };
  });
  const rowsPerCase = useMemo<AssetRow[][]>(() => cases.map((_, i) => (runs[i].arrivalH ? assetRows(assets, runs[i].arrivalH!, W, H, maxHours) : [])), [cases, runs, assets, W, H, maxHours]);
  const here = metrics[active];
  const hasVillages = assets.some(a => a.kind === 'village');
  const fireLinedIgnitions = ignitions.filter(c => fireMask[c.row * W + c.col]).length;
  const stops = useMemo(() => readRampStops(), [themeTick]);
  const tok = useMemo(() => readDarkTokens(), [themeTick]);
  const bright = view !== 'light';                       // dark terrain and satellite share the bright fire colours and dark-rimmed symbols
  const shade = useMemo(() => hillshade(grid.elevationM, W, H, grid.cellSizeM), [grid, W, H]);
  const hillshadeTileUrl = import.meta.env.VITE_HILLSHADE_TILE_URL as string | undefined;
  const mapStyle = useMemo(() => (view === 'dark' ? whatifTerrainStyle(tok.terrain) : view === 'satellite' && sat ? satelliteStyle(sat.url, sat.attribution, undefined, sat.maxZoom, hillshadeTileUrl) : undefined), [view, tok, sat, hillshadeTileUrl]);
  const override = useMemo(() => (bright ? (tok.mapColors as never) : undefined), [bright, tok]);
  const caseColor = (i: number): RGB => (bright ? tok.cases[i] : readTokenColor(CASE_TOKEN[i]));
  const caseCss = (i: number): string => (bright ? tok.caseCss[i] : `var(--tw-${CASE_TOKEN[i]})`);

  // Hillshade and land-cover tint: computed once per pack, drawn only in the dark terrain view.
  useEffect(() => {
    if (view !== 'dark') { setTerrainUrl(null); return; }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(terrainPixels(grid.fuel, shade, { tints: tok.tints, light: tok.light, dark: tok.dark, tintAlpha: 0.32, strength: 1 }), W, H), 0, 0);
    let stale = false;
    c.toBlob(blob => { if (stale || !blob) return; const url = URL.createObjectURL(blob); setTerrainUrl(prev => { if (prev) setTimeout(() => URL.revokeObjectURL(prev), 2000); return url; }); });
    return () => { stale = true; };
  }, [view, grid, shade, tok, W, H]);

  // ---- the picture on the map ----
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const buf = createOverlay(W, H);
    const multi = cases.length > 1;
    const text = readTokenColor('text', [30, 30, 30]);
    const a = runs[active]?.arrivalH;
    if (a) paintRun(buf, a, W, H, hour, maxHours, bright
      ? { fill: { stops: tok.fire, alpha: multi ? 0.6 : 0.92, age: true }, hourLines: { rgb: tok.contour, alpha: 0.55 }, ...(multi ? {} : { outline: { rgb: tok.front, style: 'solid' as const, thickness: 1 }, glow: { rgb: tok.front, alpha: 0.28 } }) }
      : { fill: { stops, alpha: multi ? 0.5 : 0.78 }, hourLines: { rgb: text, alpha: 0.45 }, outline: multi ? undefined : { rgb: text, style: 'solid', thickness: 2 } });
    if (multi) cases.forEach((_, i) => { const r = runs[i]?.arrivalH; if (r) paintRun(buf, r, W, H, hour, maxHours, { outline: { rgb: caseColor(i), style: CASE_STYLE[i], thickness: bright ? 4 : 2 } }); });
    ctx.putImageData(new ImageData(buf, W * OVERLAY_SCALE, H * OVERLAY_SCALE), 0, 0);
    let stale = false;
    canvas.toBlob(blob => {
      if (stale || !blob) return;
      const url = URL.createObjectURL(blob);
      setOverlayUrl(prev => { if (prev) setTimeout(() => URL.revokeObjectURL(prev), 2000); return url; });
    });
    return () => { stale = true; };
  }, [canvas, runs, active, cases, hour, maxHours, stops, tok, bright, themeTick, W, H]);

  const bounds = useMemo(() => packBounds(layout), [layout]);
  const square = useMemo(() => [{ id: 'pack', ring: [layout.nw, layout.ne, layout.se, layout.sw] as Array<[number, number]>, tone: 'envelope' as const }], [layout]);
  const quad = useMemo(() => imageQuad(layout), [layout]);
  const terrain = useMemo(() => (terrainUrl ? { url: terrainUrl, coordinates: quad, opacity: 1 } : null), [terrainUrl, quad]);
  const overlay = useMemo(() => (overlayUrl ? { url: overlayUrl, coordinates: quad, opacity: 1 } : null), [overlayUrl, quad]);
  const points = useMemo<MapPoint[]>(() => [
    // A village the fire could reach by the selected time gets a round marker with the hour; the others stay square. Shape, not colour, tells them apart.
    ...assets.filter(a => a.kind === 'village').map(a => { const h = rowsPerCase[active]?.find(r => r.asset.id === a.id && r.asset.kind === 'village')?.hours ?? null; const hit = h !== null && h <= hour; return { id: `v-${a.id}`, lat: a.lonlat[1], lon: a.lonlat[0], symbol: hit ? ('verified' as const) : ('officer' as const), label: hit ? `${a.name || assetKind(t, 'village')} · ${formatHours(h!)} h` : a.name }; }),
    ...ignitions.map((c, i) => { const [lon, lat] = cellCentre(layout, c.col, c.row); return { id: `ign-${i}`, lat, lon, symbol: 'signal' as const, label: t('whatif.ignition_n', 'Ignition {{n}}', { n: i + 1 }) }; }),
  ], [assets, ignitions, layout, t, rowsPerCase, active, hour]);
  const mapLines = useMemo<MapLine[]>(() => [
    ...(showMapAssets ? assets.filter(a => a.kind !== 'village' && a.coords.length >= 2).map(a => ({ id: `${a.kind}-${a.id}`, coords: a.coords, tone: a.kind as 'road' | 'water' })) : []),
    ...lines.map((l, i) => ({ id: `fl-${i}`, coords: l.map(c => cellCentre(layout, c.col, c.row)), tone: 'fireline' as const })),
    ...(draft.length ? [{ id: 'draft', coords: draft.map(c => cellCentre(layout, c.col, c.row)), tone: 'draft' as const }] : []),
  ], [assets, lines, draft, layout, showMapAssets]);

  // ---- export ----
  const caseSummary = (c: WindCase) => windText(t, c);
  const downloadImage = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.triggerRepaint();
      const style = getComputedStyle(document.documentElement);
      const out = composeExport(map.getCanvas(), [
        t('whatif.export_caption', '{{area}}, {{hour}} h after ignition', { area: manifest.name, hour: round1(hour) }),
        ...cases.map((c, i) => `${CASE_IDS[i]}: ${caseSummary(c)}`),
        t('whatif.export_data', 'Data: {{sources}}', { sources: [...new Set(manifest.sources.map(s => s.name)), ...(view === 'satellite' && sat ? [sat.attribution] : [])].join('; ') }),
      ], t('whatif.disclaimer', DISCLAIMER), { background: style.getPropertyValue('--tw-surface').trim() || 'white', text: style.getPropertyValue('--tw-text').trim() || 'black' });
      const a = document.createElement('a');
      a.href = out.toDataURL('image/png');
      a.download = `whatif-${pack.id}-${Math.round(hour)}h.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setSay({ kind: 'success', text: t('whatif.export_done', 'Image saved to your downloads, with the notice on it.') });
    } catch {
      setSay({ kind: 'danger', text: t('whatif.export_fail', 'The image could not be made in this browser.') });
    }
  };

  const copyNote = async () => {
    const text = buildNote({
      areaName: manifest.name,
      ignitions: ignitions.map(c => { const [lon, lat] = cellCentre(layout, c.col, c.row); return { ...c, lon, lat }; }),
      cases: cases.map((c, i) => ({ id: CASE_IDS[i], wind: c, burnedKm2: metrics[i]?.burned ?? null, headKm: metrics[i]?.headKm ?? null, backKm: metrics[i]?.backKm ?? null })),
      hour, maxHours, fireLineCount: lines.length,
      assets: cases.flatMap((_, i) => rowsPerCase[i].filter(r => r.hours !== null).slice(0, 5).map(r => ({ caseId: CASE_IDS[i], name: r.asset.name || assetKind(t, r.asset.kind), hours: r.hours }))),
    });
    setNote(text);
    try { await navigator.clipboard.writeText(text); setSay({ kind: 'success', text: t('whatif.note_copied', 'Note copied. It is also shown below.') }); } catch { setSay({ kind: 'info', text: t('whatif.note_manual', 'Select the text below and copy it.') }); }
  };

  const running = ignitions.length > 0 && runs.slice(0, cases.length).some(r => r.status === 'running' || r.inputKey !== inputKey);
  const hasCurrentResults = ignitions.length > 0 && !running && runs.slice(0, cases.length).every(r => r.status === 'ok');
  const errored = running ? undefined : runs.slice(0, cases.length).find(r => r.status === 'error');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      {/* On wide screens the controls scroll by themselves beside the map, so the map stays in view while you draw or change the wind. */}
      <div className="space-y-4 lg:sticky lg:top-40 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:p-1">
        <Card title={t('whatif.ignition', 'Ignition')}>
          <p className="text-sm text-ink-muted">{t('whatif.ignition_help', 'Click the map to place an ignition. It snaps to a 30 m cell and only cells that can burn are accepted. You can place up to {{n}}.', { n: MAX_IGNITIONS })}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => addIgnition(atCentre())}>{t('whatif.ig_centre', 'Place ignition at map centre')}</Button>
            <Button variant="secondary" icon={<Trash2 aria-hidden="true" size={18} />} disabled={ignitions.length === 0} onClick={() => { setIgnitions([]); setSelected(null); }}>{t('whatif.ig_clear', 'Clear ignitions')}</Button>
          </div>
          {ignitions.length === 0 ? <p className="mt-3 text-sm">{t('whatif.ig_none', 'No ignition yet. Nothing is drawn until you place one.')}</p> : (
            <ul className="mt-3 space-y-2" aria-label={t('whatif.ig_list', 'Ignitions')} onKeyDown={onIgnitionKey}>
              {ignitions.map((c, i) => (
                <li key={`${c.col}-${c.row}-${i}`} className="flex items-center gap-2">
                  <button type="button" aria-pressed={selected === i} onClick={() => setSelected(i)} className={`inline-flex min-h-11 flex-1 items-center rounded-rq border px-3 text-left text-sm font-semibold ${selected === i ? 'border-action bg-action-tint' : 'border-control bg-surface hover:bg-surface-2'}`}>
                    {t('whatif.ig_item', 'Ignition {{n}}: column {{col}}, row {{row}}', { n: i + 1, col: c.col, row: c.row })}
                  </button>
                  <Button variant="secondary" aria-label={t('whatif.ig_remove', 'Remove ignition {{n}}', { n: i + 1 })} onClick={() => { setIgnitions(l => l.filter((_, k) => k !== i)); setSelected(null); }}><Trash2 aria-hidden="true" size={18} /></Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-muted">{t('whatif.ig_keys', 'With an ignition selected, the arrow keys move it one cell; hold Shift for five cells.')}</p>
          {fireLinedIgnitions > 0 && <Notice kind="warning" className="mt-2">{t('whatif.ig_on_line', '{{n}} ignition(s) sit on a fire line and are left out of the run.', { n: fireLinedIgnitions })}</Notice>}
        </Card>

        <Card title={t('whatif.wind', 'Wind')}>
          {cases.length > 1 && (
            <div role="group" aria-label={t('whatif.case_pick', 'Wind case to edit')} className="mb-3 flex flex-wrap gap-2">
              {cases.map((_, i) => <button key={i} type="button" aria-pressed={active === i} onClick={() => setActive(i)} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-rq border px-3 font-semibold ${active === i ? 'border-action bg-action text-on-action' : 'border-control bg-surface hover:bg-surface-2'}`}>{t('whatif.case_n', 'Case {{id}}', { id: CASE_IDS[i] })}</button>)}
            </div>
          )}
          <WindControl legend={cases.length > 1 ? t('whatif.case_wind', 'Wind for case {{id}}', { id: CASE_IDS[active] }) : t('whatif.wind_now', 'Wind from the start')} speedKmh={cases[active].speedKmh} fromDeg={cases[active].fromDeg} onChange={w => setCase(active, { ...cases[active], ...w })} />
          <p className="mt-2 text-xs text-ink-muted" title={t('whatif.neigh_help', 'Above {{v}} km/h the run uses 32 directions per cell instead of 16, so a wind-driven fire is not cut short at its head. It takes about twice as long.', { v: STRONG_WIND_KMH })}>{t('whatif.neigh_note', 'Directions per cell: {{n}}. Above {{v}} km/h the run uses 32 instead of 16, so a wind-driven fire is not cut short at its head. It takes about twice as long.', { n: neighboursFor(cases[active], maxHours), v: STRONG_WIND_KMH })}</p>
          <div className="mt-3">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={cases[active].shift !== null} onChange={e => setCase(active, { ...cases[active], shift: e.target.checked ? { afterH: 6, speedKmh: cases[active].speedKmh, fromDeg: cases[active].fromDeg } : null })} />
              {t('whatif.shift_on', 'The wind changes later')}
            </label>
            {cases[active].shift && (
              <div className="mt-2 space-y-2 rounded-rq border border-line p-3">
                <p className="text-sm text-ink-muted">{t('whatif.shift_help', 'Wind changes to X km/h from Y degrees after N hours.')}</p>
                <ShiftField label={t('whatif.shift_after', 'After (hours)')} value={cases[active].shift!.afterH} min={0.5} max={maxHours} step={0.5} onChange={v => setCase(active, { ...cases[active], shift: { ...cases[active].shift!, afterH: v } })} />
                <ShiftField label={t('whatif.shift_speed', 'New wind speed (km/h)')} value={cases[active].shift!.speedKmh} min={0} max={60} step={1} onChange={v => setCase(active, { ...cases[active], shift: { ...cases[active].shift!, speedKmh: v } })} />
                <ShiftField label={t('whatif.shift_dir', 'New wind from (degrees)')} value={cases[active].shift!.fromDeg} min={0} max={359} step={1} onChange={v => setCase(active, { ...cases[active], shift: { ...cases[active].shift!, fromDeg: Math.round(normaliseDeg(v)) } })} />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {cases.length < 3 && <Button variant="secondary" onClick={addCase}>{t('whatif.case_add', 'Add a wind case to compare')}</Button>}
            {cases.length > 1 && <Button variant="secondary" onClick={() => removeCase(active)}>{t('whatif.case_remove', 'Remove case {{id}}', { id: CASE_IDS[active] })}</Button>}
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t('whatif.case_help', 'Up to three wind cases share the same ignitions and fire lines. Their outlines are drawn together at the chosen time.')}</p>
        </Card>

        <Card title={t('whatif.fireline', 'Fire lines')}>
          <p className="text-sm text-ink-muted">{t('whatif.fl_help', 'A fire line is a barrier fire cannot cross. Click points on the map, then finish the line with a double-click or the Finish button. A gap of one cell lets fire through.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={drawing ? 'primary' : 'secondary'} aria-pressed={drawing} onClick={() => { setDrawing(d => !d); setDraft([]); }}>{drawing ? t('whatif.fl_stop', 'Stop drawing') : t('whatif.fl_draw', 'Draw fire line')}</Button>
            {drawing && <Button variant="secondary" onClick={() => { const c = atCentre(); if (!c) setSay({ kind: 'warning', text: tx('outside') }); else setDraft(d => pushPoint(d, c)); }}>{t('whatif.fl_centre', 'Add point at map centre')}</Button>}
            {drawing && <Button onClick={finishLine} disabled={draft.length < 2}>{t('whatif.fl_finish', 'Finish line')}</Button>}
            <Button variant="secondary" disabled={draft.length === 0 && lines.length === 0} onClick={() => { if (draft.length) setDraft(d => d.slice(0, -1)); else setLines(l => l.slice(0, -1)); }}>{t('whatif.fl_undo', 'Undo')}</Button>
            <Button variant="secondary" disabled={draft.length === 0 && lines.length === 0} onClick={() => { setDraft([]); setLines([]); }}>{t('whatif.fl_clear', 'Clear fire lines')}</Button>
          </div>
          <p className="mt-2 text-sm" role="status">{drawing ? t('whatif.fl_drawing', 'Drawing: {{n}} point(s) so far.', { n: draft.length }) : t('whatif.fl_count', 'Fire lines drawn: {{n}}', { n: lines.length })}</p>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="space-y-2" data-testid="whatif-map-block" data-view={view}>
          <div className={`rounded-rq border-l-4 p-3 text-sm font-semibold ${drawing ? 'border-action bg-action-tint' : running ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`} role="status" aria-live="polite">
            {drawing ? t('whatif.mode_draw', 'Drawing fire line: click points on the map, then finish the line.') : running ? t('whatif.results_running', 'Calculating the current scenario. The map is temporarily showing the previous result.') : ignitions.length === 0 ? t('whatif.mode_ignition', 'Place an ignition by clicking inside the outlined area.') : hasCurrentResults ? t('whatif.results_current', 'Scenario results are current for the selected inputs.') : t('whatif.results_ready', 'Scenario is ready to calculate.')}
          </div>
          <fieldset className="rounded-rq border border-line p-3">
            <legend className="px-1 text-sm font-semibold">{t('whatif.view', 'Map view')}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {MAP_VIEWS.map(v => {
                const off = v === 'satellite' && sat === null;
                return (
                  <label key={v} className={`flex min-h-11 items-center gap-2 text-sm font-semibold ${off ? 'opacity-60' : ''}`}>
                    <input type="radio" name="whatif-view" value={v} checked={view === v} disabled={off} onChange={() => setView(v)} aria-describedby={v === 'satellite' ? 'whatif-sat-help' : undefined} />
                    {v === 'dark' ? t('whatif.view_dark', 'Dark terrain') : v === 'light' ? t('whatif.view_light', 'Light') : t('whatif.view_sat', 'Satellite')}
                  </label>
                );
              })}
            </div>
            <p id="whatif-sat-help" className="text-xs text-ink-muted">{sat === null ? t('whatif.sat_off', 'Satellite is off: it needs a tile service set up for this deployment.') : hillshadeTileUrl ? t('whatif.sat_on_hillshade', '{{note}} Mapbox hillshade is enabled.', { note: sat.note }) : t('whatif.sat_on', '{{note}} Hillshade is unavailable for this deployment.', { note: sat.note })}</p>
          </fieldset>
          <div className={`rounded-panel ${drawing ? 'ring-2 ring-action' : ''}`}>
            <MapView label={t('whatif.map', 'What-if fire map')} className="h-[62vh] min-h-96" bounds={bounds} points={points} polygons={square} basemapStyle={mapStyle} colorsOverride={override} terrainOverlay={terrain} selectedId={selected === null ? null : `ign-${selected}`} onSelect={id => { if (id?.startsWith('ign-')) setSelected(Number(id.slice(4))); }} onMapClick={onMapClick} onMapDoubleClick={() => { if (drawing) finishLine(); }} doubleClickZoom={!drawing} imageOverlay={overlay} lines={mapLines} onMapReady={m => { mapRef.current = m as unknown as MapLike; }} />
          </div>
          <p className="text-xs text-ink-muted">{t('whatif.attribution', 'Data: {{sources}}', { sources: [...manifest.sources.map(s => s.attribution), ...(view === 'satellite' && sat ? [sat.attribution] : [])].join(' ') })}</p>
          <p className="text-xs text-ink-muted">{pack.integrity === 'verified' ? t('whatif.integrity_ok', 'The area files matched their checksums.') : t('whatif.integrity_skip', 'Checksums were not checked: this browser context has no crypto support.')}</p>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showMapAssets} onChange={e => setShowMapAssets(e.target.checked)} />{t('whatif.show_assets', 'Show roads and water on the map')}</label>
        </div>

        {say && <p aria-live="polite" role="status" className="text-sm text-ink-muted">{say.text}</p>}
        {errored && <Notice kind="danger" title={t('whatif.run_failed', 'The run could not finish')}>{errored.message}</Notice>}
        {(running || ignitions.length === 0) && <p role="status" className="text-sm text-ink-muted">{running ? t('whatif.running', 'Calculating…') : t('whatif.start_hint', 'Click the map or use “Place ignition at map centre” to start.')}</p>}

        <Card title={t('whatif.time', 'Time')}>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label htmlFor="whatif-hour" className="text-sm font-semibold">{t('whatif.hour', 'Hours after ignition')}: <output htmlFor="whatif-hour" data-testid="hour-out">{round1(hour)}</output></label>
              <input id="whatif-hour" type="range" min={0} max={maxHours} step={0.25} value={hour} aria-valuetext={t('whatif.hour_text', '{{h}} hours after ignition', { h: round1(hour) })} onChange={e => { setPlaying(false); setHour(Number(e.target.value)); }} className="mt-1 h-11 w-full" />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" icon={playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />} onClick={() => { if (!playing && hour >= maxHours) setHour(0); setPlaying(p => !p); }}>{playing ? t('whatif.pause', 'Pause') : t('whatif.play', 'Play')}</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField label={t('whatif.speed', 'Play speed')} value={String(speed)} onChange={e => setSpeed(Number(e.target.value))}>
                {SPEEDS.map(s => <option key={s} value={s}>{t('whatif.speed_opt', '{{s}} h per second', { s })}</option>)}
              </SelectField>
              <SelectField label={t('whatif.max_hours', 'Run length (hours)')} value={String(maxHours)} onChange={e => { setPlaying(false); setMaxHours(Number(e.target.value)); }}>
                {MAX_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
              </SelectField>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{prefersReducedMotion() ? t('whatif.reduced', 'Reduced motion is on: Play moves in whole hours, one step per second.') : t('whatif.noauto', 'Nothing plays by itself. Use Play or move the slider.')}</p>
          <Legend stops={bright ? tok.fire : stops} bright={bright} hour={hour} maxHours={maxHours} cases={cases} caseCss={caseCss} />
        </Card>

        <Card title={t('whatif.numbers', 'At {{h}} h', { h: round1(hour) })}>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t('whatif.burned', 'Burned area')} value={here && hasCurrentResults ? `${here.burned.toFixed(2)} km²` : '–'} test="burned-km2" raw={here?.burned} />
            <Stat label={t('whatif.head', 'Head reach')} value={here && hasCurrentResults ? `${here.headKm.toFixed(1)} km` : '–'} test="head-km" />
            <Stat label={t('whatif.back', 'Back reach')} value={here && hasCurrentResults ? `${here.backKm.toFixed(1)} km` : '–'} test="back-km" />
          </dl>
          <p className="mt-2 text-xs text-ink-muted">{t('whatif.reach_def', 'Reach is measured along the wind from the nearest ignition: head is downwind, back is upwind. Case {{id}} is shown.', { id: CASE_IDS[active] })}</p>
        </Card>

        <Card title={t('whatif.assets', 'Villages, roads and water')}>
          <AssetTable t={t} rows={rowsPerCase[active]} hasRun={hasCurrentResults && !!runs[active].arrivalH} assetsCount={assets.length} hasVillages={hasVillages} maxHours={maxHours} hour={hour} showAll={showAll} onToggle={() => setShowAll(s => !s)} />
        </Card>

        {cases.length > 1 && (
          <Card title={t('whatif.compare', 'Compare wind cases')}>
            <CompareTable t={t} cases={cases} metrics={hasCurrentResults ? metrics : metrics.map(() => null)} rows={rowsPerCase} hour={hour} maxHours={maxHours} />
          </Card>
        )}

        <Card title={t('whatif.share', 'Share')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download aria-hidden="true" size={18} />} disabled={running || !hasCurrentResults} onClick={downloadImage}>{t('whatif.download', 'Download image')}</Button>
            <Button variant="secondary" disabled={running || !hasCurrentResults} onClick={() => void copyNote()}>{t('whatif.copy_note', 'Copy scenario as note')}</Button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{t('whatif.share_help', 'The image holds the map as shown and the notice. Nothing is saved to the server and no incident is changed.')}</p>
          {note && <textarea readOnly aria-label={t('whatif.note_text', 'Scenario note')} value={note} rows={10} className={`${INPUT} font-mono text-sm`} />}
        </Card>

        <HowItWorks />
      </div>
    </div>
  );
}

function ShiftField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = `shift-${label.replace(/\W+/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))} className={INPUT} />
    </div>
  );
}

function Stat({ label, value, test, raw }: { label: string; value: string; test: string; raw?: number }) {
  return (
    <div className="rounded-rq border border-line p-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-2xl font-bold" data-testid={test} data-value={raw === undefined ? undefined : String(raw)}>{value}</dd>
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];
const windText = (t: T, c: WindCase): string => {
  const one = (s: number, f: number) => t('whatif.wind_text', '{{speed}} km/h from {{deg}} degrees ({{dir}})', { speed: round1(s), deg: Math.round(normaliseDeg(f)), dir: compassName(f) });
  return c.shift ? t('whatif.wind_text_shift', '{{a}}, then {{b}} after {{h}} h', { a: one(c.speedKmh, c.fromDeg), b: one(c.shift.speedKmh, c.shift.fromDeg), h: round1(c.shift.afterH) }) : one(c.speedKmh, c.fromDeg);
};
const assetKind = (t: T, kind: string): string => (kind === 'village' ? t('whatif.k_village', 'Village') : kind === 'road' ? t('whatif.k_road', 'Road') : t('whatif.k_water', 'Water'));
const assetName = (t: T, r: AssetRow): string => r.asset.name || t('whatif.unnamed', 'Unnamed {{kind}}', { kind: assetKind(t, r.asset.kind).toLowerCase() });

function timeCell(t: T, hours: number | null, maxHours: number, water: boolean) {
  if (hours === null) return t('whatif.not_reached', 'not reached in {{h}} h', { h: maxHours });
  return water ? t('whatif.could_reach_edge', 'fire could reach the edge in about {{h}} h', { h: formatHours(hours) }) : t('whatif.could_reach', 'could reach in about {{h}} h', { h: formatHours(hours) });
}

const FEW = 12;
function AssetTable({ t, rows, hasRun, assetsCount, hasVillages, maxHours, hour, showAll, onToggle }: { t: T; rows: AssetRow[]; hasRun: boolean; assetsCount: number; hasVillages: boolean; maxHours: number; hour: number; showAll: boolean; onToggle: () => void }) {
  if (assetsCount === 0) return <p>{t('whatif.assets_empty', 'This area has no villages, roads or water mapped in OpenStreetMap, so there is nothing to list. A missing feature here means it is not mapped, not that it is absent on the ground.')}</p>;
  if (!hasRun) return <p className="text-ink-muted">{t('whatif.assets_wait', 'Place an ignition to see which villages, roads and water points the fire could reach, and when.')}</p>;
  const shown = showAll ? rows : rows.slice(0, FEW);
  return (
    <div>
      {!hasVillages && <p className="mb-2 text-sm text-ink-muted">{t('whatif.no_villages', 'No villages or hamlets are mapped in this area.')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-96 border-collapse text-left text-sm">
          <caption className="sr-only">{t('whatif.assets_caption', 'Places the fire could reach, earliest first')}</caption>
          <thead><tr className="border-b border-line"><th scope="col" className="py-2 pr-3">{t('whatif.col_place', 'Place')}</th><th scope="col" className="py-2 pr-3">{t('whatif.col_kind', 'Type')}</th><th scope="col" className="py-2 pr-3">{t('whatif.col_time', 'Time')}</th><th scope="col" className="py-2">{t('whatif.col_by', 'Reached by {{h}} h', { h: round1(hour) })}</th></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={`${r.asset.kind}-${r.asset.id}`} className="border-b border-line align-top">
                <th scope="row" className="py-2 pr-3 font-semibold">{assetName(t, r)}</th>
                <td className="py-2 pr-3">{assetKind(t, r.asset.kind)}{r.asset.detail ? ` (${r.asset.detail})` : ''}</td>
                <td className="py-2 pr-3">{timeCell(t, r.hours, maxHours, r.asset.kind === 'water')}</td>
                <td className="py-2">{r.hours !== null && r.hours <= hour ? t('whatif.yes', 'Yes') : t('whatif.no', 'No')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > FEW && <Button className="mt-2" variant="ghost" onClick={onToggle}>{showAll ? t('whatif.show_fewer', 'Show fewer') : t('whatif.show_all', 'Show all {{n}}', { n: rows.length })}</Button>}
      <p className="mt-2 text-xs text-ink-muted">{t('whatif.assets_note', 'A place counts as reached when fire gets within about 60 m of it, or of the nearest point of a road. Water does not burn.')}</p>
    </div>
  );
}

function CompareTable({ t, cases, metrics, rows, hour, maxHours }: { t: T; cases: WindCase[]; metrics: Array<{ burned: number } | null>; rows: AssetRow[][]; hour: number; maxHours: number }) {
  // Assets that any case could reach, earliest first (at most six).
  const best = new Map<string, { row: AssetRow; min: number }>();
  rows.forEach(list => list.forEach(r => { if (r.hours === null) return; const k = `${r.asset.kind}-${r.asset.id}`; const cur = best.get(k); if (!cur || r.hours < cur.min) best.set(k, { row: r, min: r.hours }); }));
  const top = [...best.entries()].sort((a, b) => a[1].min - b[1].min).slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-96 border-collapse text-left text-sm">
        <caption className="sr-only">{t('whatif.compare_caption', 'Wind cases side by side')}</caption>
        <thead><tr className="border-b border-line"><th scope="col" className="py-2 pr-3">{t('whatif.col_measure', 'Measure')}</th>{cases.map((_, i) => <th key={i} scope="col" className="py-2 pr-3">{t('whatif.case_n', 'Case {{id}}', { id: CASE_IDS[i] })}</th>)}</tr></thead>
        <tbody>
          <tr className="border-b border-line"><th scope="row" className="py-2 pr-3">{t('whatif.col_wind', 'Wind')}</th>{cases.map((c, i) => <td key={i} className="py-2 pr-3">{windText(t, c)}</td>)}</tr>
          <tr className="border-b border-line"><th scope="row" className="py-2 pr-3">{t('whatif.compare_burned', 'Burned area at {{h}} h', { h: round1(hour) })}</th>{cases.map((_, i) => <td key={i} className="py-2 pr-3" data-testid={`compare-burned-${CASE_IDS[i]}`}>{metrics[i] ? `${metrics[i]!.burned.toFixed(2)} km²` : '–'}</td>)}</tr>
          {top.map(([k, v]) => (
            <tr key={k} className="border-b border-line"><th scope="row" className="py-2 pr-3">{assetName(t, v.row)}</th>{cases.map((_, i) => { const h = rows[i].find(r => `${r.asset.kind}-${r.asset.id}` === k)?.hours ?? null; return <td key={i} className="py-2 pr-3">{timeCell(t, h, maxHours, v.row.asset.kind === 'water')}</td>; })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ stops, bright, hour, maxHours, cases, caseCss }: { stops: RGB[]; bright: boolean; hour: number; maxHours: number; cases: WindCase[]; caseCss: (i: number) => string }) {
  const { t } = useTranslation();
  const css = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
  const gradient = `linear-gradient(to right, ${Array.from({ length: 11 }, (_, i) => css(rampColor(stops, i / 10))).join(', ')})`;
  const ticks = bright ? [0, round1(hour / 2), round1(hour)] : legendTicks(maxHours);
  return (
    <div data-testid="whatif-legend" className="mt-3 space-y-3">
      <div>
        <p className="text-sm font-semibold">{bright ? t('whatif.legend_age', 'How long ago the fire could have reached each place: bright yellow is just now, deep red is earliest') : t('whatif.legend_ramp', 'When the fire could arrive (hours after ignition): darker is earlier, lighter is later')}</p>
        <div aria-hidden="true" className="mt-1 h-4 w-full rounded border border-control" style={{ background: gradient }} />
        <ol className="mt-1 flex justify-between text-xs" aria-label={t('whatif.legend_ticks', 'Hour marks')}>{bright ? ticks.map((h, i) => <li key={i}>{t('whatif.ago', '{{h}} h ago', { h })}</li>) : ticks.map(h => <li key={h}>{h} h</li>)}</ol>
        <p className="mt-1 text-xs text-ink-muted">{t('whatif.legend_lines', 'Thin lines mark each {{n}} h of spread.', { n: maxHours <= 24 ? 1 : 2 })}</p>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 28 28"><path d="M14 4 24 14 14 24 4 14Z" fill="var(--tw-surface)" stroke="var(--tw-unconfirmed)" strokeWidth="2.5" strokeDasharray="3 2" /></svg>{t('whatif.leg_ignition', 'Ignition')}</li>
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 28 28"><rect x="6" y="6" width="16" height="16" fill="var(--tw-text)" /></svg>{t('whatif.leg_village', 'Village or hamlet')}</li>
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 28 28"><circle cx="14" cy="14" r="8" fill="var(--tw-danger)" /></svg>{t('whatif.leg_hit', 'Village the fire could reach by the selected time (round, with the hour)')}</li>
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="30" height="12" viewBox="0 0 30 12"><line x1="2" y1="6" x2="28" y2="6" stroke="var(--tw-text)" strokeWidth="4" strokeLinecap="round" /></svg>{t('whatif.leg_fireline', 'Fire line')}</li>
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="30" height="12" viewBox="0 0 30 12"><line x1="2" y1="6" x2="28" y2="6" stroke="var(--tw-map-road-major)" strokeWidth="2" /></svg>{t('whatif.leg_road', 'Road')}</li>
        <li className="flex items-center gap-2"><svg aria-hidden="true" width="30" height="12" viewBox="0 0 30 12"><line x1="2" y1="6" x2="28" y2="6" stroke="var(--tw-map-boundary)" strokeWidth="2.5" strokeDasharray="2 3" /></svg>{t('whatif.leg_water', 'River or water')}</li>
      </ul>
      {cases.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={t('whatif.leg_cases', 'Wind case outlines')}>
          {cases.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <svg aria-hidden="true" width="34" height="12" viewBox="0 0 34 12"><line x1="2" y1="6" x2="32" y2="6" stroke={caseCss(i)} strokeWidth="3" strokeDasharray={CASE_BORDER[i] === 'solid' ? undefined : CASE_BORDER[i] === 'dashed' ? '8 4' : '2 4'} /></svg>
              <span>{t('whatif.leg_case', 'Case {{id}}: {{style}} line', { id: CASE_IDS[i], style: CASE_BORDER[i] === 'solid' ? t('whatif.solid', 'solid') : CASE_BORDER[i] === 'dashed' ? t('whatif.dashed', 'dashed') : t('whatif.dotted', 'dotted') })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <details className="rounded-panel border border-line bg-surface p-4">
      <summary className="min-h-11 cursor-pointer text-lg font-bold">{t('whatif.how', 'How this works')}</summary>
      <div className="mt-3 max-w-3xl space-y-3 text-sm">
        <p>{t('whatif.how_1', 'The area is a grid of 30 metre cells. Each cell has a height (Copernicus DEM) and a land-cover class (ESA WorldCover) that is turned into a fuel class: trees, shrub, grass, crop, and cells that do not burn such as water, built-up and bare ground.')}</p>
        <p>{t('whatif.how_2', 'Fire spreads fastest in the direction the wind blows and uphill. Wind and slope are combined into one push, which sets how long and narrow the burned shape is. It spreads more slowly across the wind and slowest against it. Grass is quickest, shrub and crops are in between, and forest litter is slow.')}</p>
        <p>{t('whatif.how_3', 'The model finds the quickest route for the fire front from the ignition to every cell, so each cell gets an arrival time. The colour on the map is that time. Water, bare ground, built-up cells and the fire lines you draw never burn and cannot be crossed, so a continuous line stops the fire and a one-cell gap does not.')}</p>
        <p>{t('whatif.how_4', 'Each run is repeatable: the same inputs give the same result.')}</p>
        <h3 className="text-base">{t('whatif.limits', 'Measured limits')}</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('whatif.lim_1', 'With no wind the burned shape is a circle within about 3 percent.')}</li>
          <li>{t('whatif.lim_2', 'With 16 directions per cell and a wind of 8 km/h the burned area is 9 to 10 percent smaller than the exact shape, because the head is cut short. At 15 km/h the arrival time near the head can be up to 28 percent too slow; with 32 directions that falls to about 15 percent. This page uses 32 directions above 10 km/h.')}</li>
          <li>{t('whatif.lim_3', 'Spread rates are assumptions, not fitted to Indian fires. Land cover is not a fuel map: all forest is one class.')}</li>
          <li>{t('whatif.lim_4', 'Not modelled: spotting, crown fire, changes in fuel moisture, wind that changes with the day or the terrain, crews and suppression.')}</li>
          <li>{t('whatif.lim_5', 'A road, village or river missing here may simply be missing from OpenStreetMap.')}</li>
        </ul>
      </div>
    </details>
  );
}

