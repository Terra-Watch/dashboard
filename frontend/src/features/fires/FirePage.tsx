import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { Card, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { boundsOf, type MapPoint } from '../map/geojson';
import { MapView } from '../map/MapView';
import { satelliteStyle, whatifTerrainStyle } from '../map/style';
import { OUTLOOK_VIEWS, readDarkTokens, readView, safeStorage, satelliteConfig, writeView, type OutlookViewId } from '../outlook/view';
import { useCrew, useFire, useMark } from './api';
import { fireName, firePolygons, happenedWords, nearestWords, warnText, type MarkStatus } from './model';
import { StatusChip, useTt } from './parts';

const SATELLITE = satelliteConfig(import.meta.env as Record<string, string | boolean | undefined>);

/** Control room: one fire. What the satellite saw pass by pass, the places near its edge, and what to do. No prediction: where it may go is not available for live fires yet. */
export function FirePage() {
  const tt = useTt(); const nav = useNavigate(); const id = useParams().id ?? '';
  const q = useFire(id); const crew = useCrew(); const mark = useMark();
  const [upto, setUpto] = useState<number | null>(null); const [msg, setMsg] = useState('');
  const [view, setView] = useState<OutlookViewId>(() => readView(safeStorage(), !!SATELLITE)); const [playing, setPlaying] = useState(false);
  useEffect(() => { writeView(safeStorage(), view); }, [view]);
  const f = q.data; const dark = view !== 'light'; const tokens = useMemo(() => (dark ? readDarkTokens() : null), [dark]);
  const style = useMemo(() => (view === 'dark' && tokens ? whatifTerrainStyle(tokens.terrain) : view === 'satellite' && SATELLITE ? satelliteStyle(SATELLITE.url, SATELLITE.attribution, window.location.origin, SATELLITE.maxZoom) : null), [view, tokens]);
  const last = f ? f.footprints.length - 1 : 0; const shown = upto === null ? last : Math.min(upto, last);
  const polygons = useMemo(() => (f ? firePolygons(f.footprints, shown) : []), [f, shown]);
  useEffect(() => {          // replay: step through the looks, then stop on the newest
    if (!playing) return; if (shown >= last) { setPlaying(false); return; }
    const id = window.setTimeout(() => setUpto(shown + 1), 900); return () => window.clearTimeout(id);
  }, [playing, shown, last]);
  const points = useMemo<MapPoint[]>(() => (f?.places ?? []).slice(0, 6).map((p, i) => ({ id: `v-${i}`, lat: p.lat, lon: p.lon, symbol: 'village' as const, label: `${p.name} · ${p.km} km` })), [f]);
  const bounds = useMemo(() => f ? boundsOf([{ lat: f.bbox[1] - 0.025, lon: f.bbox[0] - 0.025 }, { lat: f.bbox[3] + 0.025, lon: f.bbox[2] + 0.025 }, ...(f.nearest && f.nearest.km <= 3 ? [{ lat: f.nearest.lat, lon: f.nearest.lon }] : [])]) : null, [f]);
  if (q.isError) return <div className="mx-auto max-w-5xl space-y-3"><Link to="/ops/fires" className="font-semibold underline">{tt('fires.back', 'All active fires')}</Link><LoadError message={q.error instanceof ApiError && q.error.status === 404 ? tt('fires.not_found', 'This fire was not found. It may be out, or outside your area.') : tt('fires.load_failed', 'The fires could not be loaded.')} onRetry={() => void q.refetch()} /></div>;
  if (!f) return <div className="mx-auto max-w-5xl"><Skeleton lines={5} /></div>;
  async function send() { try { const r = await crew.mutateAsync(f!.id); void nav(`/ops/incidents/${r.incident_id}`); } catch { /* shown below */ } }
  async function warn() { const text = warnText(f!, tt); try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setMsg(tt('fires.copied', 'Copied: paste it into WhatsApp or a message')); } } catch { setMsg(tt('fires.share_failed', 'Could not share. Select and copy the text by hand.')); } }
  const doMark = (status: MarkStatus) => mark.mutate({ id: f!.id, status }, { onSuccess: () => setMsg(status === 'burning' ? tt('fires.marked_burning', 'Marked as still burning.') : tt('fires.marked_closed', 'Marked. It leaves the board unless the satellite sees it again.')) });
  const near = nearestWords(f, tt);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link to="/ops/fires" className="inline-flex min-h-11 items-center font-semibold underline">{tt('fires.back', 'All active fires')}</Link>
      <PageTitle title={fireName(f, tt)} actions={<StatusChip f={f} />} />
      <section className="space-y-3 rounded-panel border border-line bg-surface p-4 sm:p-5">
        <p className="max-w-3xl text-xl font-semibold leading-snug" data-testid="happened">{happenedWords(f, tt)}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={tt('fires.stat_size', 'Size so far')} value={`${f.area_km2} km²`} />
          <Stat label={tt('fires.stat_seen', 'Satellite looks')} value={String(f.n_passes)} sub={tt('fires.stat_det', '{{n}} detections', { n: f.n_det })} />
          <Stat label={tt('fires.stat_last', 'Last seen')} value={formatWhen(f.last_seen)} />
          <Stat label={tt('fires.stat_edge', 'Nearest place')} value={f.nearest ? f.nearest.name : '-'} sub={f.nearest ? tt('fires.stat_edge_km', '{{km}} km from the edge', { km: f.nearest.km }) : tt('fires.stat_edge_none', 'none within 15 km')} />
        </dl>
        <p className="text-sm text-ink-muted">{tt('fires.no_predict', 'Where it may spread next is not available for live fires yet. What is drawn is what the satellite saw.')}</p>
      </section>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <fieldset className="inline-flex rounded-rq border border-control p-1"><legend className="sr-only">{tt('outlook.view', 'Map view')}</legend>
              {OUTLOOK_VIEWS.map(v => <label key={v} className={`inline-flex min-h-11 cursor-pointer items-center rounded-rq px-3 font-semibold focus-within:ring-2 focus-within:ring-action ${view === v ? 'bg-ink text-surface' : ''} ${v === 'satellite' && !SATELLITE ? 'opacity-50' : ''}`}><input type="radio" name="fire-view" value={v} checked={view === v} disabled={v === 'satellite' && !SATELLITE} onChange={() => setView(v)} className="sr-only" />{v === 'light' ? tt('outlook.view_light', 'Light') : v === 'dark' ? tt('outlook.view_dark', 'Dark terrain') : tt('outlook.view_satellite', 'Satellite')}</label>)}
            </fieldset>
            {last > 0 && <button type="button" onClick={() => { if (!playing && shown >= last) setUpto(0); setPlaying(p => !p); }} aria-pressed={playing} className="min-h-11 rounded-rq border border-control px-4 font-semibold">{playing ? tt('fires.pause', 'Pause') : tt('fires.replay', 'Replay how it grew')}</button>}
          </div>
          <MapView label={tt('fires.map_one', 'Map of the fire')} polygons={polygons} points={points} bounds={bounds} basemapStyle={style} colorsOverride={tokens?.mapColors} className="h-[60vh] min-h-96" />
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={tt('fires.key', 'Map key')}>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-4 rounded-sm bg-danger" />{tt('fires.key_fire', 'Fire so far')}</span>
            {last > 0 && <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-4 rounded-sm bg-warn" />{tt('fires.key_grew', 'Added at the look shown')}</span>}
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 border-ink bg-surface" />{tt('fires.key_village', 'Village or town, distance from the fire edge')}</span></p>
          <section aria-label={tt('fires.timeline', 'Each satellite look')}>
            <h2 className="text-sm font-bold">{tt('fires.timeline', 'Each satellite look')}</h2>
            <ol className="mt-1 flex flex-wrap gap-2">{f.passes.map((p, k) => <li key={p.t}><button type="button" aria-pressed={k === shown} onClick={() => setUpto(k)} className={`min-h-11 rounded-rq border px-3 text-left text-sm ${k === shown ? 'border-action bg-action/10' : 'border-line'}`}>
              <span className="block font-semibold">{formatWhen(p.t)}</span><span className="block text-ink-muted">{tt('fires.pass_line', '{{n}} detections · {{area}} km²', { n: p.n, area: p.area_km2 })}{p.n_new > 0 && k > 0 ? ` · ${tt('fires.pass_grew', 'grew')}` : ''}</span></button></li>)}</ol>
          </section>
        </div>
        <div className="space-y-4">
          <Card title={tt('fires.actions', 'What to do')}>
            <div className="flex flex-col gap-2">
              <button type="button" disabled={crew.isPending} onClick={() => void send()} className="min-h-11 rounded-rq bg-action px-4 font-semibold text-on-action disabled:opacity-60">{f.tasked ? tt('fires.open_check', 'Open the check') : tt('fires.send_crew', 'Send a crew')}</button>
              <button type="button" onClick={() => void warn()} className="min-h-11 rounded-rq border border-control px-4 font-semibold">{tt('fires.warn', 'Warn villages (WhatsApp or SMS)')}</button>
            </div>
            <h3 className="mt-3 text-sm font-bold">{tt('fires.mark_title', 'Close or confirm it')}</h3>
            <div className="mt-1 flex flex-wrap gap-2">{([['burning', 'Still burning'], ['handled', 'Handled'], ['out', 'Out'], ['not_forest_fire', 'Not a forest fire']] as const).map(([s, label]) => <button key={s} type="button" disabled={mark.isPending} onClick={() => doMark(s)} className="min-h-11 rounded-rq border border-control px-3 text-sm font-semibold">{tt(`fires.mark_${s}`, label)}</button>)}</div>
            {(crew.isError || mark.isError) && <Notice kind="danger">{tt('fires.action_failed', 'That did not work. Try again.')}</Notice>}
            {msg && <p role="status" className="mt-2 text-sm text-ink-muted">{msg}</p>}
          </Card>
          <Card title={tt('fires.places', 'Places in reach')}>
            {f.places.length === 0 ? <p className="text-sm text-ink-muted">{tt('fires.no_places', 'No named places within 15 km in the OpenStreetMap extract. Many forests are thinly mapped, so this does not mean nobody lives there.')}</p> : (
              <ul className="space-y-1 text-sm">{f.places.map(p => <li key={`${p.name}-${p.lat}`}><b>{p.name}</b> <span className="text-ink-muted">· {tt(`outlook.kind.${p.kind}`, p.kind)} · {tt('fires.km_edge', '{{km}} km from the edge', { km: p.km })} · {p.bearing}{p.on_side ? ` · ${tt('fires.on_side_short', 'on the side it grew toward')}` : ''}</span></li>)}</ul>)}
          </Card>
          {f.stations.length > 0 && <Card title={tt('fires.stations', 'Lookout stations within 10 km')}><ul className="space-y-1 text-sm">{f.stations.map(s => <li key={s.id}><Link to={`/ops/stations/${s.id}`} className="font-semibold underline">{s.name}</Link> · {s.km} km</li>)}</ul></Card>}
          <Card title={tt('fires.facts', 'More facts')}><dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm"><dt className="text-ink-muted">{tt('fires.first', 'First seen')}</dt><dd className="font-semibold">{formatWhen(f.first_seen)}</dd><dt className="text-ink-muted">{tt('fires.dets', 'Detections')}</dt><dd className="font-semibold">{f.n_det}</dd><dt className="text-ink-muted">{tt('fires.power', 'Fire power')}</dt><dd className="font-semibold">{Math.round(f.frp_sum)} MW</dd></dl>
            <p className="mt-2 text-xs text-ink-muted">{tt('fires.size_note', 'Size is counted in 375 m satellite pixels; real fires are usually smaller than the pixels they light.')}</p></Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-rq border border-line bg-canvas px-3 py-2"><dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-0.5 text-lg font-bold leading-tight">{value}</dd>{sub && <dd className="text-sm text-ink-muted">{sub}</dd>}</div>;
}
