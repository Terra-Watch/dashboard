import { motion, useReducedMotion } from 'motion/react';
import { ClipboardCheck, FileText, HardHat, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STEPS = [{ id: 'report', Icon: FileText }, { id: 'check', Icon: Search }, { id: 'respond', Icon: HardHat }, { id: 'close', Icon: ClipboardCheck }] as const;

/** Four steps that come into view as you scroll. With reduced motion they are simply shown. */
export function HowItWorks() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20">
      <h2 id="how-title" className="text-2xl md:text-3xl">{t('landing.how.title')}</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-4">
        {STEPS.map(({ id, Icon }, index) => (
          <motion.li key={id} initial={reduce ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.08 }}
            className="rounded-panel border border-line bg-surface p-5">
            <span className="flex size-10 items-center justify-center rounded-full bg-action text-on-action"><Icon aria-hidden="true" size={20} /></span>
            <p className="mt-3 text-sm font-bold text-ink-muted">{index + 1}</p>
            <h3 className="text-xl">{t(`landing.how.${id}.title`)}</h3>
            <p className="mt-1 text-ink-muted">{t(`landing.how.${id}.body`)}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
