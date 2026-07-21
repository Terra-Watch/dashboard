'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Radio, Users } from 'lucide-react';
import { useMission } from '@/context/MissionContext';
import { smoothstep } from '@/lib/utils';

/**
 * PURPOSE: The emergency section must feel urgent, not dramatic.
 * Show exactly what Jalri does in those 3 minutes —
 * detect, transmit, alert, respond. Each step matters.
 */
export function EmergencyOverlay() {
  const { progress, isEmergency, phase } = useMission();

  const showDetection  = progress >= 0.70;
  const showTransmit   = progress >= 0.72;
  const showResponse   = progress >= 0.78;
  const showConfirm    = progress >= 0.85;

  // Background red tint
  const tintOpacity =
    progress >= 0.70 && progress < 0.85
      ? smoothstep(0.70, 0.73, progress) * (1 - smoothstep(0.82, 0.85, progress)) * 0.12
      : 0;

  return (
    <>
      {/* Subtle red atmosphere tint */}
      <AnimatePresence>
        {tintOpacity > 0.01 && (
          <motion.div
            className="fixed inset-0 z-20 pointer-events-none"
            style={{
              background: `rgba(255, 45, 0, ${tintOpacity})`,
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Emergency chain — right side panel */}
      <AnimatePresence>
        {isEmergency && (
          <motion.div
            key="emergency"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="
              fixed top-1/2 -translate-y-1/2 right-6 z-40
              glass border border-[rgba(255,90,31,0.25)]
              rounded-2xl p-5 w-[220px]
              shadow-[0_0_40px_rgba(255,90,31,0.1)]
            "
            role="alert"
            aria-label="Emergency response chain"
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[var(--c-orange)] animate-[sos-pulse_1s_ease-in-out_infinite]" />
              <span className="font-mono text-[0.6875rem] tracking-[0.15em] uppercase text-[var(--c-orange)]">
                SOS Active
              </span>
            </div>

            <ol className="flex flex-col gap-3" aria-label="Response sequence">
              <ChainStep
                visible={showDetection}
                label="WristNode Detected"
                sub="Man overboard alert"
                done={showTransmit}
              />
              <ChainStep
                visible={showTransmit}
                label="SOS Transmitted"
                sub="Via LoRa mesh"
                done={showResponse}
              />
              <ChainStep
                visible={showResponse}
                label="Nearby Boat Responding"
                sub="2.4 km away"
                done={showConfirm}
              />
              <ChainStep
                visible={showConfirm}
                label="Rescue Confirmed"
                sub="10:31 mission time"
                done={false}
                success
              />
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Chain Step ───────────────────────────────────────────────────────────────

function ChainStep({
  visible, label, sub, done, success = false,
}: {
  visible: boolean;
  label: string;
  sub: string;
  done: boolean;
  success?: boolean;
}) {
  if (!visible) return null;

  const accentColor = success
    ? 'var(--c-green)'
    : done
      ? 'var(--c-cyan)'
      : 'var(--c-orange)';

  return (
    <motion.li
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex items-start gap-2.5"
    >
      <div
        className="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: accentColor }}
        aria-hidden="true"
      />
      <div>
        <p className="text-xs text-[var(--c-white)] font-medium leading-tight">{label}</p>
        <p className="text-[0.6875rem] text-[var(--c-dim)] mt-0.5">{sub}</p>
      </div>
    </motion.li>
  );
}
