import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Navigation } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { ObservationForm, PhotoButton } from './ObservationForm';
import { LocateButton, usePosition } from './Position';
import { TaskStatus } from './TasksPage';
import { bearingDeg, compassPoint, distanceKm, distanceText } from './geo';
import { TASKS_KEY, useTasks } from './useTasks';

type Observation = { id: number; outcome: string; notes: string; observed_at: string };
const OUTCOME_WORDS: Record<string, string> = { confirmed: 'Fire confirmed', not_confirmed: 'No fire found', inconclusive: 'Could not tell' };

export function TaskDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const assignmentId = Number(id);
  const queryClient = useQueryClient();
  const tasks = useTasks();
  const { position } = usePosition();
  const task = tasks.data?.find(item => item.assignment_id === assignmentId);
  const observations = useQuery({ queryKey: ['field-observations', assignmentId], queryFn: () => api<{ items: Observation[] }>(`/api/ranger/assignments/${assignmentId}/verifications`), enabled: Number.isFinite(assignmentId) && Boolean(task && task.status !== 'assigned') });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  async function act(path: string, json?: unknown) {
    setBusy(true); setProblem('');
    try { await api(`/api/ranger/assignments/${assignmentId}/${path}`, { method: 'POST', json: json ?? {} }); await queryClient.invalidateQueries({ queryKey: TASKS_KEY }); setDeclineOpen(false); return true; }
    catch (error) { setProblem(error instanceof ApiError ? error.detail : t('field.act_failed', 'That was not saved. Check your signal and try again.')); return false; }
    finally { setBusy(false); }
  }

  if (tasks.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton lines={5} /></div>;
  if (doneMessage) return <div className="mx-auto max-w-2xl space-y-4"><PageTitle title={t('field.done_title', 'Task finished')} /><Notice kind="success">{doneMessage}</Notice><Link to="/field/tasks" className="inline-flex min-h-11 items-center font-semibold underline">{t('nav.tasks')}</Link></div>;
  if (!task) return <div className="mx-auto max-w-2xl"><Notice kind="warning">{t('field.task_gone', 'This task is not in your list any more. It may be finished, declined, or reassigned.')} <Link className="underline" to="/field/tasks">{t('nav.tasks')}</Link></Notice></div>;

  const target = task.latitude != null && task.longitude != null ? { lat: task.latitude, lon: task.longitude } : null;
  const working = task.status === 'accepted' || task.status === 'in_progress';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('field.incident', { id: task.incident_id, defaultValue: 'Incident {{id}}' })} subtitle={`${task.source} · ${task.size}`} actions={<TaskStatus status={task.status} />} />
      {problem && <Notice kind="danger">{problem}</Notice>}

      <Card title={t('field.place', 'Place')}>
        {target ? <>
          <p className="text-lg font-semibold">{target.lat.toFixed(5)}, {target.lon.toFixed(5)}</p>
          {position ? <p className="mt-1 text-xl font-bold" role="status">{distanceText(distanceKm(position, target))} {compassPoint(bearingDeg(position, target))} <span className="text-base font-normal text-ink-muted">· {t('field.straight_line', 'straight line')} · {t('field.accuracy', { m: Math.round(position.accuracy), defaultValue: 'position accurate to about {{m}} m' })}</span></p> : <p className="mt-1 text-ink-muted">{t('field.tap_locate', 'Tap below to see distance and direction from where you are.')}</p>}
          <div className="mt-3 flex flex-wrap gap-2"><LocateButton /><a href={`geo:${target.lat},${target.lon}?q=${target.lat},${target.lon}`} className="inline-flex min-h-11 items-center gap-2 rounded-rq border border-control px-4 font-semibold text-ink hover:bg-surface-2"><Navigation aria-hidden="true" size={18} />{t('field.open_nav', 'Open in navigation app')}</a></div>
        </> : <p className="text-ink-muted">{t('field.no_place', 'This incident has no location on record.')}</p>}
        {task.notes && <p className="mt-3 whitespace-pre-wrap text-ink-muted"><span className="font-bold text-ink">{t('field.reporter_notes', 'Report')}: </span>{task.notes}</p>}
      </Card>

      {task.status === 'assigned' && (
        <Card title={t('field.answer', 'Can you take this?')}>
          <div className="flex flex-wrap gap-3">
            <Button loading={busy} onClick={() => void act('decision', { decision: 'accepted' })} icon={<Check aria-hidden="true" size={18} />}>{t('field.accept', 'Accept')}</Button>
            <Dialog.Root open={declineOpen} onOpenChange={setDeclineOpen}>
              <Dialog.Trigger asChild><Button variant="secondary">{t('field.decline', 'Decline')}</Button></Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
                <Dialog.Content data-rq-app className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-control bg-surface p-5 text-ink">
                  <Dialog.Title className="text-xl font-bold">{t('field.decline_title', 'Why can you not take this?')}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-ink-muted">{t('field.decline_body', 'The Control Room sees your reason and will assign someone else.')}</Dialog.Description>
                  <div className="mt-3"><TextArea label={t('field.reason', 'Reason')} rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></div>
                  <div className="mt-4 flex justify-end gap-2"><Dialog.Close asChild><Button variant="secondary">{t('field.keep', 'Keep it')}</Button></Dialog.Close><Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => void act('decision', { decision: 'declined', reason: reason.trim() }).then(ok => ok && setDoneMessage(t('field.declined', 'You declined this task. The Control Room has been told.')))}>{t('field.decline_confirm', 'Decline task')}</Button></div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </Card>)}

      {working && <>
        <Card title={t('field.record', 'Record what you find')}><ObservationForm assignmentId={assignmentId} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ['field-observations', assignmentId] }); void queryClient.invalidateQueries({ queryKey: TASKS_KEY }); }} /></Card>
        <Card title={t('field.photo.title', 'Photo')}><PhotoButton assignmentId={assignmentId} onDone={() => undefined} /></Card>
        <Card title={t('field.my_obs', 'Your observations')}>
          {observations.isLoading ? <Skeleton lines={2} /> : !observations.data?.items.length ? <p className="text-ink-muted">{t('field.no_obs', 'None yet. Record at least one before you finish.')}</p>
            : <ul className="space-y-3">{observations.data.items.map(item => <li key={item.id} className="rounded-rq border border-line p-3"><p className="font-bold">{t(`field.obs.${item.outcome}`, OUTCOME_WORDS[item.outcome] ?? item.outcome)} <span className="font-normal text-ink-muted">· {formatWhen(item.observed_at)}</span></p><p className="mt-1 whitespace-pre-wrap">{item.notes}</p></li>)}</ul>}
        </Card>
        <Button block variant="secondary" loading={busy} disabled={!observations.data?.items.length} onClick={() => void act('complete').then(ok => ok && setDoneMessage(t('field.completed', 'Field work is complete. The Control Room has been told.')))}>{t('field.complete', 'Finish field work')}</Button>
        {!observations.data?.items.length && <p className="text-sm text-ink-muted">{t('field.complete_needs', 'You can finish once you have recorded an observation.')}</p>}
      </>}
    </div>
  );
}
