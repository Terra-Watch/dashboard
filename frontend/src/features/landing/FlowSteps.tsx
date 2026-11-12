import { motion, useReducedMotion } from 'motion/react';
import { ClipboardCheck, Flame, HardHat, MapPin, SatelliteDish, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STEPS: Array<{ id: string; Icon: LucideIcon; title: string; question: string; gives: string }> = [
  { id: 'forecast', Icon: Flame, title: 'Forecast', question: 'Where is a fire likely tomorrow?', gives: 'A level for each 55 km forest area, with the places to look first.' },
  { id: 'satellite', Icon: SatelliteDish, title: 'Satellite', question: 'Is this detection a real fire?', gives: 'Every detection sorted into a group, with the reason in words.' },
  { id: 'fires', Icon: MapPin, title: 'Active fires', question: 'Which fires matter now?', gives: 'Fires built from detections, with size, growth and the nearest villages.' },
  { id: 'action', Icon: HardHat, title: 'Action', question: 'What do we do?', gives: 'A crew sent as a check, a notice written and approved by a second person, a village warned.' },
  { id: 'record', Icon: ClipboardCheck, title: 'Record', question: 'Was it right?', gives: 'What the ranger found, and the forecast set beside what was detected.' },
];

/** One fire through the five steps of the product. Each step is a question staff ask and what TerraWatch gives for it. */
export function FlowSteps() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <section aria-labelledby="flow-title" className="rounded-panel border border-line bg-surface p-5 md:p-8" data-testid="flow-steps">
      <h2 id="flow-title" className="text-2xl md:text-3xl">{t('landing.v5.flow.title', 'How one fire moves through TerraWatch')}</h2>
      <p className="mt-2 max-w-2xl text-ink-muted">{t('landing.v5.flow.intro', 'Software suggests and people decide. Every action passes through a person.')}</p>
      <ol className="mt-6 grid gap-4 md:grid-cols-5">
        {STEPS.map(({ id, Icon, title, question, gives }, index) => (
          <motion.li key={id} initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: reduce ? 0 : index * 0.08 }} className="rounded-panel border border-line bg-canvas p-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-action text-on-action"><Icon aria-hidden="true" size={20} /></span>
            <p className="mt-3 text-sm font-bold text-ink-muted">{index + 1}</p>
            <h3 className="text-xl">{t(`landing.v5.flow.${id}.title`, title)}</h3>
            <p className="mt-1 font-semibold">{t(`landing.v5.flow.${id}.question`, question)}</p>
            <p className="mt-1 text-ink-muted">{t(`landing.v5.flow.${id}.gives`, gives)}</p>
          </motion.li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-ink-muted">{t('landing.v5.flow.stations', 'A lookout station’s smoke or sound statement is a prompt to look: it enters the Action step as a check.')}</p>
    </section>
  );
}
