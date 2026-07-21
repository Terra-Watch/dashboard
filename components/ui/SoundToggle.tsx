'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/hooks/useSound';

/**
 * PURPOSE: Sound gives the visitor an optional emotional layer —
 * hearing the storm, the SOS alarm, and the quiet dawn return.
 * It must never autoplay. This toggle appears quietly after
 * the visitor has shown intent by scrolling.
 */
export function SoundToggle() {
  const [visible, setVisible] = useState(false);
  const [isOn, setIsOn] = useState(false);
  const sound = useSound();

  // Appear after 3 seconds of page load, not on scroll start
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleToggle = () => {
    sound.toggle();
    setIsOn(!isOn);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          onClick={handleToggle}
          aria-label={isOn ? 'Mute ambient sound' : 'Enable ambient sound'}
          title={isOn ? 'Mute' : 'Enable ambient sound'}
          className="
            fixed bottom-6 right-6 z-50
            w-10 h-10 rounded-full
            glass border border-[var(--c-cyan-border)]
            flex items-center justify-center
            text-[var(--c-dim)] hover:text-[var(--c-cyan)]
            transition-colors duration-200
            focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-[var(--c-cyan)]
          "
        >
          {isOn ? (
            <Volume2 size={15} />
          ) : (
            <VolumeX size={15} />
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
