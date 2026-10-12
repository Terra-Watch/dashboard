import { useState } from 'react';
import {
  TrustBadge, SampleDataBadge, Chip, StepIndicator, EmptyState, OfflineBanner, Toast, Dialog, Button,
} from '../components/primitives';
import {
  RiskLegend, ProbabilityBandLegend, WindSourceSwitch, BaselineToggle, AssumptionsPanel, TimelineSlider, BriefingExport,
} from '../components/scenario';
import { MapShell, LayerPanel, WindArrowsControl } from '../components/map';
import { DetectionCard, VerifyActions } from '../components/watch';
import { PhotoCapture, SyncQueue } from '../components/field';
import { RoleSwitcher } from '../components/RoleSwitcher';
import type { Detection, QueuedFieldReport, Role } from '../lib/types';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-b border-contour py-8">
      <h2 className="mb-1 font-serif text-xl">{title}</h2>
      <div className="mt-4 flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}

function StateLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-64">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

const SAMPLE_DETECTION: Detection = {
  id: 'det-sample', incident_id: 'E2023-084925', source: 'VIIRS', state: 'OD', label: 'Similipal, Odisha — Mar 2023',
  detected_at: '2023-03-07T07:29:00Z', confidence: 'nominal', status: 'new', lat: 19.3, lon: 83.9, frp: 4.6,
};

const SAMPLE_QUEUE: QueuedFieldReport[] = [
  { idempotency_key: '1', task_id: 't1', note: '', photo_name: null, captured_at: new Date().toISOString(), state: 'pending', attempts: 0 },
  { idempotency_key: '2', task_id: 't2', note: '', photo_name: null, captured_at: new Date().toISOString(), state: 'syncing', attempts: 1 },
  { idempotency_key: '3', task_id: 't3', note: '', photo_name: null, captured_at: new Date().toISOString(), state: 'synced', attempts: 1 },
  { idempotency_key: '4', task_id: 't4', note: '', photo_name: null, captured_at: new Date().toISOString(), state: 'failed', attempts: 2 },
];

export function StyleguidePage() {
  const [role, setRole] = useState<Role>('range_officer');
  const [layers, setLayers] = useState(new Set(['risk']));
  const [baseline, setBaseline] = useState(true);
  const [wind, setWind] = useState('era5land_native');
  const [windArrows, setWindArrows] = useState(true);
  const [k, setK] = useState(2);
  const [toast, setToast] = useState(false);
  const [dialog, setDialog] = useState(false);

  return (
    <div data-rq-app className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="font-serif text-2xl">Styleguide</h1>
      <p className="mt-1 text-sm text-ink-muted">Every redesign-v2 component from docs/redesign/08_design_system.md, in its documented states.</p>

      <Section id="trust-sample" title="TrustBadge / SampleDataBadge / Chip">
        <StateLabel label="Forecast"><TrustBadge level="forecast">Ranked, not predicted</TrustBadge></StateLabel>
        <StateLabel label="Detection"><TrustBadge level="detection">Not yet verified</TrustBadge></StateLabel>
        <StateLabel label="Verified"><TrustBadge level="verified">Confirmed by a person</TrustBadge></StateLabel>
        <StateLabel label="Scenario"><TrustBadge level="scenario">Uncalibrated scenario</TrustBadge></StateLabel>
        <StateLabel label="Sample data"><SampleDataBadge /></StateLabel>
        <StateLabel label="Chip"><Chip>est. 2.1 km²</Chip></StateLabel>
      </Section>

      <Section id="step-indicator" title="StepIndicator">
        <div className="w-full"><StepIndicator current="Scenario" /></div>
      </Section>

      <Section id="legends" title="RiskCell legend / ProbabilityBand legend">
        <StateLabel label="Risk ramp"><RiskLegend /></StateLabel>
        <StateLabel label="Probability bands"><ProbabilityBandLegend /></StateLabel>
      </Section>

      <Section id="map" title="MapShell / LayerPanel / WindArrowsControl">
        <StateLabel label="Default"><MapShell label="Map placeholder" /></StateLabel>
        <StateLabel label="Empty"><MapShell label="No data for this view" /></StateLabel>
        <StateLabel label="Layer panel"><LayerPanel active={layers} onToggle={(id) => setLayers((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })} /></StateLabel>
        <StateLabel label="Wind arrows toggle"><WindArrowsControl visible={windArrows} onChange={setWindArrows} /></StateLabel>
      </Section>

      <Section id="watch" title="DetectionCard / VerifyActions / QueueList">
        <StateLabel label="New (default)"><DetectionCard detection={SAMPLE_DETECTION} busy={false} onAction={() => {}} /></StateLabel>
        <StateLabel label="Verified"><DetectionCard detection={{ ...SAMPLE_DETECTION, status: 'verify' }} busy={false} onAction={() => {}} /></StateLabel>
        <StateLabel label="Dismissed"><DetectionCard detection={{ ...SAMPLE_DETECTION, status: 'dismiss' }} busy={false} onAction={() => {}} /></StateLabel>
        <StateLabel label="Loading (busy)"><DetectionCard detection={SAMPLE_DETECTION} busy onAction={() => {}} /></StateLabel>
        <StateLabel label="Actions, disabled"><VerifyActions onAction={() => {}} disabled /></StateLabel>
      </Section>

      <Section id="scenario" title="TimelineSlider / BaselineToggle / WindSourceSwitch / AssumptionsPanel / BriefingExport">
        <StateLabel label="Timeline"><TimelineSlider k={k} maxK={7} onChange={setK} /></StateLabel>
        <StateLabel label="Baseline on"><BaselineToggle visible={baseline} onChange={setBaseline} /></StateLabel>
        <StateLabel label="Baseline off (hidden reminder)"><BaselineToggle visible={false} onChange={() => {}} /></StateLabel>
        <StateLabel label="Wind source"><WindSourceSwitch value={wind} onChange={setWind} /></StateLabel>
        <StateLabel label="Assumptions"><AssumptionsPanel fuel="TL2/GR1 uncalibrated crosswalk" weather="27°C, 40% RH fixed" terrain="Copernicus GLO-30 DEM" /></StateLabel>
        <StateLabel label="Export"><BriefingExport onExport={() => {}} /></StateLabel>
      </Section>

      <Section id="field" title="PhotoCapture / SyncQueue">
        <StateLabel label="Capture (default)"><PhotoCapture onCapture={() => {}} /></StateLabel>
        <StateLabel label="Queue: pending/syncing/synced/failed"><SyncQueue items={SAMPLE_QUEUE} onRetry={() => {}} /></StateLabel>
      </Section>

      <Section id="role" title="RoleSwitcher">
        <StateLabel label="Default"><RoleSwitcher role={role} onChange={setRole} /></StateLabel>
      </Section>

      <Section id="state" title="EmptyState / OfflineBanner / Toast / Dialog">
        <StateLabel label="Empty"><EmptyState title="Not validated here" body="Outside the six scoped states, no value is shown." /></StateLabel>
        <StateLabel label="Offline"><OfflineBanner lastSyncedAt="14:02" /></StateLabel>
        <StateLabel label="Toast"><Button onClick={() => setToast(true)}>Show toast</Button>{toast && <Toast message="Report synced." onClose={() => setToast(false)} />}</StateLabel>
        <StateLabel label="Dialog">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          {dialog && <Dialog title="Confirm escalation" onClose={() => setDialog(false)}><p className="text-sm">This will notify the control room.</p></Dialog>}
        </StateLabel>
      </Section>

      <Section id="buttons" title="Button — default / hover / focus / disabled">
        <StateLabel label="Primary"><Button variant="primary">Verify</Button></StateLabel>
        <StateLabel label="Secondary"><Button variant="secondary">Dismiss</Button></StateLabel>
        <StateLabel label="Danger"><Button variant="danger">Escalate</Button></StateLabel>
        <StateLabel label="Disabled"><Button variant="primary" disabled>Verify</Button></StateLabel>
        <StateLabel label="Focus (tab to it)"><Button variant="primary" autoFocus>Focus me</Button></StateLabel>
      </Section>

      <p className="mt-6 text-xs text-ink-muted">
        Hover/stale states are documented per-component in 08_design_system.md but are not separately instrumented here
        beyond native CSS :hover — use a mouse to see hover treatment on any button/card above.
      </p>
    </div>
  );
}
