'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ChevronRight } from 'lucide-react';
import { useMission } from '@/context/MissionContext';
import { Button } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/GlassCard';
import { panelVisibility, smoothstep } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';

// ─── Panel definitions ────────────────────────────────────────────────────────

interface PanelContent {
  at: number;
  hideAt: number;
  align: 'left' | 'center';
  label?: string;
  labelColor?: 'default' | 'cyan' | 'amber' | 'orange' | 'green';
  title: string | string[];
  sub?: string;
  isHero?: boolean;
}

const PANELS: PanelContent[] = [
  {
    at: 0.00, hideAt: 0.08, align: 'center', isHero: true,
    label: 'MARITIME SAFETY PLATFORM',
    title: ['Every Voyage', 'Deserves a', 'Safe Return.'],
    sub: 'AI-assisted connectivity for fishermen operating beyond cellular coverage.',
  },
  {
    at: 0.09, hideAt: 0.20, align: 'left',
    label: '05:40 — PREPARING BOAT', labelColor: 'default',
    title: 'Leaving Harbor.',
    sub: 'Engine on. GPS locked. The voyage begins.',
  },
  {
    at: 0.21, hideAt: 0.33, align: 'left',
    label: '07:30 — OPEN OCEAN',
    title: '30 km from shore.',
    sub: 'No cell tower. No signal. The sea does not wait.',
  },
  {
    at: 0.34, hideAt: 0.44, align: 'left',
    label: '08:20 — FISHING ZONE', labelColor: 'cyan',
    title: 'All systems nominal.',
    sub: 'Jalri monitors continuously, even where networks end.',
  },
  {
    at: 0.44, hideAt: 0.51, align: 'center',
    label: '09:55 — SIGNAL LOST', labelColor: 'orange',
    title: 'Network Lost.',
    sub: 'Cellular coverage ends. Most systems go dark.',
  },
  {
    at: 0.51, hideAt: 0.59, align: 'center',
    label: '10:08 — LORA ACTIVATED', labelColor: 'cyan',
    title: 'Jalri connects.',
    sub: 'LoRa mesh instantly bridges the gap. 30 km+ coverage. Offline-first.',
  },
  {
    at: 0.59, hideAt: 0.69, align: 'left',
    label: '10:15 — WEATHER ALERT', labelColor: 'amber',
    title: 'Storm building.',
    sub: 'Jalri detects deteriorating conditions. Fleet is notified.',
  },
  {
    at: 0.69, hideAt: 0.77, align: 'center',
    label: '10:18 — SOS', labelColor: 'orange',
    title: 'Man overboard.',
    sub: 'WristNode detects the fall. BoatNode confirms. SOS transmitted in seconds.',
  },
  {
    at: 0.77, hideAt: 0.84, align: 'left',
    label: '10:22 — RESCUE IN PROGRESS', labelColor: 'amber',
    title: 'Nearby boats respond.',
    sub: 'The mesh works. Vessel 2.4 km away is already turning.',
  },
  {
    at: 0.84, hideAt: 0.91, align: 'left',
    label: '10:31 — CONFIRMED', labelColor: 'green',
    title: 'Rescue confirmed.',
    sub: 'From detection to response: under 3 minutes.',
  },
];

/**
 * PURPOSE: Each panel exists only to answer one question:
 * "What is Jalri doing for the fisherman right now?"
 * Text is kept minimal — the 3D scene does the heavy lifting.
 */
export function CinematicPanels() {
  const { progress } = useMission();

  return (
    <div className="fixed inset-0 z-30 pointer-events-none" aria-live="polite">
      {PANELS.map((panel, i) => {
        const vis = panelVisibility(progress, panel.at, panel.hideAt, 0.015);
        if (vis <= 0.001) return null;

        return (
          <PanelView
            key={i}
            panel={panel}
            opacity={vis}
            progress={progress}
          />
        );
      })}
    </div>
  );
}

// ─── Panel View ───────────────────────────────────────────────────────────────

function PanelView({
  panel, opacity, progress,
}: {
  panel: PanelContent;
  opacity: number;
  progress: number;
}) {
  const isCenter = panel.align === 'center';

  if (panel.isHero) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-auto"
        style={{ opacity }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.4 }}
          className="flex flex-col items-center"
        >
          {panel.label && (
            <SectionLabel className="mb-6 tracking-[0.2em]">
              {panel.label}
            </SectionLabel>
          )}

          <h1 className="font-display font-bold text-[var(--c-white)] leading-[1.02] mb-6"
            style={{ fontSize: 'clamp(3.5rem, 9vw, 8.5rem)' }}
          >
            {Array.isArray(panel.title)
              ? panel.title.map((line, li) => (
                  <span key={li} className="block">{line}</span>
                ))
              : panel.title}
          </h1>

          {panel.sub && (
            <p className="font-body text-[var(--c-dim)] mb-10 max-w-md text-lg leading-relaxed">
              {panel.sub}
            </p>
          )}

          <div className="flex items-center gap-4">
            <Button variant="primary" size="lg" aria-label="Explore the Jalri platform">
              Explore Jalri
            </Button>
            <Button variant="secondary" size="lg" aria-label="Learn about Jalri's mission">
              Our Mission
            </Button>
          </div>

          <motion.div
            className="mt-16 flex flex-col items-center gap-2 text-[var(--c-dim)]"
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            <span className="font-mono text-xs tracking-widest uppercase">Scroll to begin</span>
            <ArrowDown size={14} />
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`
        absolute inset-0 flex items-center pointer-events-none
        ${isCenter ? 'justify-center text-center px-6' : 'justify-start pl-8 md:pl-20 pr-[220px]'}
      `}
      style={{ opacity }}
    >
      <div className={`max-w-lg ${isCenter ? '' : ''}`}>
        {panel.label && (
          <SectionLabel
            color={panel.labelColor}
            className="block mb-4"
          >
            {panel.label}
          </SectionLabel>
        )}

        <h2
          className="font-display font-bold text-[var(--c-white)] leading-[1.05] mb-4"
          style={{ fontSize: 'clamp(2.2rem, 5.5vw, 5rem)' }}
        >
          {Array.isArray(panel.title)
            ? panel.title.map((line, li) => (
                <span key={li} className="block">{line}</span>
              ))
            : panel.title}
        </h2>

        {panel.sub && (
          <p
            className="font-body text-[var(--c-dim)] text-lg leading-relaxed"
          >
            {panel.sub}
          </p>
        )}
      </div>
    </div>
  );
}
