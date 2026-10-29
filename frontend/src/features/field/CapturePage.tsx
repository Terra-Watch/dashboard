import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { NewReportForm } from './NewReportForm';
import { ObservationForm, PhotoButton } from './ObservationForm';
import { TASKS_KEY, useTasks } from './useTasks';

/** The centre button: record or photograph for the task you are working on, without hunting for it. */
export function CapturePage() {
  const { t } = useTranslation();
  const tasks = useTasks();
  const queryClient = useQueryClient();
  const working = (tasks.data ?? []).filter(item => item.status !== 'assigned');
  const [chosen, setChosen] = useState<number | null>(null);
  const assignmentId = chosen ?? working[0]?.assignment_id ?? null;

  const [mode, setMode] = useState<'task' | 'new' | null>(null);
  const active = mode ?? (working.length ? 'task' : 'new');      // no task to record for: go straight to a new report

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.capture')} subtitle={active === 'task' ? t('field.capture.subtitle', 'Record an observation or a photo for the task you are working on.') : t('field.new.subtitle', 'Report something you found. It does not need a task.')} />
      {!tasks.isLoading && working.length > 0 && (
        <div role="tablist" aria-label={t('nav.capture')} className="grid grid-cols-2 gap-1 rounded-rq border border-line bg-surface-2 p-1">
          {(['task', 'new'] as const).map(value => (
            <button key={value} type="button" role="tab" aria-selected={active === value} onClick={() => setMode(value)} className={`min-h-11 rounded-rq px-3 font-semibold transition ${active === value ? 'bg-surface shadow-sm' : 'text-ink-muted'}`}>
              {value === 'task' ? t('field.capture.for_task', 'For my task') : t('field.capture.new', 'New report')}
            </button>))}
        </div>)}
      {tasks.isLoading ? <Skeleton lines={3} /> : active === 'new' ? <NewReportForm /> : (
        <>
          {working.length > 1 && <SelectField label={t('field.capture.which', 'Which incident?')} value={String(assignmentId)} onChange={event => setChosen(Number(event.target.value))}>{working.map(item => <option key={item.assignment_id} value={item.assignment_id}>{t('field.incident', { id: item.incident_id, defaultValue: 'Incident {{id}}' })}</option>)}</SelectField>}
          {assignmentId && <>
            <Card title={t('field.record', 'Record what you find')}><ObservationForm assignmentId={assignmentId} onSaved={() => void queryClient.invalidateQueries({ queryKey: TASKS_KEY })} /></Card>
            <Card title={t('field.photo.title', 'Photo')}><PhotoButton assignmentId={assignmentId} onDone={() => undefined} /></Card>
          </>}
          <Notice kind="info">{t('field.capture.note', 'An observation goes to the Control Room. Only they change the incident.')}</Notice>
        </>)}
    </div>
  );
}
