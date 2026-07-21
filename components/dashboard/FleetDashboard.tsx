'use client';

/**
 * components/dashboard/FleetDashboard.tsx
 *
 * Fleet Operations Dashboard.
 * Layout Fix: Removes fixed maxHeight constraints to eliminate content clipping (battery bars & status badges).
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useMission } from '@/context/MissionContext';
import { fmt, fmtHeading, fmtDistance } from '@/lib/utils';
import type { DashboardState } from '@/context/MissionContext';
import { TelemetryGrid } from './TelemetryGrid';
import { MissionLog } from './MissionLog';

const STATE_STYLES: Record<DashboardState, {
  width: string;
  bottom: string;
  right: string;
}> = {
  minimized: { width: '280px', bottom: '5rem', right: '1.5rem' },
  normal:    { width: '340px', bottom: '5rem', right: '1.5rem' },
  expanded:  { width: '420px', bottom: '5rem', right: '1.5rem' },
  primary:   { width: '480px', bottom: '5rem', right: '1.5rem' },
  complete:  { width: '340px', bottom: '5rem', right: '1.5rem' },
};

export function FleetDashboard() {
  const { dashboardState, telemetry, missionTime, progress, isEmergency } = useMission();

  const style = STATE_STYLES[dashboardState];

  const emergencyBorder = isEmergency
    ? 'border-[rgba(255,90,31,0.5)] shadow-[0_0_40px_rgba(255,90,31,0.15)]'
    : 'border-[var(--c-cyan-border)] shadow-[0_4px_32px_rgba(0,0,0,0.3)]';

  return (
    <motion.div
      layout
      animate={{
        width: style.width,
        opacity: 1,
      }}
      initial={{ opacity: 0, y: 20 }}
      transition={{
        layout: { type: 'spring', stiffness: 120, damping: 24 },
        opacity: { duration: 0.5 },
      }}
      className={`
        fixed z-35
        glass rounded-2xl border flex flex-col p-1
        ${emergencyBorder}
      `}
      style={{
        bottom: style.bottom,
        right: style.right,
      }}
      role="complementary"
      aria-label="Fleet Operations Dashboard"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--c-cyan-border)]">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isEmergency
                ? 'bg-[var(--c-orange)] animate-[sos-pulse_1s_ease-in-out_infinite]'
                : 'bg-[var(--c-green)]'
            }`}
            aria-hidden="true"
          />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-[var(--c-dim)] font-semibold">
            Fleet Operations
          </span>
        </div>
        <span className="font-mono text-[0.75rem] font-bold text-[var(--c-cyan)]">
          {missionTime}
        </span>
      </div>

      {/* Content — smooth height auto */}
      <div className="flex flex-col">
        {/* Vessel row — always visible */}
        <VesselRow
          telemetry={telemetry}
          missionTime={missionTime}
          isEmergency={isEmergency}
        />

        {/* Telemetry — normal and above */}
        <AnimatePresence>
          {dashboardState !== 'minimized' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="px-1"
            >
              <TelemetryGrid telemetry={telemetry} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mission log — expanded and above */}
        <AnimatePresence>
          {(dashboardState === 'expanded' || dashboardState === 'primary' || dashboardState === 'complete') && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="px-1"
            >
              <MissionLog progress={progress} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Complete state — mission summary */}
        <AnimatePresence>
          {dashboardState === 'complete' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="px-4 py-3 border-t border-[var(--c-cyan-border)] mt-1"
            >
              <p className="font-mono text-[0.7rem] text-[var(--c-green)] text-center tracking-wide font-semibold">
                ✦ Mission Complete — Safe Return
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Vessel row ───────────────────────────────────────────────────────────────

function VesselRow({ telemetry, isEmergency }: {
  telemetry: ReturnType<typeof useMission>['telemetry'];
  missionTime: string;
  isEmergency: boolean;
}) {
  return (
    <div className="px-3.5 py-2.5 flex items-center gap-3">
      {/* Vessel icon */}
      <div
        className={`
          w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold
          ${isEmergency
            ? 'bg-[rgba(255,90,31,0.2)] text-[var(--c-orange)]'
            : 'bg-[var(--c-slate-mid)] text-[var(--c-cyan)]'
          }
        `}
        aria-hidden="true"
      >
        ⛵
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-body text-sm font-semibold text-[var(--c-white)] truncate">
          {isEmergency ? 'JALRI-01 — SOS' : 'JALRI-01'}
        </p>
        <p className="font-mono text-[0.65rem] text-[var(--c-dim)] tracking-wider truncate">
          {fmt(telemetry.speed, 1)} kts · {fmtHeading(telemetry.heading)} · {fmtDistance(telemetry.distanceOffshore)}
        </p>
      </div>

      <div
        className={`text-[0.65rem] font-mono px-2.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
          isEmergency
            ? 'bg-[rgba(255,90,31,0.2)] text-[var(--c-orange)]'
            : telemetry.meshStatus === 'active'
              ? 'bg-[rgba(0,200,220,0.15)] text-[var(--c-cyan)]'
              : 'bg-[var(--c-slate-mid)] text-[var(--c-dim)]'
        }`}
      >
        {isEmergency ? 'SOS' : telemetry.meshStatus === 'active' ? 'MESH' : 'CELL'}
      </div>
    </div>
  );
}
