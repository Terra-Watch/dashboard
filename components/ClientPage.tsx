'use client';

import dynamic from 'next/dynamic';
import { MissionProvider } from '@/context/MissionContext';
import { MISSION_CONFIG } from '@/lib/mission-config';
import { Navbar } from '@/components/navigation/Navbar';
import { MissionTimeline } from '@/components/mission/MissionTimeline';
import { StatusHUD } from '@/components/mission/StatusHUD';
import { NetworkToast } from '@/components/mission/NetworkToast';
import { EmergencyOverlay } from '@/components/mission/EmergencyOverlay';
import { CinematicPanels } from '@/components/scroll/CinematicPanels';
import { FleetDashboard } from '@/components/dashboard/FleetDashboard';
import { OutcomeMetrics } from '@/components/outcomes/OutcomeMetrics';
import { FinalSequence } from '@/components/final/FinalSequence';
import { SoundToggle } from '@/components/ui/SoundToggle';

// ─── Dynamic import: Three.js cannot run on the server ───────────────────────
const OceanCanvas = dynamic(
  () => import('@/components/three/OceanCanvas').then((m) => m.OceanCanvas),
  {
    ssr: false,
    loading: () => (
      // Fallback while Three.js loads — same background color
      <div className="fixed inset-0 z-0 bg-[#030D1B]" aria-hidden="true" />
    ),
  },
);

/**
 * The entire landing page experience is assembled here.
 *
 * Architecture:
 *   - OceanCanvas: fixed, z=0, always running
 *   - All overlays (HUD, Dashboard, Panels): fixed, z=30–50
 *   - Scroll spacer: the only non-fixed element, creates scroll distance
 *
 * MissionContext reads scroll position and provides derived state to every
 * component. The 3D scene reads from the missionProgressStore singleton
 * directly in useFrame, bypassing React for maximum performance.
 */
export default function ClientPage() {
  return (
    <MissionProvider>
      {/* ── Always-on 3D world ─────────────────────────────────────────── */}
      <OceanCanvas />

      {/* ── Fixed navigation ───────────────────────────────────────────── */}
      <Navbar />

      {/* ── Mission progress timeline (right sidebar) ─────────────────── */}
      <MissionTimeline />

      {/* ── Mission telemetry HUD (top-left) ──────────────────────────── */}
      <StatusHUD />

      {/* ── Network state toasts (top-center) ─────────────────────────── */}
      <NetworkToast />

      {/* ── Emergency response chain (right side, phase 0.70–0.85) ────── */}
      <EmergencyOverlay />

      {/* ── Cinematic content panels (center/left, phase-triggered) ────── */}
      <CinematicPanels />

      {/* ── Fleet dashboard (bottom-right, persistent, grows with mission) */}
      <FleetDashboard />

      {/* ── Outcome metrics (phase 0.85–0.92) ─────────────────────────── */}
      <OutcomeMetrics />

      {/* ── Final sequence (phase 0.92+) ───────────────────────────────── */}
      <FinalSequence />

      {/* ── Optional sound toggle ──────────────────────────────────────── */}
      <SoundToggle />

      {/* ── Scroll space: drives all mission progress ──────────────────── */}
      {/*    Height = MISSION_CONFIG.SCROLL_PX. Change that number to      */}
      {/*    lengthen or shorten the entire mission experience.             */}
      <div
        style={{ height: `${MISSION_CONFIG.SCROLL_PX}px` }}
        aria-hidden="true"
        role="presentation"
      />
    </MissionProvider>
  );
}
