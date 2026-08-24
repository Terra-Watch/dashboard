import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsDiagram, DocsFlowchart } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const AI_STEPS = [
  {
    title: "6-Axis IMU Sensor Stream",
    subtitle: "Continuously captures accelerometer (X/Y/Z) and gyroscope (X/Y/Z) signals at 50 Hz.",
    tech: "Acc & Gyro @ 50 Hz",
    connectorText: "Continuous Sampling"
  },
  {
    title: "Sliding Window Buffer",
    subtitle: "Buffers 2.0-second segments with 50% overlap (100 samples per window window).",
    tech: "Windowing Buffer",
    connectorText: "Segment Array"
  },
  {
    title: "Feature Extraction & Normalization",
    subtitle: "Calculates Signal Vector Magnitude (SVM), spectral energy, and peak free-fall impact thresholds.",
    tech: "Mathematical Normalizer",
    connectorText: "Clean Feature Vector"
  },
  {
    title: "Quantized Classifier",
    subtitle: "Evaluates the feature vector on-device using a 1D-CNN or SVM model optimized via TensorFlow Lite Micro.",
    tech: "TFLite Micro INT8 Model",
    connectorText: "Class Confidence"
  },
  {
    title: "Safety Event Trigger",
    subtitle: "Dispatches distress frames to the BoatNode (e.g. MOB distress trigger) if safety limits are exceeded.",
    tech: "BLE Broadcast Action"
  }
];

export default function AiDocPage() {
  const pagination = getDocPagination("/docs/ai");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 07</div>
        <h1 className="docs-page-title">AI & TinyML (WristNode)</h1>
        <p className="docs-page-lead">
          Research specifications for edge AI safety telemetry, WristNode IMU fall/distress detection, and embedded inference pipelines.
        </p>
        <DocsStatusBadge
          status="IN PROGRESS"
          detail="jalari-ai Scaffolding Created; TinyML Pipeline in Research Stage; Edge Deployment Pending"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">WristNode Safety Concept</h2>
        <p className="docs-p">
          The WristNode is a planned low-power wearable device designed to be worn on the fisherman&apos;s wrist. Outfitted with a 6-axis Inertial Measurement Unit (IMU), its purpose is to autonomously detect life-threatening incidents — such as a Man-Overboard (MOB) event, severe wave impact, sudden fall, or prolonged unconscious immobility — and transmit an immediate distress beacon to the vessel BoatNode over short-range BLE/RF.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Sensor Data & TinyML Processing Pipeline</h2>
        <DocsDiagram title="End-to-End Edge ML Feature Pipeline" caption="Interactive windowing and inference pipeline for edge life-safety incident detection.">
          <DocsFlowchart nodes={AI_STEPS} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Candidate Model Architectures</h2>
        <div className="docs-grid-2">
          <div className="docs-card-panel">
            <h4>Support Vector Machine (SVM)</h4>
            <p>Classical statistical classifier running on hand-engineered time/frequency domain features. Features ultra-low RAM footprint (&lt; 2 KB) and sub-millisecond execution on ARM Cortex-M / Xtensa cores.</p>
          </div>
          <div className="docs-card-panel">
            <h4>1D-CNN (TensorFlow Lite for Micro)</h4>
            <p>1D Convolutional Neural Network learning temporal patterns directly from raw sensor windows. Quantized to INT8 weights for microcontrollers, providing superior sensitivity to rapid rotational slip dynamics.</p>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Current Integration Status</h2>
        <div className="docs-callout docs-callout-warning">
          <div className="docs-callout-title">Source of Truth Notice</div>
          <div className="docs-callout-body">
            In the current repository state:
            <ul className="docs-ul" style={{ margin: "8px 0 0 0", paddingLeft: "18px" }}>
              <li className="docs-li">The <code>jalari-ai/</code> repository is scaffolded with placeholder directories (<code>datasets/</code>, <code>notebooks/</code>).</li>
              <li className="docs-li"><strong>No trained AI models are currently deployed on the BoatNode firmware.</strong></li>
              <li className="docs-li">Dataset acquisition, annotation of marine motion artifacts, and micro-inference benchmarking are active research initiatives.</li>
            </ul>
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
