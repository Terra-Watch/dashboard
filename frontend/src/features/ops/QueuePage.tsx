import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { listStatusText, mediaCheckSuffix } from '../../lib/assessmentPresentation';
import { ageText } from '../../ui/ladder';
import { closurePayload } from '../incidents/closure';
import { INCIDENTS_KEY, useIncidents, useOpsRegion, useOpsSettings } from './useOps';
import { NOT_CONFIRMED, SECTIONS, buildQueue, lateCount, needsYou, type QAssignment, type QStation, type QueueEvent, type Section } from './queueModel';

/*
 * The Control Room queue: a flat dispatch board. No cards, pills or side bars. Each row is a line of text; the time waiting is the loudest thing on it
 * because it decides the order. The selected row opens in a plain panel beside the list. Grouping and ranking live in queueModel.ts.
 */
const ROW_CAP = 20;
// English text for the keys that are built from a variable (the other languages are in hi.json and or.json).
const COPY: Record<Section, { title: string; ask: string; empty: string }> = {
  decide: { title: 'Decide', ask: 'Is it real? Strongest evidence first.', empty: 'Nothing is waiting for a decision.' },
  send: { title: 'Send someone', ask: 'Verified, nobody on the ground yet.', empty: 'Every verified event has an officer.' },
  back: { title: 'Field reported back', ask: 'An officer has written. Your call.', empty: 'No field reports waiting.' },
  signals: { title: 'Signals to check', ask: 'Nothing reported here yet.', empty: 'No unexplained signals.' },
  watch: { title: 'Watching', ask: 'In progress. Flagged when quiet for too long.', empty: 'Nothing in progress.' },
};
const SOURCE_WORD: Record<string, string> = { citizen: 'Citizen', patrol: 'Ranger', lookout_tower: 'Lookout tower', phone: 'Logged by staff', station: 'Station' };
const STATE_WORD = { report: 'Report', signal: 'Signal', verified: 'Verified', responding: 'Responding', contained: 'Contained' } as const;
const REASON_WORD: Record<string, string> = { controlled_burn: 'Controlled burn', cooking_fire: 'Cooking or waste fire', cloud: 'Cloud or mist', not_forest: 'Not forest', duplicate: 'Duplicate' };
const MUTE_HOURS = 6;
const MUTE_KEY = 'tw_queue_muted';
type Hotspot = { id: number; latitude: number; longitude: number; acq_datetime: string; forest_state: string | null };
type Ranger = { id: number; name: string; home_state: string | null; community?: string | null };

const readMuted = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(MUTE_KEY) ?? '{}'); } catch { return {}; } };
const writeMuted = (value: Record<string, number>) => { try { localStorage.setItem(MUTE_KEY, JSON.stringify(value)); } catch { /* kept for this visit only */ } };

const STATE_TONE: Record<QueueEvent['rung'], string> = { report: 'text-unconfirmed', signal: 'text-unconfirmed', verified: 'text-danger', responding: 'text-warn', contained: 'text-ok' };

function ageParts(minutes: number): [number, 'min' | 'h' | 'd'] {
  return minutes < 60 ? [minutes, 'min'] : minutes < 1440 ? [Math.round(minutes / 60), 'h'] : [Math.round(minutes / 1440), 'd'];
}

export function QueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const region = useOpsRegion();
  const incidents = useIncidents();
  const settings = useOpsSettings();
  const assignments = useQuery({ queryKey: ['ops-assignments'], queryFn: () => api<{ items: QAssignment[] }>('/api/control-room/assignments'), refetchInterval: 30_000 });
  const stations = useQuery({ queryKey: ['ops-queue-stations'], retry: false, refetchInterval: 60_000, queryFn: () => api<{ items: QStation[] }>('/api/stations') });
  const hotspots = useQuery({ queryKey: ['ops-queue-hotspots'], retry: false, refetchInterval: 5 * 60_000, queryFn: () => api<{ items: Hotspot[] }>('/api/hotspots?since_hours=24') });
  const rangers = useQuery({ queryKey: ['ops-rangers'], queryFn: () => api<{ items: Ranger[] }>('/api/control-room/rangers'), staleTime: 60_000 });

  const [filter, setFilter] = useState<'all' | 'late'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [more, setMore] = useState<Partial<Record<Section, boolean>>>({});
  const [muted, setMuted] = useState<Record<string, number>>(() => { const now = Date.now(); return Object.fromEntries(Object.entries(readMuted()).filter(([, until]) => until > now)); });
  const [busy, setBusy] = useState(false); const [problem, setProblem] = useState(''); const [message, setMessage] = useState(''); const [officer, setOfficer] = useState('');
  const list = useRef<HTMLDivElement>(null);

  const queue = useMemo(() => {
    const scopedIncidents = (incidents.data ?? []).filter(item => !region || item.community_slug === region);
    const scopedAssignments = (assignments.data?.items ?? []).filter(item => !region || item.community_slug === region);
    const built = buildQueue({ incidents: scopedIncidents, assignments: scopedAssignments, stations: stations.data?.items ?? [], detections: hotspots.data?.items ?? [],
      corroboration: settings.data?.corroboration ?? null, muted: new Set(Object.keys(muted)) });
    // "Keep watching" on a field note: it leaves the back section on this device until the operator or the officer changes something.
    const kept = built.back.filter(event => muted[`back:${event.key}`]);
    return kept.length ? { ...built, back: built.back.filter(event => !kept.includes(event)), watch: [...built.watch, ...kept] } : built;
  }, [incidents.data, assignments.data, stations.data, hotspots.data, settings.data, region, muted]);

  const visible = useMemo(() => Object.fromEntries(SECTIONS.map(section => [section, queue[section].filter(event => filter === 'all' || event.late)])) as Record<Section, QueueEvent[]>, [queue, filter]);
  const shown = useMemo(() => Object.fromEntries(SECTIONS.map(section => [section, more[section] ? visible[section] : visible[section].slice(0, ROW_CAP)])) as Record<Section, QueueEvent[]>, [visible, more]);
  const flat = useMemo(() => SECTIONS.flatMap(section => shown[section]), [shown]);
  const current = flat.find(event => event.key === selectedKey) ?? flat[0] ?? null;

  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: INCIDENTS_KEY }), queryClient.invalidateQueries({ queryKey: ['ops-assignments'] }), queryClient.invalidateQueries({ queryKey: ['ops-queue-stations'] })]); };
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setProblem(''); setMessage('');
    try { await action(); setMessage(done); await refresh(); return true; }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.failed', 'That was not saved. Try again.')); return false; }
    finally { setBusy(false); }
  }
  const mute = (key: string, hours = MUTE_HOURS) => { const next = { ...muted, [key]: Date.now() + hours * 3_600_000 }; setMuted(next); writeMuted(next); };
  const verify = (event: QueueEvent) => run(() => api(`/api/incidents/${event.incidentId}/status`, { method: 'PATCH', json: { status: 'verified' } }), t('ops.status_saved', 'Status changed.'));
  const close = (event: QueueEvent, reason: 'resolved' | 'false_alarm' | 'duplicate' | 'unable_to_verify', note: string) =>
    run(() => api(`/api/incidents/${event.incidentId}/status`, { method: 'PATCH', json: closurePayload(reason, note) }), t('ops.closed_saved', 'Incident closed.'));
  const send = (event: QueueEvent) => run(() => event.assignmentId
    ? api(`/api/control-room/incidents/${event.incidentId}/assignments/${event.assignmentId}`, { method: 'PATCH', json: { ranger_id: Number(officer) } })
    : api(`/api/control-room/incidents/${event.incidentId}/assignments`, { method: 'POST', json: { ranger_id: Number(officer) } }), t('ops.assigned', 'Officer assigned.')).then(ok => { if (ok) setOfficer(''); return ok; });
  const openCheck = (event: QueueEvent) => run(async () => {
    const result = await api<{ created: boolean; incident_id: number }>(`/api/stations/${event.stationId}/check`, { method: 'POST', json: {} });
    setSelectedKey(`i${result.incident_id}`);
  }, t('ops.q.check_opened', 'A check is open. It is now under Decide.'));

  useEffect(() => { setProblem(''); setMessage(''); setOfficer(''); }, [current?.key]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [current?.key]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || event.metaKey || event.ctrlKey || !current) return;
      const index = flat.findIndex(item => item.key === current.key);
      if (event.key === 'j' && index < flat.length - 1) setSelectedKey(flat[index + 1].key);
      else if (event.key === 'k' && index > 0) setSelectedKey(flat[index - 1].key);
      else if (event.key === 'v' && current.section === 'decide' && !busy) void verify(current);
      else if (event.key === 'Enter' && current.incidentId && target.tagName !== 'A' && target.tagName !== 'BUTTON') navigate(`/ops/incidents/${current.incidentId}`);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const loading = incidents.isLoading;
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title={t('nav.queue')} subtitle={t('ops.queue.subtitle2', 'What needs you, in the order it needs you.')} actions={<Link to="/ops/incidents/new" className="inline-flex min-h-11 items-center font-semibold text-action underline underline-offset-4">{t('ops.log.title', 'Log a report')}</Link>} />
      {loading ? <Skeleton lines={6} /> : incidents.isError ? <LoadError message={t('ops.queue.error', 'The queue could not be loaded.')} onRetry={() => void incidents.refetch()} retryLabel={t('citizen.retry', 'Try again')} /> : (
        <div className="grid gap-x-9 gap-y-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div ref={list} className="min-w-0">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-ink-muted" role="status">{t('ops.q.summary', { need: needsYou(queue), late: lateCount(queue), defaultValue: '{{need}} need you · {{late}} running late' })}</p>
              <div role="group" aria-label={t('ops.q.show', 'Show')} className="flex gap-5">
                {(['all', 'late'] as const).map(id => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-11 border-b-2 pt-1 ${filter === id ? 'border-ink font-bold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}>{id === 'all' ? t('ops.q.f_all', 'Everything that needs me') : t('ops.q.f_late', 'Running late')}</button>)}
              </div>
            </div>
            {(stations.isError || hotspots.isError) && <p className="mt-2 text-sm text-ink-muted">{t('ops.q.signals_off', 'Station and satellite signals could not be loaded, so Signals to check may be incomplete.')}</p>}
            {SECTIONS.map(section => (
              <section key={section} aria-labelledby={`q-${section}`} className="mt-7">
                <h2 id={`q-${section}`} className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-ink pb-1.5 text-sm font-bold uppercase tracking-[0.09em]">
                  {t(`ops.q.${section}.title`, COPY[section].title)} <span className="font-mono tracking-normal">{visible[section].length}</span>
                  <span className="text-[0.9375rem] font-normal normal-case tracking-normal text-ink-muted">{t(`ops.q.${section}.ask`, COPY[section].ask)}</span>
                </h2>
                {visible[section].length === 0 ? <p className="py-3 text-ink-muted">{t(`ops.q.${section}.empty`, COPY[section].empty)}</p> : (
                  <ul role="listbox" aria-label={t(`ops.q.${section}.title`, COPY[section].title)}>
                    {shown[section].map(event => <Row key={event.key} event={event} selected={event.key === current?.key} onSelect={() => setSelectedKey(event.key)} />)}
                  </ul>)}
                {visible[section].length > shown[section].length && <button type="button" onClick={() => setMore(value => ({ ...value, [section]: true }))} className="mt-2 min-h-11 font-semibold text-action underline underline-offset-4">{t('ops.q.more', { count: visible[section].length - shown[section].length, defaultValue: 'Show {{count}} more' })}</button>}
              </section>))}
            <p className="mt-6 text-sm text-ink-muted">{t('ops.q.keys', 'j and k move, v verifies, Enter opens the full case.')}</p>
          </div>
          <aside aria-label={t('ops.q.selected', 'Selected event')} className="min-w-0 lg:sticky lg:top-3 lg:self-start lg:border-l lg:border-line lg:pl-8">
            {current ? <Detail event={current} incident={(incidents.data ?? []).find(item => item.id === current.incidentId)} rangers={rangers.data?.items ?? []} officer={officer} setOfficer={setOfficer} busy={busy}
              message={message} problem={problem} onVerify={() => void verify(current)} onClose={(reason, note) => void close(current, reason, note)} onSend={() => void send(current)}
              onOpenCheck={() => void openCheck(current)} onMute={() => mute(current.key)} onKeep={() => mute(`back:${current.key}`, 12)} />
              : <p className="text-ink-muted">{t('ops.q.p.select', 'Select an event to see it here.')}</p>}
          </aside>
        </div>)}
    </div>
  );
}

function Row({ event, selected, onSelect }: { event: QueueEvent; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const [n, unit] = ageParts(event.ageMin);
  return (
    <li role="option" aria-selected={selected} tabIndex={0} onClick={onSelect} onKeyDown={key => { if (key.key === ' ') { key.preventDefault(); onSelect(); } }}
      className={`grid cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-3 pr-2 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-x-4 ${selected ? 'bg-surface-2 shadow-[-0.625rem_0_0_var(--color-surface-2)]' : 'hover:bg-surface-2/60'}`}>
      <div className="pt-0.5 text-right font-mono leading-none">
        <b className={`block text-xl font-medium tracking-tight sm:text-2xl ${event.late ? 'text-warn' : ''}`}>{n}</b>
        <small className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">{t(`ops.q.u.${unit}`, unit)}</small>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-base font-bold [overflow-wrap:anywhere]">{event.place}</span>
          {event.community && <span className="text-ink-muted">{event.community}</span>}
          <span className={`inline-flex items-baseline gap-1.5 text-sm font-bold ${STATE_TONE[event.rung]}`}><span aria-hidden="true" className={`inline-block size-[7px] bg-current ${event.rung === 'signal' ? 'rotate-45' : ''}`} />{t(`ops.q.s.${event.rung}`, STATE_WORD[event.rung])}</span>
          {event.late && <span className="text-sm font-bold text-warn">{t('ops.q.late', 'Running late')}</span>}
        </div>
        <p className="mt-0.5">{trustLine(event, t)}</p>
        {event.facts.assessment && <p className="text-sm text-ink-muted">{listStatusText(event.facts.assessment)}{event.facts.assessment === 'COMPLETED' && mediaCheckSuffix(event.facts.mediaIntegrity, t) ? ` · ${mediaCheckSuffix(event.facts.mediaIntegrity, t)}` : ''}</p>}
      </div>
    </li>
  );
}

type T = TFunction;
function trustLine(event: QueueEvent, t: T): string {
  const f = event.facts;
  if (event.kind === 'station') {
    const base = f.sound ? t(f.sound.kind === 'chainsaw' ? 'ops.q.sig.chainsaw' : 'ops.q.sig.blast', { pct: f.sound.confidence, defaultValue: f.sound.kind === 'chainsaw' ? 'Heard what sounds like a chainsaw, {{pct}} % sure. A sound model, not a person.' : 'Heard what sounds like a gunshot or blast, {{pct}} % sure. A sound model, not a person.' })
      : t('ops.q.sig.pm', { ratio: (f.pmRatio ?? 0).toFixed(1), defaultValue: 'Air-quality reading {{ratio}} times its usual level. Not a fire detector.' });
    return f.nearIncident ? `${base} ${t('ops.q.sig.near', { id: f.nearIncident, defaultValue: 'A report is already open nearby: #{{id}}.' })}` : base;
  }
  if (event.kind === 'cluster') return t('ops.q.sig.cluster', { count: f.detections ?? 0, defaultValue: '{{count}} satellite detections in forest cells. Heat seen from space; nobody has checked it.' });
  if (event.section === 'send') return f.officer ? t('ops.q.send.waiting', { name: f.officer, min: f.officerWaitMin ?? 0, defaultValue: '{{name}} was asked {{min}} min ago and has not answered.' }) : t('ops.q.send.none', 'Verified. No officer assigned.');
  if (event.section === 'back') return t('ops.q.back.note', { name: f.officer ?? '', defaultValue: '{{name}} has written since your last change.' });
  if (event.section === 'watch') return f.officer ? t('ops.q.watch.with', { name: f.officer, time: ageText(new Date(Date.now() - event.ageMin * 60_000).toISOString()).replace(' ago', ''), defaultValue: '{{name}} on it. Last change {{time}} ago.' })
    : t('ops.q.watch.without', { time: ageText(new Date(Date.now() - event.ageMin * 60_000).toISOString()).replace(' ago', ''), defaultValue: 'No officer. Last change {{time}} ago.' });
  const parts = [f.firstHand && t('ops.q.part.first', 'Ranger report'), f.reports ? t('ops.q.part.reports', { count: f.reports, defaultValue: 'Other reports nearby: {{count}}' }) : '',
    f.satellite ? t('ops.q.part.satellite', { count: f.satellite, defaultValue: 'Satellite detections nearby: {{count}}' }) : '', f.hasPhoto ? t('ops.q.part.photo', 'Has a photo') : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('ops.q.part.alone', 'One report, nothing else yet.');
}

type DetailProps = {
  event: QueueEvent; incident?: { id: number; source: string; notes: string | null; created_at: string; updated_at: string; state: string | null; latitude: number | null; longitude: number | null };
  rangers: Ranger[]; officer: string; setOfficer: (value: string) => void; busy: boolean; message: string; problem: string;
  onVerify: () => void; onClose: (reason: 'resolved' | 'false_alarm' | 'duplicate' | 'unable_to_verify', note: string) => void; onSend: () => void; onOpenCheck: () => void; onMute: () => void; onKeep: () => void;
};

function Detail(p: DetailProps) {
  const { t } = useTranslation();
  const { event, incident } = p;
  const go = 'inline-flex min-h-11 items-center font-bold text-action underline decoration-2 underline-offset-4 disabled:opacity-50';
  const alt = 'inline-flex min-h-11 items-center underline decoration-ink-muted underline-offset-4 disabled:opacity-50';
  const sourceWord = incident ? t(`ops.q.src.${incident.source}`, SOURCE_WORD[incident.source] ?? incident.source) : '';
  return (
    <div className="space-y-5">
      <div>
        <p className={`inline-flex items-baseline gap-1.5 text-sm font-bold ${STATE_TONE[event.rung]}`}><span aria-hidden="true" className={`inline-block size-[7px] bg-current ${event.rung === 'signal' ? 'rotate-45' : ''}`} />{t(`ops.q.s.${event.rung}`, STATE_WORD[event.rung])}</p>
        <h2 className="mt-1 text-[1.375rem] leading-snug [overflow-wrap:anywhere]">{event.place}</h2>
        <p className="text-ink-muted">{[event.community, ageText(new Date(Date.now() - event.ageMin * 60_000).toISOString()), event.incidentId ? `#${event.incidentId}` : null].filter(Boolean).join(' · ')}</p>
      </div>
      {p.message && <Notice kind="success">{p.message}</Notice>}
      {p.problem && <Notice kind="danger">{p.problem}</Notice>}

      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.09em] text-ink-muted">{t('ops.q.p.know', 'What we know')}</h3>
        <ul className="divide-y divide-line">
          <li className="py-1.5">{trustLine(event, t)}</li>
          {incident?.notes && <li className="whitespace-pre-wrap py-1.5">{incident.notes}</li>}
          {incident && <li className="py-1.5 text-ink-muted">{t('ops.q.p.source', { who: sourceWord, when: ageText(incident.created_at), defaultValue: 'Source: {{who}}, {{when}}' })}</li>}
          {event.links.length > 0 && <li className="py-1.5">{t('ops.q.p.linked', 'Possibly the same event')}: {event.links.map(id => <Link key={id} to={`/ops/incidents/${id}`} className="mr-2 font-bold underline">#{id}</Link>)}</li>}
          {event.lat != null && event.lon != null && <li className="py-1.5 font-mono text-sm text-ink-muted">{event.lat.toFixed(4)}, {event.lon.toFixed(4)} · <Link to="/ops/map" className="font-sans underline">{t('nav.map')}</Link></li>}
        </ul>
      </section>

      <section>
        <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.09em] text-ink-muted">{t('ops.q.p.move', 'Your move')}</h3>
        {event.section === 'decide' && (<>
          <div className="flex flex-wrap items-baseline gap-x-6">
            <button type="button" className={go} disabled={p.busy} onClick={p.onVerify}>{t('ops.q.a.verify', 'Verify')} →</button>
            <Link className={alt} to={`/ops/incidents/${event.incidentId}`}>{t('ops.q.a.open', 'Open the full case')}</Link>
          </div>
          <p className="mt-3 text-ink-muted">{t('ops.q.a.not', 'Not confirmed, because:')}
            {NOT_CONFIRMED.map(item => <button key={item.id} type="button" disabled={p.busy} onClick={() => p.onClose(item.reason, item.note)} className="ml-4 min-h-11 text-ink underline decoration-ink-muted underline-offset-4 disabled:opacity-50">{t(`ops.q.r.${item.id}`, REASON_WORD[item.id])}</button>)}</p>
        </>)}
        {(event.section === 'send' || event.section === 'decide') && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <label htmlFor="q-officer" className="text-ink-muted">{event.assignmentId ? t('ops.change_officer', 'Change officer') : t('ops.choose_officer', 'Assign an officer')}</label>
            <select id="q-officer" value={p.officer} onChange={e => p.setOfficer(e.target.value)} className="min-h-11 max-w-full border-0 border-b border-ink-muted bg-transparent text-ink">
              <option value="">{t('citizen.report.choose', 'Choose')}</option>{p.rangers.map(r => <option key={r.id} value={r.id}>{r.name}{r.community ? ` · ${r.community}` : ''}</option>)}
            </select>
            <button type="button" className={go} disabled={p.busy || !p.officer || (event.section === 'decide' && !event.incidentId)} onClick={p.onSend}>{t('ops.q.a.send', 'Send')} →</button>
          </div>)}
        {event.section === 'send' && <div className="mt-2"><Link className={alt} to={`/ops/incidents/${event.incidentId}`}>{t('ops.q.a.open', 'Open the full case')}</Link></div>}
        {event.section === 'back' && (
          <div className="flex flex-wrap items-baseline gap-x-6">
            <button type="button" className={go} disabled={p.busy} onClick={() => p.onClose('resolved', '')}>{t('ops.q.a.resolve', 'Close as resolved')} →</button>
            <button type="button" className={alt} onClick={p.onKeep}>{t('ops.q.a.keep', 'Keep watching')}</button>
            <Link className={alt} to={`/ops/incidents/${event.incidentId}`}>{t('ops.q.a.open', 'Open the full case')}</Link>
          </div>)}
        {event.section === 'watch' && <Link className={go} to={`/ops/incidents/${event.incidentId}`}>{t('ops.q.a.open', 'Open the full case')} →</Link>}
        {event.section === 'signals' && (<>
          <div className="flex flex-wrap items-baseline gap-x-6">
            {event.kind === 'station' && <button type="button" className={go} disabled={p.busy} onClick={p.onOpenCheck}>{t('ops.q.a.check', 'Open a check')} →</button>}
            {event.kind === 'cluster' && <Link className={go} to="/ops/satellite">{t('ops.q.a.satellite', 'See it on the Satellite page')} →</Link>}
            {event.kind === 'station' && <Link className={alt} to={`/ops/stations/${event.stationId}`}>{t('ops.q.a.station', 'Open the station')}</Link>}
            {event.facts.nearIncident && <Link className={alt} to={`/ops/incidents/${event.facts.nearIncident}`}>#{event.facts.nearIncident}</Link>}
            <button type="button" className={alt} onClick={p.onMute}>{t('ops.q.a.mute', 'Not an issue')}</button>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{t('ops.q.a.check_hint', 'A check makes an unverified incident from this signal. It is not called a fire. "Not an issue" hides it on this device for 6 hours.')}</p>
        </>)}
      </section>
      <p className="border-t border-line pt-3 text-sm text-ink-muted">{t('ops.q.p.foot', 'Nothing becomes verified by itself. Verifying and alerting the public are separate steps.')}</p>
    </div>
  );
}
