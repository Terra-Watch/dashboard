import * as Tabs from '@radix-ui/react-tabs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { stateName, formatWhen } from '../citizen/format';
import { CloseIncident } from '../incidents/CloseIncident';
import { EvidenceReview, type EvidenceImage } from '../incidents';
import { closeReasonLabel, closurePayload, type CloseReason } from '../incidents/closure';
import { ScenarioTab } from '../scenarios/ScenarioTab';
import { INCIDENTS_KEY, useOpsSettings, type Incident } from './useOps';

type Detail = Incident & { images: EvidenceImage[] };
type Assignment = { id: number; ranger_id: number; ranger_name: string; status: string; created_at: string; updated_at: string };
type Observation = { id: number; assignment_id: number; ranger_name: string; outcome: string; notes: string; observed_at: string };
type HistoryEntry = { action: string; occurred_at: string; user_id: number | null; metadata: Record<string, unknown> | null };

const NEXT: Record<string, string[]> = { reported: ['verified', 'closed'], verified: ['responding', 'contained', 'closed'], responding: ['contained', 'closed'], contained: ['responding', 'closed'], closed: [] };
const ACTION_WORDS: Record<string, string> = { incident_status_verified: 'Verified', incident_status_responding: 'Response started', incident_status_contained: 'Marked contained', incident_status_closed: 'Closed', incident_assigned: 'Officer assigned', incident_reassigned: 'Officer changed', assignment_accepted: 'Officer accepted', assignment_declined: 'Officer declined', assignment_in_progress: 'Officer began work', assignment_completed: 'Officer finished', ranger_verification_submitted: 'Field observation', citizen_report_created: 'Report received', incident_image_reviewed: 'Photo reviewed', scenario_note: 'Scenario saved for briefing', report_escalated: 'Report brought to the lead (no officer assigned)' };

export function OpsIncidentPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const incidentId = Number(id);
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['ops-incident', incidentId], queryFn: () => api<Detail>(`/api/incidents/${incidentId}`) });
  const field = useQuery({ queryKey: ['ops-field', incidentId], queryFn: () => api<{ assignments: Assignment[]; verifications: Observation[] }>(`/api/control-room/incidents/${incidentId}/assignments`) });
  const settings = useOpsSettings();
  const history = useQuery({ queryKey: ['ops-history', incidentId], queryFn: () => api<{ history: HistoryEntry[] }>(`/api/incidents/${incidentId}/history`) });
  const rangers = useQuery({ queryKey: ['ops-rangers'], queryFn: () => api<{ items: Array<{ id: number; name: string; home_state: string | null }> }>('/api/control-room/rangers'), staleTime: 60_000 });
  const [problem, setProblem] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [closing, setClosing] = useState(false); const [ranger, setRanger] = useState('');

  const refresh = async () => { await Promise.all([detail.refetch(), field.refetch(), history.refetch(), queryClient.invalidateQueries({ queryKey: INCIDENTS_KEY })]); };
  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setProblem(''); setMessage('');
    try { await action(); setMessage(done); await refresh(); return true; } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.failed', 'That was not saved. Try again.')); return false; } finally { setBusy(false); }
  }
  const changeStatus = (status: string) => run(() => api(`/api/incidents/${incidentId}/status`, { method: 'PATCH', json: { status } }), t('ops.status_saved', 'Status changed.'));
  const close = async (reason: CloseReason, note: string) => { if (await run(() => api(`/api/incidents/${incidentId}/status`, { method: 'PATCH', json: closurePayload(reason, note) }), t('ops.closed_saved', 'Incident closed.'))) setClosing(false); };

  if (detail.isLoading) return <div className="mx-auto max-w-5xl"><Skeleton lines={6} /></div>;
  if (detail.isError || !detail.data) return <div className="mx-auto max-w-5xl"><Notice kind="danger">{t('ops.not_found', 'This incident could not be opened. It may be outside your regions.')} <Link className="underline" to="/ops/queue">{t('nav.queue')}</Link></Notice></div>;
  const item = detail.data;
  const active = field.data?.assignments.find(a => ['assigned', 'accepted', 'in_progress'].includes(a.status));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageTitle title={`${t('ops.incident', 'Incident')} #${item.id}`} subtitle={`${stateName(item.state)} · ${t('ops.reported', 'reported')} ${ageText(item.created_at)}`} actions={<RungBadge rung={rungOfStatus(item.status)} />} />
      {message && <Notice kind="success">{message}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}
      {item.status === 'closed' && <Notice kind="info" title={t('ops.closed_title', 'Closed')}>{closeReasonLabel(item.close_reason) || t('ops.closed_no_reason', 'No reason was recorded.')}</Notice>}

      <Tabs.Root defaultValue="summary">
        <Tabs.List aria-label={t('ops.incident', 'Incident')} className="flex flex-wrap gap-1 border-b border-line">
          {[['summary', t('ops.sec.summary', 'Summary')], ['evidence', `${t('ops.sec.evidence', 'Evidence')} (${item.images.length})`], ['field', `${t('ops.sec.field', 'Field')} (${field.data?.verifications.length ?? 0})`], ['timeline', t('ops.sec.timeline', 'Timeline')], ...(settings.data?.scenario_enabled && item.latitude != null && item.longitude != null ? [['scenario', t('ops.sec.scenario', 'Scenario')]] : [])].map(([value, label]) => <Tabs.Trigger key={value} value={value} className="min-h-12 border-b-4 border-transparent px-4 font-semibold data-[state=active]:border-action hover:bg-surface-2">{label}</Tabs.Trigger>)}
        </Tabs.List>

        <Tabs.Content value="summary" className="space-y-4 pt-4 outline-none">
          <Card title={t('ops.what_reported', 'What was reported')}>
            <p className="whitespace-pre-wrap text-lg">{item.notes || t('ops.no_text', 'No description.')}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="font-bold text-ink-muted">{t('ops.source', 'Source')}</dt><dd>{item.source}</dd></div><div><dt className="font-bold text-ink-muted">{t('ops.place', 'Place')}</dt><dd>{item.latitude != null ? `${item.latitude.toFixed(5)}, ${item.longitude?.toFixed(5)}` : '—'}</dd></div><div><dt className="font-bold text-ink-muted">{t('ops.seen', 'Seen')}</dt><dd>{formatWhen(item.observed_at ?? item.created_at)}</dd></div></dl>
          </Card>
          {NEXT[item.status]?.length > 0 && (
            <Card title={t('ops.decide', 'Decide')}>
              <div className="flex flex-wrap gap-2">
                {NEXT[item.status].filter(status => status !== 'closed').map(status => <Button key={status} loading={busy} onClick={() => void changeStatus(status)}>{t(`ops.to.${status}`, `Mark ${status}`)}</Button>)}
                <Button variant="danger" disabled={busy} onClick={() => setClosing(true)}>{t('ops.to.closed', 'Close incident…')}</Button>
              </div>
              {item.status === 'reported' && <p className="mt-2 text-sm text-ink-muted">{t('ops.verify_hint', 'Verify only after you have checked the evidence. Nothing else changes this.')}</p>}
              {closing && <CloseIncident incidentId={item.id} busy={busy} onCancel={() => setClosing(false)} onConfirm={(reason, note) => void close(reason, note)} />}
            </Card>)}
          {item.status !== 'closed' && (
            <Card title={t('ops.assign', 'Field officer')}>
              {active ? <p><strong>{active.ranger_name}</strong> · {t(`field.status.${active.status}`, active.status)} · {ageText(active.updated_at)}</p> : <p className="text-ink-muted">{t('ops.no_officer', 'No officer is assigned.')}</p>}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1"><SelectField label={active ? t('ops.change_officer', 'Change officer') : t('ops.choose_officer', 'Assign an officer')} value={ranger} onChange={event => setRanger(event.target.value)}><option value="">{t('citizen.report.choose', 'Choose')}</option>{rangers.data?.items.map(r => <option key={r.id} value={r.id}>{r.name}{r.home_state ? ` (${r.home_state})` : ''}</option>)}</SelectField></div>
                <Button variant="secondary" loading={busy} disabled={!ranger} onClick={() => void run(() => active ? api(`/api/control-room/incidents/${incidentId}/assignments/${active.id}`, { method: 'PATCH', json: { ranger_id: Number(ranger) } }) : api(`/api/control-room/incidents/${incidentId}/assignments`, { method: 'POST', json: { ranger_id: Number(ranger) } }), t('ops.assigned', 'Officer notified.')).then(() => setRanger(''))}>{active ? t('ops.reassign', 'Reassign') : t('ops.assign_button', 'Assign')}</Button>
              </div>
            </Card>)}
        </Tabs.Content>

        <Tabs.Content value="evidence" className="space-y-4 pt-4 outline-none">
          {item.images.length ? item.images.map(image => <EvidenceReview key={image.id} incidentId={item.id} image={image} onUpdated={(updated: EvidenceImage) => { void queryClient.setQueryData(['ops-incident', incidentId], (current: Detail | undefined) => current && { ...current, images: current.images.map(existing => existing.id === updated.id ? { ...existing, ...updated } : existing) }); }} />) : <p className="text-ink-muted">{t('ops.no_photos', 'No photos were sent with this report.')}</p>}
        </Tabs.Content>

        <Tabs.Content value="field" className="space-y-3 pt-4 outline-none">
          {field.isLoading ? <Skeleton lines={3} /> : !field.data?.verifications.length ? <p className="text-ink-muted">{t('ops.no_obs', 'No field observations yet.')}</p>
            : <ul className="space-y-3">{field.data.verifications.map(obs => <li key={obs.id} className="rounded-panel border border-line bg-surface p-3"><p className="font-bold">{obs.ranger_name} · {t(`field.obs.${obs.outcome}`, obs.outcome)} <span className="font-normal text-ink-muted">· {formatWhen(obs.observed_at)}</span></p><p className="mt-1 whitespace-pre-wrap">{obs.notes}</p></li>)}</ul>}
          {field.data && field.data.assignments.length > 0 && <Card title={t('ops.assignments', 'Assignments')}><ul className="space-y-1 text-sm">{field.data.assignments.map(a => <li key={a.id}>{a.ranger_name} · {t(`field.status.${a.status}`, a.status)} · {formatWhen(a.created_at)}</li>)}</ul></Card>}
        </Tabs.Content>

        {settings.data?.scenario_enabled && item.latitude != null && item.longitude != null && (
          <Tabs.Content value="scenario" className="pt-4 outline-none">
            <ScenarioTab incidentId={item.id} lat={item.latitude} lon={item.longitude} staleMinutes={settings.data.feed_stale_minutes} radii={settings.data.exposure_radii_km} />
          </Tabs.Content>)}

        <Tabs.Content value="timeline" className="pt-4 outline-none">
          {history.isLoading ? <Skeleton lines={4} /> : <ol className="relative space-y-4 border-l-2 border-line pl-5">{[...(history.data?.history ?? [])].reverse().map((entry, index) => (
            <li key={index} className="relative"><span aria-hidden="true" className="absolute -left-[1.65rem] top-1 size-3 rounded-full border-2 border-surface bg-action" /><p className="font-bold">{t(`ops.action.${entry.action}`, ACTION_WORDS[entry.action] ?? entry.action)}</p><p className="text-sm text-ink-muted">{formatWhen(entry.occurred_at)}{entry.metadata && typeof entry.metadata.close_reason === 'string' ? ` · ${closeReasonLabel(entry.metadata.close_reason)}` : ''}</p>{entry.action === 'scenario_note' && typeof entry.metadata?.note === 'string' && entry.metadata.note && <p className="text-sm">{entry.metadata.note}</p>}</li>))}</ol>}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
