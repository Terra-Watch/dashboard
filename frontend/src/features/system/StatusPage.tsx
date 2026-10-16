import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Brand } from '../../components/Brand';
import { useSession } from '../../app/session';
import { homePath } from '../../ui/nav';

type Kind = 'not_found' | 'offline' | 'session_expired';
const COPY: Record<Kind, { title: string; body: string }> = {
  not_found: { title: 'This page does not exist.', body: 'The address may be mistyped, or the page has moved.' },
  offline: { title: 'You are offline.', body: 'Pages you already opened still work. Reports and observations you write are kept on this device and sent when the connection returns.' },
  session_expired: { title: 'Your session ended.', body: 'Sign in again to continue. Anything saved on this device is still here.' },
};

/** One plain page for the few states that are not a screen: not found, offline, signed out. */
export function StatusPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const { role } = useSession();
  const copy = COPY[kind];
  return (
    <div data-rq-app className="min-h-screen bg-canvas text-ink">
      <header className="px-4 py-3 md:px-8"><Link to="/" aria-label={t('app.name')}><Brand /></Link></header>
      <main id="main" className="mx-auto max-w-xl px-4 pt-12">
        <h1 className="text-3xl">{t(`status.${kind}.title`, copy.title)}</h1>
        <p className="mt-3 text-lg">{t(`status.${kind}.body`, copy.body)}</p>
        <p className="mt-6 flex gap-4">
          <Link className="font-semibold underline" to={role ? homePath(role) : '/'}>{role ? t('citizen.go_home', 'Go to your workspace') : t('auth.back_home', 'Back to the start')}</Link>
          {!role && <Link className="font-semibold underline" to="/login">{t('auth.submit')}</Link>}
        </p>
      </main>
    </div>
  );
}
