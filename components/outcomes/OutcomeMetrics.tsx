'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMission } from '@/context/MissionContext';
import { panelVisibility } from '@/lib/utils';

const OUTCOMES = [
  {
    metric: '30 km+',
    label: 'Mesh Coverage',
    sub: 'Where cellular towers end, Jalri continues.',
    at: 0.85,
    hideAt: 0.90,
  },
  {
    metric: '< 3 min',
    label: 'Emergency Response',
    sub: 'From detection to nearby vessel response.',
    at: 0.87,
    hideAt: 0.90,
  },
  {
    metric: 'Always On',
    label: 'Continuous Monitoring',
    sub: 'Fleet visibility from departure to return.',
    at: 0.88,
    hideAt: 0.91,
  },
  {
    metric: 'Zero Signal',
    label: 'Zero Compromise',
    sub: 'Offline-first. Designed for real ocean conditions.',
    at: 0.89,
    hideAt: 0.92,
  },
];

/**
 * PURPOSE: Show what Jalri delivers — outcomes, not features.
 * After the rescue, the visitor understands why each metric matters.
 * These numbers have context because they lived through the mission.
 */
export function OutcomeMetrics() {
  const { progress } = useMission();

  const showAny = progress >= 0.85 && progress < 0.92;
  if (!showAny) return null;

  return (
    <div
      className="fixed inset-0 z-30 pointer-events-none flex items-center justify-center"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 px-6">
        {OUTCOMES.map((outcome) => {
          const vis = panelVisibility(progress, outcome.at, outcome.hideAt, 0.01);
          if (vis < 0.01) return null;

          return (
            <motion.div
              key={outcome.metric}
              style={{ opacity: vis }}
              className="text-center"
            >
              <p
                className="font-display font-bold text-[var(--c-white)]"
                style={{ fontSize: 'clamp(2.5rem, 7vw, 6rem)' }}
              >
                {outcome.metric}
              </p>
              <p className="font-body text-[var(--c-cyan)] font-medium tracking-wide text-lg">
                {outcome.label}
              </p>
              <p className="font-body text-[var(--c-dim)] text-sm mt-1 max-w-xs mx-auto">
                {outcome.sub}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
