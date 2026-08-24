import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function DecisionsDocPage() {
  const pagination = getDocPagination("/docs/decisions");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 16</div>
        <h1 className="docs-page-title">Architecture Decision Records (ADRs)</h1>
        <p className="docs-page-lead">
          Formal engineering justifications, evaluated alternatives, and trade-off analyses behind foundational system design choices.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="5 Core Architecture Decision Records Formally Documented"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">ADR-001: Custom Binary Framing over Protocol Buffers on LoRa</h2>
        <div className="docs-card-panel" style={{ marginBottom: "16px" }}>
          <h4>Context & Decision</h4>
          <p>LoRa bandwidth is strictly constrained (125 kHz channel, ~5.4 kbps effective data rate). Every transmitted byte directly adds 1.5 to 3.0 milliseconds of channel airtime. We evaluated nanopb / Protocol Buffers vs hand-packed custom binary framing.</p>
        </div>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Decision:</strong> Implement a fixed 10-byte hand-packed binary header + compact binary payload + CCITT CRC-16.</li>
          <li className="docs-li"><strong className="docs-strong">Rationale:</strong> Avoids serialization tag overhead, variable-length integer encoding bloat, and heap allocations on microcontrollers. Total heartbeat packet size is kept to a predictable 25 bytes.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">ADR-002: Listen-Before-Talk (LBT) MAC over Slotted Pseudo-TDMA</h2>
        <div className="docs-card-panel" style={{ marginBottom: "16px" }}>
          <h4>Context & Decision</h4>
          <p>Multi-node mesh deployments require channel contention management. We evaluated synchronized TDMA vs pure CAD vs Listen-Before-Talk (LBT) with randomized backoff.</p>
        </div>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Decision:</strong> Adopt Listen-Before-Talk (LBT) with priority-aware exponential backoff.</li>
          <li className="docs-li"><strong className="docs-strong">Rationale:</strong> Slotted TDMA requires microsecond-level synchronization across boats. Without continuous GPS lock, microcontroller oscillator drift (30–50 ppm) would require prohibitive over-the-air resynchronization traffic. LBT achieves 90–95% PDR with zero global clock dependency.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">ADR-003: Hop-by-Hop ACK over End-to-End Delivery Acknowledgements</h2>
        <div className="docs-card-panel" style={{ marginBottom: "16px" }}>
          <h4>Context & Decision</h4>
          <p>Choosing reliability scope for multi-hop packet delivery across lossy radio links.</p>
        </div>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Decision:</strong> Every relay node acknowledges the immediate previous hop upon valid packet receipt. End-to-end delivery confirmations are restricted to emergency SOS traffic.</li>
          <li className="docs-li"><strong className="docs-strong">Rationale:</strong> End-to-end ACKs across 3+ hops compound loss probability multiplicatively and lock channel resources across the entire route. Hop-by-hop ACK localizes retransmissions to the specific degraded link.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">ADR-004: Bluetooth Low Energy (BLE) over Wi-Fi Direct for Phone ↔ BoatNode</h2>
        <div className="docs-card-panel" style={{ marginBottom: "16px" }}>
          <h4>Context & Decision</h4>
          <p>Connecting the fisherman&apos;s smartphone to the vessel radio box on open water.</p>
        </div>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Decision:</strong> Implement a custom BLE GATT service rather than Wi-Fi SoftAP / Wi-Fi Direct.</li>
          <li className="docs-li"><strong className="docs-strong">Rationale:</strong> BLE draws an order of magnitude less electrical current (~15 mA burst vs &gt; 180 mA Wi-Fi), preserving vessel battery life. BLE reconnects autonomously in the background without disturbing phone networking.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">ADR-005: Synchronous Fixed-Capacity Architecture over FreeRTOS Async Threads</h2>
        <div className="docs-card-panel" style={{ marginBottom: "16px" }}>
          <h4>Context & Decision</h4>
          <p>Managing internal firmware task execution on the ESP32-S3 microcontroller.</p>
        </div>
        <ul className="docs-ul">
          <li className="docs-li"><strong className="docs-strong">Decision:</strong> Construct firmware around deterministic polling services, a synchronous 8-listener EventBus, and bounded ring-buffer queues.</li>
          <li className="docs-li"><strong className="docs-strong">Rationale:</strong> Eliminates race conditions, mutex deadlocks, and dynamic heap fragmentation. Enables 100% deterministic unit testing on host x86/ARM machines without RTOS kernel emulation.</li>
        </ul>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
