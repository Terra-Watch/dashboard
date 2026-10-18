import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Brand } from '../../components/Brand';
import { LanguageMenu } from '../../ui/LanguageMenu';
import { ThemeMenu } from '../../ui/ThemeMenu';

/** The one frame for sign-in, registration and password reset: a single column on phones, form beside a short statement on desktop. */
export function AuthLayout({ title, subtitle, children, aside }: { title: string; subtitle?: string; children: ReactNode; aside?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div data-rq-app className="min-h-screen bg-canvas text-ink">
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link to="/" aria-label={t('app.name')}><Brand /></Link>
        <div className="flex items-center gap-2"><LanguageMenu /><ThemeMenu /></div>
      </header>
      <main id="main" className="mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-6 md:grid-cols-[1fr_26rem] md:px-8 md:pt-16">
        <div className="hidden md:block">{aside}</div>
        <section aria-labelledby="auth-title" className="rounded-panel border border-line bg-surface p-5 sm:p-7">
          <h1 id="auth-title" className="text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </section>
      </main>
    </div>
  );
}
