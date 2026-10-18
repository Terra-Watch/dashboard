import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { useSession } from '../../app/session';
import { STATES, stateName } from '../citizen/format';

type Rule = { id: number; name: string; kind: string; enabled: boolean; state: string | null; severity: string; conditions: { min_size?: string; source?: string } | null };
const KEY = ['alert-rules'] as const;
const SIZES = ['small', 'medium', 'large'];

/** Choose which new reports tell you straight away. Matching reports appear in your notifications. */
export function AlertRulesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const needsState = user?.role !== 'admin';   // everyone else may only watch the states they cover
  const rules = useQuery({ queryKey: KEY, queryFn: () => api<Rule[]>('/api/alerts/rules') });
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [minSize, setMinSize] = useState('');
  const [severity, setSeverity] = useState('warning');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api('/api/alerts/rules', { method: 'POST', json: { name: name.trim(), kind: 'incident', enabled: true, channel: 'in-app', state: state || null, severity, conditions: minSize ? { min_size: minSize } : {} } }),
    onSuccess: () => { setName(''); setState(''); setMinSize(''); setError(''); void queryClient.invalidateQueries({ queryKey: KEY }); },
    onError: reason => setError(reason instanceof ApiError ? reason.detail : t('auth.network')),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) create.mutate(); };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('ops.rules.title', 'Alert rules')} subtitle={t('ops.rules.sub', 'Choose which new reports notify you. Alerts appear under the bell. Email and phone push are not part of this.')} actions={<Link to="/ops/queue" className="font-semibold underline">{t('ops.back_queue', 'Back to the queue')}</Link>} />
      {error && <Notice kind="danger">{error}</Notice>}
      <Card title={t('ops.rules.new', 'New rule')}>
        <form onSubmit={submit} noValidate className="space-y-3">
          <TextField label={t('ops.rules.name', 'Name')} value={name} maxLength={80} onChange={event => setName(event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label={t('ops.rules.state', 'State')} value={state} onChange={event => setState(event.target.value)}>{!needsState && <option value="">{t('ops.rules.any_state', 'Any state I cover')}</option>}{needsState && <option value="">{t('citizen.report.choose', 'Choose')}</option>}{STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}</SelectField>
            <SelectField label={t('ops.rules.size', 'At least this size')} value={minSize} onChange={event => setMinSize(event.target.value)}><option value="">{t('ops.rules.any_size', 'Any size')}</option>{SIZES.map(s => <option key={s} value={s}>{t(`ops.log.size.${s}`, s)}</option>)}</SelectField>
            <SelectField label={t('ops.rules.severity', 'Importance')} value={severity} onChange={event => setSeverity(event.target.value)}>{['info', 'warning', 'critical'].map(s => <option key={s} value={s}>{t(`ops.rules.sev.${s}`, s)}</option>)}</SelectField>
          </div>
          <Button type="submit" loading={create.isPending} disabled={!name.trim() || (needsState && !state)}>{t('ops.rules.add', 'Add rule')}</Button>
        </form>
      </Card>
      <Card title={t('ops.rules.yours', 'Your rules')}>
        {rules.isLoading && <Skeleton lines={3} />}
        {rules.isError && <LoadError message={t('ops.rules.error', 'Alert rules could not be loaded.')} onRetry={() => void rules.refetch()} retryLabel={t('citizen.retry', 'Try again')} />}
        {rules.data && !rules.data.length && <p className="text-ink-muted">{t('ops.rules.none', 'No rules yet. New reports reach you through the queue only.')}</p>}
        <ul className="divide-y divide-line">{rules.data?.map(rule => <li key={rule.id} className="py-2"><strong>{rule.name}</strong> <span className="text-sm text-ink-muted">· {rule.state ? stateName(rule.state) : t('ops.rules.any_state', 'Any state I cover')} · {rule.conditions?.min_size ? `${t('ops.rules.size', 'At least this size')}: ${rule.conditions.min_size}` : t('ops.rules.any_size', 'Any size')} · {rule.severity}</span></li>)}</ul>
      </Card>
    </div>
  );
}
