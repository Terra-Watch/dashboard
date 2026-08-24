import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function ResearchDocPage() {
  const pagination = getDocPagination("/docs/research");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 14</div>
        <h1 className="docs-page-title">Research & Publication Strategy</h1>
        <p className="docs-page-lead">
          Academic research formulation, literature differentiation, novelty analysis, experimental methodology, and publication roadmap for the Jalari maritime communication system.
        </p>
        <DocsStatusBadge
          status="IN PROGRESS"
          detail="Evaluation Framework Formulated; Empirical Maritime Campaign Planned"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Research Problem Statement</h2>
        <p className="docs-p">
          Small-craft artisanal fishing fleets operating in near-shore and coastal waters (5–25 km offshore) face complete radio and cellular disconnection. While terrestrial LoRa mesh systems (such as Meshtastic and land-based ad-hoc networks) are well-explored, <strong className="docs-strong">maritime multi-hop communication introduces distinct physical and protocol challenges</strong>:
        </p>
        <ul className="docs-ul">
          <li className="docs-li">Highly dynamic, sparse node topologies where boat mobility frequently disrupts established multi-hop routes.</li>
          <li className="docs-li">Severe tidal fading, sea-surface multi-path reflections, and rolling antenna polarization mismatches over open water.</li>
          <li className="docs-li">Safety-critical traffic asymmetry where emergency SOS beacons must preempt routine telemetry under heavy channel contention.</li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Related Work & Literature Comparison</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>System / Literature</th>
                <th>Hardware / Stack</th>
                <th>Key Mechanism</th>
                <th>Jalari Differentiation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Arregui Almeida et al. (Sensors 2025)</strong></td>
                <td>ESP32-S3 + SX1262</td>
                <td>Hop-by-hop ACK, 500ms LBT, 32-bit dedup, 6-hop TTL</td>
                <td>Jalari adapts this baseline specifically for maritime safety with prioritized SOS backoff and full Android-to-Cloud integration</td>
              </tr>
              <tr>
                <td><strong>Meshtastic</strong></td>
                <td>Various ESP32 / nRF52</td>
                <td>Managed flooding, LoRa broadcast mesh</td>
                <td>Jalari utilizes deterministic hop-by-hop ACK, strict binary framing, and offline Indic voice-to-text workflows</td>
              </tr>
              <tr>
                <td><strong>Delay-Tolerant Networking (uD3TN / IBR)</strong></td>
                <td>Linux / Constrained RTOS</td>
                <td>Full Bundle Protocol (RFC 5050/9171), custody transfer</td>
                <td>Jalari strips heavy Bundle Protocol overhead in favor of a lightweight 10-byte header with embedded TTL/hop limits</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Experimental Methodology & Metrics</h2>
        <p className="docs-p">
          To evaluate the Jalari protocol rigorously for academic publication, the following experimental campaign is designed:
        </p>
        <div className="docs-grid-3">
          <div className="docs-card-panel">
            <h4>Packet Delivery Ratio (PDR)</h4>
            <p>Percentage of successfully delivered heartbeats and SOS packets across 1, 2, and 3-hop topologies under simulated and real channel loss.</p>
          </div>
          <div className="docs-card-panel">
            <h4>SOS Delivery Latency</h4>
            <p>End-to-end time elapsed from emergency button press on the Android app to database commit on the FastAPI backend.</p>
          </div>
          <div className="docs-card-panel">
            <h4>Ablation Comparison</h4>
            <p>Measuring performance of Priority-LBT vs standard LBT vs naive flooding under congested multi-vessel traffic.</p>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Academic Publication Roadmap</h2>
        <div className="docs-callout docs-callout-info">
          <div className="docs-callout-title">Honest Publication Readiness</div>
          <div className="docs-callout-body">
            The project possesses working single-hop software contracts and a cohesive full-stack architecture. To be accepted at premier ACM/IEEE maritime or mobile computing venues, the next milestone requires:
            <ol className="docs-ol" style={{ margin: "8px 0 0 0", paddingLeft: "18px" }}>
              <li className="docs-li">Executing multi-node physical trials across coastal waterways.</li>
              <li className="docs-li">Reporting repeated experimental trials with statistically robust variance and confidence intervals.</li>
              <li className="docs-li">Benchmarking Jalari directly against a plain flooding baseline.</li>
            </ol>
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
