/** Tailwind scoped to the redesign-v2 surfaces only; legacy CSS (styles.css/ui.css) is untouched. */
export default {
  content: ['./src/redesign/**/*.{ts,tsx}', './index.html'],
  darkMode: ['selector', '[data-rq-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canopy: { DEFAULT: 'var(--rq-canopy)', deep: 'var(--rq-canopy-deep)' },
        ink: { DEFAULT: 'var(--rq-ink)', muted: 'var(--rq-ink-muted)' },
        paper: 'var(--rq-paper)',
        sheet: 'var(--rq-sheet)',
        contour: 'var(--rq-contour)',
        info: 'var(--rq-info)',
        warn: 'var(--rq-warn)',
        danger: 'var(--rq-danger)',
        risk: {
          low: 'var(--rq-risk-low)',
          moderate: 'var(--rq-risk-moderate)',
          high: 'var(--rq-risk-high)',
          veryhigh: 'var(--rq-risk-veryhigh)',
        },
        prob: {
          1: 'var(--rq-prob-1)',
          2: 'var(--rq-prob-2)',
          3: 'var(--rq-prob-3)',
          4: 'var(--rq-prob-4)',
        },
      },
      fontFamily: {
        serif: ['"Noto Serif"', 'Georgia', 'serif'],
        sans: ['"Noto Sans"', 'Arial', 'sans-serif'],
      },
      borderRadius: { rq: '8px' },
    },
  },
  plugins: [],
};
