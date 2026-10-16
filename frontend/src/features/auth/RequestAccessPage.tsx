import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { STATES } from '../citizen/format';
import { AuthLayout } from './AuthLayout';

const BLANK = { name: '', designation: '', department: '', email: '', state: '', reason: '' };

/** Forest department staff ask for access. Nothing is created: an administrator reads the request and sends an invitation. */
export function RequestAccessPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState(BLANK);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof BLANK) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  const complete = Object.values(form).every(value => value.trim()) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;
    setBusy(true); setProblem('');
    try { await api('/api/auth/access-requests', { method: 'POST', json: Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) }); setSent(true); }
    catch (reason) { setProblem(reason instanceof Error ? reason.message : t('auth.network')); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('auth.access.title', 'Ask for staff access')} subtitle={t('auth.access.sub', 'For Control Room staff and Range Officers. Citizens can create an account without asking.')}>
      {sent
        ? <><Notice kind="success">{t('auth.access.sent', 'Your request was received. An administrator will read it. If it is approved you will get an invitation by email.')}</Notice><p className="mt-4"><Link to="/" className="font-semibold underline">{t('auth.back_home', 'Back to the start')}</Link></p></>
        : (
          <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
            {problem && <Notice kind="danger">{problem}</Notice>}
            <TextField label={t('auth.register.name', 'Full name')} autoComplete="name" value={form.name} maxLength={100} onChange={set('name')} />
            <TextField label={t('auth.access.designation', 'Designation')} value={form.designation} maxLength={100} onChange={set('designation')} />
            <TextField label={t('auth.access.department', 'Department or division')} value={form.department} maxLength={150} onChange={set('department')} />
            <TextField label={t('auth.email', 'Email')} type="email" autoComplete="email" value={form.email} maxLength={200} onChange={set('email')} />
            <SelectField label={t('auth.access.state', 'State you work in')} value={form.state} onChange={set('state')}>
              <option value="">{t('citizen.report.choose', 'Choose')}</option>{STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </SelectField>
            <TextArea label={t('auth.access.reason', 'What you need access for')} value={form.reason} maxLength={500} onChange={set('reason')} />
            <Button type="submit" block loading={busy} disabled={!complete}>{t('auth.access.submit', 'Send request')}</Button>
          </form>)}
    </AuthLayout>
  );
}
