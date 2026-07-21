'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Battery, Navigation, Gauge, Clock, Radio, AlertTriangle } from 'lucide-react';
import { useMission } from '@/context/MissionContext';
import { fmt, fmtHeading, fmtDistance } from '@/lib/utils';

/**
 * PURPOSE: Shows the visitor what Jalri is monitoring in real-time.
 * Every field is something that keeps the fisherman safe.
 * GPS lock, mesh status, battery — not features, but lifelines.
 */
export function StatusHUD() {
  const { telemetry, missionTime, phase, isEmergency } = useMission();

  const meshColor =
    telemetry.meshStatus === 'emergency' ? 'text-[var(--c-orange)]' :
    telemetry.meshStatus === 'active'    ? 'text-[var(--c-cyan)]' :
    telemetry.meshStatus === 'searching' ? 'text-[var(--c-amber)]' :
                                           'text-[var(--c-dimmer)]';

  const meshLabel =
    telemetry.meshStatus === 'emergency' ? 'SOS' :
    telemetry.meshStatus === 'active'    ? 'LORA ACTIVE' :
    telemetry.meshStatus === 'searching' ? 'SEARCHING' :
                                           'NO MESH';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, delay: 1.0 }}
      className="fixed top-20 left-6 z-40 flex flex-col gap-1.5"
      role="status"
      aria-label="Mission telemetry"
      aria-live="polite"
    >
      <div className="glass rounded-xl p-3.5 flex flex-col gap-3 min-w-[168px]">

        {/* Mission time */}
        <div className="flex items-center gap-2 pb-2 border-b border-[var(--c-cyan-border)]">
          <Clock size={11} className="text-[var(--c-dim)]" />
          <span className="hud-label">Mission Time</span>
          <span className="hud-value ml-auto font-bold text-[var(--c-cyan)]">{missionTime}</span>
        </div>

        {/* Speed */}
        <HUDRow
          icon={<Gauge size={11} />}
          label="Speed"
          value={`${fmt(telemetry.speed, 1)} kts`}
        />

        {/* Heading */}
        <HUDRow
          icon={<Navigation size={11} />}
          label="Heading"
          value={fmtHeading(telemetry.heading)}
        />

        {/* Distance offshore */}
        <HUDRow
          icon={<Navigation size={11} className="rotate-45" />}
          label="Offshore"
          value={fmtDistance(telemetry.distanceOffshore)}
        />

        {/* GPS */}
        <HUDRow
          icon={<Radio size={11} />}
          label="GPS"
          value={telemetry.gpsLock ? 'LOCKED' : 'LOST'}
          valueClass={telemetry.gpsLock ? 'text-[var(--c-green)]' : 'text-[var(--c-orange)]'}
        />

        {/* Mesh */}
        <HUDRow
          icon={<Wifi size={11} />}
          label="Mesh"
          value={meshLabel}
          valueClass={meshColor}
        />

        {/* Battery bars */}
        <div className="pt-1 border-t border-[var(--c-cyan-border)] flex flex-col gap-1.5">
          <BatteryBar label="BOAT" value={telemetry.battery} />
          <BatteryBar label="WRIST" value={telemetry.wristBattery} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HUDRow({
  icon, label, value, valueClass = 'text-[var(--c-white)]',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--c-dim)]">{icon}</span>
      <span className="hud-label flex-1">{label}</span>
      <span className={`hud-value ${valueClass}`}>{value}</span>
    </div>
  );
}

function BatteryBar({ label, value }: { label: string; value: number }) {
  const color =
    value < 20 ? 'bg-[var(--c-orange)]' :
    value < 40 ? 'bg-[var(--c-amber)]' :
                 'bg-[var(--c-cyan)]';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="hud-label">{label} PWR</span>
        <span className="hud-value">{Math.round(value)}%</span>
      </div>
      <div className="telemetry-bar-track">
        <div
          className={`telemetry-bar-fill ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
