import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import type { EvidenceImage } from './evidenceReviewTypes';

type Alert = { id: number; status: string; published_at: string | null; expires_at: string; withdrawn_reason: string | null; image_id: number | null; area_geojson: unknown };

/** Tell people nearby that a fire is confirmed. Only for a confirmed incident; one person can send it (urgent path), it is logged, and it ends when the incident closes or when staff end it. */
export function AlertNearby({ incidentId, images }: { incidentId: number; images: EvidenceImage[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: ['alert-options'], queryFn: () => api<{ radii_km: number[]; hours: number }>('/api/notices/alert-options'), staleTime: 300_000 });
  const alerts = useQuery({ queryKey: ['incident-alerts', incidentId], queryFn: () => api<{ items: Alert[] }>(`/api/notices?incident_id=${incidentId}`), refetchInterval: 30_000 });
  const live = alerts.data?.items.find(item => item.status === 'published' && Date.parse(item.expires_at) > Date.now());
  const [radius, setRadius] = useState(''); const [note, setNote] = useState(''); const [photo, setPhoto] = useState(''); const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false); const [problem, setProblem] = useState('');
  const radii = options.data?.radii_km ?? [];
  const chosen = radius || String(radii[Math.min(2, radii.length - 1)] ?? '');
  const shown = images.filter(image => image.public_state === 'visible');

  async function send() {
    setBusy(true); setProblem('');
    try {
      await api(`/api/notices/from-incident/${incidentId}`, { method: 'POST', json: { radius_km: Number(chosen), instructions: note.trim() || undefined, image_id: photo ? Number(photo) : undefined } });
      setNote(''); setSure(false); await queryClient.invalidateQueries({ queryKey: ['incident-alerts', incidentId] });
    } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.alert.failed', 'The alert was not sent. Try again.')); }
    finally { setBusy(false); }
  }
  async function end() {
    if (!live) return;
    setBusy(true); setProblem('');
    try { await api(`/api/notices/${live.id}/withdraw`, { method: 'POST', json: { reason: 'Ended by the Control Room' } }); await queryClient.invalidateQueries({ queryKey: ['incident-alerts', incidentId] }); }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.alert.end_failed', 'The alert could not be ended. Try again.')); }
    finally { setBusy(false); }
  }

  return (
    <Card title={t('ops.alert.title', 'Alert people nearby')}>
      {live ? (
        <div className="space-y-2">
          <Notice kind="warning" title={t('ops.alert.live', 'An alert is live')}>{t('ops.alert.live_detail', { at: formatWhen(live.published_at), until: formatWhen(live.expires_at), defaultValue: 'Sent {{at}}. It ends {{until}}, or when this incident is closed.' })}{live.image_id ? ` ${t('ops.alert.with_photo', 'It shows a photo.')}` : ''}</Notice>
          <Button variant="danger" loading={busy} onClick={() => void end()}>{t('ops.alert.end', 'End this alert now')}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{t('ops.alert.help', 'Citizens in the area see "Fire confirmed by officials" with the area only, never the exact place. You can send it once; end it when it is over.')}</p>
          <SelectField label={t('ops.alert.radius', 'How far around the fire (km)')} value={chosen} onChange={event => setRadius(event.target.value)}>
            {radii.map(value => <option key={value} value={value}>{value} km</option>)}
          </SelectField>
          <TextArea label={t('ops.alert.instructions', 'What people should do (optional)')} rows={2} maxLength={300} value={note} onChange={event => setNote(event.target.value)} hint={t('ops.alert.instructions_hint', 'Short and plain, for example: avoid the ridge road. Added to the standard safety text.')} />
          <SelectField label={t('ops.alert.photo', 'Show a photo')} value={photo} onChange={event => setPhoto(event.target.value)}>
            <option value="">{t('ops.alert.no_photo', 'No photo')}</option>
            {shown.map(image => <option key={image.id} value={image.id}>{image.original_filename}</option>)}
          </SelectField>
          {shown.length === 0 && <p className="text-sm text-ink-muted">{t('ops.alert.photo_hint', 'Only a photo already shown to the public can be used. Show one in the evidence box below first.')}</p>}
          <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={sure} onChange={event => setSure(event.target.checked)} /><span>{t('ops.alert.sure', 'I have confirmed this fire. I understand this goes to everyone nearby now.')}</span></label>
          {problem && <Notice kind="danger">{problem}</Notice>}
          <Button loading={busy} disabled={!sure || !chosen} onClick={() => void send()}>{t('ops.alert.send', 'Send the alert now')}</Button>
        </div>
      )}
      {live && problem && <Notice kind="danger">{problem}</Notice>}
    </Card>
  );
}
