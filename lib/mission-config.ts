// ─────────────────────────────────────────────────────────────────────────────
// Jalri Mission Configuration
// All mission pacing is driven by this single file.
// Change SCROLL_PX to tune the total scroll distance.
// All phase thresholds are normalized 0–1 — they scale automatically.
// ─────────────────────────────────────────────────────────────────────────────

export type MissionPhaseKey =
  | 'PREPARING'
  | 'DEPARTING'
  | 'OPEN_OCEAN'
  | 'FISHING_ZONE'
  | 'NETWORK_LOST'
  | 'LORA_ACTIVE'
  | 'STORM'
  | 'EMERGENCY'
  | 'RESPONDING'
  | 'RESCUE'
  | 'RETURN'
  | 'END';

export interface PhaseConfig {
  start: number; // normalized 0–1
  label: string;
  time: string; // mission clock time
}

export type LogLevel = 'info' | 'warning' | 'alert' | 'success';

export interface MissionLogEntry {
  time: string;
  event: string;
  level: LogLevel;
  revealAt: number; // progress threshold to reveal
}

export type TelemetryKeyframe = [number, number]; // [progress, value]

export const MISSION_CONFIG = {
  /** Total scroll distance in pixels. Change this to tune pacing. */
  SCROLL_PX: 12000,

  PHASES: {
    PREPARING:    { start: 0.00, label: 'Preparing Boat',           time: '05:40' },
    DEPARTING:    { start: 0.10, label: 'Leaving Harbor',            time: '06:10' },
    OPEN_OCEAN:   { start: 0.22, label: 'Open Ocean',                time: '07:30' },
    FISHING_ZONE: { start: 0.35, label: 'Fishing Zone',              time: '08:20' },
    NETWORK_LOST: { start: 0.45, label: 'Signal Lost',               time: '09:55' },
    LORA_ACTIVE:  { start: 0.52, label: 'LoRa Mesh Active',           time: '10:08' },
    STORM:        { start: 0.60, label: 'Weather Alert',              time: '10:15' },
    EMERGENCY:    { start: 0.70, label: 'SOS Transmitted',            time: '10:18' },
    RESPONDING:   { start: 0.78, label: 'Nearby Boat Responding',    time: '10:22' },
    RESCUE:       { start: 0.85, label: 'Rescue Confirmed',           time: '10:31' },
    RETURN:       { start: 0.92, label: 'Safe Return',                time: '13:27' },
    END:          { start: 0.98, label: 'Mission Complete',           time: '13:30' },
  } satisfies Record<MissionPhaseKey, PhaseConfig>,

  MISSION_LOG: [
    { time: '05:42', event: 'Engine Started',             level: 'info',    revealAt: 0.00 },
    { time: '05:42', event: 'GPS Locked',                 level: 'info',    revealAt: 0.00 },
    { time: '06:08', event: 'Leaving Harbor',             level: 'info',    revealAt: 0.10 },
    { time: '08:17', event: 'Fishing Zone Reached',       level: 'info',    revealAt: 0.35 },
    { time: '09:55', event: 'Cellular Signal Lost',       level: 'warning', revealAt: 0.45 },
    { time: '10:08', event: 'LoRa Mesh Activated',        level: 'info',    revealAt: 0.52 },
    { time: '10:15', event: 'Weather Alert Issued',       level: 'warning', revealAt: 0.60 },
    { time: '10:18', event: 'Emergency SOS Transmitted',  level: 'alert',   revealAt: 0.70 },
    { time: '10:22', event: 'Nearby Boat Responding',     level: 'warning', revealAt: 0.78 },
    { time: '10:31', event: 'Rescue Confirmed',           level: 'success', revealAt: 0.85 },
    { time: '13:27', event: 'Safe Harbor Return',         level: 'success', revealAt: 0.92 },
  ] satisfies MissionLogEntry[],

  /** Telemetry keyframes: [progress, value] pairs */
  TELEMETRY: {
    speed: [
      [0.00, 0.0], [0.08, 0.5], [0.10, 4.2], [0.22, 7.8], [0.35, 8.4],
      [0.45, 5.1], [0.52, 7.0], [0.60, 3.8], [0.70, 0.8],
      [0.78, 3.2], [0.85, 6.1], [0.92, 7.0], [0.98, 2.5], [1.00, 0.0],
    ] as TelemetryKeyframe[],

    heading: [
      [0.00, 270], [0.10, 252], [0.22, 244], [0.35, 237],
      [0.45, 231], [0.52, 235], [0.60, 222], [0.70, 218],
      [0.78, 202], [0.85, 84], [0.92, 91], [1.00, 72],
    ] as TelemetryKeyframe[],

    distanceOffshore: [
      [0.00, 0.0], [0.10, 1.8], [0.22, 14.0], [0.35, 28.0],
      [0.45, 32.0], [0.52, 33.0], [0.60, 34.0], [0.70, 34.0],
      [0.78, 30.0], [0.85, 20.0], [0.92, 5.0], [1.00, 0.5],
    ] as TelemetryKeyframe[],

    battery: [
      [0.00, 100], [0.22, 95], [0.35, 89], [0.52, 83],
      [0.70, 76], [0.85, 69], [1.00, 63],
    ] as TelemetryKeyframe[],

    wristBattery: [
      [0.00, 100], [0.22, 97], [0.35, 92], [0.52, 87],
      [0.70, 79], [0.85, 73], [1.00, 66],
    ] as TelemetryKeyframe[],

    waveHeight: [
      [0.00, 0.20], [0.22, 0.30], [0.35, 0.35],
      [0.45, 0.40], [0.52, 0.38], [0.60, 0.90],
      [0.70, 1.50], [0.78, 1.10], [0.85, 0.60],
      [0.92, 0.28], [1.00, 0.20],
    ] as TelemetryKeyframe[],
  },

  /** Mission clock: interpolate between start and end times (minutes since midnight) */
  MISSION_CLOCK: {
    startMinutes: 5 * 60 + 40,  // 05:40
    endMinutes:   13 * 60 + 30, // 13:30
  },

  /** Cinematic panels: [progress, content config] */
  PANELS: [
    { at: 0.00, phase: 'PREPARING'    as MissionPhaseKey },
    { at: 0.10, phase: 'DEPARTING'    as MissionPhaseKey },
    { at: 0.22, phase: 'OPEN_OCEAN'   as MissionPhaseKey },
    { at: 0.35, phase: 'FISHING_ZONE' as MissionPhaseKey },
    { at: 0.45, phase: 'NETWORK_LOST' as MissionPhaseKey },
    { at: 0.52, phase: 'LORA_ACTIVE'  as MissionPhaseKey },
    { at: 0.60, phase: 'STORM'        as MissionPhaseKey },
    { at: 0.70, phase: 'EMERGENCY'    as MissionPhaseKey },
    { at: 0.78, phase: 'RESPONDING'   as MissionPhaseKey },
    { at: 0.85, phase: 'RESCUE'       as MissionPhaseKey },
    { at: 0.92, phase: 'RETURN'       as MissionPhaseKey },
    { at: 0.98, phase: 'END'          as MissionPhaseKey },
  ],
};

/** Map phase key → ordered index for comparisons */
export const PHASE_ORDER: MissionPhaseKey[] = [
  'PREPARING', 'DEPARTING', 'OPEN_OCEAN', 'FISHING_ZONE',
  'NETWORK_LOST', 'LORA_ACTIVE', 'STORM', 'EMERGENCY',
  'RESPONDING', 'RESCUE', 'RETURN', 'END',
];

/** Get current phase key from normalized progress */
export function getCurrentPhase(progress: number): MissionPhaseKey {
  let current: MissionPhaseKey = 'PREPARING';
  for (const key of PHASE_ORDER) {
    if (progress >= MISSION_CONFIG.PHASES[key].start) {
      current = key;
    }
  }
  return current;
}

/** Check if a phase has been reached */
export function isPhaseReached(progress: number, phase: MissionPhaseKey): boolean {
  return progress >= MISSION_CONFIG.PHASES[phase].start;
}

/** Get mission clock time string from progress */
export function getMissionTime(progress: number): string {
  const { startMinutes, endMinutes } = MISSION_CONFIG.MISSION_CLOCK;
  const totalMinutes = startMinutes + (endMinutes - startMinutes) * progress;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
