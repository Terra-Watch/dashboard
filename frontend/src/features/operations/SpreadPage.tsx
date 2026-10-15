export function SpreadPage() {
  return <section className="shell-page">
    <span className="eyebrow">Saved historical example</span>
    <h1>Explore possible fire spread</h1>
    <p className="muted">
      This saved example illustrates one possible spread from a fixed starting
      point. It is not an observed fire, current forecast, or operational
      guidance. Creating a new example is unavailable because runs do not yet
      have separate, protected storage.
    </p>
    <a className="primary-link" href="/demo">View the saved historical example</a>
  </section>;
}
