import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { STATES, formatWhen, stateName } from '../citizen/format';
import { useIncidents, useOpsRegion } from './useOps';

type Note = { id: number; state: string; body: string; incident_id: number | null; created_at: string; acknowledged_at: string | null; author_name: string; acknowledged_by_name: string | null };

export function HandoverPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const region = useOpsRegion();
  const incidents = useIncidents();
  const notes = useQuery({ queryKey: ['handover'], queryFn: () => api<{ items: Note[] }>('/api/handover/notes') });
  const [state, setState] = useState(region || 'OD'); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [problem, setProblem] = useState('');
  const open = (incidents.data ?? []).filter(item => item.status !== 'closed' && (!region || item.state === region));
  const counts = ['reported', 'verified', 'responding', 'contained'].map(status => ({ status, count: open.filter(item => item.status === status).length }));

  async function add(event: FormEvent) {
    event.preventDefault(); if (!body.trim()) return; setBusy(true); setProblem('');
    try { await api('/api/handover/notes', { method: 'POST', json: { state, body: body.trim() } }); setBody(''); await queryClient.invalidateQueries({ queryKey: ['handover'] }); }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.failed', 'That was not saved. Try again.')); } finally { setBusy(false); }
  }
  const acknowledge = async (id: number) => { try { await api(`/api/handover/notes/${id}/acknowledge`, { method: 'POST', json: {} }); await queryClient.invalidateQueries({ queryKey: ['handover'] }); } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.failed', 'That was not saved. Try again.')); } };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('nav.handover')} subtitle={t('ops.handover.subtitle', 'What the next shift needs to know.')} />
      <Card title={t('ops.handover.open', 'Open now')}>
        {incidents.isLoading ? <Skeleton lines={1} /> : <ul className="flex flex-wrap gap-3">{counts.map(item => <li key={item.status} className="rounded-rq border border-line px-3 py-2"><span className="text-2xl font-bold">{item.count}</span> <span className="text-ink-muted">{t(`ops.tab.${item.status === 'reported' ? 'new' : item.status === 'contained' ? 'contained' : 'active'}`, item.status)} · {item.status}</span></li>)}</ul>}
        <p className="mt-2 text-sm"><Link to="/ops/queue" className="underline">{t('nav.queue')}</Link></p>
      </Card>
      <Card title={t('ops.handover.write', 'Leave a note')}>
        <form onSubmit={event => void add(event)} noValidate className="space-y-3">
          {problem && <Notice kind="danger">{problem}</Notice>}
          <SelectField label={t('ops.region', 'Region')} value={state} onChange={event => setState(event.target.value)}>{STATES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</SelectField>
          <TextArea label={t('ops.handover.note', 'Note')} rows={4} maxLength={2000} value={body} onChange={event => setBody(event.target.value)} hint={t('ops.handover.hint', 'Open questions, assumptions, who is waiting for what.')} />
          <Button type="submit" loading={busy} disabled={!body.trim()}>{t('ops.handover.save', 'Save note')}</Button>
        </form>
      </Card>
      {notes.isLoading ? <Skeleton lines={3} /> : !notes.data?.items.length ? <EmptyState title={t('ops.handover.none', 'No notes yet.')} />
        : <ul className="space-y-3">{notes.data.items.map(note => (
          <li key={note.id} className="rounded-panel border border-line bg-surface p-4"><p className="whitespace-pre-wrap text-lg">{note.body}</p>
            <p className="mt-2 text-sm text-ink-muted">{note.author_name} · {stateName(note.state)} · {formatWhen(note.created_at)}{note.incident_id ? ` · #${note.incident_id}` : ''}</p>
            {note.acknowledged_at ? <p className="mt-1 text-sm text-ok">{t('ops.handover.acked', 'Read by')} {note.acknowledged_by_name} · {formatWhen(note.acknowledged_at)}</p> : <Button className="mt-2" variant="secondary" onClick={() => void acknowledge(note.id)}>{t('ops.handover.ack', 'I have read this')}</Button>}</li>))}</ul>}
    </div>
  );
}
