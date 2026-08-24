import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsDiagram, DocsComponentTree } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const BOATNODE_TREE_NODES = [
  {
    name: "main.cpp",
    type: "file" as const,
    desc: "Composition Root: instantiates HAL adapters, constructs subsystems, wires dependency graphs, and initializes loop ticks."
  },
  {
    name: "App",
    type: "folder" as const,
    desc: "Tick Loop Coordinator and core engine execution context.",
    children: [
      { name: "IRadio", type: "sub-item" as const, desc: "Hardware interface adapter for the SX1278 LoRa physical layer transceiver." },
      { name: "PacketQueue", type: "sub-item" as const, desc: "Bounded 8-slot transmit ring buffer preventing heap allocation during loops." },
      { name: "EventBus", type: "sub-item" as const, desc: "Decoupled synchronous event dispatcher matching up to 8 listeners." }
    ]
  },
  {
    name: "Services",
    type: "folder" as const,
    desc: "Deterministic polling services triggered periodically by App ticks.",
    children: [
      { name: "HeartbeatService", type: "sub-item" as const, desc: "Schedules and structures regular status broadcasts (default every 2000 ms)." },
      { name: "HeartbeatAckManager", type: "sub-item" as const, desc: "Processes and resolves corresponding heartbeat verification packets." },
      { name: "AckManager", type: "sub-item" as const, desc: "Monitors up to 8 reliable packets; manages 1000 ms timeouts and triggers up to 3 retries." },
      { name: "NeighborManager", type: "sub-item" as const, desc: "Maintains a 16-node tracking index, calculating rolling EWMA link metrics (RSSI/SNR)." },
      { name: "ForwardingService", type: "sub-item" as const, desc: "Controls packet relay logic, currently configured with NullForwardingStrategy." }
    ]
  },
  {
    name: "BoatProtocol",
    type: "file" as const,
    desc: "Binary encoding logic: packets, parser models, factory generation, checksum validation, and CRC-16 computation."
  },
  {
    name: "HAL (Hardware Abstraction Layer)",
    type: "file" as const,
    desc: "Concrete ESP32 hardware adapters wrapping SpiBus, Clock, Delay, and SerialConsole APIs."
  }
];

export default function BoatNodeDocPage() {
  const pagination = getDocPagination("/docs/boatnode");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 04</div>
        <h1 className="docs-page-title">BoatNode Firmware</h1>
        <p className="docs-page-lead">
          Embedded firmware architecture and operational implementation for the vessel-side Jalari BoatNode running on the ESP32-S3 microcontroller.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Firmware v0.1.0 (C++17, PlatformIO) Compiled; Software Seams Verified"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Hardware Specification</h2>
        <div className="docs-grid-2">
          <div className="docs-card-panel">
            <h4>Microcontroller (MCU)</h4>
            <div className="docs-kv-list">
              <div className="docs-kv-item"><span className="docs-kv-key">Board</span><span className="docs-kv-val">ESP32-S3-DevKitM-1</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Core</span><span className="docs-kv-val">Dual-Core Xtensa LX7 @ 240 MHz</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Flash / PSRAM</span><span className="docs-kv-val">16 MB Flash / Octal PSRAM</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Operating Voltage</span><span className="docs-kv-val">3.3V Logic (5V/12V Regulated In)</span></div>
            </div>
          </div>
          <div className="docs-card-panel">
            <h4>LoRa Transceiver</h4>
            <div className="docs-kv-list">
              <div className="docs-kv-item"><span className="docs-kv-key">Transceiver</span><span className="docs-kv-val">Semtech SX1278 (or SX1262)</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Frequency</span><span className="docs-kv-val">433.0 MHz Sub-GHz</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Max Output Power</span><span className="docs-kv-val">+20 dBm (100 mW)</span></div>
              <div className="docs-kv-item"><span className="docs-kv-key">Interface</span><span className="docs-kv-val">High-Speed SPI Bus</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">SPI & GPIO Pin Configuration</h2>
        <p className="docs-p">
          BoatNode firmware compiles with the following immutable pin configuration defined in <code>include/Config.h</code>:
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>ESP32-S3 GPIO</th>
                <th>SX1278 Pin</th>
                <th>Functionality</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>SCK</code></td><td><code>GPIO 12</code></td><td>SCK</td><td>SPI Clock</td></tr>
              <tr><td><code>MISO</code></td><td><code>GPIO 13</code></td><td>MISO</td><td>SPI Master In / Slave Out</td></tr>
              <tr><td><code>MOSI</code></td><td><code>GPIO 11</code></td><td>MOSI</td><td>SPI Master Out / Slave In</td></tr>
              <tr><td><code>CS / NSS</code></td><td><code>GPIO 10</code></td><td>NSS</td><td>SPI Chip Select (Active Low)</td></tr>
              <tr><td><code>RESET</code></td><td><code>GPIO 9</code></td><td>RST</td><td>Transceiver Hardware Reset</td></tr>
              <tr><td><code>DIO0</code></td><td><code>GPIO 14</code></td><td>DIO0</td><td>Packet RX / TX Done Interrupt</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Firmware Architecture</h2>
        <p className="docs-p">
          The BoatNode firmware is constructed around strict dependency inversion, fixed-capacity memory allocations (no dynamic heap allocations in steady-state loop), and deterministic polling services:
        </p>

        <DocsDiagram title="BoatNode Component Graph" caption="Interactive tree view representing how main.cpp wires ESP32 HAL and deterministic services to the App tick coordinator.">
          <DocsComponentTree nodes={BOATNODE_TREE_NODES} />
        </DocsDiagram>

        <h3 className="docs-h3">Core Subsystems</h3>
        <ul className="docs-ul">
          <li className="docs-li">
            <strong className="docs-strong">PacketQueue:</strong> Bounded ring-buffer (8 slots) acting as the single transmit boundary. When full, incoming non-critical packets are dropped with diagnostic logging.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">AckManager:</strong> Tracks in-flight reliable transmissions, matching incoming <code>HeartbeatAck</code> and <code>DataAck</code> packets against active packet IDs. Handles timeout (1000ms) and enqueues up to 3 retries.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">NeighborManager:</strong> Maintains a 16-entry neighbor table recording observed node beacons, moving average RSSI/SNR (8 samples), and expires stale nodes after 30 seconds.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">NullForwardingStrategy:</strong> The active forwarding strategy delivers all packets locally. Mesh multi-hop routing will replace only this interface implementation in Phase 3.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Build, Flash & Monitor Instructions</h2>
        <DocsCodeBlock
          language="bash"
          filename="Terminal / PlatformIO CLI"
          code={`# Navigate to the BoatNode firmware directory
cd /Users/kireeti/Desktop/Projects/RESQ/jalari-node-firmware

# Compile firmware for ESP32-S3
pio run

# Flash to connected device via USB
pio run --target upload

# Open serial debug monitor (115200 baud)
pio device monitor`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Configuration Reference (Config.h)</h2>
        <DocsCodeBlock
          language="cpp"
          filename="include/Config.h"
          code={`struct FirmwareConfig {
    RadioConfig radio = {
        .frequency = 433000000,
        .sckPin = 12,
        .misoPin = 13,
        .mosiPin = 11,
        .csPin = 10,
        .resetPin = 9,
        .dio0Pin = 14
    };
    NodeConfig node = {
        .nodeId = 1
    };
    ProtocolConfig protocol = {
        .preamble = 0xA5,
        .version = 3,
        .maxPayloadSize = 48,
        .maxRadioPacketSize = 255
    };
    PowerConfig power = {
        .heartbeatIntervalMs = 2000
    };
    ReliabilityConfig reliability = {
        .ackTimeoutMs = 1000,
        .maxRetries = 3
    };
    NetworkConfig network = {
        .defaultTtl = 8,
        .maxHopCount = 16,
        .neighborTimeoutMs = 30000,
        .metricWindowSize = 8
    };
};`}
        />
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
