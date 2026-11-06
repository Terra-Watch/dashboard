import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, LoadError, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';
import { useStations } from '../stations/api';

type Heard = { node_id: number; first_heard: string; last_heard: string; heard: number; reported_lat: number | null; reported_lon: number | null };
type Draft = { node: string; name: string; lat: string; lon: string; minutes: string; notes: string };
const EMPTY: Draft = { node: '', name: '', lat: '', lon: '', minutes: '10', notes: '' };

/** Register lookout stations and claim the node ids the gateway has heard but nobody registered. Administrators only (the server checks). */
export function StationSetup() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const stations = useStations();
  const heard = useQuery({ queryKey: ['stations-unknown'], retry: false, refetchInterval: 15_000, queryFn: () => api<{ items: Heard[] }>('/api/stations/unknown') });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [done, setDone] = useState('');
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft(prev => ({ ...prev, [key]: event.target.value }));
  const save = useMutation({
    mutationFn: () => api<{ id: number; state: string }>('/api/stations', { method: 'POST', json: { node_id: Number(draft.node), name: draft.name.trim(), latitude: Number(draft.lat), longitude: Number(draft.lon), expected_interval_s: Math.round(Number(draft.minutes) * 60), notes: draft.notes.trim() } }),
    onSuccess: res => { setDone(t('stations.setup.done', { name: draft.name.trim(), state: res.state, defaultValue: 'Registered {{name}} ({{state}}).' })); setDraft(EMPTY); void client.invalidateQueries({ queryKey: ['stations'] }); void client.invalidateQueries({ queryKey: ['stations-unknown'] }); },
  });
  const valid = Number(draft.node) >= 1 && Number(draft.node) <= 253 && draft.name.trim().length > 0 && Math.abs(Number(draft.lat)) <= 90 && draft.lat !== '' && Math.abs(Number(draft.lon)) <= 180 && draft.lon !== '' && Number(draft.minutes) > 0;
  const submit = (event: FormEvent) => { event.preventDefault(); setDone(''); if (valid) save.mutate(); };
  const claim = (h: Heard) => { setDone(''); setDraft({ ...EMPTY, node: String(h.node_id), lat: h.reported_lat != null ? String(h.reported_lat) : '', lon: h.reported_lon != null ? String(h.reported_lon) : '' }); };
  const registered = stations.data?.items ?? [];
  const unknown = (heard.data?.items ?? []).filter(h => !registered.some(s => s.node_id === h.node_id));
  return (
    <Card title={t('stations.setup.title', 'Lookout stations')}>
      <p className="text-sm text-ink-muted">{t('stations.setup.hint', 'Register a station by its node number so readings from the gateway are stored. A node the gateway has heard but nobody registered is listed below to claim.')}</p>
      {done && <Notice kind="success">{done}</Notice>}
      {save.error && <Notice kind="danger">{save.error instanceof ApiError ? save.error.message : t('stations.setup.failed', 'The station could not be registered.')}</Notice>}
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField label={t('stations.setup.node', 'Node number (1 to 253)')} inputMode="numeric" value={draft.node} onChange={set('node')} required />
        <TextField label={t('stations.setup.name', 'Name')} value={draft.name} onChange={set('name')} maxLength={80} required />
        <TextField label={t('stations.setup.lat', 'Latitude')} inputMode="decimal" value={draft.lat} onChange={set('lat')} required />
        <TextField label={t('stations.setup.lon', 'Longitude')} inputMode="decimal" value={draft.lon} onChange={set('lon')} required />
        <TextField label={t('stations.setup.minutes', 'Report every (minutes)')} inputMode="decimal" value={draft.minutes} onChange={set('minutes')} />
        <TextField label={t('stations.setup.notes', 'Notes')} value={draft.notes} onChange={set('notes')} maxLength={500} />
        <div className="sm:col-span-2"><Button type="submit" loading={save.isPending} disabled={!valid}>{t('stations.setup.register', 'Register station')}</Button></div>
      </form>
      <h3 className="mt-5 text-sm font-bold">{t('stations.setup.heard', 'Heard but not registered')}</h3>
      {heard.isLoading && <Skeleton lines={1} />}
      {heard.isError && <LoadError message={t('stations.setup.heard_failed', 'The list could not be loaded.')} onRetry={() => void heard.refetch()} />}
      {heard.data && unknown.length === 0 && <p className="text-sm text-ink-muted">{t('stations.setup.none_heard', 'No unregistered nodes heard.')}</p>}
      <ul className="mt-1 space-y-1">{unknown.map(h => (
        <li key={h.node_id} className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{t('stations.setup.node_n', { n: h.node_id, defaultValue: 'Node {{n}}' })}</span><span className="text-ink-muted">{t('stations.setup.heard_n', { n: h.heard, when: formatWhen(h.last_heard), defaultValue: 'heard {{n}} times, last {{when}}' })}</span>
          <Button variant="secondary" onClick={() => claim(h)}>{t('stations.setup.claim', 'Register this node')}</Button></li>))}</ul>
      <h3 className="mt-5 text-sm font-bold">{t('stations.setup.registered', 'Registered stations')}</h3>
      {registered.length === 0 ? <p className="text-sm text-ink-muted">{t('stations.setup.none', 'None yet.')}</p> : (
        <ul className="mt-1 divide-y divide-line text-sm">{registered.map(s => <li key={s.id} className="flex flex-wrap gap-x-3 py-2"><span className="font-semibold">{s.name}</span><span className="text-ink-muted">{t('stations.setup.node_n', { n: s.node_id, defaultValue: 'Node {{n}}' })} · {s.state} · {s.status}</span></li>)}</ul>)}
    </Card>
  );
}
