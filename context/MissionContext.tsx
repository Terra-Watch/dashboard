'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useMissionProgress } from '@/hooks/useMissionProgress';
import {
  getCurrentPhase,
  getMissionTime,
  isPhaseReached,
  MISSION_CONFIG,
  type MissionPhaseKey,
} from '@/lib/mission-config';
import { interpolateKeyframes } from '@/lib/utils';

// ─── Telemetry ────────────────────────────────────────────────────────────────

export type MeshStatus = 'inactive' | 'searching' | 'active' | 'emergency';
export type WeatherState = 'clear' | 'building' | 'storm' | 'clearing';
export type CrewStatus = 'normal' | 'alert' | 'sos' | 'rescued' | 'safe';

export interface TelemetryState {
  speed: number;             // knots
  heading: number;           // degrees
  distanceOffshore: number;  // km
  gpsLock: boolean;
  meshStatus: MeshStatus;
  battery: number;           // % BoatNode
  wristBattery: number;      // % WristNode
  weather: WeatherState;
  waveHeight: number;        // metres
  crewStatus: CrewStatus;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardState = 'minimized' | 'normal' | 'expanded' | 'primary' | 'complete';

// ─── Context shape ────────────────────────────────────────────────────────────

export interface MissionContextValue {
  progress: number;
  phase: MissionPhaseKey;
  missionTime: string;
  telemetry: TelemetryState;
  dashboardState: DashboardState;

  // Narrative state flags
  isEmergency: boolean;
  isLoraActive: boolean;
  isNetworkLost: boolean;
  isStorm: boolean;
  isReturning: boolean;
}

const MissionContext = createContext<MissionContextValue | null>(null);

// ─── Derived state helpers ────────────────────────────────────────────────────

function deriveTelemetry(progress: number): TelemetryState {
  const t = MISSION_CONFIG.TELEMETRY;
  const speed = interpolateKeyframes(t.speed, progress);
  const heading = interpolateKeyframes(t.heading, progress);
  const distanceOffshore = interpolateKeyframes(t.distanceOffshore, progress);
  const battery = interpolateKeyframes(t.battery, progress);
  const wristBattery = interpolateKeyframes(t.wristBattery, progress);
  const waveHeight = interpolateKeyframes(t.waveHeight, progress);

  const gpsLock = progress < 0.45 || progress >= 0.52;

  let meshStatus: MeshStatus = 'inactive';
  if (progress >= 0.70) meshStatus = 'emergency';
  else if (progress >= 0.52) meshStatus = 'active';
  else if (progress >= 0.44) meshStatus = 'searching';

  let weather: WeatherState = 'clear';
  if (progress >= 0.92) weather = 'clearing';
  else if (progress >= 0.60) weather = 'storm';
  else if (progress >= 0.50) weather = 'building';

  let crewStatus: CrewStatus = 'normal';
  if (progress >= 0.92) crewStatus = 'safe';
  else if (progress >= 0.85) crewStatus = 'rescued';
  else if (progress >= 0.78) crewStatus = 'sos';
  else if (progress >= 0.70) crewStatus = 'sos';
  else if (progress >= 0.60) crewStatus = 'alert';

  return {
    speed,
    heading,
    distanceOffshore,
    gpsLock,
    meshStatus,
    battery,
    wristBattery,
    weather,
    waveHeight,
    crewStatus,
  };
}

function deriveDashboardState(progress: number): DashboardState {
  if (progress >= 0.92) return 'complete';
  if (progress >= 0.85) return 'primary';
  if (progress >= 0.70) return 'expanded';
  if (progress >= 0.35) return 'normal';
  return 'minimized';
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function MissionProvider({ children }: { children: ReactNode }) {
  // This hook also updates the missionProgressStore singleton for Three.js
  const progress = useMissionProgress();

  const value = useMemo<MissionContextValue>(() => {
    const phase = getCurrentPhase(progress);
    const missionTime = getMissionTime(progress);
    const telemetry = deriveTelemetry(progress);
    const dashboardState = deriveDashboardState(progress);

    return {
      progress,
      phase,
      missionTime,
      telemetry,
      dashboardState,
      isEmergency: isPhaseReached(progress, 'EMERGENCY') && !isPhaseReached(progress, 'RESCUE'),
      isLoraActive: isPhaseReached(progress, 'LORA_ACTIVE'),
      isNetworkLost: isPhaseReached(progress, 'NETWORK_LOST') && !isPhaseReached(progress, 'LORA_ACTIVE'),
      isStorm: isPhaseReached(progress, 'STORM') && !isPhaseReached(progress, 'RESCUE'),
      isReturning: isPhaseReached(progress, 'RETURN'),
    };
  }, [progress]);

  return (
    <MissionContext.Provider value={value}>
      {children}
    </MissionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMission(): MissionContextValue {
  const ctx = useContext(MissionContext);
  if (!ctx) throw new Error('useMission must be used within <MissionProvider>');
  return ctx;
}
