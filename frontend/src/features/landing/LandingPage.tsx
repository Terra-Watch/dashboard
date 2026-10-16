import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useSession } from '../../app/session';
import { homePath } from '../../ui/nav';
import { API } from '../../app/config';
import { Brand } from '../../components/Brand';
import { Button } from '../../ui/Button';
import { LanguageMenu } from '../../ui/LanguageMenu';
import { Notice } from '../../ui/Notice';
import { ThemeMenu } from '../../ui/ThemeMenu';
import { DataAnswers } from './DataAnswers';
import { HowItWorks } from './HowItWorks';
import { LadderPlayer } from './LadderPlayer';
import { PrivacyMap } from './PrivacyMap';
import { RoleExplorer } from './RoleExplorer';

/** The public status line is read from the server. If the feed is off or unapproved it says so; it never shows invented numbers. */
function StatusLine() {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${API}/api/public/status`).then(response => (response.ok ? response.json() : Promise.reject())).then(data => { if (live && typeof data.summary === 'string') setText(data.summary); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return <p role="status" className="text-sm text-ink-muted">{text ?? t('landing.hero.status_none')}</p>;
}

export function LandingPage() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { role } = useSession();
  const [params] = useSearchParams();
  // The installed app opens on the person's own workspace, not on the introduction.
  if (role && params.get('source') === 'pwa') return <Navigate to={homePath(role)} replace />;
  return (
    <div data-rq-app className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-rq focus:bg-action focus:px-4 focus:py-2 focus:text-on-action">{t('app.skip')}</a>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 sm:gap-3 border-b border-line bg-surface px-4 md:px-8">
        <Link to="/" aria-label={t('app.name')}><Brand /></Link>
        <nav aria-label={t('app.menu')} className="ml-6 hidden gap-5 md:flex">
          <a href="#features" className="font-semibold text-ink underline-offset-4 hover:underline">{t('landing.nav.features')}</a>
          <a href="#how" className="font-semibold text-ink underline-offset-4 hover:underline">{t('landing.nav.how')}</a>
          <a href="#privacy" className="font-semibold text-ink underline-offset-4 hover:underline">{t('landing.nav.privacy')}</a>
        </nav>
        <div className="ml-auto flex items-center gap-2"><LanguageMenu /><ThemeMenu /><Link to="/login" className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold text-ink hover:bg-surface-2">{t('app.signin')}</Link></div>
      </header>

      <main id="main" className="mx-auto max-w-6xl space-y-16 px-4 pb-20 pt-10 md:px-8 md:pt-16">
        <section aria-labelledby="hero-title" className="max-w-3xl">
          <motion.h1 id="hero-title" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-4xl leading-tight md:text-6xl">{t('landing.hero.title')}</motion.h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-muted md:text-xl">{t('landing.hero.body')}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/login?next=/citizen/report" className="inline-flex min-h-12 items-center rounded-rq bg-action px-6 text-lg font-bold text-on-action hover:bg-action-strong">{t('landing.hero.report')}</Link>
            <Link to="/login" className="inline-flex min-h-12 items-center rounded-rq border border-control px-6 text-lg font-semibold text-ink hover:bg-surface-2">{t('landing.hero.signin')}</Link>
          </div>
          <div className="mt-6 space-y-3"><Notice kind="warning">{t('landing.hero.emergency')}</Notice><StatusLine /></div>
        </section>

        <LadderPlayer />
        <div id="features" className="scroll-mt-20"><RoleExplorer /></div>
        <HowItWorks />
        <PrivacyMap />
        <DataAnswers />
      </main>

      <footer className="border-t border-line bg-surface px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 text-sm text-ink-muted">
          <Brand />
          <p className="max-w-xl">{t('landing.footer.sources')}</p>
        </div>
      </footer>
    </div>
  );
}
export { Button };
