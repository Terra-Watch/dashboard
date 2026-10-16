export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`brand${dark ? ' brand-dark' : ''}`} aria-label="TerraWatch">
      <img className="terrawatch-logo" src={dark ? '/terrawatch-logo.svg' : '/terrawatch-logo-on-dark.svg'} alt="TerraWatch" />
    </div>
  );
}
