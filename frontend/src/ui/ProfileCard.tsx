import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { api } from '../app/http';
import { signOut } from '../app/session';
import { STATES } from '../features/citizen/format';
import { Button } from './Button';
import { InstallApp } from './InstallApp';
import { LanguageMenu } from './LanguageMenu';
import { Notice } from './Notice';
import { Card, Skeleton } from './Page';
import { ThemeMenu } from './ThemeMenu';

type Me = { id: number; email: string; name: string; role: string; home_state: string | null; scopes: string[] };
const ROLE_LABELS: Record<string, string> = {
  field_crew: 'Range Officer', range_officer: 'Range Officer', control_room_operator: 'Control Room operator', incident_commander: 'Incident commander', officer: 'Control Room officer', admin: 'Administrator', citizen: 'Citizen',
};
const stateName = (code: string) => STATES.find(state => state.code === code)?.name ?? code;

/** Who you are signed in as, the same on every role: name, email, role, the states you cover, language and theme, install, password, sign out. */
export function ProfileCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/auth/me') });
  const field = (label: string, value: string) => <div><dt className="text-sm font-bold text-ink-muted">{label}</dt><dd className="break-words">{value}</dd></div>;
  return (
    <>
      <Card title={t('profile.you', 'Your account')}>
        {me.isLoading ? <Skeleton lines={3} /> : me.data ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {field(t('citizen.account.name', 'Name'), me.data.name)}
            {field(t('auth.email', 'Email'), me.data.email)}
            {field(t('profile.role', 'Role'), t(`profile.role_${me.data.role}`, ROLE_LABELS[me.data.role] ?? me.data.role))}
            {field(t('profile.areas', 'Areas you cover'), me.data.scopes.length ? me.data.scopes.map(stateName).join(', ') : me.data.home_state ? stateName(me.data.home_state) : t('profile.all_areas', 'All areas'))}
          </dl>) : <Notice kind="danger">{t('citizen.account.error', 'Your account details could not be loaded.')}</Notice>}
      </Card>
      <Card title={t('citizen.account.display', 'Language and theme')}><div className="flex flex-wrap items-center gap-3"><LanguageMenu /><ThemeMenu /></div></Card>
      <Card title={t('profile.app', 'This app')}><InstallApp /></Card>
      <Card title={t('profile.security', 'Sign-in')}>
        <p className="text-ink-muted">{t('profile.password_body', 'To change your password we send a reset link to your email.')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/forgot" className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold">{t('profile.change_password', 'Change password')}</Link>
          <Button variant="secondary" onClick={() => void signOut().then(() => navigate('/', { replace: true }))} icon={<LogOut aria-hidden="true" size={18} />}>{t('app.signout', 'Sign out')}</Button>
        </div>
      </Card>
    </>
  );
}
