'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Radio, CheckCircle2 } from 'lucide-react';
import { useMission } from '@/context/MissionContext';

/**
 * PURPOSE: The two most critical narrative moments of the mission —
 * losing cellular signal (the problem) and LoRa activating (the solution).
 * The visitor must emotionally understand the gap Jalri fills.
 */
export function NetworkToast() {
  const { isNetworkLost, isLoraActive, isEmergency, progress } = useMission();

  // Show "Signal Lost" between network_lost and lora_active
  const showSignalLost = isNetworkLost && !isLoraActive;

  // Show "LoRa Active" for a window after activation
  const showLoraActive = isLoraActive && progress < 0.62 && !isEmergency;

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-45 flex flex-col items-center gap-3"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Signal Lost */}
      <AnimatePresence>
        {showSignalLost && (
          <motion.div
            key="signal-lost"
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            role="alert"
            className="
              glass border border-[rgba(255,90,31,0.3)]
              rounded-full px-5 py-2.5
              flex items-center gap-3
              shadow-[0_4px_32px_rgba(255,90,31,0.15)]
            "
          >
            <WifiOff size={14} className="text-[var(--c-orange)]" />
            <span className="font-mono text-xs tracking-[0.12em] uppercase text-[var(--c-orange)]">
              Network Lost
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-orange)] animate-[signal-blink_1s_ease-in-out_infinite]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* LoRa Mesh Active */}
      <AnimatePresence>
        {showLoraActive && (
          <motion.div
            key="lora-active"
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            role="status"
            className="
              glass border border-[rgba(0,200,220,0.3)]
              rounded-full px-5 py-2.5
              flex items-center gap-3
              shadow-[0_4px_32px_rgba(0,200,220,0.12)]
            "
          >
            <Radio size={14} className="text-[var(--c-cyan)]" />
            <span className="font-mono text-xs tracking-[0.12em] uppercase text-[var(--c-cyan)]">
              LoRa Mesh Active
            </span>
            <CheckCircle2 size={13} className="text-[var(--c-green)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
