type BoatDetailsPageProps = {
  params: Promise<{ boatId: string }>;
};

export default async function BoatDetailsPage({ params }: BoatDetailsPageProps) {
  const { boatId } = await params;

  return (
    <div className="boat-details-page">
      <header className="boats-header">
        <p className="boat-details-back">Boats / Vessel details</p>
        <h1>Vessel not available</h1>
        <p>No vessel record is currently available for this identifier.</p>
      </header>

      <section className="boat-details-empty" aria-label="Vessel details">
        <p className="boats-empty-title">No vessel record</p>
        <p className="boats-empty-message">Identifier: {boatId}</p>
      </section>
    </div>
  );
}

