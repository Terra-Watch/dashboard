import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../app/http';
import { useSession } from '../../app/session';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { STATES, formatWhen } from '../citizen/format';

type Staff = { id: number; name: string; email: string; role: string; scopes: string[]; created_at: string; deactivated_at: string | null };
type Invite = { id: number; email: string; role: string; scopes: string[]; expires_at: string };
type Req = { id: number; name: string; designation: string; department: string; email: string; state: string; reason: string; created_at: string };
type People = { staff: Staff[]; citizens: number; invites: Invite[]; requests: Req[] };
type Made = { link: string; emailed: boolean; email: string };

export const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', incident_commander: 'Control Room lead', control_room_operator: 'Control Room operator', field_crew: 'Range Officer', range_officer: 'Range Officer', officer: 'Control Room (older role)', viewer: 'Viewer (older role)' };
const INVITE_ROLES = ['control_room_operator', 'incident_commander', 'field_crew', 'admin'];
const KEY = ['admin-people'] as const;

function States({ value, onChange, label }: { value: string[]; onChange: (next: string[]) => void; label: string }) {
  return (
    <fieldset className="min-w-0"><legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{STATES.map(s => <label key={s.code} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={value.includes(s.code)} onChange={event => onChange(event.target.checked ? [...value, s.code] : value.filter(c => c !== s.code))} />{s.name}</label>)}</div>
    </fieldset>
  );
}

export function AdminPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const people = useQuery({ queryKey: KEY, queryFn: () => api<People>('/api/admin/people'), enabled: user?.role === 'admin' });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [made, setMade] = useState<Made | null>(null);
  const [error, setError] = useState('');
  const [reset, setReset] = useState<{ id: number; link: string } | null>(null);
  const [editing, setEditing] = useState<{ id: number; states: string[] } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const fail = (reason: unknown) => setError(reason instanceof ApiError ? reason.detail : t('auth.network'));

  const invite = useMutation({
    mutationFn: () => api<Made>('/api/auth/invites', { method: 'POST', json: { email: email.trim(), role, scopes: states } }),
    onSuccess: result => { setMade(result); setEmail(''); setRole(''); setStates([]); setError(''); void refresh(); }, onError: fail,
  });
  const act = useMutation({ mutationFn: (request: () => Promise<unknown>) => request(), onSuccess: () => { setError(''); void refresh(); }, onError: fail });

  if (user?.role !== 'admin') return <div className="mx-auto max-w-xl"><h1 className="text-2xl">{t('ops.admin.only', 'This page is for administrators.')}</h1><p className="mt-3"><Link className="font-semibold underline" to="/ops/queue">{t('ops.back_queue', 'Back to the queue')}</Link></p></div>;
  const submit = (event: FormEvent) => { event.preventDefault(); invite.mutate(); };
  const needsStates = role !== 'admin';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageTitle title={t('ops.admin.title', 'People and access')} subtitle={t('ops.admin.sub', 'Who can sign in, and which states they cover. People who leave are deactivated, not deleted, so their history stays.')} />
      {error && <Notice kind="danger">{error}</Notice>}

      <Card title={t('ops.admin.invite', 'Invite someone')}>
        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t('auth.email')} type="email" autoCapitalize="none" value={email} onChange={event => setEmail(event.target.value)} />
            <SelectField label={t('ops.admin.role', 'Role')} value={role} onChange={event => setRole(event.target.value)}>
              <option value="">{t('citizen.report.choose', 'Choose')}</option>{INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </SelectField>
          </div>
          {needsStates && <States label={t('ops.admin.states', 'States this person covers')} value={states} onChange={setStates} />}
          <Button type="submit" loading={invite.isPending} disabled={!email.trim() || !role || (needsStates && !states.length)}>{t('ops.admin.send_invite', 'Create invitation')}</Button>
        </form>
        {made && (
          <div className="mt-4"><Notice kind="success" title={made.emailed ? t('ops.admin.emailed', 'Invitation emailed to {{email}}.', { email: made.email }) : t('ops.admin.not_emailed', 'Email is not set up, so nothing was sent. Give this link to {{email}} yourself. It works once, for 7 days.', { email: made.email })}>
            <code className="mt-2 block break-all rounded-rq border border-line bg-surface-2 p-2" data-testid="invite-link">{made.link.startsWith('http') ? made.link : `${window.location.origin}${made.link}`}</code>
          </Notice></div>)}
      </Card>

      {people.isLoading && <Skeleton lines={5} />}
      {people.data && (
        <>
          <Card title={`${t('ops.admin.staff', 'Staff')} (${people.data.staff.length})`}>
            <ul className="divide-y divide-line">
              {people.data.staff.map(person => (
                <li key={person.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p><strong>{person.name}</strong> <span className="text-ink-muted">· {person.email}</span></p>
                    <p className="text-sm">{ROLE_LABEL[person.role] ?? person.role}{person.deactivated_at ? ` · ${t('ops.admin.deactivated', 'deactivated')}` : ''}</p>
                  </div>
                  <p className="text-sm text-ink-muted">{person.scopes.length ? person.scopes.map(c => STATES.find(s => s.code === c)?.name ?? c).join(', ') : t('ops.admin.no_states', 'No states')}</p>
                  {editing?.id === person.id
                    ? (
                      <div className="mt-2 space-y-2"><States label={t('ops.admin.states', 'States this person covers')} value={editing.states} onChange={next => setEditing({ id: person.id, states: next })} />
                        <div className="flex gap-2"><Button onClick={() => act.mutate(() => api(`/api/admin/people/${person.id}/scopes`, { method: 'PUT', json: { states: editing.states } }).then(() => setEditing(null)))}>{t('common.save', 'Save')}</Button><Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel', 'Cancel')}</Button></div></div>)
                    : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!person.deactivated_at && <Button variant="secondary" onClick={() => setEditing({ id: person.id, states: person.scopes })}>{t('ops.admin.edit_states', 'Change states')}</Button>}
                        {!person.deactivated_at && <Button variant="secondary" onClick={() => act.mutate(async () => { const r = await api<{ token: string }>('/api/auth/password-reset/admin-initiate', { method: 'POST', json: { user_id: person.id } }); setReset({ id: person.id, link: `${window.location.origin}/reset?token=${r.token}` }); })}>{t('ops.admin.reset', 'Make a password reset link')}</Button>}
                        {person.deactivated_at
                          ? <Button variant="secondary" onClick={() => act.mutate(() => api(`/api/admin/people/${person.id}/reactivate`, { method: 'POST' }))}>{t('ops.admin.reactivate', 'Reactivate')}</Button>
                          : person.id !== user.id && <Button variant="danger" onClick={() => { if (window.confirm(t('ops.admin.confirm_off', 'Deactivate {{name}}? They are signed out and cannot sign in. Their history stays.', { name: person.name }))) act.mutate(() => api(`/api/admin/people/${person.id}/deactivate`, { method: 'POST' })); }}>{t('ops.admin.deactivate', 'Deactivate')}</Button>}
                      </div>)}
                  {reset?.id === person.id && <Notice kind="info" className="mt-2"><code className="block break-all">{reset.link}</code>{t('ops.admin.reset_note', 'Give this link to the person. It works once, for 24 hours.')}</Notice>}
                </li>))}
            </ul>
            <p className="mt-3 text-sm text-ink-muted">{t('ops.admin.citizens', '{{n}} citizen accounts (not listed).', { n: people.data.citizens })}</p>
          </Card>

          {people.data.invites.length > 0 && (
            <Card title={t('ops.admin.pending', 'Invitations waiting')}>
              <ul className="space-y-1 text-sm">{people.data.invites.map(i => <li key={i.id}>{i.email} · {ROLE_LABEL[i.role] ?? i.role} · {i.scopes.join(', ') || '—'} · {t('ops.admin.until', 'valid until')} {formatWhen(i.expires_at)}</li>)}</ul>
            </Card>)}

          <Card title={`${t('ops.admin.requests', 'Requests for access')} (${people.data.requests.length})`}>
            {!people.data.requests.length && <p className="text-ink-muted">{t('ops.admin.no_requests', 'No open requests.')}</p>}
            <ul className="divide-y divide-line">
              {people.data.requests.map(r => (
                <li key={r.id} className="py-3">
                  <p><strong>{r.name}</strong> · {r.designation}, {r.department} · {STATES.find(s => s.code === r.state)?.name ?? r.state}</p>
                  <p className="text-sm text-ink-muted">{r.email} · {formatWhen(r.created_at)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{r.reason}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" onClick={() => { setEmail(r.email); setStates(STATES.some(s => s.code === r.state) ? [r.state] : []); window.scrollTo({ top: 0 }); }}>{t('ops.admin.prefill', 'Start an invitation')}</Button>
                    <Button variant="ghost" onClick={() => act.mutate(() => api(`/api/admin/access-requests/${r.id}/handled`, { method: 'POST' }))}>{t('ops.admin.handled', 'Mark handled')}</Button>
                  </div>
                </li>))}
            </ul>
          </Card>
        </>)}
    </div>
  );
}
