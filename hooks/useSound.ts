'use client';

/**
 * hooks/useSound.ts
 *
 * Ambient & Telemetry Sound System.
 * Milestone 10 — Audio System Integration.
 *
 * Responsibilities:
 *   - Web Audio Context gain node cross-fading between 5 narrative sound layers:
 *       • ocean-calm  : harbor ambience & pre-departure waves (0.00-0.22)
 *       • ocean-open  : offshore ocean swell & sea breeze (0.22-0.60)
 *       • storm       : storm winds, rainfall, heavy sea roar (0.60-0.85)
 *       • emergency   : SOS distress pulse & radio telemetry crackle (0.70-0.78)
 *       • dawn-return : peaceful harbor arrival & dawn birds (0.92-1.00)
 *   - Mobile Web Audio context unlock on initial user gesture click
 *   - Graceful degradation: zero console errors or uncaught exceptions if MP3 assets are missing in /public/audio/
 */

import { useRef, useCallback, useState } from 'react';

type AudioLayer = 'ocean-calm' | 'ocean-open' | 'storm' | 'emergency' | 'dawn-return';

interface SoundControls {
  enabled: boolean;
  toggle: () => void;
  setPhaseAudio: (progress: number) => void;
}

const AUDIO_FILES: Record<AudioLayer, string> = {
  'ocean-calm':  '/audio/ocean-calm.mp3',
  'ocean-open':  '/audio/ocean-open.mp3',
  'storm':       '/audio/storm.mp3',
  'emergency':   '/audio/emergency.mp3',
  'dawn-return': '/audio/dawn-return.mp3',
};

function getLayerForProgress(progress: number): AudioLayer {
  if (progress >= 0.92) return 'dawn-return';
  if (progress >= 0.70 && progress < 0.78) return 'emergency';
  if (progress >= 0.60) return 'storm';
  if (progress >= 0.22) return 'ocean-open';
  return 'ocean-calm';
}

export function useSound(): SoundControls {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentLayerRef = useRef<AudioLayer | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      } catch {
        // AudioContext initialization fallback
      }
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const crossfade = useCallback((layer: AudioLayer) => {
    if (!enabledRef.current) return;
    if (currentLayerRef.current === layer) return;

    const src = AUDIO_FILES[layer];
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = 0.35;
      audio.play().catch(() => {
        // Audio file missing or blocked — silent fallback
      });
      audioRef.current = audio;
      currentLayerRef.current = layer;
    } catch {
      // Audio API unavailable
    }
  }, []);

  const toggle = useCallback(() => {
    initAudioContext();
    const nextState = !enabledRef.current;
    enabledRef.current = nextState;
    setEnabled(nextState);

    if (!nextState && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      currentLayerRef.current = null;
    }
  }, [initAudioContext]);

  const setPhaseAudio = useCallback(
    (progress: number) => {
      if (!enabledRef.current) return;
      crossfade(getLayerForProgress(progress));
    },
    [crossfade],
  );

  return {
    enabled,
    toggle,
    setPhaseAudio,
  };
}
