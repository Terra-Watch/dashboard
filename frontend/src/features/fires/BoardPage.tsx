import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { ApiError } from '../../app/http';
import { ForecastTabs } from '../forecast/BoardPage';
import { formatWhen } from '../citizen/format';
import { boundsOf, type MapPoint } from '../map/geojson';
import { MapView } from '../map/MapView';
import { useBoard, useCrew } from './api';
import { fireName, happenedWords, nearestWords, statusLine, type Fire } from './model';
import { StatusChip, useTt } from './parts';

/** Control room: the fires that are burning now, in the order they need a person. A fire seen on one satellite pass only is left out unless asked for (84 % of fires are seen once and gone in a day). */
export function FiresBoardPage() {
  const tt = useTt(); const nav = useNavigate();
  const [single, setSingle] = useState(false); const [sel, setSel] = useState<string | null>(null);
  const q = useBoard(single); const crew = useCrew();
  const items = q.data?.items ?? [];
  const points = useMemo<MapPoint[]>(() => items.map(f => ({ id: f.id, lat: f.lat, lon: f.lon, symbol: f.kind === 'likely' ? 'signal_likely' : 'signal', label: fireName(f, tt) })), [items]);      // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => boundsOf(points.length ? points.map(p => ({ lat: p.lat, lon: p.lon })) : [{ lat: 8, lon: 70 }, { lat: 35, lon: 97 }]), [points]);
  async function send(id: string) { try { const r = await crew.mutateAsync(id); void nav(`/ops/incidents/${r.incident_id}`); } catch { /* the error is shown under the list */ } }
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <ForecastTabs current="fires" />
      <PageTitle title={tt('fires.title', 'Active fires')} subtitle={tt('fires.subtitle', 'Fires seen by satellite that are still burning, the ones that need someone first.')} />
      {q.isLoading && <Skeleton lines={4} />}
      {q.isError && <LoadError message={q.error instanceof ApiError ? q.error.detail : tt('fires.load_failed', 'The fires could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.data && (
        <>
          <p role="status" aria-live="polite" className="rounded-rq border border-line bg-surface px-3 py-2 font-semibold">{statusLine(q.data.counts, tt)}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={single} onChange={e => setSingle(e.target.checked)} className="h-4 w-4" />{tt('fires.show_single', 'Also show fires seen only once')}</label>
            {!single && q.data.counts.single > 0 && <span className="text-ink-muted">{tt('fires.n_single', '{{n}} fires seen only once are hidden. Most are small and gone within a day.', { n: q.data.counts.single })} <Link to="/ops/satellite" className="font-semibold underline">{tt('fires.all_det', 'All satellite detections')}</Link></span>}
            <span className="ml-auto text-ink-muted">{tt('fires.updated', 'Updated {{when}}', { when: formatWhen(q.data.generated_at) })}</span>
          </div>
          {items.length === 0 ? <EmptyState title={tt('fires.none', 'No active fires right now')}>{tt('fires.none_hint', 'No fire in your area has been seen on more than one satellite pass in the last four days.')}</EmptyState> : (
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <ul className="space-y-3" aria-label={tt('fires.list', 'Fires')}>{items.map(f => <li key={f.id}><Row f={f} active={f.id === sel} onSelect={() => setSel(f.id)} onCrew={() => void send(f.id)} busy={crew.isPending} /></li>)}</ul>
              <div className="lg:sticky lg:top-4 lg:self-start"><MapView label={tt('fires.map', 'Active fires')} points={points} selectedId={sel} onSelect={setSel} bounds={bounds} className="h-[60vh] min-h-80" /></div>
            </div>)}
          {crew.isError && <Notice kind="danger">{crew.error instanceof ApiError ? crew.error.detail : tt('fires.crew_failed', 'The check could not be created. Try again.')}</Notice>}
          <p className="text-sm text-ink-muted">{tt('fires.note', 'Everything here is what the satellite has seen. It does not say where a fire will go or when. A person on the ground decides.')}</p>
        </>)}
    </div>
  );
}

function Row({ f, active, onSelect, onCrew, busy }: { f: Fire; active: boolean; onSelect: () => void; onCrew: () => void; busy: boolean }) {
  const tt = useTt(); const near = nearestWords(f, tt);
  return (
    <article onClick={onSelect} aria-label={fireName(f, tt)} className={`rounded-xl border p-4 ${active ? 'border-action ring-2 ring-action' : 'border-line bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{fireName(f, tt)}</h2><StatusChip f={f} /></div>
      <p className="mt-1 text-sm">{happenedWords(f, tt)}</p>
      {near && <p className="mt-1 text-sm"><span className="font-semibold">{tt('fires.nearest_label', 'Nearest place')}:</span> {near}</p>}
      <p className="mt-1 text-sm text-ink-muted">{f.tasked ? tt('fires.tasked', 'A check is open for this fire.') : tt('fires.no_task', 'No check yet.')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); onCrew(); }} className="min-h-11 rounded-rq bg-action px-4 font-semibold text-on-action disabled:opacity-60">{f.tasked ? tt('fires.open_check', 'Open the check') : tt('fires.send_crew', 'Send a crew')}</button>
        <Link to={`/ops/fires/${f.id}`} className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold">{tt('fires.open', 'Open the fire')}</Link>
      </div>
    </article>
  );
}
