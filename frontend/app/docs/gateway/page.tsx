import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsDiagram, DocsFlowchart } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const GATEWAY_PIPELINE_NODES = [
  {
    title: "SX1278 Radio RX Interrupt",
    subtitle: "Hardware-level event when a valid preamble and CRC match occurs on the LoRa frequency.",
    tech: "Hardware IRQ Trigger",
    connectorText: "ISR Handler"
  },
  {
    title: "LoRaDriver::receive()",
    subtitle: "Reads the raw byte buffer from the transceiver's FIFO register via the SPI bus.",
    tech: "SPI Bus Transfer",
    connectorText: "Raw Frame Bytes"
  },
  {
    title: "IPacketParser::parse()",
    subtitle: "Extracts the 10-byte Protocol v3 common header fields and maps the payload segment.",
    tech: "Binary Deserializer",
    connectorText: "Structured Packet View"
  },
  {
    title: "IPacketValidator::validate()",
    subtitle: "Verifies the CCITT CRC-16 checksum, matching preamble (0xA5) and protocol version (0x03).",
    tech: "CRC-16 Poly 0x1021",
    connectorText: "Validated Frame"
  },
  {
    title: "GatewayAckHandler (Immediate RF Path)",
    subtitle: "Builds a 21-byte HeartbeatAck frame, registers it, and transmits immediately to node to prevent retry storm.",
    tech: "Immediate Radio ACK",
    connectorText: "Simultaneous to"
  },
  {
    title: "BackendIngestionClient (Async Ingest Path)",
    subtitle: "Enqueues event into the 8-slot RAM ring-buffer and posts JSON to backend /api/ingest/gateway.",
    tech: "8-Slot Ingestion Queue"
  }
];

export default function GatewayDocPage() {
  const pagination = getDocPagination("/docs/gateway");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 05</div>
        <h1 className="docs-page-title">Shore Gateway Firmware</h1>
        <p className="docs-page-lead">
          Architecture, packet processing pipeline, immediate LoRa acknowledgement, and asynchronous backend HTTP ingestion implemented in the Jalari Maritime Edge Gateway firmware.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Firmware v0.1.0 Implemented; Host Protocol Contract Test Validated"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Gateway Overview</h2>
        <p className="docs-p">
          The Jalari Shore Gateway is the bridge between the vessel LoRa radio mesh and the IP-based cloud infrastructure. Installed at coastal shore stations, lighthouses, or harbor master towers, it provides continuous 433 MHz radio coverage, immediate RF acknowledgements to vessels, and forwards structured telemetry events to the FastAPI backend over Wi-Fi or cellular backhaul.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Gateway Receive Pipeline</h2>
        <DocsDiagram title="Gateway Packet Ingestion & Processing Pipeline" caption="Interactive flowchart showing immediate ACK generation on the RF interface and async HTTP ingestion queueing.">
          <DocsFlowchart nodes={GATEWAY_PIPELINE_NODES} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Immediate ACK vs Asynchronous Ingestion</h2>
        <div className="docs-callout docs-callout-success">
          <div className="docs-callout-title">Architectural Guarantee</div>
          <div className="docs-callout-body">
            The Gateway never blocks the LoRa radio pipeline waiting for an HTTP response from the backend. The RF ACK is computed and transmitted within milliseconds. If shore Wi-Fi is temporarily disconnected, packets are queued in the Gateway&apos;s 8-slot memory buffer and retried at 250ms intervals.
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Backend Ingestion Client Specifications</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Behavior on Failure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Queue Capacity</strong></td>
                <td>8 events (RAM ring-buffer)</td>
                <td>Oldest uncommitted non-critical event dropped with log</td>
              </tr>
              <tr>
                <td><strong>HTTP Timeout</strong></td>
                <td>1500 ms</td>
                <td>Triggers retry if connection hangs</td>
              </tr>
              <tr>
                <td><strong>Max Attempts</strong></td>
                <td>2 attempts per event</td>
                <td>Logged as error; never falsely reported as delivered</td>
              </tr>
              <tr>
                <td><strong>Retry Delay</strong></td>
                <td>250 ms</td>
                <td>Exponential backoff applied during continuous failure</td>
              </tr>
              <tr>
                <td><strong>Wi-Fi Reconnect</strong></td>
                <td>10-second polling interval</td>
                <td>Gateway continues receiving LoRa packets while offline</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Configuration Reference (BuildConfig.h)</h2>
        <p className="docs-p">
          All deployment-specific credentials and network settings are configured in <code>include/BuildConfig.h</code>:
        </p>
        <DocsCodeBlock
          language="cpp"
          filename="include/BuildConfig.h"
          code={`#pragma once

namespace Jalri::Gateway {

struct BuildConfig {
    // Wi-Fi Access Point Credentials
    const char* wifiSsid = "SHORE_STATION_SSID";
    const char* wifiPassword = "STATION_WPA_KEY";

    // Backend Ingestion Endpoint Base URL
    const char* baseUrl = "http://192.168.1.100:8000";

    // Gateway Network Identity
    uint8_t gatewayId = 0xFE;

    // Firmware Release String
    const char* firmwareVersion = "0.1.0";

    // Local Test Simulation Flag
    bool simulationMode = false;
};

}`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Build, Upload & Monitor Commands</h2>
        <DocsCodeBlock
          language="bash"
          filename="Terminal / PlatformIO CLI"
          code={`# Navigate to Gateway firmware directory
cd /Users/kireeti/Desktop/Projects/RESQ/jalri-gateway-firmware

# Compile for ESP32-S3 (macOS default environment)
pio run

# Compile for Windows environment
pio run -e windows

# Upload firmware to connected gateway board
pio run --target upload

# Run the host-compilable cross-repository protocol contract test
cd test
./run_protocol_contract.sh`}
        />
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
