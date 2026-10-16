import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Brand } from '../../components/Brand';
import { rqFetch } from '../lib/api';
import { listStatusText } from '../../lib/assessmentPresentation';
import { MapShell } from '../components/map';
import { Marker } from 'react-map-gl/maplibre';

type Navigate = (path: string) => void;
type CitizenPath = string;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function CitizenShell({ path, go, children }: { path: CitizenPath; go: Navigate; children: ReactNode }) {
  const links: Array<[CitizenPath, string, string]> = [
    ['/citizen', 'Home', '⌂'],
    ['/citizen/map', 'Fire Map', '⌖'],
    ['/citizen/report', 'Report', '＋'],
    ['/citizen/reports', 'My Reports', '▤'],
  ];
  return (
    <div data-rq-app data-citizen-app className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-contour bg-sheet/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/citizen" aria-label="TerraWatch Citizen home" onClick={event => { event.preventDefault(); go('/citizen'); }}><Brand dark /></a>
          <nav aria-label="Citizen navigation" className="hidden items-center gap-5 text-sm font-semibold md:flex">
            {links.map(([href, label]) => <a key={href} href={href} onClick={event => { event.preventDefault(); go(href); }} className={path === href ? 'border-b-2 border-canopy pb-1 text-canopy' : 'text-ink-muted hover:text-ink'}>{label}</a>)}
            <a href="/citizen/safety" onClick={event => { event.preventDefault(); go('/citizen/safety'); }} className={path === '/citizen/safety' ? 'border-b-2 border-canopy pb-1 text-canopy' : 'text-ink-muted hover:text-ink'}>Stay safe</a>
          </nav>
          <a href="/" onClick={event => { event.preventDefault(); go('/'); }} className="text-xs font-semibold text-ink-muted underline hover:text-ink">TerraWatch home</a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-8 md:pb-12">{children}</main>
      <nav aria-label="Citizen mobile navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-contour bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {links.map(([href, label, icon]) => <a key={href} href={href} onClick={event => { event.preventDefault(); go(href); }} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${path === href ? 'text-canopy' : 'text-ink-muted'}`}><span aria-hidden="true" className="text-lg">{icon}</span>{label}</a>)}
      </nav>
    </div>
  );
}

function StateCard({ title, children, tone = 'neutral' }: { title: string; children: ReactNode; tone?: 'neutral' | 'notice' | 'warning' }) {
  const styles = tone === 'warning' ? 'border-warn/50 bg-paper' : tone === 'notice' ? 'border-canopy/30 bg-sheet' : 'border-contour bg-sheet';
  return <section className={`rounded-rq border p-5 ${styles}`}><h2 className="font-serif text-xl">{title}</h2><div className="mt-2 text-sm leading-6 text-ink-muted">{children}</div></section>;
}

export function CitizenHomePage({ go }: { go: Navigate }) {
  return <CitizenShell path="/citizen" go={go}>
    <section className="rounded-rq bg-canopy px-5 py-8 text-white sm:px-8 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">Citizen fire information</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">See public information. Share an observation. Stay prepared.</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">TerraWatch helps communities understand available fire information. It does not replace emergency services or confirm a fire from a prediction.</p>
      <div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={() => go('/citizen/report')} className="rounded-rq bg-white px-4 py-3 text-sm font-bold text-canopy hover:bg-paper focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-canopy">Report a fire</button><button type="button" onClick={() => go('/citizen/map')} className="rounded-rq border border-white/60 px-4 py-3 text-sm font-bold text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white">View fire map</button></div>
    </section>
    <div className="mt-6 grid gap-5 md:grid-cols-3">
      <StateCard title="Public fire information" tone="notice"><p>No public live incident feed is connected to this Citizen application yet. The Fire Map will identify when data is unavailable or historical.</p><button type="button" onClick={() => go('/citizen/map')} className="mt-4 font-semibold text-canopy underline">Open the Fire Map</button></StateCard>
      <StateCard title="Stay safe"><p>Prepare using local authority guidance. Do not rely on a TerraWatch ranking as an evacuation order or an assurance that an area is safe.</p><button type="button" onClick={() => go('/citizen/safety')} className="mt-4 font-semibold text-canopy underline">Read safety guidance</button></StateCard>
      <StateCard title="Your reports"><p>Review only the reports and evidence owned by your authenticated Citizen account.</p><button type="button" onClick={() => go('/citizen/reports')} className="mt-4 font-semibold text-canopy underline">View my reports</button></StateCard>
    </div>
    <p className="mt-6 text-xs text-ink-muted">Source and freshness: public data source status is shown on the Fire Map. When no source is connected, TerraWatch says so instead of presenting stale or simulated information as current.</p>
  </CitizenShell>;
}

export function CitizenMapPage({ go }: { go: Navigate }) {
  return <CitizenShell path="/citizen/map" go={go}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-canopy">Public awareness</p><h1 className="mt-2 font-serif text-4xl">Fire Map</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">This map only displays approved public information. Private evidence, reviewer notes, and staff operational layers are never exposed here.</p></div><span className="rounded-full border border-warn/50 bg-paper px-3 py-1 text-xs font-semibold text-ink-muted">Data status: unavailable</span></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]"><StateCard title="No public map source connected" tone="warning"><p>There are no confirmed public incident markers available for this view. This is an empty state, not an indication that no fires exist.</p><p className="mt-3">Last checked: not available. Freshness: not available.</p><button type="button" onClick={() => go('/citizen/report')} className="mt-5 rounded-rq border border-canopy bg-canopy px-4 py-2.5 font-semibold text-white hover:bg-canopy-deep">Report a fire</button></StateCard><StateCard title="Legend"><ul className="space-y-2"><li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-red-600" />Confirmed public incident</li><li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-amber-500" />Satellite detection, if published</li><li><span className="mr-2 inline-block h-3 w-3 rounded-full bg-slate-400" />Historical example</li></ul><p className="mt-4 text-xs">No markers are shown until a public source is available.</p></StateCard></div>
    <p className="mt-5 text-xs text-ink-muted">Attribution: no public map provider is active for this page. For immediate danger, contact local emergency services and follow official alerts.</p>
  </CitizenShell>;
}

export function ReportWizard({ go }: { go: Navigate }) {
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState('');
  const [locationStatus, setLocationStatus] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [fileError, setFileError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [reportState, setReportState] = useState('OD');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [reportId, setReportId] = useState<number | null>(null);

  const selectMapLocation = (nextLongitude: number, nextLatitude: number) => {
    setLatitude(nextLatitude.toFixed(5));
    setLongitude(nextLongitude.toFixed(5));
    setLocation(`${nextLatitude.toFixed(5)}, ${nextLongitude.toFixed(5)} (selected on map)`);
    setLocationStatus('Location selected on the map. Confirm it is where you observed the suspected fire.');
  };

  const requestLocation = () => {
    if (!navigator.geolocation) { setLocationStatus('Location is not available on this device. Enter the observation location manually.'); return; }
    setLocationStatus('Requesting phone location…');
    navigator.geolocation.getCurrentPosition(
      position => { setLatitude(position.coords.latitude.toFixed(5)); setLongitude(position.coords.longitude.toFixed(5)); setLocation(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (phone location)`); setLocationStatus('Phone location captured. Confirm that this is the observation location before continuing.'); },
      () => setLocationStatus('Location permission was denied or unavailable. Enter the observation location manually; your phone location is not required.'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const chooseFile = (candidate: File | undefined) => {
    setFileError('');
    if (!candidate) return;
    if (!ACCEPTED_IMAGE_TYPES.has(candidate.type)) { setFile(null); setFileError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (candidate.size > MAX_IMAGE_BYTES) { setFile(null); setFileError('Images must be 10 MB or smaller.'); return; }
    setFile(candidate);
  };

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canContinue = step === 1 ? location.trim().length > 0 && Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180 : step === 2 ? observedAt.length > 0 : true;
  const summary = useMemo(() => ({ location, observedAt, description, evidence: file?.name ?? 'No photo attached' }), [description, file?.name, location, observedAt]);
  const advance = () => { if (!canContinue) return; setStep(current => Math.min(4, current + 1)); };
  async function submitReport() {
    setSubmitError(''); setSuccess('');
    try {
      const result = await rqFetch<{ report: { id: number } }>('/api/citizen/reports', { method: 'POST', body: JSON.stringify({ client_key: `citizen-${crypto.randomUUID()}`, latitude: Number(latitude), longitude: Number(longitude), state: reportState, description, observed_at: new Date(observedAt).toISOString() }) });
      setReportId(result.report.id);
      if (file) {
        const form = new FormData(); form.append('image', file);
        const token = localStorage.getItem('resq_token'); const csrf = document.cookie.split('; ').find(item => item.startsWith('resq_csrf='))?.split('=')[1] ?? '';
        const response = await fetch(`/api/citizen/reports/${result.report.id}/evidence`, { method: 'POST', body: form, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(csrf ? { 'x-resq-csrf': csrf } : {}) }, credentials: 'include' });
        if (!response.ok) throw new Error('The report was saved, but its photograph could not be stored. Check the report history before retrying.');
      }
      setSuccess(`Report ${result.report.id} was persisted for human review. No emergency notification was sent by this action.`);
    } catch (reason) { setSubmitError(reason instanceof Error ? reason.message : 'Report submission failed. No confirmation was received.'); }
  }

  return <CitizenShell path="/citizen/report" go={go}>
    <p className="text-xs font-bold uppercase tracking-wider text-canopy">Citizen reporting</p><h1 className="mt-2 font-serif text-4xl">Report a suspected fire</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Your report is saved only after the server confirms persistence. It enters human review; this action does not notify emergency responders.</p>
    <ol aria-label="Report steps" className="mt-7 grid grid-cols-4 gap-2">{['Location', 'Observation', 'Evidence', 'Review'].map((label, index) => <li key={label} className={`border-t-4 pt-2 text-xs font-semibold ${step === index + 1 ? 'border-canopy text-canopy' : step > index + 1 ? 'border-canopy/40 text-ink-muted' : 'border-contour text-ink-muted'}`}><span className="sr-only">Step {index + 1}: </span>{label}</li>)}</ol>
    <section className="mt-6 max-w-3xl rounded-rq border border-contour bg-sheet p-5 sm:p-7">
      {step === 1 && <div><h2 className="font-serif text-2xl">1. Where did you observe it?</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Click the map to place the marker, or enter coordinates manually. Device location is optional and never required.</p><div className="mt-5"><MapShell label="Select suspected fire location" center={[Number(longitude) || 80.4, Number(latitude) || 20.3]} zoom={Number(latitude) ? 9 : 4.6} aspect="wide" onMapClick={selectMapLocation}>{Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && latitude !== '' && longitude !== '' && <Marker longitude={Number(longitude)} latitude={Number(latitude)} anchor="bottom"><div aria-label="Selected observation location" className="h-5 w-5 rounded-full border-2 border-white bg-danger shadow-lg" /></Marker>}</MapShell><p className="mt-2 text-xs text-ink-muted">Map selection gives coordinates only; TerraWatch does not invent a place name or accuracy claim.</p></div><label htmlFor="observation-location" className="mt-5 block text-sm font-semibold">Location summary <span className="font-normal text-ink-muted">(optional)</span></label><input id="observation-location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Address or landmark, if known" className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm" /><div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold">Latitude<input aria-label="Latitude" type="number" min="-90" max="90" step="any" value={latitude} onChange={event => setLatitude(event.target.value)} className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm" /></label><label className="text-sm font-semibold">Longitude<input aria-label="Longitude" type="number" min="-180" max="180" step="any" value={longitude} onChange={event => setLongitude(event.target.value)} className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm" /></label><label className="text-sm font-semibold">State<select aria-label="State" value={reportState} onChange={event => setReportState(event.target.value)} className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm"><option>OD</option><option>CG</option><option>TS</option><option>MP</option><option>MH</option><option>JH</option></select></label></div><button type="button" onClick={requestLocation} className="mt-3 rounded-rq border border-canopy px-3 py-2 text-sm font-semibold text-canopy hover:bg-paper">Use my phone location</button>{locationStatus && <p role="status" className="mt-3 text-sm text-ink-muted">{locationStatus}</p>}</div>}
      {step === 2 && <div><h2 className="font-serif text-2xl">2. What did you observe?</h2><label htmlFor="observed-at" className="mt-5 block text-sm font-semibold">Observation time</label><input id="observed-at" type="datetime-local" value={observedAt} onChange={event => setObservedAt(event.target.value)} className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm focus:border-canopy focus:outline-none focus:ring-2 focus:ring-canopy/30" /><label htmlFor="observation-description" className="mt-5 block text-sm font-semibold">Description <span className="font-normal text-ink-muted">(optional)</span></label><textarea id="observation-description" value={description} onChange={event => setDescription(event.target.value)} rows={5} placeholder="Describe smoke, flames, or what you saw in plain language." className="mt-2 w-full rounded-rq border border-contour bg-paper px-3 py-3 text-sm focus:border-canopy focus:outline-none focus:ring-2 focus:ring-canopy/30" /></div>}
      {step === 3 && <div><h2 className="font-serif text-2xl">3. Add a photo</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Photos are held only in this draft until a supported secure workflow is available. JPEG, PNG, and WebP files up to 10 MB are accepted.</p><label htmlFor="evidence-file" className="mt-5 block text-sm font-semibold">Choose a photo <span className="font-normal text-ink-muted">(optional)</span></label><input id="evidence-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => chooseFile(event.target.files?.[0])} className="mt-2 block w-full text-sm" />{fileError && <p role="alert" className="mt-3 text-sm text-danger">{fileError}</p>}{file && <div className="mt-4 flex items-center gap-3 rounded border border-contour p-3"><img src={previewUrl} alt="Selected evidence preview" className="h-20 w-20 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-ink-muted">{Math.round(file.size / 1024)} KB</p></div><button type="button" onClick={() => setFile(null)} className="text-sm font-semibold text-danger underline">Remove</button></div>}</div>}
      {step === 4 && <div><h2 className="font-serif text-2xl">4. Review before secure submission</h2><dl className="mt-5 divide-y divide-contour rounded border border-contour"><div className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr]"><dt className="text-xs font-bold uppercase text-ink-muted">Location</dt><dd className="text-sm">{summary.location} · {latitude}, {longitude} · {reportState}</dd></div><div className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr]"><dt className="text-xs font-bold uppercase text-ink-muted">Observed</dt><dd className="text-sm">{summary.observedAt}</dd></div><div className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr]"><dt className="text-xs font-bold uppercase text-ink-muted">Description</dt><dd className="text-sm">{summary.description || 'Not provided'}</dd></div><div className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr]"><dt className="text-xs font-bold uppercase text-ink-muted">Evidence</dt><dd className="text-sm">{summary.evidence}</dd></div></dl>{success && <p role="status" className="mt-5 rounded-rq border border-canopy/40 bg-sheet p-4 text-sm text-canopy">{success}</p>}{submitError && <p role="alert" className="mt-5 rounded-rq border border-warn/50 bg-paper p-4 text-sm text-ink-muted">{submitError}</p>}<p className="mt-5 text-sm text-ink-muted">Reports are persisted for human review. No emergency notification is implied.</p></div>}
      <div className="mt-7 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setStep(current => Math.max(1, current - 1))} disabled={step === 1 || Boolean(success)} className="rounded-rq border border-contour px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Back</button>{step < 4 ? <button type="button" onClick={advance} disabled={!canContinue} className="rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep disabled:cursor-not-allowed disabled:opacity-40">Continue</button> : <button type="button" onClick={() => void submitReport()} disabled={Boolean(success)} className="rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep disabled:opacity-50">{success ? `Report ${reportId} saved` : 'Submit report'}</button>}</div><p role="status" className="mt-3 text-xs text-ink-muted">{success ? 'Server-confirmed report.' : 'Nothing is submitted until you press Submit report.'}</p>
    </section>
  </CitizenShell>;
}

export function CitizenReportsPage({ go }: { go: Navigate }) {
  const [reports, setReports] = useState<Array<{ id: number; status: string; state: string; observed_at: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { void rqFetch<{ items: typeof reports }>('/api/citizen/reports').then(result => setReports(result.items)).catch(reason => setError(reason instanceof Error ? reason.message : 'Report history is unavailable.')).finally(() => setLoading(false)); }, []);
  return <CitizenShell path="/citizen/reports" go={go}><p className="text-xs font-bold uppercase tracking-wider text-canopy">Citizen reporting</p><h1 className="mt-2 font-serif text-4xl">My Reports</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Only reports owned by your authenticated Citizen account are shown.</p><div className="mt-6 max-w-3xl">{loading && <p role="status" className="rounded-rq border border-contour bg-sheet p-5 text-sm text-ink-muted">Loading your reports…</p>}{error && <p role="alert" className="rounded-rq border border-warn/50 bg-paper p-5 text-sm text-ink-muted">{error}</p>}{!loading && !error && !reports.length && <StateCard title="No reports yet" tone="notice"><p>No server-persisted reports belong to this account.</p><button type="button" onClick={() => go('/citizen/report')} className="mt-5 rounded-rq border border-canopy bg-canopy px-4 py-2.5 font-semibold text-white hover:bg-canopy-deep">Report a fire</button></StateCard>}{reports.length > 0 && <div className="space-y-3">{reports.map(report => <article key={report.id} className="rounded-rq border border-contour bg-sheet p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Report {report.id}</h2><span className="rounded-full border border-contour px-2 py-1 text-xs">{report.status}</span></div><p className="mt-2 text-sm text-ink-muted">{report.state} · observed {new Date(report.observed_at).toLocaleString()} · submitted {new Date(report.created_at).toLocaleString()}</p><button type="button" onClick={() => go(`/citizen/reports/${report.id}`)} className="mt-4 font-semibold text-canopy underline">View report details</button></article>)}</div>}</div></CitizenShell>;
}

export function CitizenReportDetailPage({ id, go }: { id: number; go: Navigate }) {
  const [report, setReport] = useState<{ id: number; status: string; state: string; latitude: number; longitude: number; observed_at: string; created_at: string; evidence: Array<{ id: number; original_filename: string; assessment_status: string }> } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void rqFetch<{ report: typeof report }>(`/api/citizen/reports/${id}`).then(result => setReport(result.report)).catch(reason => setError(reason instanceof Error ? reason.message : 'Report details are unavailable.')); }, [id]);
  return <CitizenShell path={`/citizen/reports/${id}`} go={go}><button type="button" onClick={() => go('/citizen/reports')} className="text-sm font-semibold text-canopy underline">← Back to reports</button><h1 className="mt-5 font-serif text-4xl">Report {id}</h1>{error && <p role="alert" className="mt-5 rounded-rq border border-warn/50 bg-paper p-5 text-sm text-ink-muted">{error}</p>}{!report && !error && <p role="status" className="mt-5 rounded-rq border border-contour bg-sheet p-5 text-sm text-ink-muted">Loading report…</p>}{report && <section className="mt-6 max-w-2xl rounded-rq border border-contour bg-sheet p-5"><p className="text-sm text-ink-muted">Status: <strong className="text-ink">{report.status}</strong></p><dl className="mt-5 space-y-3 text-sm"><div><dt className="font-semibold text-ink-muted">Location</dt><dd>{report.latitude}, {report.longitude} · {report.state}</dd></div><div><dt className="font-semibold text-ink-muted">Observed</dt><dd>{new Date(report.observed_at).toLocaleString()}</dd></div><div><dt className="font-semibold text-ink-muted">Submitted</dt><dd>{new Date(report.created_at).toLocaleString()}</dd></div></dl><h2 className="mt-6 font-serif text-xl">Evidence</h2>{!report.evidence.length && <p className="mt-2 text-sm text-ink-muted">No evidence attached.</p>}{report.evidence.map(item => <p key={item.id} className="mt-2 text-sm text-ink-muted">{item.original_filename} · {listStatusText(item.assessment_status)}</p>)}</section>}</CitizenShell>;
}

export function CitizenSafetyPage({ go }: { go: Navigate }) {
  return <CitizenShell path="/citizen/safety" go={go}><p className="text-xs font-bold uppercase tracking-wider text-canopy">Preparedness</p><h1 className="mt-2 max-w-3xl font-serif text-4xl">Stay safe before, during, and after a fire.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Follow local emergency services and civil-protection authorities for current instructions. TerraWatch does not issue evacuation orders or determine that an area is safe.</p><div className="mt-7 grid gap-5 md:grid-cols-3"><StateCard title="Prepare"><ul className="list-disc space-y-2 pl-5"><li>Keep emergency contacts and medicines ready.</li><li>Know more than one route away from your home.</li><li>Keep important documents accessible.</li></ul></StateCard><StateCard title="If you see smoke"><ul className="list-disc space-y-2 pl-5"><li>Move away from immediate danger and call local emergency services.</li><li>Do not approach a fire or enter smoke.</li><li>Share a report only when it is safe to do so.</li></ul></StateCard><StateCard title="Follow official advice"><ul className="list-disc space-y-2 pl-5"><li>Monitor official local alerts.</li><li>Follow evacuation instructions promptly.</li><li>Do not treat a model prediction as an official warning.</li></ul></StateCard></div></CitizenShell>;
}

function CitizenUnavailablePage({ go, title }: { go: Navigate; title: string }) {
  return <CitizenShell path="/citizen" go={go}><p className="text-xs font-bold uppercase tracking-wider text-canopy">Citizen application</p><h1 className="mt-2 font-serif text-4xl">{title}</h1><div className="mt-6 max-w-2xl rounded-rq border border-warn/50 bg-paper p-5"><p className="text-sm leading-6 text-ink-muted">This capability is not connected to a supported backend contract yet. TerraWatch has not fabricated posts, comments, profiles, or private records.</p></div></CitizenShell>;
}

export function CitizenRouter({ path, go }: { path: string; go: Navigate }) {
  if (path === '/citizen') return <CitizenHomePage go={go} />;
  if (path === '/citizen/map') return <CitizenMapPage go={go} />;
  if (path === '/citizen/report') return <ReportWizard go={go} />;
  if (path === '/citizen/reports') return <CitizenReportsPage go={go} />;
  const reportMatch = path.match(/^\/citizen\/reports\/(\d+)$/);
  if (reportMatch) return <CitizenReportDetailPage id={Number(reportMatch[1])} go={go} />;
  if (path === '/citizen/safety') return <CitizenSafetyPage go={go} />;
  if (path.startsWith('/citizen/community')) return <CitizenUnavailablePage go={go} title="Community discussions unavailable" />;
  if (path === '/citizen/profile') return <CitizenUnavailablePage go={go} title="Profile unavailable" />;
  return <CitizenUnavailablePage go={go} title="Citizen page unavailable" />;
}
