import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RungBadge } from '../../ui/RungBadge';
import { Button } from '../../ui/Button';
import type { Rung } from '../../ui/ladder';

const ORDER: Rung[] = ['signal', 'report', 'verified', 'responding', 'contained', 'closed'];
const STEP_MS = 2600;

/** An interactive walk up the confidence ladder. Auto-play is off for people who prefer reduced motion; the step buttons always work. */
export function LadderPlayer() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(1);
  const [playing, setPlaying] = useState(false);
  const rung = ORDER[index];

  useEffect(() => {
    if (!playing || reduce) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % ORDER.length), STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, reduce]);

  return (
    <section aria-labelledby="ladder-title" className="rounded-panel border border-line bg-surface p-5 md:p-8" data-testid="ladder-player">
      <h2 id="ladder-title" className="text-2xl md:text-3xl">{t('landing.ladder.title')}</h2>
      <p className="mt-2 max-w-2xl text-ink-muted">{t('landing.ladder.intro')}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-[16rem_1fr]">
        <ol className="space-y-2" aria-label={t('landing.ladder.title')}>
          {ORDER.map((item, position) => (
            <li key={item}>
              <button type="button" onClick={() => { setIndex(position); setPlaying(false); }} aria-current={position === index ? 'step' : undefined}
                className={`flex w-full min-h-12 items-center gap-3 rounded-rq border px-3 text-left ${position === index ? 'border-action bg-action-tint' : 'border-line bg-surface hover:bg-surface-2'}`}>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${position <= index ? 'bg-action text-on-action' : 'bg-surface-2 text-ink-muted'}`}>{position + 1}</span>
                <RungBadge rung={item} />
              </button>
            </li>
          ))}
        </ol>
        <div aria-live="polite" className="min-h-72 rounded-panel border border-line bg-canvas p-5">
          <AnimatePresence mode="wait">
            <motion.div key={rung} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              <RungBadge rung={rung} />
              <dl className="mt-4 space-y-4">
                {(['who', 'staff', 'public'] as const).map(field => (
                  <div key={field}>
                    <dt className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t(`landing.ladder.${field}`)}</dt>
                    <dd className="mt-1 text-lg">{t(`landing.ladder.steps.${rung}.${field}`)}</dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => { setIndex(i => (i + ORDER.length - 1) % ORDER.length); setPlaying(false); }} icon={<ChevronLeft aria-hidden="true" size={18} />}>{t('landing.ladder.prev')}</Button>
        <Button variant="secondary" onClick={() => { setIndex(i => (i + 1) % ORDER.length); setPlaying(false); }} icon={<ChevronRight aria-hidden="true" size={18} />}>{t('landing.ladder.next')}</Button>
        {!reduce && <Button onClick={() => setPlaying(value => !value)} icon={playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}>{playing ? t('landing.ladder.pause') : t('landing.ladder.play')}</Button>}
        <span className="text-sm text-ink-muted">{t('landing.ladder.illustration')}</span>
      </div>
    </section>
  );
}
