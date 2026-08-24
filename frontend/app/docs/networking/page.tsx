import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsDiagram, DocsByteGrid } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const PROTOCOL_FIELDS = [
  { offset: "Byte 0", name: "Preamble", size: "1 Byte (uint8)", value: "0xA5", description: "Frame boundary synchronization constant: 0xA5" },
  { offset: "Byte 1", name: "Protocol Version", size: "1 Byte (uint8)", value: "0x03", description: "Protocol version identifier: 0x03" },
  { offset: "Byte 2", name: "Packet Type", size: "1 Byte (uint8)", value: "1, 2, 3, or 4", description: "Enumeration: 1=DATA, 2=HEARTBEAT, 3=DATA_ACK, 4=HEARTBEAT_ACK" },
  { offset: "Byte 3", name: "Source ID", size: "1 Byte (uint8)", value: "Node ID (1..254)", description: "Originating vessel node ID or gateway (0xFE)" },
  { offset: "Byte 4", name: "Destination ID", size: "1 Byte (uint8)", value: "0xFF (Broadcast)", description: "Target node ID, or 0xFF for network broadcast" },
  { offset: "Bytes 5-6", name: "Sequence", size: "2 Bytes (uint16_le)", value: "Incrementing", description: "Unique incrementing sequence number for tracking" },
  { offset: "Byte 7", name: "TTL", size: "1 Byte (uint8)", value: "8 (default)", description: "Time-to-Live hop countdown, decremented at each relay" },
  { offset: "Byte 8", name: "Hop Count", size: "1 Byte (uint8)", value: "0 (default)", description: "Hops traversed so far, incremented at each relay" },
  { offset: "Byte 9", name: "Payload Length", size: "1 Byte (uint8)", value: "0..48", description: "Number of payload bytes following the header" },
  { offset: "Bytes 10+", name: "Payload", size: "Variable (0..48 Bytes)", value: "Custom", description: "The core packet payload, e.g. status fields or distress messages" },
  { offset: "Last 2 Bytes", name: "CRC-16 / CCITT", size: "2 Bytes (uint16_le)", value: "Poly 0x1021", description: "CCITT CRC checksum over all header and payload bytes for frame validation" }
];

export default function NetworkingDocPage() {
  const pagination = getDocPagination("/docs/networking");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 03</div>
        <h1 className="docs-page-title">Networking & LoRa Protocol</h1>
        <p className="docs-page-lead">
          Detailed technical specification of the Jalari custom binary protocol (v3), radio physical layer configuration, frame serialization, reliability policies, and routing mechanics.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Protocol v3 Serializer & Single-Hop Reliability Implemented in Firmware"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Physical Layer (PHY) Radio Parameters</h2>
        <p className="docs-p">
          Both BoatNode and Shore Gateway compile with identical Semtech SX1278 (and pin-compatible SX1262) transceiver modulation settings in the 433 MHz ISM sub-band:
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Configured Value</th>
                <th>Technical Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Carrier Frequency</strong></td>
                <td><code>433.0 MHz</code></td>
                <td>Optimal maritime surface propagation and Fresnel zone clearance over coastal waters</td>
              </tr>
              <tr>
                <td><strong>Spreading Factor (SF)</strong></td>
                <td><code>SF7</code> (Configurable SF7–SF10)</td>
                <td>Balanced tradeoff between airtime duration (~60–85 ms per packet) and link margin</td>
              </tr>
              <tr>
                <td><strong>Bandwidth (BW)</strong></td>
                <td><code>125.0 kHz</code></td>
                <td>Standard sub-GHz LoRa channel width conforming to regional spectral masks</td>
              </tr>
              <tr>
                <td><strong>Coding Rate (CR)</strong></td>
                <td><code>4/5</code></td>
                <td>Forward Error Correction overhead adding 1 parity bit per 4 data bits</td>
              </tr>
              <tr>
                <td><strong>Sync Word</strong></td>
                <td><code>0x12</code></td>
                <td>Private network sync word isolating Jalari traffic from public LoRaWAN networks</td>
              </tr>
              <tr>
                <td><strong>Hardware CRC</strong></td>
                <td><code>Enabled</code></td>
                <td>SX1278 hardware-level payload integrity validation before MCU interrupt</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Protocol v3 Frame Structure</h2>
        <p className="docs-p">
          All over-the-air communication utilizes the Jalari Protocol v3 serialized binary format. It features a fixed 10-byte network header, variable-length payload (up to 48 bytes), and a 16-bit CCITT CRC checksum.
        </p>
        
        <DocsDiagram title="Protocol v3 Binary Frame Layout" caption="Interactive byte viewer representing the 10-byte network header, variable payload, and CRC block.">
          <DocsByteGrid fields={PROTOCOL_FIELDS} />
        </DocsDiagram>

        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Offset</th>
                <th>Field</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Byte 0</td>
                <td><code>preamble</code></td>
                <td><code>uint8</code></td>
                <td>Frame boundary synchronization constant: <code>0xA5</code></td>
              </tr>
              <tr>
                <td>Byte 1</td>
                <td><code>protocolVersion</code></td>
                <td><code>uint8</code></td>
                <td>Protocol version identifier: <code>0x03</code></td>
              </tr>
              <tr>
                <td>Byte 2</td>
                <td><code>packetType</code></td>
                <td><code>uint8</code></td>
                <td>Enumeration: <code>1=DATA</code>, <code>2=HEARTBEAT</code>, <code>3=DATA_ACK</code>, <code>4=HEARTBEAT_ACK</code></td>
              </tr>
              <tr>
                <td>Byte 3</td>
                <td><code>sourceId</code></td>
                <td><code>uint8</code></td>
                <td>Originating vessel node ID (e.g., <code>1</code>) or gateway (<code>0xFE</code>)</td>
              </tr>
              <tr>
                <td>Byte 4</td>
                <td><code>destinationId</code></td>
                <td><code>uint8</code></td>
                <td>Target node ID, or <code>0xFF</code> for network broadcast</td>
              </tr>
              <tr>
                <td>Bytes 5–6</td>
                <td><code>sequence</code></td>
                <td><code>uint16_le</code></td>
                <td>Incrementing transmission sequence counter</td>
              </tr>
              <tr>
                <td>Byte 7</td>
                <td><code>ttl</code></td>
                <td><code>uint8</code></td>
                <td>Time-to-Live hop countdown (default: <code>8</code>, decremented per hop)</td>
              </tr>
              <tr>
                <td>Byte 8</td>
                <td><code>hopCount</code></td>
                <td><code>uint8</code></td>
                <td>Accumulated forwarding hop counter (initialized to <code>0</code>)</td>
              </tr>
              <tr>
                <td>Byte 9</td>
                <td><code>payloadLength</code></td>
                <td><code>uint8</code></td>
                <td>Byte length of trailing payload (0 to 48 bytes)</td>
              </tr>
              <tr>
                <td>Bytes 10..N</td>
                <td><code>payload</code></td>
                <td><code>bytes</code></td>
                <td>Type-specific packet body</td>
              </tr>
              <tr>
                <td>Last 2 Bytes</td>
                <td><code>crc</code></td>
                <td><code>uint16_le</code></td>
                <td>CRC-16/CCITT computed over bytes 0 to N (excluding CRC itself)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Packet Types & Payload Formats</h2>
        
        <h3 className="docs-h3">1. Heartbeat Packet (Type 2)</h3>
        <p className="docs-p">
          Transmitted periodically by BoatNodes to announce liveness, battery state, and firmware status. Total frame length is exactly <strong>25 bytes</strong> (10-byte header + 13-byte payload + 2-byte CRC).
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Payload Offset</th>
                <th>Field</th>
                <th>Type</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Bytes 0–3</td>
                <td><code>packetId</code></td>
                <td><code>uint32_le</code></td>
                <td>Unique monotonically incrementing 32-bit heartbeat ID</td>
              </tr>
              <tr>
                <td>Bytes 4–7</td>
                <td><code>uptime</code></td>
                <td><code>uint32_le</code></td>
                <td>Node uptime in milliseconds since boot</td>
              </tr>
              <tr>
                <td>Byte 8</td>
                <td><code>firmwareMajor</code></td>
                <td><code>uint8</code></td>
                <td>Major firmware release version (e.g., <code>0</code>)</td>
              </tr>
              <tr>
                <td>Byte 9</td>
                <td><code>firmwareMinor</code></td>
                <td><code>uint8</code></td>
                <td>Minor firmware release version (e.g., <code>1</code>)</td>
              </tr>
              <tr>
                <td>Byte 10</td>
                <td><code>firmwarePatch</code></td>
                <td><code>uint8</code></td>
                <td>Patch firmware release version (e.g., <code>0</code>)</td>
              </tr>
              <tr>
                <td>Byte 11</td>
                <td><code>batteryPercentage</code></td>
                <td><code>uint8</code></td>
                <td>Battery state of charge (0–100%)</td>
              </tr>
              <tr>
                <td>Byte 12</td>
                <td><code>status</code></td>
                <td><code>uint8</code></td>
                <td>Node operational flag (<code>0=OK</code>, <code>1=WARNING</code>, <code>2=CRITICAL</code>)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="docs-h3">2. Heartbeat Acknowledgement (Type 4)</h3>
        <p className="docs-p">
          Transmitted immediately by the Gateway (ID <code>0xFE</code>) back to the originating BoatNode. Total frame length is exactly <strong>21 bytes</strong> (10 header + 9 payload + 2 CRC).
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Payload Offset</th>
                <th>Field</th>
                <th>Type</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Bytes 0–3</td>
                <td><code>ackPacketId</code></td>
                <td><code>uint32_le</code></td>
                <td>Echoes the acknowledged 32-bit heartbeat <code>packetId</code></td>
              </tr>
              <tr>
                <td>Byte 4</td>
                <td><code>targetNodeId</code></td>
                <td><code>uint8</code></td>
                <td>Destination vessel node ID being acknowledged</td>
              </tr>
              <tr>
                <td>Bytes 5–8</td>
                <td><code>gatewayTimestampMs</code></td>
                <td><code>uint32_le</code></td>
                <td>Gateway uptime in milliseconds upon packet receipt</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Reliability Mechanics: ACK, Retry & Dedup</h2>
        <p className="docs-p">
          Jalari implements strict hop-by-hop reliability via the firmware&apos;s <code>AckManager</code>:
        </p>
        <ul className="docs-ul">
          <li className="docs-li">
            <strong className="docs-strong">ACK Matching Rules:</strong> A BoatNode marks a pending transmission as confirmed only when:
            <ol className="docs-ol" style={{ marginTop: "6px" }}>
              <li>Packet Type is <code>HeartbeatAck</code> (or <code>DataAck</code>)</li>
              <li>Source is Gateway (<code>0xFE</code>) and Destination matches local Node ID</li>
              <li>Embedded <code>targetNodeId</code> matches local Node ID</li>
              <li>Embedded <code>packetId</code> strictly matches the in-flight packet ID</li>
            </ol>
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Retry & Timeout Policy:</strong> If no matching ACK is received within <code>1000 ms</code>, the packet is re-enqueued up to a maximum of <code>3 retries</code>. Retransmissions preserve the exact same packet ID and sequence number.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Deduplication on Gateway:</strong> If the Gateway receives duplicate frames (due to an ACK dropped over the air), it recognizes the duplicate by <code>(sourceId, packetId)</code>, transmits another ACK, but does not duplicate event processing to the backend.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">MAC Strategy: Listen-Before-Talk (LBT)</h2>
        <p className="docs-p">
          Jalari adopts <strong className="docs-strong">Listen-Before-Talk (LBT) with randomized backoff</strong> rather than slotted Pseudo-TDMA or pure CAD (Channel Activity Detection):
        </p>
        <div className="docs-grid-2">
          <div className="docs-card-panel">
            <h4>Why Not Slotted TDMA?</h4>
            <p>TDMA requires microsecond-level synchronization across mobile boats without guaranteed GPS. Typical crystal oscillator drift (30–50 ppm) would require excessive over-the-air resynchronization traffic, saturating the low duty-cycle band.</p>
          </div>
          <div className="docs-card-panel">
            <h4>Why LBT with Randomized Backoff?</h4>
            <p>Before transmitting, the radio checks for preamble/channel activity for 300–500 ms. If busy, it executes a jittered exponential backoff. Emergency SOS traffic uses a contracted backoff window to gain statistical priority.</p>
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
