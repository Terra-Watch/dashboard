import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SelectField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, EmptyState, PageTitle, Skeleton } from '../../ui/Page';
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

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.capture')} subtitle={t('field.capture.subtitle', 'Record an observation or a photo for the task you are working on.')} />
      {tasks.isLoading ? <Skeleton lines={3} /> : !working.length
        ? <EmptyState title={t('field.capture.none', 'No accepted task to record for.')} action={<Link to="/field/tasks" className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold">{t('nav.tasks')}</Link>}>{t('field.capture.none_hint', 'Accept a task first. Then you can record here.')}</EmptyState>
        : <>
          {working.length > 1 && <SelectField label={t('field.capture.which', 'Which incident?')} value={String(assignmentId)} onChange={event => setChosen(Number(event.target.value))}>{working.map(item => <option key={item.assignment_id} value={item.assignment_id}>{t('field.incident', { id: item.incident_id, defaultValue: 'Incident {{id}}' })}</option>)}</SelectField>}
          {assignmentId && <>
            <Card title={t('field.record', 'Record what you find')}><ObservationForm assignmentId={assignmentId} onSaved={() => void queryClient.invalidateQueries({ queryKey: TASKS_KEY })} /></Card>
            <Card title={t('field.photo.title', 'Photo')}><PhotoButton assignmentId={assignmentId} onDone={() => undefined} /></Card>
          </>}
          <Notice kind="info">{t('field.capture.note', 'An observation goes to the Control Room. Only they change the incident.')}</Notice>
        </>}
    </div>
  );
}
