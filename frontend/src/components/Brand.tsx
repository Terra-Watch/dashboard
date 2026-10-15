export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`brand${dark ? ' brand-dark' : ''}`} aria-label="TerraWatch">
      <span className="brand-mark brand-mark-terra" aria-hidden="true">TW</span>
      <span className="brand-wordmark">TerraWatch</span>
    </div>
  );
}
