import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsDiagram, DocsFlowchart } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const ANDROID_STEPS = [
  {
    title: "Fisherman Action (SOS Trigger / Voice Input)",
    subtitle: "User interacts with compose UI to trigger safety alerts or input message telemetry.",
    tech: "Jetpack Compose UI",
    connectorText: "ViewModel Action"
  },
  {
    title: "ViewModel & Repository Layer",
    subtitle: "Converts user interface input into structured domain repository contracts.",
    tech: "Kotlin StateFlow",
    connectorText: "Room Write"
  },
  {
    title: "Room Database (SQLite Outbox Table)",
    subtitle: "Durably commits status entries to outbox_messages: CREATED -> QUEUED_BLE -> ACKED_NODE -> SYNCED.",
    tech: "Room SQLite Outbox",
    connectorText: "WorkManager Schedule"
  },
  {
    title: "Android WorkManager Outbox Worker",
    subtitle: "Handles background BLE polling, tracking local vessel unit characteristics.",
    tech: "Android WorkManager",
    connectorText: "BLE GATT Transfer"
  },
  {
    title: "BoatNode Vessel Radio Link",
    subtitle: "Receives synced buffers via Bluetooth GATT characteristics and transmits over LoRa.",
    tech: "SX1278 Physical Transmit"
  }
];

export default function AndroidDocPage() {
  const pagination = getDocPagination("/docs/android");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 06</div>
        <h1 className="docs-page-title">Android Application</h1>
        <p className="docs-page-lead">
          Architecture specification and operational design for the offline-first Jalari vessel companion mobile application.
        </p>
        <DocsStatusBadge
          status="IN PROGRESS"
          detail="Architecture & Data Contracts Formulated; Full Implementation in Development"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Application Overview</h2>
        <p className="docs-p">
          The Android application acts as the human interface for fishermen at sea. Designed for zero-internet environments, the phone connects locally to the vessel&apos;s BoatNode over Bluetooth Low Energy (BLE) to trigger emergency SOS distress alerts, view offline bathymetric and navigational charts, send compressed text/voice messages, and monitor vessel connection health.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Offline-First MVVM + Room Outbox Architecture</h2>
        <p className="docs-p">
          On-device state is strictly persistent-first. When a fisherman presses SOS or sends a message, it is instantly written to the local SQLite database via <strong className="docs-strong">Android Room</strong> before any attempt is made over BLE:
        </p>
        <DocsDiagram title="Android Local State & Sync Architecture" caption="Interactive sync architecture flowchart from fisherman UI events to BLE GATT serialization.">
          <DocsFlowchart nodes={ANDROID_STEPS} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Component Breakdown & Status</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Feature Module</th>
                <th>Technology / Approach</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Local Storage & Outbox</strong></td>
                <td>Android Jetpack Room (SQLite) with transactional outbox queue</td>
                <td><span className="docs-badge docs-badge-in-progress">IN PROGRESS</span></td>
              </tr>
              <tr>
                <td><strong>BLE GATT Link</strong></td>
                <td>Android BLE Central managing auto-reconnect and packet fragmentation</td>
                <td><span className="docs-badge docs-badge-in-progress">IN PROGRESS</span></td>
              </tr>
              <tr>
                <td><strong>One-Touch SOS</strong></td>
                <td>Hardware volume long-press / large UI button emitting high-priority SOS</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>Offline Maps</strong></td>
                <td>MapLibre Native caching vector coastal charts & hazard zones</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>Multilingual Speech-to-Text</strong></td>
                <td>On-device quantized acoustic model for Indic coastal dialects</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Why BLE Over Wi-Fi Direct?</h2>
        <p className="docs-p">
          Jalari selected BLE as the primary phone-to-BoatNode local link after rigorous trade-off analysis:
        </p>
        <div className="docs-grid-2">
          <div className="docs-card-panel">
            <h4>Ultra-Low Power Budget</h4>
            <p>BLE draws less than 15 mA during active bursts and microamps in idle, allowing the BoatNode to operate autonomously on small solar panels without depleting boat batteries.</p>
          </div>
          <div className="docs-card-panel">
            <h4>Zero Pairing Friction</h4>
            <p>Unlike Wi-Fi SoftAP, BLE does not sever the phone&apos;s cellular/Wi-Fi background services or require the fisherman to navigate complex OS Wi-Fi settings when boarding.</p>
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
