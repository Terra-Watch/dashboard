import { useTranslation } from 'react-i18next';
import { actionsFor, burningWords, chanceWords, changeWords, levelName, placeLine, seasonNote, usualWords, type Action, type Area, type LevelId } from './model';

export type Tt = (key: string, fallback: string, opts?: Record<string, unknown>) => string;
/** Translation with an English fallback, in the shape the helpers in model.ts take. */
export function useTt(): Tt {
  const { t } = useTranslation();
  return (k, d, o) => t(k, { defaultValue: d, ...o }) as string;
}

const LOOK: Record<LevelId, { mark: string; cls: string }> = {
  extreme: { mark: '▲▲▲', cls: 'border-danger bg-danger/15 text-ink' },
  high: { mark: '▲▲', cls: 'border-danger/60 bg-danger/10 text-ink' },
  moderate: { mark: '▲', cls: 'border-warn bg-warn-tint text-ink' },
  none: { mark: '–', cls: 'border-line bg-surface text-ink-muted' },
};

/** The level as a word and a mark, never colour alone. */
export function LevelChip({ level, big = false }: { level: LevelId; big?: boolean }) {
  const tt = useTt(); const l = LOOK[level];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-bold ${big ? 'text-lg' : 'text-sm'} ${l.cls}`}><span aria-hidden="true" className="tracking-tighter">{l.mark}</span>{levelName(level, tt)}</span>;
}

/** What to do at this chance: the default action table, each line marked on or not. */
export function ActionList({ area, actions }: { area: Area; actions: Action[] }) {
  const tt = useTt();
  return (
    <ul className="space-y-1" aria-label={tt('forecast.do_today', 'Do today')}>
      {actionsFor(area, actions).map(a => <li key={a.id} className={`flex gap-2 text-sm ${a.on ? 'font-semibold' : 'text-ink-muted'}`}><span aria-hidden="true" className="w-4 shrink-0 text-center">{a.on ? '✓' : '–'}</span><span>{a.text}{!a.on && <span className="font-normal"> ({tt('forecast.not_needed', 'not needed at this level')})</span>}</span></li>)}
    </ul>
  );
}

export function Reasons({ area }: { area: Area }) {
  const tt = useTt(); const burning = burningWords(area, tt); const lines = [usualWords(area, tt), changeWords(area, tt), seasonNote(area, tt)].filter(Boolean) as string[];
  return burning || lines.length ? <div>{burning && <p className="text-sm font-semibold">{burning}</p>}<ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-muted">{lines.map(x => <li key={x}>{x}</li>)}</ul></div> : null;
}

export function LookList({ area, limit = 5 }: { area: Area; limit?: number }) {
  const tt = useTt(); const items = (area.look ?? []).slice(0, limit);
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-bold">{tt('forecast.look', 'Where to look')}</h3>
      <ol className="mt-1 space-y-1 text-sm">{items.map((l, i) => (
        <li key={l.cell_id} className="flex flex-wrap items-baseline gap-x-2"><span className="font-bold tabular-nums">{i + 1}</span>
          <span className="font-semibold">{l.place ? placeLine(l.place) : tt('forecast.no_place', 'Forest square at {{lat}}, {{lon}} (no named place nearby)', { lat: l.lat.toFixed(2), lon: l.lon.toFixed(2) })}</span>
          <span className="text-ink-muted">· {chanceWords(l.chance, tt)}</span>
          <a className="font-semibold underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`}>{tt('forecast.directions', 'Directions')}</a></li>))}</ol>
      <p className="mt-1 text-xs text-ink-muted">{tt('forecast.look_note', 'Each place is the nearest named village or locality to a forest square of about 11 km. Names come from OpenStreetMap and are thin in some forests.')}</p>
    </div>
  );
}

export function WeakNote({ area }: { area: Pick<Area, 'reliable' | 'state'> }) {
  const tt = useTt();
  return area.reliable ? null : <p className="rounded-rq border border-warn bg-warn-tint p-2 text-sm">{tt('forecast.weak', 'Less reliable in {{state}}: the forecast was checked there and was weaker or ran high. Treat the level as a rough guide.', { state: area.state })}</p>;
}
