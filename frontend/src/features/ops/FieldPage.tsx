import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { useCommunities } from '../../lib/community';
import { LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { buildRoster, type FAssignment, type FIncident, type FRanger, type FieldRow } from './fieldModel';
import { ageParts } from './queueModel';
import { useIncidents, useOpsRegion } from './useOps';

/* The Field page: who is out, who has stopped answering, who is free. The same flat board as the queue; time since the last word is the big number. */
const STATUS_TONE: Record<FieldRow['status'], string> = { assigned: 'text-unconfirmed', accepted: 'text-warn', in_progress: 'text-warn' };
const STATUS_WORD: Record<FieldRow['status'], string> = { assigned: 'Asked', accepted: 'On the way', in_progress: 'On site' };
const COPY = {
  silent: { title: 'Not answering', ask: 'Asked, and no reply yet.', empty: 'Everyone who was asked has answered.' },
  ground: { title: 'On the ground', ask: 'Accepted, on the way or on site.', empty: 'Nobody is out right now.' },
  free: { title: 'Free', ask: 'No open assignment.', empty: 'Every officer has an assignment.' },
} as const;

export function OpsFieldPage() {
  const { t } = useTranslation();
  const region = useOpsRegion();
  const communities = useCommunities();
  const assignments = useQuery({ queryKey: ['ops-assignments'], queryFn: () => api<{ items: FAssignment[] }>('/api/control-room/assignments'), refetchInterval: 30_000 });
  const rangers = useQuery({ queryKey: ['ops-rangers'], queryFn: () => api<{ items: FRanger[] }>('/api/control-room/rangers'), staleTime: 60_000 });
  const incidents = useIncidents();
  const regionName = (communities.data?.items ?? []).find(c => c.slug === region)?.name ?? null;
  const roster = useMemo(() => buildRoster({ assignments: assignments.data?.items ?? [], rangers: rangers.data?.items ?? [], incidents: (incidents.data ?? []) as FIncident[], region, regionName }), [assignments.data, rangers.data, incidents.data, region, regionName]);
  const out = roster.ground.length + roster.silent.length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title={t('nav.field')} subtitle={t('ops.f.subtitle', 'Who is out, who has stopped answering, who is free.')} />
      {assignments.isLoading ? <Skeleton lines={5} /> : assignments.isError ? <LoadError message={t('ops.field.error', 'Assignments could not be loaded.')} onRetry={() => void assignments.refetch()} retryLabel={t('citizen.retry', 'Try again')} /> : (<>
        <p className="text-ink-muted" role="status">{t('ops.f.summary', { out, silent: roster.silent.length, free: roster.free.length, defaultValue: '{{out}} out · {{silent}} not answering · {{free}} free' })}</p>
        {(['silent', 'ground'] as const).map(section => (
          <section key={section} aria-labelledby={`f-${section}`} className="mt-8">
            <h2 id={`f-${section}`} className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-ink pb-1.5 text-sm font-bold uppercase tracking-[0.09em]">
              {t(`ops.f.${section}.title`, COPY[section].title)} <span className="font-mono tracking-normal">{roster[section].length}</span>
              <span className="text-[0.9375rem] font-normal normal-case tracking-normal text-ink-muted">{t(`ops.f.${section}.ask`, COPY[section].ask)}</span>
            </h2>
            {roster[section].length === 0 ? <p className="py-3 text-ink-muted">{t(`ops.f.${section}.empty`, COPY[section].empty)}</p> : (
              <ul>{roster[section].map(row => <Row key={row.key} row={row} section={section} />)}</ul>)}
          </section>))}
        <section aria-labelledby="f-free" className="mt-8">
          <h2 id="f-free" className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-ink pb-1.5 text-sm font-bold uppercase tracking-[0.09em]">
            {t('ops.f.free.title', COPY.free.title)} <span className="font-mono tracking-normal">{roster.free.length}</span>
            <span className="text-[0.9375rem] font-normal normal-case tracking-normal text-ink-muted">{t('ops.f.free.ask', COPY.free.ask)}</span>
          </h2>
          {roster.free.length === 0 ? <p className="py-3 text-ink-muted">{t('ops.f.free.empty', COPY.free.empty)}</p> : (
            <ul>{roster.free.map(r => <li key={r.key} className="flex flex-wrap items-baseline gap-x-4 border-b border-line py-2.5"><span className="font-bold">{r.officer}</span>{r.where && <span className="text-ink-muted">{r.where}</span>}</li>)}</ul>)}
          <p className="mt-3 text-sm text-ink-muted">{t('ops.f.free_hint', 'To send someone, open an event in the')} <Link to="/ops/queue" className="font-semibold underline">{t('nav.queue')}</Link>.</p>
        </section>
      </>)}
    </div>
  );
}

function Row({ row, section }: { row: FieldRow; section: 'silent' | 'ground' }) {
  const { t } = useTranslation();
  const [n, unit] = ageParts(row.ageMin);
  const line = row.status === 'assigned' ? t('ops.f.t.asked', 'Asked, no reply yet.') : row.status === 'accepted' ? t('ops.f.t.accepted', 'Accepted, on the way.') : t('ops.f.t.on_site', 'On site.');
  return (
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-3 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-x-4">
      <div className="pt-0.5 text-right font-mono leading-none">
        <b className={`block text-xl font-medium tracking-tight sm:text-2xl ${row.late ? 'text-warn' : ''}`}>{n}</b>
        <small className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">{t(`ops.q.u.${unit}`, unit)}</small>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-base font-bold">{row.officer}</span>
          <span className={`inline-flex items-baseline gap-1.5 text-sm font-bold ${STATUS_TONE[row.status]}`}><span aria-hidden="true" className="inline-block size-[7px] bg-current" />{t(`ops.f.s.${row.status}`, STATUS_WORD[row.status])}</span>
          {row.late && <span className="text-sm font-bold text-warn">{section === 'silent' ? t('ops.f.late_silent', 'No reply for a long time') : t('ops.f.late_quiet', 'No word for a long time')}</span>}
        </div>
        <p className="mt-0.5">{line}{row.observations > 0 ? ` · ${t('ops.f.notes', { count: row.observations, defaultValue: 'Notes recorded: {{count}}' })}` : ''}</p>
        <p className="mt-0.5 text-ink-muted"><Link to={`/ops/incidents/${row.incidentId}`} className="font-semibold text-ink underline underline-offset-4">{row.place}</Link>{row.community ? ` · ${row.community}` : ''}</p>
      </div>
    </li>
  );
}
