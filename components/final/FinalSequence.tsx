'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMission } from '@/context/MissionContext';
import { Button } from '@/components/ui/Button';
import { Anchor, ArrowUpRight } from 'lucide-react';
import { smoothstep } from '@/lib/utils';

/**
 * PURPOSE: The final sequence is quiet. The danger has passed.
 * The boat is home. The headline returns — but now it has earned its meaning.
 * "Every Voyage Deserves a Safe Return" lands differently after the journey.
 */
export function FinalSequence() {
  const { progress } = useMission();

  const show = progress >= 0.92;
  const opacity = smoothstep(0.92, 0.96, progress);

  if (!show) return null;

  const lines = ['Every Voyage', 'Deserves', 'A Safe Return.'];

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
      style={{ opacity }}
      aria-live="polite"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: opacity > 0.1 ? 1 : 0 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        className="flex flex-col items-center max-w-3xl"
      >
        {/* Subtle label */}
        <p className="font-mono text-[0.7rem] tracking-[0.25em] uppercase text-[var(--c-cyan)] mb-6 opacity-90 font-semibold">
          Mission Complete · 13:30
        </p>

        {/* Main headline — staggered */}
        <h2
          className="font-display font-bold text-[var(--c-white)] leading-[1.02] mb-8 tracking-tight"
          style={{ fontSize: 'clamp(3rem, 7.5vw, 6.5rem)' }}
        >
          {lines.map((line, i) => (
            <motion.span
              key={line}
              className="block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: opacity > 0.1 ? 1 : 0, y: opacity > 0.1 ? 0 : 20 }}
              transition={{
                duration: 1.0,
                ease: 'easeOut',
                delay: i * 0.25,
              }}
            >
              {line}
            </motion.span>
          ))}
        </h2>

        {/* Sub-line */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: opacity > 0.3 ? 0.8 : 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="font-body text-[var(--c-dim)] text-lg max-w-md mb-10 leading-relaxed"
        >
          Built for every fisherman returning home.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: opacity > 0.5 ? 1 : 0, y: opacity > 0.5 ? 0 : 10 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="flex items-center gap-5 pointer-events-auto"
        >
          <Button
            variant="primary"
            size="lg"
            aria-label="Explore the Jalri platform"
            className="gap-2"
          >
            Explore Jalri
            <ArrowUpRight size={18} />
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Return to the beginning of the mission"
          >
            Replay Mission
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: opacity > 0.7 ? 0.5 : 0 }}
          transition={{ duration: 0.8, delay: 1.6 }}
          className="mt-16 flex items-center gap-3 text-[var(--c-dim)]"
        >
          <Anchor size={14} className="text-[var(--c-cyan)]" />
          <span className="font-display font-semibold text-sm tracking-wider text-[var(--c-white)]">JALRI</span>
          <span className="font-body text-xs text-[var(--c-dim)]">© 2026 · Maritime Safety Platform</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
