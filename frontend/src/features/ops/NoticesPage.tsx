import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../app/http';
import { useSession } from '../../app/session';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { useCommunities } from '../../lib/community';
import type { CommunityImageAssessment } from '../../lib/assessmentPresentation';
import { PhotoLibrary } from './PhotoLibrary';
import { ModerationMedia, type ModerationImage } from './ModerationMedia';

/*
 * Notices, as a flat board like the queue. What waits on a person comes first (urgent alerts that went out without a second person, notices waiting for approval,
 * community posts held or flagged), then what is live, then drafts and history. Writing a notice is one action at the top. Photo library and chat rooms are rare jobs and sit at the end.
 */
type NoticeRow = { urgent?: boolean; reviewed_at?: string | null; review_decision?: string | null; review_note?: string | null; incident_id?: number | null; id: number; title: string; body: string; severity: 'info' | 'advisory' | 'warning'; regions: string[]; status: 'draft' | 'pending_approval' | 'published' | 'withdrawn'; author_id: number; starts_at: string; expires_at: string; return_reason: string | null; expired: boolean };
type QueueItem = { id: number; reason: string; kind: string; held: boolean; content: string | null; author_id: number | null; author_name: string | null; author_prior_removals: number; open_reports: number; severity: 'high' | 'held' | 'normal'; image?: ModerationImage | null; community_image_assessment?: CommunityImageAssessment | null };
type Room = { region: string; slow_mode_seconds: number; frozen: boolean; retention_days: number | null };

const go = "inline-flex min-h-11 items-center font-bold text-action underline decoration-2 underline-offset-4 after:ml-1.5 after:content-['→'] disabled:opacity-50";
const alt = 'inline-flex min-h-11 items-center underline decoration-ink-muted underline-offset-4 disabled:opacity-50';
const warn = 'inline-flex min-h-11 items-center font-semibold text-danger underline decoration-danger/60 underline-offset-4 disabled:opacity-50';

function Section({ id, title, ask, count, children }: { id: string; title: string; ask: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={`n-${id}`} className="mt-8">
      <h2 id={`n-${id}`} className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-ink pb-1.5 text-sm font-bold uppercase tracking-[0.09em]">
        {title}{count !== undefined && <span className="font-mono tracking-normal">{count}</span>}<span className="text-[0.9375rem] font-normal normal-case tracking-normal text-ink-muted">{ask}</span>
      </h2>
      {children}
    </section>
  );
}

function Line({ label, tone = 'text-ink-muted', children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-1 gap-x-5 border-b border-line py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <p className={`pt-0.5 text-sm font-bold uppercase tracking-[0.06em] ${tone}`}>{label}</p>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

export function NoticesPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const communities = useCommunities();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['notice-admin'], queryFn: () => api<{ items: NoticeRow[] }>('/api/notices?limit=100') });
  const posts = useQuery({ queryKey: ['mod-queue'], queryFn: () => api<{ items: QueueItem[] }>('/api/community/moderation/queue'), refetchInterval: 60_000 });
  const [problem, setProblem] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false); const [earlier, setEarlier] = useState(false);
  const [reasonFor, setReasonFor] = useState<{ id: number; kind: 'return' | 'withdraw' } | null>(null); const [reason, setReason] = useState('');
  const [concern, setConcern] = useState<{ id: number; note: string } | null>(null);
  const canApprove = user?.role === 'admin' || user?.role === 'incident_commander';
  const items = list.data?.items ?? [];
  const urgent = items.filter(item => item.urgent && !item.reviewed_at && item.status === 'published');
  const pending = items.filter(item => item.status === 'pending_approval');
  const live = items.filter(item => item.status === 'published' && !item.expired);
  const drafts = items.filter(item => item.status === 'draft');
  const history = items.filter(item => item.status === 'withdrawn' || (item.status === 'published' && item.expired));
  const waiting = urgent.length + pending.length + (posts.data?.items.length ?? 0);
  const regionNames = (item: NoticeRow) => (communities.data?.items ?? []).filter(c => item.regions.includes(c.state)).map(c => c.name).join(', ') || item.regions.join(', ');

  async function act(action: () => Promise<unknown>, done: string, keys: string[] = ['notice-admin']) {
    setBusy(true); setProblem(''); setMessage('');
    try { await action(); setMessage(done); await Promise.all(keys.map(key => queryClient.invalidateQueries({ queryKey: [key] }))); return true; }
    catch (error) { setProblem(error instanceof ApiError ? error.detail : t('ops.failed', 'That was not saved. Try again.')); return false; }
    finally { setBusy(false); }
  }
  const reasonForm = (item: NoticeRow) => reasonFor?.id === item.id && (
    <div className="mt-2 space-y-2"><TextField label={t('ops.reason', 'Reason')} value={reason} onChange={event => setReason(event.target.value)} />
      <div className="flex flex-wrap gap-x-5"><button type="button" className={go} disabled={busy || reason.trim().length < 3} onClick={() => void act(() => api(`/api/notices/${item.id}/${reasonFor.kind}`, { method: 'POST', json: { reason: reason.trim() } }), reasonFor.kind === 'return' ? t('ops.notices.returned_ok', 'Returned to the author.') : t('ops.notices.withdrawn', 'Withdrawn.')).then(() => { setReasonFor(null); setReason(''); })}>{t('ops.confirm', 'Confirm')}</button>
        <button type="button" className={alt} onClick={() => setReasonFor(null)}>{t('citizen.community.cancel', 'Cancel')}</button></div></div>);

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title={t('nav.notices')} subtitle={t('ops.notices.subtitle', 'Official notices for the public, and the community.')} actions={<button type="button" aria-expanded={writing} className={writing ? alt : go} onClick={() => setWriting(value => !value)}>{t('ops.notices.write', 'Write a notice')}</button>} />
      {message && <Notice kind="success">{message}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}
      {writing && <Compose busy={busy} onSaved={async (payload) => { const ok = await act(() => api('/api/notices', { method: 'POST', json: payload }), t('ops.notices.saved', 'Draft saved. Send it for approval when it is ready.')); if (ok) setWriting(false); return ok; }} />}
      <p className="text-ink-muted" role="status">{t('ops.n.summary', { count: waiting, defaultValue: '{{count}} waiting on a person' })}</p>

      {list.isError ? <div className="mt-4"><LoadError message={t('ops.notices.load_error', 'Notices could not be loaded.')} onRetry={() => void list.refetch()} retryLabel={t('citizen.retry', 'Try again')} /></div> : list.isLoading ? <div className="mt-6"><Skeleton lines={4} /></div> : (<>
        <Section id="need" title={t('ops.n.need', 'Needs a person')} ask={t('ops.n.need_ask', 'Waiting on a decision.')} count={waiting}>
          {waiting === 0 && <p className="py-3 text-ink-muted">{t('ops.n.need_empty', 'Nothing is waiting on you.')}</p>}
          <ul>
            {urgent.map(item => (
              <Line key={`u${item.id}`} label={t('ops.n.kind.urgent', 'Urgent alert')} tone="text-danger">
                <p className="font-bold">{item.title}</p><p className="whitespace-pre-wrap">{item.body}</p>
                <p className="text-sm text-ink-muted">{t('ops.notices.urgent_hint', 'These were sent at once. Look at them now: say they are fine, or say what worries you. You cannot review your own.')}</p>
                <p className="text-sm text-ink-muted">{regionNames(item)}{item.incident_id ? <> · <Link className="underline" to={`/ops/incidents/${item.incident_id}`}>#{item.incident_id}</Link></> : null}</p>
                {canApprove && item.author_id !== user?.id && (concern?.id === item.id ? (
                  <div className="mt-2 space-y-2"><TextArea label={t('ops.notices.concern', 'What is the concern?')} rows={2} maxLength={500} value={concern.note} onChange={event => setConcern({ id: item.id, note: event.target.value })} />
                    <div className="flex flex-wrap gap-x-5"><button type="button" className={go} disabled={busy || concern.note.trim().length < 5} onClick={() => void act(() => api(`/api/notices/${item.id}/review`, { method: 'POST', json: { decision: 'concern', note: concern.note.trim() } }), t('ops.notices.reviewed', 'Review saved.')).then(() => setConcern(null))}>{t('ops.notices.send_concern', 'Send my concern')}</button>
                      <button type="button" className={alt} onClick={() => setConcern(null)}>{t('ops.cancel', 'Cancel')}</button></div></div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-x-6"><button type="button" className={go} disabled={busy} onClick={() => void act(() => api(`/api/notices/${item.id}/review`, { method: 'POST', json: { decision: 'ok' } }), t('ops.notices.reviewed', 'Review saved.'))}>{t('ops.notices.fine', 'This is fine')}</button>
                    <button type="button" className={alt} onClick={() => setConcern({ id: item.id, note: '' })}>{t('ops.notices.raise', 'I have a concern')}</button></div>))}
              </Line>))}
            {pending.map(item => (
              <Line key={`p${item.id}`} label={t('ops.n.kind.approval', 'Needs approval')} tone="text-unconfirmed">
                <p className="font-bold">{item.title}</p><p className="whitespace-pre-wrap">{item.body}</p>
                <p className="text-sm text-ink-muted">{t(`citizen.severity.${item.severity}`, item.severity)} · {regionNames(item)} · {formatWhen(item.starts_at)} → {formatWhen(item.expires_at)}</p>
                {item.status === 'pending_approval' && canApprove && item.author_id !== user?.id && <div className="mt-1 flex flex-wrap gap-x-6"><button type="button" className={go} disabled={busy} onClick={() => void act(() => api(`/api/notices/${item.id}/approve`, { method: 'POST', json: {} }), t('ops.notices.approved', 'Published.'))}>{t('ops.notices.approve', 'Approve and publish')}</button><button type="button" className={alt} onClick={() => setReasonFor({ id: item.id, kind: 'return' })}>{t('ops.notices.return', 'Return with a reason')}</button></div>}
                {item.author_id === user?.id && <p className="mt-1 text-sm text-ink-muted">{t('ops.notices.wait_second', 'Waiting for a second person to approve. You cannot approve your own notice.')}</p>}
                {reasonForm(item)}
              </Line>))}
            <Moderation queue={posts.data?.items} loading={posts.isLoading} error={posts.isError} reload={() => void posts.refetch()} />
          </ul>
        </Section>

        <Section id="live" title={t('ops.n.live', 'Live now')} ask={t('ops.n.live_ask', 'Public right now.')} count={live.length}>
          {live.length === 0 ? <p className="py-3 text-ink-muted">{t('ops.n.live_empty', 'No notice is live.')}</p> : <ul>{live.map(item => (
            <Line key={item.id} label={t(`citizen.severity.${item.severity}`, item.severity)} tone={item.severity === 'warning' ? 'text-danger' : 'text-ink-muted'}>
              <p className="font-bold">{item.title}</p><p className="whitespace-pre-wrap">{item.body}</p>
              <p className="text-sm text-ink-muted">{regionNames(item)} · {t('ops.n.until', { when: formatWhen(item.expires_at), defaultValue: 'until {{when}}' })}</p>
              <button type="button" className={warn} onClick={() => setReasonFor({ id: item.id, kind: 'withdraw' })}>{t('ops.notices.withdraw', 'Withdraw')}</button>
              {reasonForm(item)}
            </Line>))}</ul>}
        </Section>

        {drafts.length > 0 && <Section id="drafts" title={t('ops.n.drafts', 'Drafts')} ask={t('ops.n.drafts_ask', 'Written, not yet sent for approval.')} count={drafts.length}>
          <ul>{drafts.map(item => (
            <Line key={item.id} label={t('ops.notice_status.draft', 'draft')}>
              <p className="font-bold">{item.title}</p><p className="whitespace-pre-wrap">{item.body}</p>
              {item.return_reason && <p className="mt-1 text-warn"><b>{t('ops.notices.returned', 'Returned for changes')}:</b> {item.return_reason}</p>}
              {item.author_id === user?.id && <button type="button" className={go} disabled={busy} onClick={() => void act(() => api(`/api/notices/${item.id}/submit`, { method: 'POST', json: {} }), t('ops.notices.submitted', 'Sent for approval.'))}>{t('ops.notices.submit', 'Send for approval')}</button>}
            </Line>))}</ul>
        </Section>}

        {history.length > 0 && <Section id="earlier" title={t('ops.n.earlier', 'Earlier')} ask={t('ops.n.earlier_ask', 'Withdrawn or expired.')} count={history.length}>
          {earlier ? <ul>{history.map(item => <Line key={item.id} label={item.expired ? t('ops.notices.expired', 'expired') : t('ops.notice_status.withdrawn', 'withdrawn')}><p className="font-bold">{item.title}</p><p className="text-sm text-ink-muted">{regionNames(item)} · {formatWhen(item.starts_at)} → {formatWhen(item.expires_at)}</p></Line>)}</ul>
            : <button type="button" className={`${alt} mt-1`} onClick={() => setEarlier(true)}>{t('ops.n.show_earlier', 'Show earlier notices')}</button>}
        </Section>}
      </>)}

      <section className="mt-10 border-t-2 border-ink pt-1">
        <details className="group"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold uppercase tracking-[0.09em]">{t('ops.library.tab', 'Photo library')}</summary><div className="pb-4"><PhotoLibrary /></div></details>
        <details className="group border-t border-line"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold uppercase tracking-[0.09em]">{t('ops.rooms.tab', 'Chat rooms')}</summary><div className="pb-4"><Rooms /></div></details>
      </section>
    </div>
  );
}

function Compose({ busy, onSaved }: { busy: boolean; onSaved: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const { t } = useTranslation();
  const communities = useCommunities();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [severity, setSeverity] = useState('info'); const [regions, setRegions] = useState<string[]>([]); const [picked, setPicked] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); const [expiresAt, setExpiresAt] = useState('');
  const ready = title.trim() && body.trim() && regions.length > 0 && expiresAt;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!ready) return;
    await onSaved({ title: title.trim(), body: body.trim(), severity, regions, starts_at: new Date(startsAt).toISOString(), expires_at: new Date(expiresAt).toISOString() });
  }
  return (
    <form onSubmit={event => void submit(event)} noValidate className="mb-2 space-y-3 border-b border-line pb-5" aria-label={t('ops.notices.write', 'Write a notice')}>
      <TextField label={t('ops.notices.title', 'Title')} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} />
      <TextArea label={t('ops.notices.body', 'What people should know')} rows={4} maxLength={1000} value={body} onChange={event => setBody(event.target.value)} hint={t('ops.notices.body_hint', 'Plain words. A second person approves it before the public sees it.')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label={t('ops.notices.severity', 'Level')} value={severity} onChange={event => setSeverity(event.target.value)}><option value="info">{t('citizen.severity.info', 'Information')}</option><option value="advisory">{t('citizen.severity.advisory', 'Advisory')}</option><option value="warning">{t('citizen.severity.warning', 'Warning')}</option></SelectField>
        <TextField label={t('ops.notices.starts', 'Shows from')} type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} />
        <TextField label={t('ops.notices.expires', 'Shows until')} type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} />
      </div>
      <fieldset><legend className="text-sm font-semibold">{t('ops.notices.regions', 'Who sees it')}</legend><div className="mt-1 flex flex-wrap gap-x-5">{(communities.data?.items ?? []).map(c => <label key={c.slug} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={picked.includes(c.slug)} onChange={event => { const next = event.target.checked ? [...picked, c.slug] : picked.filter(slug => slug !== c.slug); setPicked(next); setRegions([...new Set((communities.data?.items ?? []).filter(x => next.includes(x.slug)).map(x => x.state))]); }} className="size-5 accent-[var(--tw-action)]" />{c.name}</label>)}</div></fieldset>
      <Button type="submit" loading={busy} disabled={!ready}>{t('ops.notices.save_draft', 'Save draft')}</Button>
    </form>
  );
}

function Moderation({ queue, loading, error, reload }: { queue?: QueueItem[]; loading: boolean; error: boolean; reload: () => void }) {
  const { t } = useTranslation();
  const [reasons, setReasons] = useState<Record<number, string>>({}); const [problem, setProblem] = useState(''); const [message, setMessage] = useState('');
  async function decide(item: QueueItem, action: 'approve' | 'remove' | 'dismiss') {
    const reason = (reasons[item.id] ?? '').trim();
    if (action !== 'dismiss' && reason.length < 3) { setProblem(t('ops.moderation.need_reason', 'Give a short reason (at least 3 characters).')); return; }
    try { await api(`/api/community/moderation/reports/${item.id}/resolve`, { method: 'POST', json: { action, reason: reason || 'Dismissed' } }); setProblem(''); setMessage(t('ops.moderation.done', 'Done.')); reload(); } catch (error) { setProblem(error instanceof ApiError ? error.detail : t('ops.failed', 'That was not saved. Try again.')); }
  }
  async function mute(item: QueueItem) {
    const reason = (reasons[item.id] ?? '').trim();
    if (!item.author_id || reason.length < 3) { setProblem(t('ops.moderation.need_reason', 'Give a short reason (at least 3 characters).')); return; }
    try { await api('/api/community/sanctions', { method: 'POST', json: { user_id: item.author_id, kind: 'mute', reason, hours: 24 } }); setProblem(''); setMessage(t('ops.moderation.muted', 'Muted for 24 hours.')); } catch (error) { setProblem(error instanceof ApiError ? error.detail : t('ops.failed', 'That was not saved. Try again.')); }
  }
  if (loading) return <li className="py-3"><Skeleton lines={2} /></li>;
  if (error) return <li className="py-3"><LoadError message={t('ops.moderation.load_error', 'The moderation queue could not be loaded.')} onRetry={reload} retryLabel={t('citizen.retry', 'Try again')} /></li>;
  if (!queue?.length && !message && !problem) return null;
  return (
    <li data-testid="moderation" className="list-none">
      {(message || problem) && <div className="py-2">{message && <Notice kind="success">{message}</Notice>}{problem && <Notice kind="danger">{problem}</Notice>}</div>}
      <ul>
      {queue?.map(item => (
        <Line key={`m${item.id}`} label={item.severity === 'high' ? t('ops.moderation.high', 'Urgent') : item.held ? t('ops.moderation.held', 'Held for review') : t('ops.moderation.flagged', 'Flagged')} tone={item.severity === 'high' ? 'text-danger' : 'text-warn'}>
          <p className="text-sm text-ink-muted">{item.reason} · {t('ops.moderation.reports', { count: item.open_reports, defaultValue: '{{count}} report(s)' })}</p>
          <p className="whitespace-pre-wrap text-lg">{item.content ?? t('ops.moderation.gone', '(already removed)')}</p>
          {item.image?.url && <ModerationMedia image={item.image} assessment={item.community_image_assessment} />}
          <p className="text-sm text-ink-muted">{item.author_name ?? '—'} · {t('ops.moderation.prior', { count: item.author_prior_removals, defaultValue: '{{count}} earlier removal(s)' })}</p>
          <div className="mt-2"><TextField label={t('ops.moderation.reason', 'Reason for your decision (the author sees it)')} value={reasons[item.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} /></div>
          <div className="mt-1 flex flex-wrap gap-x-6">
            {item.held && <button type="button" className={go} onClick={() => void decide(item, 'approve')}>{t('ops.moderation.approve', 'Approve')}</button>}
            <button type="button" className={warn} onClick={() => void decide(item, 'remove')}>{t('ops.moderation.remove', 'Remove')}</button>
            {!item.held && <button type="button" className={alt} onClick={() => void decide(item, 'dismiss')}>{t('ops.moderation.dismiss', 'Dismiss report')}</button>}
            {item.author_id && <button type="button" className={alt} onClick={() => void mute(item)}>{t('ops.moderation.mute', 'Mute author 24 h')}</button>}
          </div>
        </Line>))}
      </ul>
    </li>
  );
}

function Rooms() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => api<{ items: Room[] }>('/api/community/rooms') });
  const [problem, setProblem] = useState('');
  async function save(room: Room, change: Partial<Pick<Room, 'slow_mode_seconds' | 'frozen'>>) {
    try { await api(`/api/community/rooms/${encodeURIComponent(room.region)}`, { method: 'PATCH', json: change }); setProblem(''); await queryClient.invalidateQueries({ queryKey: ['rooms'] }); } catch (error) { setProblem(error instanceof ApiError ? error.detail : t('ops.failed', 'That was not saved. Try again.')); }
  }
  if (rooms.isLoading) return <Skeleton lines={3} />;
  if (rooms.isError) return <LoadError message={t('ops.rooms.load_error', 'Chat rooms could not be loaded.')} onRetry={() => void rooms.refetch()} retryLabel={t('citizen.retry', 'Try again')} />;
  return (
    <div>{problem && <Notice kind="danger">{problem}</Notice>}
      {!rooms.data?.items.length ? <p className="py-2 text-ink-muted">{t('ops.rooms.none', 'No chat rooms yet. They appear when someone first writes in one.')}</p>
        : <ul>{rooms.data.items.map(room => (
          <li key={room.region} className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line py-3">
            <div className="min-w-32 flex-1"><p className="text-base font-bold">{room.region}</p><p className="text-sm text-ink-muted">{room.frozen ? t('ops.rooms.frozen', 'Paused') : t('ops.rooms.open', 'Open')}{room.retention_days ? ` · ${t('ops.rooms.retention', { days: room.retention_days, defaultValue: 'kept {{days}} days' })}` : ''}</p></div>
            <div className="w-40"><SelectField label={t('ops.rooms.slow', 'Slow mode')} value={String(room.slow_mode_seconds)} onChange={event => void save(room, { slow_mode_seconds: Number(event.target.value) })}>{[0, 15, 30, 60, 120].map(seconds => <option key={seconds} value={seconds}>{seconds === 0 ? t('ops.rooms.off', 'Off') : `${seconds} s`}</option>)}</SelectField></div>
            <button type="button" className={room.frozen ? go : alt} onClick={() => void save(room, { frozen: !room.frozen })}>{room.frozen ? t('ops.rooms.resume', 'Resume room') : t('ops.rooms.pause', 'Pause room')}</button>
          </li>))}</ul>}
    </div>
  );
}
