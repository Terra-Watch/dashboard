import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function TestingDocPage() {
  const pagination = getDocPagination("/docs/testing");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 12</div>
        <h1 className="docs-page-title">Testing & Validation</h1>
        <p className="docs-page-lead">
          Honest reporting of verified test suites, host-compilable protocol contract validations, backend test coverage, and planned maritime field trials.
        </p>
        <DocsStatusBadge
          status="VALIDATED"
          detail="Software & Host Protocol Contracts Passing; Physical RF Field Tests Pending"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Testing Status Matrix</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Test Domain</th>
                <th>Target Component</th>
                <th>Test Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Cross-Firmware Protocol Contract</strong></td>
                <td>BoatNode ↔ Gateway Serialization</td>
                <td>Host C++17 Contract Test (<code>protocol_contract_test.cpp</code>)</td>
                <td><span className="docs-badge docs-badge-validated">VALIDATED</span></td>
              </tr>
              <tr>
                <td><strong>Backend Ingestion Deduplication</strong></td>
                <td>FastAPI <code>/api/ingest/gateway</code></td>
                <td>Pytest Automated Integration Tests</td>
                <td><span className="docs-badge docs-badge-validated">VALIDATED</span></td>
              </tr>
              <tr>
                <td><strong>REST API Endpoint Suite</strong></td>
                <td>FastAPI Routers & Repositories</td>
                <td>Pytest Unit & SQLite DB Test Suite</td>
                <td><span className="docs-badge docs-badge-validated">VALIDATED</span></td>
              </tr>
              <tr>
                <td><strong>Single-Hop RF Communication</strong></td>
                <td>ESP32-S3 + SX1278 Hardware</td>
                <td>Physical RF Bench & Line-of-Sight Test</td>
                <td><span className="docs-badge docs-badge-pending">PENDING TRIALS</span></td>
              </tr>
              <tr>
                <td><strong>Multi-Hop Mesh Forwarding</strong></td>
                <td>BoatNode Relay Mesh</td>
                <td>Multi-Node Relay Bench Test</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED (Phase 3)</span></td>
              </tr>
              <tr>
                <td><strong>Maritime Stress & Packet Loss</strong></td>
                <td>Coastal Fleet at Sea</td>
                <td>RF Channel Fading, Node Dropout, Range Limits</td>
                <td><span className="docs-badge docs-badge-not-implemented">FUTURE</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">1. Protocol Contract Test (Host Verification)</h2>
        <p className="docs-p">
          To ensure guaranteed interoperability between the BoatNode and Shore Gateway firmware without needing physical hardware, a host-compilable C++ test runner exists in <code>jalri-gateway-firmware/test/</code>.
        </p>
        <p className="docs-p">
          This test directly compiles the real BoatNode packet serializer, Gateway packet parser, CRC validator, and Gateway ACK builder against a stubbed Arduino header:
        </p>
        <DocsCodeBlock
          language="bash"
          filename="Running Protocol Contract Test"
          code={`# Execute the contract test runner
cd /Users/kireeti/Desktop/Projects/RESQ/jalri-gateway-firmware/test
./run_protocol_contract.sh

# Expected output:
# [PASS] BoatNode heartbeat serialization matches 25-byte frame
# [PASS] Gateway parser correctly extracts nodeId=1, packetId=100
# [PASS] Gateway validator accepts valid CRC-16/CCITT
# [PASS] Gateway validator rejects corrupted CRC frame
# [PASS] Gateway builds 21-byte HeartbeatAck matching packetId
# [PASS] BoatNode AckManager validates Gateway ACK frame`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">2. Backend Test Suite (Pytest)</h2>
        <p className="docs-p">
          The backend maintains test coverage across all REST routes, schemas, database models, and deduplication logic:
        </p>
        <DocsCodeBlock
          language="bash"
          filename="Running Backend Test Suite"
          code={`cd /Users/kireeti/Desktop/Projects/RESQ/website/backend

# Activate virtual environment
source .venv/bin/activate

# Execute pytest suite
pytest tests/ -v`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">RF & Hardware Validation Boundaries</h2>
        <div className="docs-callout docs-callout-warning">
          <div className="docs-callout-title">Validation Scope</div>
          <div className="docs-callout-body">
            While firmware builds and host protocol compatibility have been mathematically and logically verified, <strong>over-the-air physical RF communication across open water has not yet been field-validated</strong>. Field trials are staged for the upcoming phase with calibrated GPS trackers and antenna mast mounts.
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
