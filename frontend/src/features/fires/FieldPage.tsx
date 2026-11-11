import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { LocateButton, usePosition } from '../field/Position';
import { useBoard, useMark } from './api';
import { bearingOf, fireName, happenedWords, nearestWords, pointWord, type Fire, type MarkStatus } from './model';
import { StatusChip, useTt } from './parts';
import { km as kmBetween } from './geo';

const NEAR_KM = 30;

/** Ranger: fires near me, nearest first once the position is shared. Each card says what the satellite saw and lets the ranger close or confirm the fire. */
export function FieldFiresPage() {
  const tt = useTt(); const { position } = usePosition(); const q = useBoard(false); const mark = useMark(); const [done, setDone] = useState<Record<string, string>>({});
  const items = useMemo(() => {
    const all = q.data?.items ?? [];
    if (!position) return all.map(f => ({ f, d: null as number | null, b: null as string | null }));
    return all.map(f => ({ f, d: kmBetween(position.lat, position.lon, f.lat, f.lon), b: pointWord(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearingOf(position.lat, position.lon, f.lat, f.lon) / 45) % 8], tt) }))
      .filter(x => x.d! <= NEAR_KM).sort((a, b) => a.d! - b.d!);
  }, [q.data, position]);      // eslint-disable-line react-hooks/exhaustive-deps
  const set = (f: Fire, status: MarkStatus, text: string) => mark.mutate({ id: f.id, status }, { onSuccess: () => setDone(d => ({ ...d, [f.id]: text })) });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={tt('fires.field_title', 'Fires near me')} subtitle={tt('fires.field_sub', 'Fires the satellite has seen on more than one pass, and what it saw.')} actions={<LocateButton />} />
      {!position && <Notice kind="info">{tt('fires.locate_hint', 'Tap "Use my position" to see the fires within {{km}} km of you, nearest first.', { km: NEAR_KM })}</Notice>}
      {q.isLoading && <Skeleton lines={4} />}
      {q.isError && <LoadError message={tt('fires.load_failed', 'The fires could not be loaded.')} onRetry={() => void q.refetch()} />}
      {q.data && items.length === 0 && <EmptyState title={position ? tt('fires.none_near', 'No active fire within {{km}} km', { km: NEAR_KM }) : tt('fires.none', 'No active fires right now')} />}
      <ul className="space-y-3">{items.map(({ f, d, b }) => (
        <li key={f.id}><article aria-label={fireName(f, tt)} className="space-y-2 rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{fireName(f, tt)}</h2><StatusChip f={f} /></div>
          {d !== null && <p className="font-semibold">{d.toFixed(1)} km {b} {tt('fires.from_you', 'from you')}</p>}
          <p className="text-sm">{happenedWords(f, tt)}</p>
          {nearestWords(f, tt) && <p className="text-sm">{nearestWords(f, tt)}</p>}
          <a className="inline-flex min-h-11 items-center gap-2 font-semibold underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lon}`}>{tt('fires.directions', 'Directions to the fire')} <ExternalLink aria-hidden="true" size={16} /></a>
          {done[f.id] ? <p role="status" className="text-sm font-semibold">{done[f.id]}</p> : (
            <div><p className="text-sm font-bold">{tt('fires.i_am_there', 'I checked it')}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" disabled={mark.isPending} onClick={() => set(f, 'burning', tt('fires.thanks_burning', 'Marked as still burning.'))} className="min-h-11 rounded-rq bg-action px-3 text-sm font-semibold text-on-action">{tt('fires.mark_burning', 'Still burning')}</button>
                <button type="button" disabled={mark.isPending} onClick={() => set(f, 'out', tt('fires.thanks_out', 'Marked as out. It leaves the list unless the satellite sees it again.'))} className="min-h-11 rounded-rq border border-control px-3 text-sm font-semibold">{tt('fires.mark_out', 'Out')}</button>
                <button type="button" disabled={mark.isPending} onClick={() => set(f, 'not_forest_fire', tt('fires.thanks_not', 'Marked as not a forest fire.'))} className="min-h-11 rounded-rq border border-control px-3 text-sm font-semibold">{tt('fires.mark_not_forest_fire', 'Not a forest fire')}</button>
              </div></div>)}
          <Link to="/field/satellite" className="block text-sm font-semibold underline">{tt('fires.all_det', 'All satellite detections')}</Link>
        </article></li>))}</ul>
      {mark.isError && <Notice kind="danger">{tt('fires.action_failed', 'That did not work. Try again.')}</Notice>}
    </div>
  );
}
