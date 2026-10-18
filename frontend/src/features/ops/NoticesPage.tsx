import * as Tabs from '@radix-ui/react-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { useSession } from '../../app/session';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { STATES, formatWhen } from '../citizen/format';
import type { CommunityImageAssessment } from '../../lib/assessmentPresentation';
import { ModerationMedia, type ModerationImage } from './ModerationMedia';

type NoticeRow = { id: number; title: string; body: string; severity: 'info' | 'advisory' | 'warning'; regions: string[]; status: 'draft' | 'pending_approval' | 'published' | 'withdrawn'; author_id: number; starts_at: string; expires_at: string; return_reason: string | null; expired: boolean };
type QueueItem = { id: number; reason: string; kind: string; held: boolean; content: string | null; author_id: number | null; author_name: string | null; author_prior_removals: number; open_reports: number; severity: 'high' | 'held' | 'normal'; image?: ModerationImage | null; community_image_assessment?: CommunityImageAssessment | null };
type Room = { region: string; slow_mode_seconds: number; frozen: boolean; retention_days: number | null };

export function NoticesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('notices');
  const queue = useQuery({ queryKey: ['mod-queue'], queryFn: () => api<{ items: QueueItem[] }>('/api/community/moderation/queue'), refetchInterval: 60_000 });
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle title={t('nav.notices')} subtitle={t('ops.notices.subtitle', 'Official notices for the public, and the community.')} />
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label={t('nav.notices')} className="flex flex-wrap gap-1 border-b border-line">
          {[['notices', t('ops.notices.tab', 'Notices')], ['moderation', `${t('ops.moderation.tab', 'Moderation')}${queue.data?.items.length ? ` (${queue.data.items.length})` : ''}`], ['rooms', t('ops.rooms.tab', 'Chat rooms')]].map(([value, label]) => <Tabs.Trigger key={value} value={value} className="min-h-12 border-b-4 border-transparent px-4 font-semibold data-[state=active]:border-action hover:bg-surface-2">{label}</Tabs.Trigger>)}
        </Tabs.List>
        <Tabs.Content value="notices" className="pt-4 outline-none"><NoticeAdmin /></Tabs.Content>
        <Tabs.Content value="moderation" className="pt-4 outline-none"><Moderation queue={queue.data?.items} loading={queue.isLoading} error={queue.isError} reload={() => void queue.refetch()} /></Tabs.Content>
        <Tabs.Content value="rooms" className="pt-4 outline-none"><Rooms /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function NoticeAdmin() {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['notice-admin'], queryFn: () => api<{ items: NoticeRow[] }>('/api/notices?limit=100') });
  const [problem, setProblem] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [severity, setSeverity] = useState('info'); const [regions, setRegions] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); const [expiresAt, setExpiresAt] = useState('');
  const [reasonFor, setReasonFor] = useState<{ id: number; kind: 'return' | 'withdraw' } | null>(null); const [reason, setReason] = useState('');
  const canApprove = user?.role === 'admin' || user?.role === 'incident_commander';
  const ready = title.trim() && body.trim() && regions.length > 0 && expiresAt;

  async function act(action: () => Promise<unknown>, done: string) {
    setBusy(true); setProblem(''); setMessage('');
    try { await action(); setMessage(done); await queryClient.invalidateQueries({ queryKey: ['notice-admin'] }); return true; } catch (error) { setProblem(error instanceof ApiError ? error.detail : t('ops.failed', 'That was not saved. Try again.')); return false; } finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (!ready) return;
    const ok = await act(() => api('/api/notices', { method: 'POST', json: { title: title.trim(), body: body.trim(), severity, regions, starts_at: new Date(startsAt).toISOString(), expires_at: new Date(expiresAt).toISOString() } }), t('ops.notices.saved', 'Draft saved. Send it for approval when it is ready.'));
    if (ok) { setTitle(''); setBody(''); setRegions([]); setExpiresAt(''); }
  }

  return (
    <div className="space-y-4">
      {message && <Notice kind="success">{message}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}
      <Card title={t('ops.notices.write', 'Write a notice')}>
        <form onSubmit={event => void create(event)} noValidate className="space-y-3">
          <TextField label={t('ops.notices.title', 'Title')} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} />
          <TextArea label={t('ops.notices.body', 'What people should know')} rows={4} maxLength={1000} value={body} onChange={event => setBody(event.target.value)} hint={t('ops.notices.body_hint', 'Plain words. A second person approves it before the public sees it.')} />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label={t('ops.notices.severity', 'Level')} value={severity} onChange={event => setSeverity(event.target.value)}><option value="info">{t('citizen.severity.info', 'Information')}</option><option value="advisory">{t('citizen.severity.advisory', 'Advisory')}</option><option value="warning">{t('citizen.severity.warning', 'Warning')}</option></SelectField>
            <TextField label={t('ops.notices.starts', 'Shows from')} type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} />
            <TextField label={t('ops.notices.expires', 'Shows until')} type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} />
          </div>
          <fieldset><legend className="text-sm font-semibold">{t('ops.notices.regions', 'Who sees it')}</legend><div className="mt-1 flex flex-wrap gap-3">{STATES.map(state => <label key={state.code} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={regions.includes(state.code)} onChange={event => setRegions(current => event.target.checked ? [...current, state.code] : current.filter(code => code !== state.code))} className="size-5 accent-[var(--tw-action)]" />{state.name}</label>)}</div></fieldset>
          <Button type="submit" loading={busy} disabled={!ready}>{t('ops.notices.save_draft', 'Save draft')}</Button>
        </form>
      </Card>
      {list.isLoading ? <Skeleton lines={3} /> : list.isError ? <LoadError message={t('ops.notices.load_error', 'Notices could not be loaded.')} onRetry={() => void list.refetch()} retryLabel={t('citizen.retry', 'Try again')} /> : !list.data?.items.length ? <EmptyState title={t('ops.notices.none', 'No notices yet.')} />
        : <ul className="space-y-3">{list.data.items.map(item => (
          <li key={item.id} className="rounded-panel border border-line bg-surface p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t(`ops.notice_status.${item.status}`, item.status.replace('_', ' '))}{item.expired ? ` · ${t('ops.notices.expired', 'expired')}` : ''} · {t(`citizen.severity.${item.severity}`, item.severity)} · {item.regions.join(', ')}</p>
            <h3 className="text-lg">{item.title}</h3><p className="mt-1 whitespace-pre-wrap">{item.body}</p>
            <p className="mt-1 text-sm text-ink-muted">{formatWhen(item.starts_at)} → {formatWhen(item.expires_at)}</p>
            {item.return_reason && item.status === 'draft' && <Notice kind="warning" className="mt-2" title={t('ops.notices.returned', 'Returned for changes')}>{item.return_reason}</Notice>}
            <div className="mt-2 flex flex-wrap gap-2">
              {item.status === 'draft' && item.author_id === user?.id && <Button variant="secondary" disabled={busy} onClick={() => void act(() => api(`/api/notices/${item.id}/submit`, { method: 'POST', json: {} }), t('ops.notices.submitted', 'Sent for approval.'))}>{t('ops.notices.submit', 'Send for approval')}</Button>}
              {item.status === 'pending_approval' && canApprove && item.author_id !== user?.id && <><Button disabled={busy} onClick={() => void act(() => api(`/api/notices/${item.id}/approve`, { method: 'POST', json: {} }), t('ops.notices.approved', 'Published.'))}>{t('ops.notices.approve', 'Approve and publish')}</Button><Button variant="secondary" onClick={() => setReasonFor({ id: item.id, kind: 'return' })}>{t('ops.notices.return', 'Return with a reason')}</Button></>}
              {item.status === 'pending_approval' && item.author_id === user?.id && <p className="text-sm text-ink-muted">{t('ops.notices.wait_second', 'Waiting for a second person to approve. You cannot approve your own notice.')}</p>}
              {item.status === 'published' && <Button variant="danger" onClick={() => setReasonFor({ id: item.id, kind: 'withdraw' })}>{t('ops.notices.withdraw', 'Withdraw')}</Button>}
            </div>
            {reasonFor?.id === item.id && (
              <div className="mt-3 space-y-2"><TextField label={t('ops.reason', 'Reason')} value={reason} onChange={event => setReason(event.target.value)} />
                <div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3} onClick={() => void act(() => api(`/api/notices/${item.id}/${reasonFor.kind}`, { method: 'POST', json: { reason: reason.trim() } }), reasonFor.kind === 'return' ? t('ops.notices.returned_ok', 'Returned to the author.') : t('ops.notices.withdrawn', 'Withdrawn.')).then(() => { setReasonFor(null); setReason(''); })}>{t('ops.confirm', 'Confirm')}</Button><Button variant="secondary" onClick={() => setReasonFor(null)}>{t('citizen.community.cancel', 'Cancel')}</Button></div></div>)}
          </li>))}</ul>}
    </div>
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
  if (loading) return <Skeleton lines={3} />;
  if (error) return <LoadError message={t('ops.moderation.load_error', 'The moderation queue could not be loaded.')} onRetry={reload} retryLabel={t('citizen.retry', 'Try again')} />;
  return (
    <div className="space-y-3" data-testid="moderation">
      {message && <Notice kind="success">{message}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}
      {!queue?.length ? <EmptyState title={t('ops.moderation.empty', 'Nothing to review.')} /> : (
        <ul className="space-y-3">{queue.map(item => (
          <li key={item.id} className="rounded-panel border border-line bg-surface p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{item.severity === 'high' ? t('ops.moderation.high', 'Urgent') : item.held ? t('ops.moderation.held', 'Held for review') : t('ops.moderation.flagged', 'Flagged')} · {item.reason} · {t('ops.moderation.reports', { count: item.open_reports, defaultValue: '{{count}} report(s)' })}</p>
            <p className="mt-1 whitespace-pre-wrap text-lg">{item.content ?? t('ops.moderation.gone', '(already removed)')}</p>
            {item.image?.url && <ModerationMedia image={item.image} assessment={item.community_image_assessment} />}
            <p className="text-sm text-ink-muted">{item.author_name ?? '—'} · {t('ops.moderation.prior', { count: item.author_prior_removals, defaultValue: '{{count}} earlier removal(s)' })}</p>
            <div className="mt-2"><TextField label={t('ops.moderation.reason', 'Reason for your decision (the author sees it)')} value={reasons[item.id] ?? ''} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} /></div>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.held && <Button variant="secondary" onClick={() => void decide(item, 'approve')}>{t('ops.moderation.approve', 'Approve')}</Button>}
              <Button variant="danger" onClick={() => void decide(item, 'remove')}>{t('ops.moderation.remove', 'Remove')}</Button>
              {!item.held && <Button variant="secondary" onClick={() => void decide(item, 'dismiss')}>{t('ops.moderation.dismiss', 'Dismiss report')}</Button>}
              {item.author_id && <Button variant="secondary" onClick={() => void mute(item)}>{t('ops.moderation.mute', 'Mute author 24 h')}</Button>}
            </div>
          </li>))}</ul>)}
    </div>
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
    <div className="space-y-3">{problem && <Notice kind="danger">{problem}</Notice>}
      {!rooms.data?.items.length ? <EmptyState title={t('ops.rooms.none', 'No chat rooms yet. They appear when someone first writes in one.')} />
        : <ul className="space-y-3">{rooms.data.items.map(room => (
          <li key={room.region} className="flex flex-wrap items-end gap-4 rounded-panel border border-line bg-surface p-4">
            <div className="min-w-32 flex-1"><p className="text-lg font-bold">{room.region}</p><p className="text-sm text-ink-muted">{room.frozen ? t('ops.rooms.frozen', 'Paused') : t('ops.rooms.open', 'Open')}{room.retention_days ? ` · ${t('ops.rooms.retention', { days: room.retention_days, defaultValue: 'kept {{days}} days' })}` : ''}</p></div>
            <div className="w-40"><SelectField label={t('ops.rooms.slow', 'Slow mode')} value={String(room.slow_mode_seconds)} onChange={event => void save(room, { slow_mode_seconds: Number(event.target.value) })}>{[0, 15, 30, 60, 120].map(seconds => <option key={seconds} value={seconds}>{seconds === 0 ? t('ops.rooms.off', 'Off') : `${seconds} s`}</option>)}</SelectField></div>
            <Button variant={room.frozen ? 'primary' : 'secondary'} onClick={() => void save(room, { frozen: !room.frozen })}>{room.frozen ? t('ops.rooms.resume', 'Resume room') : t('ops.rooms.pause', 'Pause room')}</Button>
          </li>))}</ul>}
    </div>
  );
}
