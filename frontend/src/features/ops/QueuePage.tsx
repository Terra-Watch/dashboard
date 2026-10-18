import { useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { listStatusText, mediaCheckSuffix } from '../../lib/assessmentPresentation';
import { api } from '../../app/http';
import { groupClaims, type Claim } from '../map/corroboration';
import { Notice } from '../../ui/Notice';
import { EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { stateName } from '../citizen/format';
import { useIncidents, useOpsRegion, useOpsSettings, type Incident } from './useOps';

const TABS = [
  { id: 'new', statuses: ['reported'], label: 'Needs a decision' },
  { id: 'active', statuses: ['verified', 'responding'], label: 'Active' },
  { id: 'contained', statuses: ['contained'], label: 'Contained' },
  { id: 'closed', statuses: ['closed'], label: 'Closed' },
] as const;

type Hotspot = { id: number; latitude: number; longitude: number; acq_datetime: string };

export function QueuePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const region = useOpsRegion();
  const incidents = useIncidents();
  const settings = useOpsSettings();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('new');
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const scoped = useMemo(() => (incidents.data ?? []).filter(item => !region || item.state === region), [incidents.data, region]);
  const counts = Object.fromEntries(TABS.map(item => [item.id, scoped.filter(incident => (item.statuses as readonly string[]).includes(incident.status)).length]));
  const rows = useMemo(() => scoped.filter(incident => (TABS.find(item => item.id === tab)!.statuses as readonly string[]).includes(incident.status)).sort((a, b) => tab === 'new' ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.updated_at) - Date.parse(a.updated_at)), [scoped, tab]);

  const located = scoped.filter(item => item.latitude != null && item.longitude != null && item.status !== 'closed');
  const bbox = located.length ? { s: Math.min(...located.map(i => i.latitude!)) - 0.5, n: Math.max(...located.map(i => i.latitude!)) + 0.5, w: Math.min(...located.map(i => i.longitude!)) - 0.5, e: Math.max(...located.map(i => i.longitude!)) + 0.5 } : null;
  const cfg = settings.data?.corroboration ?? null;
  const signals = useQuery({ queryKey: ['ops-hotspots', bbox], enabled: Boolean(bbox && cfg), retry: false, queryFn: () => api<{ items: Hotspot[] }>(`/api/hotspots?min_lat=${bbox!.s}&min_lon=${bbox!.w}&max_lat=${bbox!.n}&max_lon=${bbox!.e}&since_hours=24`) });
  const groups = useMemo(() => {
    if (!cfg) return [];
    const claims: Claim[] = [
      ...located.map(item => ({ id: `i${item.id}`, kind: (item.status === 'reported' ? 'report' : 'incident') as Claim['kind'], lat: item.latitude!, lon: item.longitude!, at: item.observed_at ?? item.created_at })),
      ...(signals.data?.items ?? []).map(item => ({ id: `s${item.id}`, kind: 'signal' as const, lat: item.latitude, lon: item.longitude, at: item.acq_datetime })),
    ];
    return groupClaims(claims, { radiusKm: cfg.radius_km, windowMinutes: cfg.window_minutes }).filter(group => group.ids.length > 1 && group.ids.some(id => id.startsWith('i')));
  }, [cfg, located, signals.data]);

  useEffect(() => setCursor(0), [tab, region]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || event.metaKey || event.ctrlKey) return;
      if (event.key === 'j') setCursor(value => Math.min(rows.length - 1, value + 1));
      else if (event.key === 'k') setCursor(value => Math.max(0, value - 1));
      else if (event.key === 'Enter' && rows[cursor] && target.tagName !== 'A' && target.tagName !== 'BUTTON') navigate(`/ops/incidents/${rows[cursor].id}`);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, navigate]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageTitle title={t('nav.queue')} subtitle={t('ops.queue.subtitle', 'Everything reported in your regions, oldest decisions first.')} actions={<Link to="/ops/incidents/new" className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold hover:bg-surface-2">{t('ops.log.title', 'Log a report')}</Link>} />
      <div role="tablist" aria-label={t('nav.queue')} className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-12 border-b-4 px-4 font-semibold ${tab === item.id ? 'border-action' : 'border-transparent hover:bg-surface-2'}`}>{t(`ops.tab.${item.id}`, item.label)} <span className="ml-1 rounded-full bg-surface-2 px-2 text-sm">{counts[item.id]}</span></button>)}
      </div>

      {groups.length > 0 && (
        <section aria-labelledby="links-title" className="rounded-panel border border-unconfirmed border-dashed bg-unconfirmed-tint p-4">
          <h2 id="links-title" className="flex items-center gap-2 text-lg"><Link2 aria-hidden="true" size={18} />{t('ops.queue.links', 'Possibly the same event')}</h2>
          <p className="text-sm text-ink-muted">{t('ops.queue.links_hint', 'Suggested only. Nothing is merged or verified until you do it.')}</p>
          <ul className="mt-2 space-y-1">{groups.map(group => <li key={group.ids.join()} className="text-sm">{t('ops.queue.group', { reports: group.summary.reports + group.summary.incidents, signals: group.summary.signals, radius: cfg!.radius_km, minutes: cfg!.window_minutes, defaultValue: '{{reports}} claim(s) and {{signals}} satellite signal(s) within {{radius}} km in {{minutes}} min' })}: {group.ids.filter(id => id.startsWith('i')).map(id => <Link key={id} className="mr-2 font-bold underline" to={`/ops/incidents/${id.slice(1)}`}>#{id.slice(1)}</Link>)}</li>)}</ul>
        </section>)}
      {!cfg && settings.isSuccess && <p className="text-sm text-ink-muted">{t('ops.queue.links_off', 'Suggested links are off until their distance and time limits are configured.')}</p>}

      {incidents.isLoading ? <Skeleton lines={5} /> : incidents.isError ? <Notice kind="danger">{t('ops.queue.error', 'The queue could not be loaded.')} <button className="underline" onClick={() => void incidents.refetch()}>{t('citizen.retry', 'Try again')}</button></Notice>
        : !rows.length ? <EmptyState title={t('ops.queue.empty', 'Nothing here.')}>{tab === 'new' ? t('ops.queue.empty_new', 'No report is waiting for a decision.') : t('ops.queue.empty_other', 'No incidents in this group.')}</EmptyState>
        : <ul ref={list} className="space-y-2" aria-label={t('ops.queue.list', 'Incidents')}>{rows.map((item, index) => <Row key={item.id} item={item} focused={index === cursor} />)}</ul>}
      <p className="text-sm text-ink-muted">{t('ops.queue.keys', 'Keys: j and k move, Enter opens.')}</p>
    </div>
  );
}

function Row({ item, focused }: { item: Incident; focused: boolean }) {
  const { t } = useTranslation();
  return (
    <li><Link to={`/ops/incidents/${item.id}`} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-panel border bg-surface p-3 text-ink hover:bg-surface-2 ${focused ? 'border-action ring-2 ring-action' : 'border-line'}`}>
      <span className="text-lg font-bold">#{item.id}</span>
      <RungBadge rung={rungOfStatus(item.status)} age={ageText(item.created_at)} />
      <span className="text-ink-muted">{stateName(item.state)}</span>
      {item.notes && <span className="min-w-0 flex-1 truncate text-ink-muted">{item.notes}</span>}
      {item.image_assessment_status && <span className="text-sm text-ink-muted">{listStatusText(item.image_assessment_status)}{item.image_assessment_status === 'COMPLETED' && mediaCheckSuffix(item.image_media_integrity_status, t) ? ` · ${mediaCheckSuffix(item.image_media_integrity_status, t)}` : ''}</span>}
      {item.status === 'closed' && item.close_reason && <span className="text-sm">{t(`ops.close.${item.close_reason}`, item.close_reason)}</span>}
    </Link></li>
  );
}
