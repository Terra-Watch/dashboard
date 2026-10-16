/** The confidence ladder (D3 section 1): how sure we are about a fire claim. Only people move something up a rung. */
export type Rung = 'signal' | 'report' | 'verified' | 'responding' | 'contained' | 'closed';
export type Tone = 'unconfirmed' | 'danger' | 'warn' | 'ok' | 'neutral';

export const RUNGS: Record<Rung, { tone: Tone; icon: 'satellite' | 'message' | 'badge-check' | 'hard-hat' | 'shield-check' | 'circle-check'; labelKey: string }> = {
  signal: { tone: 'unconfirmed', icon: 'satellite', labelKey: 'rung.signal' },
  report: { tone: 'unconfirmed', icon: 'message', labelKey: 'rung.report' },
  verified: { tone: 'danger', icon: 'badge-check', labelKey: 'rung.verified' },
  responding: { tone: 'warn', icon: 'hard-hat', labelKey: 'rung.responding' },
  contained: { tone: 'ok', icon: 'shield-check', labelKey: 'rung.contained' },
  closed: { tone: 'neutral', icon: 'circle-check', labelKey: 'rung.closed' },
};

const FROM_STATUS: Record<string, Rung> = { reported: 'report', verified: 'verified', responding: 'responding', contained: 'contained', closed: 'closed' };

/** Stored incident status -> rung. Unknown values are treated as the least certain rung, never as verified. */
export function rungOfStatus(status: string | null | undefined): Rung {
  return (status && FROM_STATUS[status]) || 'report';
}

/** Plain-language age such as "38 min ago". `now` is injectable for tests. */
export function ageText(iso: string | null | undefined, now: number = Date.now()): string {
  const then = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
