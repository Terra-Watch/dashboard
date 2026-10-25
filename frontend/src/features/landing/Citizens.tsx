import { Bell, Camera, ClipboardCheck, MessagesSquare, Route, ShieldCheck, WifiOff, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

const STEPS: Array<{ id: string; Icon: LucideIcon; title: string; text: string }> = [
  { id: 'report', Icon: Camera, title: 'You report', text: 'Take a photo and tell us what you see. It takes about a minute.' },
  { id: 'check', Icon: ClipboardCheck, title: 'Staff check it', text: 'A person in the Control Room reviews every report before anything is announced.' },
  { id: 'act', Icon: ShieldCheck, title: 'Responders act', text: 'You can follow each step of your report from received to closed.' },
];
const EXTRAS: Array<{ id: string; Icon: LucideIcon; text: string }> = [
  { id: 'offline', Icon: WifiOff, text: 'No signal? Your report waits on your phone and is sent later.' },
  { id: 'follow', Icon: Route, text: 'Follow your report and read why it was closed.' },
  { id: 'notices', Icon: Bell, text: 'See official notices and verified fire areas near you.' },
  { id: 'community', Icon: MessagesSquare, text: 'Ask neighbours in a moderated community.' },
];

/** For people who see smoke: what happens to a report, in three plain steps. */
export function Citizens() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <section id="citizens" aria-labelledby="citizens-title" className="scroll-mt-20 space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-wide text-action">{t('landing.v3.citizens_kicker', 'For citizens')}</p>
        <h2 id="citizens-title" className="mt-2 text-3xl md:text-4xl">{t('citizen.v2.how.title', 'Report a fire. Staff check it. Responders act.')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v3.citizens_sub', 'See smoke or fire? Tell the forest staff in about a minute, and follow what happens next.')}</p>
      </div>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map(({ id, Icon, title, text }, index) => (
          <motion.li key={id} initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.45, delay: index * 0.1, ease: 'easeOut' }} className="group rounded-2xl border border-line bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md">
            <span className="flex size-12 items-center justify-center rounded-full bg-action-tint text-action transition-transform duration-200 group-hover:scale-110"><Icon aria-hidden="true" size={24} strokeWidth={1.75} /></span>
            <p className="mt-4 text-sm font-bold uppercase tracking-wide text-ink-muted">{index + 1}</p>
            <p className="text-xl font-bold">{t(`citizen.v2.how.${id}`, title)}</p>
            <p className="mt-1 text-ink-muted">{t(`citizen.v2.how.${id}_text`, text)}</p>
          </motion.li>
        ))}
      </ol>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {EXTRAS.map(({ id, Icon, text }) => <li key={id} className="flex items-center gap-3"><Icon aria-hidden="true" className="shrink-0 text-action" size={22} strokeWidth={1.75} /><span>{t(`landing.v3.citizens.${id}`, text)}</span></li>)}
      </ul>
      <Link to="/login?next=/citizen/report" className="inline-flex min-h-12 items-center rounded-rq bg-action px-6 text-lg font-bold text-on-action transition duration-200 hover:-translate-y-0.5 hover:bg-action-strong active:translate-y-0">{t('landing.hero.report')}</Link>
    </section>
  );
}
