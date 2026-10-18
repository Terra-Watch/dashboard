import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { EmptyState, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { stateName } from '../citizen/format';
import { useOpsRegion } from './useOps';

type Row = { id: number; incident_id: number; ranger_name: string; status: string; state: string | null; incident_status: string; observations: number; updated_at: string; created_at: string };

export function OpsFieldPage() {
  const { t } = useTranslation();
  const region = useOpsRegion();
  const list = useQuery({ queryKey: ['ops-assignments'], queryFn: () => api<{ items: Row[] }>('/api/control-room/assignments'), refetchInterval: 30_000 });
  const rows = (list.data?.items ?? []).filter(row => !region || row.state === region);
  const waiting = rows.filter(row => row.status === 'assigned');
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageTitle title={t('nav.field')} subtitle={t('ops.field.subtitle', 'Open assignments and what each officer has recorded.')} />
      {list.isLoading ? <Skeleton lines={4} /> : list.isError ? <LoadError message={t('ops.field.error', 'Assignments could not be loaded.')} onRetry={() => void list.refetch()} retryLabel={t('citizen.retry', 'Try again')} />
        : !rows.length ? <EmptyState title={t('ops.field.empty', 'No open assignments.')}>{t('ops.field.empty_hint', 'Assign an officer from an incident.')}</EmptyState>
        : <>
          {waiting.length > 0 && <Notice kind="warning">{t('ops.field.waiting', { count: waiting.length, defaultValue: '{{count}} assignment(s) have not been answered yet.' })}</Notice>}
          <div className="overflow-x-auto rounded-panel border border-line bg-surface"><table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">{t('nav.field')}</caption>
            <thead className="border-b border-line bg-surface-2"><tr>{[t('ops.field.officer', 'Officer'), t('ops.incident', 'Incident'), t('ops.field.answer', 'Answer'), t('ops.field.obs', 'Observations'), t('ops.field.updated', 'Updated')].map(h => <th key={h} scope="col" className="px-3 py-2 text-sm font-bold">{h}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-b border-line last:border-0">
              <th scope="row" className="px-3 py-2 font-semibold">{row.ranger_name}</th>
              <td className="px-3 py-2"><Link className="font-bold underline" to={`/ops/incidents/${row.incident_id}`}>#{row.incident_id}</Link> <span className="text-ink-muted">{stateName(row.state)}</span> <RungBadge rung={rungOfStatus(row.incident_status)} /></td>
              <td className="px-3 py-2">{t(`field.status.${row.status}`, row.status)}</td><td className="px-3 py-2">{row.observations}</td><td className="px-3 py-2 text-ink-muted">{ageText(row.updated_at)}</td></tr>)}</tbody></table></div>
        </>}
    </div>
  );
}
