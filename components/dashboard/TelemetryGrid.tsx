'use client';

import { fmt, fmtHeading, fmtDistance } from '@/lib/utils';
import type { TelemetryState } from '@/context/MissionContext';

/**
 * PURPOSE: Shows the operational data Jalri collects continuously —
 * not as features, but as proof that the system never stops watching.
 */
export function TelemetryGrid({ telemetry }: { telemetry: TelemetryState }) {
  const rows = [
    {
      label: 'Speed',
      value: `${fmt(telemetry.speed, 1)} kts`,
      color: 'default',
    },
    {
      label: 'Heading',
      value: fmtHeading(telemetry.heading),
      color: 'default',
    },
    {
      label: 'Offshore',
      value: fmtDistance(telemetry.distanceOffshore),
      color: 'default',
    },
    {
      label: 'GPS',
      value: telemetry.gpsLock ? 'LOCKED' : 'LOST',
      color: telemetry.gpsLock ? 'green' : 'orange',
    },
    {
      label: 'Mesh',
      value:
        telemetry.meshStatus === 'emergency' ? 'SOS' :
        telemetry.meshStatus === 'active'    ? 'ACTIVE' :
        telemetry.meshStatus === 'searching' ? 'SEARCH' : 'OFFLINE',
      color:
        telemetry.meshStatus === 'emergency' ? 'orange' :
        telemetry.meshStatus === 'active'    ? 'cyan' :
        telemetry.meshStatus === 'searching' ? 'amber' : 'dim',
    },
    {
      label: 'Weather',
      value: telemetry.weather.toUpperCase(),
      color:
        telemetry.weather === 'storm'   ? 'orange' :
        telemetry.weather === 'building' ? 'amber'  : 'dim',
    },
    {
      label: 'Crew',
      value:
        telemetry.crewStatus === 'sos'      ? 'SOS' :
        telemetry.crewStatus === 'alert'    ? 'ALERT' :
        telemetry.crewStatus === 'rescued'  ? 'RESCUED' :
        telemetry.crewStatus === 'safe'     ? 'SAFE' : 'NORMAL',
      color:
        telemetry.crewStatus === 'sos'     ? 'orange' :
        telemetry.crewStatus === 'alert'   ? 'amber' :
        telemetry.crewStatus === 'rescued' ? 'cyan' :
        telemetry.crewStatus === 'safe'    ? 'green' : 'dim',
    },
  ] as const;

  type ColorKey = 'default' | 'green' | 'orange' | 'cyan' | 'amber' | 'dim';
  const colorClass: Record<ColorKey, string> = {
    default: 'text-[var(--c-white)]',
    green:   'text-[var(--c-green)]',
    orange:  'text-[var(--c-orange)]',
    cyan:    'text-[var(--c-cyan)]',
    amber:   'text-[var(--c-amber)]',
    dim:     'text-[var(--c-dim)]',
  };

  return (
    <div className="px-4 pb-2 grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map(({ label, value, color }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="hud-label">{label}</span>
          <span className={`hud-value font-medium ${colorClass[color as ColorKey]}`}>
            {value}
          </span>
        </div>
      ))}

      {/* Battery bars — full width */}
      <div className="col-span-2 flex flex-col gap-1.5 pt-1 border-t border-[var(--c-cyan-border)]">
        <BatteryRow label="BOAT" value={telemetry.battery} />
        <BatteryRow label="WRIST" value={telemetry.wristBattery} />
      </div>
    </div>
  );
}

function BatteryRow({ label, value }: { label: string; value: number }) {
  const barColor =
    value < 20 ? 'bg-[var(--c-orange)]' :
    value < 40 ? 'bg-[var(--c-amber)]' :
                 'bg-[var(--c-cyan)]';

  return (
    <div className="flex items-center gap-2">
      <span className="hud-label w-8">{label}</span>
      <div className="flex-1 telemetry-bar-track">
        <div
          className={`telemetry-bar-fill ${barColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="hud-value w-7 text-right">{Math.round(value)}%</span>
    </div>
  );
}
