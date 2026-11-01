import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card } from '../../ui/Page';
import { formatWhen } from '../citizen/format';

type Question = { id: number; question: string; asked_at: string; answer: string | null; answered_at: string | null };

/** Two small Control Room tools: ask the reporter something, and say that this is the same event as another incident. */
export function IncidentActions({ incidentId, onMerged }: { incidentId: number; onMerged: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const questions = useQuery({ queryKey: ['incident-questions', incidentId], queryFn: () => api<{ items: Question[] }>(`/api/incidents/${incidentId}/questions`), refetchInterval: 30_000 });
  const [text, setText] = useState(''); const [target, setTarget] = useState(''); const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false); const [problem, setProblem] = useState(''); const [message, setMessage] = useState('');

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setProblem(''); setMessage('');
    try { await action(); setMessage(done); return true; }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.actions.failed', 'That did not work. Try again.')); return false; }
    finally { setBusy(false); }
  }

  return (
    <Card title={t('ops.actions.title', 'Ask or merge')}>
      {message && <Notice kind="success">{message}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}
      <div className="space-y-3">
        <TextArea label={t('ops.actions.ask', 'Ask the person who reported this')} rows={2} maxLength={300} value={text} onChange={event => setText(event.target.value)}
          hint={t('ops.actions.ask_hint', 'One short, plain question. They see it in their inbox and on their report, and can answer there.')} />
        <Button loading={busy} disabled={text.trim().length < 5} onClick={() => void run(() => api(`/api/incidents/${incidentId}/question`, { method: 'POST', json: { question: text.trim() } }), t('ops.actions.asked', 'Question sent.')).then(ok => { if (ok) { setText(''); void queryClient.invalidateQueries({ queryKey: ['incident-questions', incidentId] }); } })}>{t('ops.actions.send_question', 'Send the question')}</Button>
        {questions.data?.items.length ? <ul className="space-y-2 text-sm">{questions.data.items.map(item => (
          <li key={item.id} className="rounded-rq border border-line p-2"><p><strong>{t('ops.actions.you_asked', 'You asked')}:</strong> {item.question} <span className="text-ink-muted">({formatWhen(item.asked_at)})</span></p>
            <p>{item.answer ? <><strong>{t('ops.actions.they_said', 'They answered')}:</strong> {item.answer}</> : <span className="text-ink-muted">{t('ops.actions.waiting', 'No answer yet.')}</span>}</p></li>))}</ul> : null}
      </div>
      <hr className="my-4 border-line" />
      <div className="space-y-2">
        <TextField label={t('ops.actions.merge', 'This is the same event as incident number')} inputMode="numeric" value={target} onChange={event => setTarget(event.target.value.replace(/\D/g, ''))}
          hint={t('ops.actions.merge_hint', 'Its photos move to that incident and this one is closed as a duplicate. Nothing is deleted.')} />
        <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={sure} onChange={event => setSure(event.target.checked)} /><span>{t('ops.actions.merge_sure', 'Yes, merge this incident.')}</span></label>
        <Button variant="secondary" loading={busy} disabled={!target || !sure} onClick={() => void run(() => api(`/api/incidents/${incidentId}/merge`, { method: 'POST', json: { into: Number(target) } }), t('ops.actions.merged', 'Merged.')).then(ok => { if (ok) onMerged(); })}>{t('ops.actions.do_merge', 'Merge into that incident')}</Button>
      </div>
    </Card>
  );
}
