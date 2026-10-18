/** The TerraWatch logo, drawn inline so it follows the light/dark theme. Two contour peaks around a glowing watch point. */
export function Brand({ markOnly = false, className = '' }: { dark?: boolean; markOnly?: boolean; className?: string }) {
  return (
    <svg className={`terrawatch-logo ${className}`} viewBox={markOnly ? '0 0 32 32' : '0 0 164 32'} height={32} width={markOnly ? 32 : 164} role="img" aria-label="TerraWatch" style={{ display: 'block', height: '2rem', width: 'auto' }}>
      <title>TerraWatch</title>
      <g fill="none" stroke="var(--tw-text, #1f1b16)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.8 27 14 6.6c.8-1.4 3.2-1.4 4 0L29.2 27" />
        <path d="M8.6 27l6.2-10.2c.5-.8 1.9-.8 2.4 0L23.4 27" />
      </g>
      <circle cx="16" cy="25.2" r="2.4" fill="var(--tw-ember, #c2410c)" />
      {!markOnly && (
        <text x="38" y="23.2" fontFamily="var(--font-sans, 'Noto Sans Variable', system-ui, sans-serif)" fontSize="20" letterSpacing="-0.2" fill="var(--tw-text, #1f1b16)">
          <tspan fontWeight="500">Terra</tspan>
          <tspan fontWeight="800">Watch</tspan>
        </text>
      )}
    </svg>
  );
}
