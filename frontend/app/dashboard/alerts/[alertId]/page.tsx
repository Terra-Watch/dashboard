type AlertDetailsPageProps = {
  params: Promise<{ alertId: string }>;
};

export default async function AlertDetailsPage({ params }: AlertDetailsPageProps) {
  const { alertId } = await params;

  return (
    <div className="alert-details-page">
      <header className="alerts-header">
        <p className="alert-details-back">Alerts &amp; SOS / Alert details</p>
        <h1>Alert not available</h1>
        <p>No alert record is currently available for this identifier.</p>
      </header>

      <section className="alert-details-empty" aria-label="Alert details">
        <p className="alerts-empty-title">No alert record</p>
        <p className="alerts-empty-message">Identifier: {alertId}</p>
      </section>
    </div>
  );
}

