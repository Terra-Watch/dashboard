'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { MISSION_CONFIG, type LogLevel } from '@/lib/mission-config';

const LEVEL_COLOR: Record<LogLevel, string> = {
  info:    'bg-[var(--c-cyan-dim)]',
  warning: 'bg-[var(--c-amber)]',
  alert:   'bg-[var(--c-orange)]',
  success: 'bg-[var(--c-green)]',
};

const LEVEL_TEXT: Record<LogLevel, string> = {
  info:    'text-[var(--c-dim)]',
  warning: 'text-[var(--c-amber)]',
  alert:   'text-[var(--c-orange)]',
  success: 'text-[var(--c-green)]',
};

/**
 * PURPOSE: The mission log reveals the chronological record of events —
 * showing that Jalri detected and responded to each moment.
 * Progressive reveal creates narrative momentum.
 */
export function MissionLog({ progress }: { progress: number }) {
  const visibleEntries = MISSION_CONFIG.MISSION_LOG.filter(
    (entry) => progress >= entry.revealAt,
  );

  return (
    <div
      className="px-4 pt-2 pb-3 border-t border-[var(--c-cyan-border)]"
      role="log"
      aria-label="Mission event log"
      aria-live="polite"
    >
      <p className="hud-label mb-2">Event Log</p>

      <div className="flex flex-col gap-0.5 max-h-[160px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {visibleEntries.map((entry) => (
            <motion.div
              key={entry.event}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="log-entry"
            >
              <span className="log-entry__time">{entry.time}</span>
              <div
                className={`log-entry__dot flex-shrink-0 ${LEVEL_COLOR[entry.level]}`}
                aria-hidden="true"
              />
              <span className={`log-entry__text ${LEVEL_TEXT[entry.level]}`}>
                {entry.event}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
