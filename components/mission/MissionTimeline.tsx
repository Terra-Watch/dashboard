'use client';

import { motion } from 'framer-motion';
import { useMission } from '@/context/MissionContext';
import { MISSION_CONFIG, PHASE_ORDER, type MissionPhaseKey } from '@/lib/mission-config';
import { isPhaseReached } from '@/lib/mission-config';

const SHOWN_PHASES: MissionPhaseKey[] = [
  'PREPARING', 'DEPARTING', 'FISHING_ZONE',
  'STORM', 'EMERGENCY', 'RESCUE', 'RETURN',
];

/**
 * PURPOSE: The timeline makes the visitor aware of the mission's arc.
 * It tells them "you are here" — creating anticipation and narrative momentum.
 * Seeing "Safe Return" at the bottom gives emotional purpose to the journey.
 */
export function MissionTimeline() {
  const { progress, phase } = useMission();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 1.2 }}
      className="
        fixed right-6 top-1/2 -translate-y-1/2 z-40
        flex flex-col items-end gap-0
        hidden md:flex
      "
      role="navigation"
      aria-label="Mission timeline progress"
    >
      {SHOWN_PHASES.map((key, i) => {
        const cfg = MISSION_CONFIG.PHASES[key];
        const reached = isPhaseReached(progress, key);
        const isCurrent = key === phase || (
          i < SHOWN_PHASES.length - 1 &&
          isPhaseReached(progress, key) &&
          !isPhaseReached(progress, SHOWN_PHASES[i + 1])
        );

        return (
          <div key={key} className="flex items-center gap-2.5 group">
            {/* Label — shown on hover or current */}
            <div
              className={`
                text-right transition-all duration-300
                ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}
              `}
            >
              <p className="font-mono text-[0.6rem] tracking-[0.12em] uppercase text-[var(--c-dim)] whitespace-nowrap">
                {cfg.time}
              </p>
              <p className="font-body text-[0.6875rem] text-[var(--c-white)] whitespace-nowrap">
                {cfg.label}
              </p>
            </div>

            {/* Connector above (except first) */}
            {i > 0 && (
              <div className="absolute" /> /* handled by vertical layout */
            )}

            {/* Node */}
            <div className="flex flex-col items-center">
              {i > 0 && (
                <div
                  className="w-px h-6 transition-colors duration-500"
                  style={{
                    background: reached
                      ? 'var(--c-cyan-dim)'
                      : 'var(--c-dimmer)',
                  }}
                />
              )}
              <div
                className="w-2.5 h-2.5 rounded-full transition-all duration-500"
                style={{
                  background: isCurrent
                    ? 'var(--c-cyan)'
                    : reached
                      ? 'var(--c-cyan-dim)'
                      : 'var(--c-dimmer)',
                  boxShadow: isCurrent
                    ? '0 0 0 3px rgba(0,200,220,0.2), 0 0 10px rgba(0,200,220,0.4)'
                    : 'none',
                }}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${cfg.time} ${cfg.label}${reached ? ' (passed)' : ''}`}
              />
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
