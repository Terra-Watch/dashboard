import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useSession } from '../../app/session';
import { homePath } from '../../ui/nav';
import { Brand } from '../../components/Brand';
import { Button } from '../../ui/Button';
import { LanguageMenu } from '../../ui/LanguageMenu';
import { Notice } from '../../ui/Notice';
import { EmergencyStrip } from '../../ui/EmergencyStrip';
import { ThemeMenu } from '../../ui/ThemeMenu';
import { Reveal } from './Reveal';
import { Citizens } from './Citizens';
import { Community } from './Community';
import { DataAnswers } from './DataAnswers';
import { Capabilities } from './Capabilities';
import { Features, Principles } from './Features';
import { LadderPlayer } from './LadderPlayer';
import { PrivacyMap } from './PrivacyMap';

export function LandingPage() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({ initial: reduce ? false as const : { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay, ease: 'easeOut' as const } });
  const { role } = useSession();
  const [params] = useSearchParams();
  // The installed app opens on the person's own workspace, not on the introduction.
  if (role && params.get('source') === 'pwa') return <Navigate to={homePath(role)} replace />;
  return (
    <div data-rq-app className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-rq focus:bg-action focus:px-4 focus:py-2 focus:text-on-action">{t('app.skip')}</a>
      <header className="z-30 min-h-16 border-b border-line bg-surface px-4 md:px-8">
        <div className="flex min-h-16 items-center gap-4">
          <Link to="/" aria-label={t('app.name')} className="inline-flex min-h-11 shrink-0 items-center transition-opacity duration-200 hover:opacity-80 active:scale-[0.97]"><Brand /></Link>
          <nav aria-label={t('app.menu')} className="ml-6 hidden md:block">
            <div className="flex items-center gap-2 text-base">
              <a href="#features" className="inline-flex min-h-11 shrink-0 items-center rounded-rq px-3 font-semibold text-ink transition duration-200 hover:bg-surface-2 active:scale-95">{t('landing.nav.features')}</a>
              <a href="#citizens" className="inline-flex min-h-11 shrink-0 items-center rounded-rq px-3 font-semibold text-ink transition duration-200 hover:bg-surface-2 active:scale-95">{t('landing.v3.nav_citizens', 'For citizens')}</a>
              <a href="#how" className="inline-flex min-h-11 shrink-0 items-center rounded-rq px-3 font-semibold text-ink transition duration-200 hover:bg-surface-2 active:scale-95">{t('landing.nav.how')}</a>
              <a href="#privacy" className="inline-flex min-h-11 shrink-0 items-center rounded-rq px-3 font-semibold text-ink transition duration-200 hover:bg-surface-2 active:scale-95">{t('landing.nav.privacy')}</a>
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-2"><LanguageMenu /><ThemeMenu /><Link to="/login" className="inline-flex min-h-11 items-center rounded-rq border border-control px-4 font-semibold text-ink transition duration-200 hover:bg-surface-2 active:scale-95">{t('app.signin')}</Link></div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl space-y-16 px-4 pb-20 pt-10 md:px-8 md:pt-16">
        <section aria-labelledby="hero-title" className="max-w-3xl">
          <motion.p {...rise(0)} className="text-sm font-bold uppercase tracking-wide text-action">{t('landing.v3.hero_kicker', 'Wildfire forecasting for India’s forests')}</motion.p>
          <motion.h1 id="hero-title" {...rise(0.1)} className="mt-3 text-4xl leading-tight md:text-6xl">{t('landing.v3.hero_title', 'See where wildfire is most likely to start tomorrow.')}</motion.h1>
          <motion.p {...rise(0.25)} className="mt-5 text-lg leading-relaxed text-ink-muted md:text-xl">{t('landing.v3.hero_body', 'TerraWatch ranks every forest area by its chance of fire, so forest staff know where to look first. Reports, photo checks and spread simulation then take them from forecast to response. People decide; software only suggests.')}</motion.p>
          <motion.div {...rise(0.35)} className="mt-7 flex flex-wrap gap-3">
            <a href="#forecast" className="inline-flex min-h-12 items-center rounded-rq bg-action px-6 text-lg font-bold text-on-action transition duration-200 hover:-translate-y-0.5 hover:bg-action-strong active:translate-y-0">{t('landing.v3.hero_forecast', 'Explore the forecast')}</a>
            <Link to="/login?next=/citizen/report" className="inline-flex min-h-12 items-center rounded-rq border border-control px-6 text-lg font-semibold text-ink transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0">{t('landing.hero.report')}</Link>
            <Link to="/login" className="inline-flex min-h-12 items-center rounded-rq border border-control px-6 text-lg font-semibold text-ink transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 active:translate-y-0">{t('landing.hero.signin')}</Link>
          </motion.div>
          <motion.div className="mt-6" {...rise(0.45)}><EmergencyStrip /></motion.div>
        </section>

        <Capabilities />
        <Reveal><div id="how" className="scroll-mt-20"><LadderPlayer /></div></Reveal>
        <Reveal><Citizens /></Reveal>
        <Community />
        <Reveal><Features /></Reveal>
        <Reveal><Principles /></Reveal>
        <Reveal><PrivacyMap /></Reveal>
        <Reveal><DataAnswers /></Reveal>
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
