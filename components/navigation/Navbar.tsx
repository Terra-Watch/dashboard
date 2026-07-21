'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Anchor } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Floating glass navbar.
 * Transparent at top → glass on scroll.
 * Minimal links — mission narrative takes priority over navigation.
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
      className={`
        fixed top-0 left-0 right-0 z-50
        transition-all duration-500
        ${scrolled
          ? 'glass border-b border-[var(--c-cyan-border)] shadow-[0_4px_32px_rgba(0,0,0,0.3)]'
          : 'bg-transparent border-b border-transparent'
        }
      `}
      role="banner"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-cyan)] rounded-lg"
          aria-label="Jalri — Home"
        >
          <div className="w-7 h-7 rounded-lg bg-[var(--c-cyan)] flex items-center justify-center shadow-[0_0_12px_rgba(0,200,220,0.4)]">
            <Anchor size={14} className="text-[var(--c-navy)]" strokeWidth={2.5} />
          </div>
          <span
            className="font-display font-bold text-lg tracking-tight text-[var(--c-white)] group-hover:text-[var(--c-cyan)] transition-colors duration-200"
          >
            JALRI
          </span>
        </a>

        {/* Nav links — desktop only */}
        <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-8">
          {[
            { label: 'Platform', href: '#platform' },
            { label: 'Safety',   href: '#safety' },
            { label: 'Mission',  href: '#mission' },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="
                font-body text-sm text-[var(--c-dim)] hover:text-[var(--c-white)]
                transition-colors duration-200
                focus-visible:outline-none focus-visible:underline
              "
            >
              {label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Explore the Jalri platform"
        >
          Explore Jalri
        </Button>
      </div>
    </motion.header>
  );
}
