import Link from "next/link";
import type { CSSProperties } from "react";
import { Reveal } from "./Reveal";

const capabilities = [
  ["Manage vessels", "Keep fleet and vessel information organized."],
  ["Monitor operations", "See available vessel status, location and operational information."],
  ["Respond to safety events", "Manage SOS and important alerts from one workspace."],
  ["Understand activity", "Review telemetry, events and operational history."],
];

const flow = [
  ["01", "CONNECT", "Vessel information reaches Jalari when connectivity is available."],
  ["02", "MONITOR", "Teams see vessels and available operational information."],
  ["03", "RESPOND", "Important alerts and SOS events are surfaced for action."],
  ["04", "REVIEW", "Teams can review what happened through history and operational records."],
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-hero-bg">
        <nav className="landing-nav" aria-label="Main navigation">
          <Link className="landing-brand" href="/" aria-label="Jalari home">JALARI</Link>
          <div className="landing-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#how-it-works">How it works</a>
            <a href="#intelligence">Operations</a>
            <Link href="/docs">Docs</Link>
          </div>
          <Link className="landing-nav-cta" href="/dashboard">Access Dashboard</Link>
        </nav>

        <Reveal as="section" className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Maritime safety and operations</p>
            <h1>Maritime safety and operations, in one place.</h1>
            <p className="landing-lede">Jalari helps maritime teams monitor vessels, manage safety events, and understand what is happening across their operations.</p>
            <div className="landing-actions">
              <Link className="landing-primary-button" href="/dashboard">Access Dashboard</Link>
              <a className="landing-secondary-button" href="#capabilities">Explore Jalari</a>
            </div>
          </div>
          <div className="landing-hero-aside" aria-label="Jalari workspace summary">
            <div className="landing-hero-aside-line"><span>JALARI</span><span>OPERATIONS WORKSPACE</span></div>
            <div className="landing-hero-aside-content">
              <span className="landing-aside-mark" aria-hidden="true" />
              <p>One clear view of the work that matters.</p>
            </div>
            <div className="landing-hero-aside-line landing-hero-aside-bottom"><span>VESSELS</span><span>SAFETY</span><span>HISTORY</span></div>
          </div>
        </Reveal>
      </div>

      <Reveal as="section" className="landing-section landing-capabilities" id="capabilities">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">The workspace</p>
          <h2>Everything important, in one workspace.</h2>
        </div>
        <div className="landing-capability-grid">
          {capabilities.map(([title, text], index) => (
              <article className="landing-capability" key={title} style={{ "--landing-delay": `${index * 70}ms` } as CSSProperties}>
              <span className="landing-index">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="landing-section landing-workflow" id="how-it-works">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">A customer workflow</p>
          <h2>How Jalari works</h2>
        </div>
        <div className="landing-flow" aria-label="Connect, monitor, respond, review">
          {flow.map(([number, title, text], index) => (
            <div className="landing-flow-step" key={title}>
              <div className="landing-flow-step-top"><span>{number}</span>{index < flow.length - 1 && <span className="landing-flow-connector" aria-hidden="true" />}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="landing-section landing-intelligence" id="intelligence">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Future capabilities</p>
          <h2>Intelligent when it matters.</h2>
        </div>
        <div className="landing-intelligence-copy">
          <p>Jalari can use available operational information to help teams recognize risk, changing conditions, and potential issues.</p>
          <div className="landing-intelligence-list">
            {["Risk awareness", "Anomaly detection", "Movement insights", "Safety guidance"].map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="landing-section landing-preview">
        <div className="landing-preview-heading">
          <div><p className="landing-eyebrow">The Jalari dashboard</p><h2>Your operations, at a glance.</h2></div>
          <p>One workspace for vessels, maps, alerts, telemetry, history and system status.</p>
        </div>
        <div className="landing-dashboard-preview" aria-label="Static preview of the existing Jalari dashboard">
          <aside><strong>JALARI</strong><span>Overview</span><span>Operations</span><span>System</span></aside>
          <div className="landing-preview-workspace"><div className="landing-preview-topbar"><span>Overview</span><span>Gateway status · Unknown</span></div><div className="landing-preview-content"><span>Dashboard workspace</span><small>Operational data appears here when available.</small></div></div>
        </div>
        <Link className="landing-secondary-button landing-preview-link" href="/dashboard">Open Dashboard</Link>
      </Reveal>

      <Reveal as="section" className="landing-final-cta">
        <p className="landing-eyebrow">Jalari</p>
        <h2>Stay informed when it matters.</h2>
        <p>Bring your maritime operations into one clear workspace.</p>
        <Link className="landing-primary-button" href="/dashboard">Access Jalari</Link>
      </Reveal>

      <footer className="landing-footer"><span className="landing-brand">JALARI</span><span>Maritime safety and operations.</span></footer>
    </main>
  );
}
