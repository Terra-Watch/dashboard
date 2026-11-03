import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { Skeleton } from '../../ui/Page';
import { useEvidenceImage } from '../incidents/useEvidenceImage';

type Item = { id: number; incident_id: number; created_at: string };
const SCENES = [['fire', 'Flames'], ['smoke', 'Smoke'], ['fire_and_smoke', 'Flames and smoke'], ['lookalike', 'Looks like fire or smoke but is not (fog, sunset, cooking, burnt ground)'], ['nothing', 'Nothing of the kind']] as const;
const ORIGINS = [['camera', 'A genuine camera photo'], ['edited', 'Edited (something added, removed or covered)'], ['generated', 'Made by an AI image tool'], ['screenshot', 'A screenshot or a photo of a screen']] as const;

function Photo({ item, onDone }: { item: Item; onDone: () => void }) {
  const { t } = useTranslation();
  const { state } = useEvidenceImage(item.incident_id, item.id);
  const [scene, setScene] = useState(''); const [origin, setOrigin] = useState(''); const [busy, setBusy] = useState(false); const [problem, setProblem] = useState('');
  async function save() {
    setBusy(true); setProblem('');
    try { await api(`/api/photo-library/${item.id}/labels`, { method: 'PUT', json: { scene, origin } }); onDone(); }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('ops.library.failed', 'The labels were not saved. Try again.')); }
    finally { setBusy(false); }
  }
  return (
    <li className="border-b border-line py-4">
      {state.status === 'ready' ? <img src={state.url} alt={t('ops.library.alt', 'A photo shared for the photo check')} className="max-h-64 w-auto max-w-full rounded-lg border border-line object-contain" /> : <p className="text-ink-muted">{t('ops.library.loading', 'Loading photo…')}</p>}
      <fieldset className="mt-3"><legend className="font-semibold">{t('ops.library.scene', 'What is in the photo?')}</legend>
        <div className="grid gap-1">{SCENES.map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2"><input type="radio" name={`scene-${item.id}`} checked={scene === value} onChange={() => setScene(value)} />{t(`ops.library.scene_${value}`, label)}</label>)}</div></fieldset>
      <fieldset className="mt-3"><legend className="font-semibold">{t('ops.library.origin', 'Where does it come from?')}</legend>
        <div className="grid gap-1">{ORIGINS.map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2"><input type="radio" name={`origin-${item.id}`} checked={origin === value} onChange={() => setOrigin(value)} />{t(`ops.library.origin_${value}`, label)}</label>)}</div></fieldset>
      {problem && <Notice kind="danger">{problem}</Notice>}
      <Button className="mt-3" loading={busy} disabled={!scene || !origin} onClick={() => void save()}>{t('ops.library.save', 'Save labels')}</Button>
    </li>
  );
}

/** Photos citizens agreed to share to test and improve the photo check. Staff say what is in each and where it comes from; the count shows how close we are to enough. */
export function PhotoLibrary() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ['library-stats'], queryFn: () => api<{ total: number; labeled: number; target: number; by_origin: Record<string, number> }>('/api/photo-library/stats') });
  const list = useQuery({ queryKey: ['library-list'], queryFn: () => api<{ items: Item[] }>('/api/photo-library?status=unlabeled&limit=20') });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['library-list'] }); void queryClient.invalidateQueries({ queryKey: ['library-stats'] }); };
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold">{t('ops.library.title', 'Photo library for the photo check')}</h3>
        <p className="text-sm text-ink-muted">{t('ops.library.help', 'These photos were shared by citizens who agreed. Label each one honestly. When there are enough of every kind, we test the check on them and tune it.')}</p>
        {stats.data && <p className="mt-2 font-semibold">{t('ops.library.progress', { labeled: stats.data.labeled, target: stats.data.target, total: stats.data.total, defaultValue: '{{labeled}} labelled of {{target}} needed ({{total}} shared so far)' })}</p>}
      </div>
      {list.isLoading ? <Skeleton lines={4} /> : !list.data?.items.length ? <p className="py-2 text-ink-muted">{t('ops.library.empty', 'No photos are waiting for labels.')} {t('ops.library.empty_hint', 'Photos appear here when a citizen agrees to share one with their report.')}</p>
        : <ul className="grid gap-x-8 lg:grid-cols-2">{list.data.items.map(item => <Photo key={item.id} item={item} onDone={refresh} />)}</ul>}
    </div>
  );
}
