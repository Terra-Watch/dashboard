import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Notice } from '../../ui/Notice';
import { EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { LocateButton, usePosition } from './Position';
import { bearingDeg, compassPoint, distanceKm, distanceText } from './geo';
import { useTasks, type Task } from './useTasks';

export function TaskStatus({ status }: { status: Task['status'] }) {
  const { t } = useTranslation();
  const styles = { assigned: 'border-warn bg-warn-tint text-warn', accepted: 'border-action bg-action-tint text-ink', in_progress: 'border-ok bg-ok-tint text-ok' } as const;
  const words = { assigned: t('field.status.assigned', 'Needs your answer'), accepted: t('field.status.accepted', 'Accepted'), in_progress: t('field.status.in_progress', 'In progress') } as const;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${styles[status]}`}>{words[status]}</span>;
}

export function TasksPage() {
  const { t } = useTranslation();
  const tasks = useTasks();
  const { position } = usePosition();
  const items = tasks.data ?? [];
  const waiting = items.filter(item => item.status === 'assigned');
  const active = items.filter(item => item.status !== 'assigned');
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.tasks')} subtitle={t('field.tasks.subtitle', 'Your assignments. Answer new ones first.')} actions={<LocateButton />} />
      {tasks.isLoading ? <Skeleton lines={4} /> : tasks.isError ? <Notice kind="danger">{t('field.tasks.error', 'Tasks could not be loaded. Saved tasks stay on this phone; try again when you have signal.')} <button className="underline" onClick={() => void tasks.refetch()}>{t('citizen.retry', 'Try again')}</button></Notice>
        : !items.length ? <EmptyState title={t('field.tasks.empty', 'No assignments right now.')}>{t('field.tasks.empty_hint', 'When the Control Room assigns you an incident it appears here and you are notified.')}</EmptyState>
        : <>
          {[{ key: 'wait', title: t('field.tasks.new', 'Waiting for your answer'), list: waiting }, { key: 'active', title: t('field.tasks.active', 'Your active tasks'), list: active }].filter(group => group.list.length).map(group => (
            <section key={group.key} aria-labelledby={`g-${group.key}`}>
              <h2 id={`g-${group.key}`} className="mb-2 text-xl">{group.title}</h2>
              <ul className="space-y-3">{group.list.map(task => {
                const here = position && task.latitude != null && task.longitude != null ? { to: { lat: task.latitude, lon: task.longitude } } : null;
                return (
                  <li key={task.assignment_id}><Link to={`/field/tasks/${task.assignment_id}`} className="flex items-center gap-3 rounded-panel border border-line bg-surface p-4 text-ink hover:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-lg font-bold">{t('field.incident', { id: task.incident_id, defaultValue: 'Incident {{id}}' })}</span><TaskStatus status={task.status} /></div>
                      <p className="mt-1 text-ink-muted">{task.source} · {task.size}</p>
                      {here && position && <p className="mt-1 font-semibold">{distanceText(distanceKm(position, here.to))} {compassPoint(bearingDeg(position, here.to))} <span className="font-normal text-ink-muted">({t('field.straight_line', 'straight line')})</span></p>}
                    </div>
                    <ChevronRight aria-hidden="true" size={22} />
                  </Link></li>);
              })}</ul>
            </section>))}
        </>}
    </div>
  );
}
