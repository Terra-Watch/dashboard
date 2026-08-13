import { LiveMapWorkspace } from "../../../components/map/LiveMapWorkspace";

export default function LiveMapPage() {
  return (
    <div className="live-map-page">
      <header className="live-map-header">
        <h1>Live Map</h1>
        <p>Current vessel positions and maritime operational information.</p>
      </header>

      <section className="live-map-section" aria-label="Live vessel map">
        <LiveMapWorkspace />
      </section>
    </div>
  );
}

