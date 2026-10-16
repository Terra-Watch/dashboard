import { useEffect, useState } from 'react';
import { MapShell, RiskCellsLayer } from '../components/map';
import { SampleDataBadge } from '../components/primitives';
import { computeFeatureCollectionBounds } from '../lib/geospatial';

const ARCHIVE_DATA = `${import.meta.env.BASE_URL ?? '/'}demo/resq6-offline-terrawatch-20261015/forecast.geojson`.replace(/\/+/g, '/');

function HistoricalMapPreview() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    void fetch(ARCHIVE_DATA).then(async (response) => {
      if (!response.ok) throw new Error('Saved map request failed');
      return response.json() as Promise<GeoJSON.FeatureCollection>;
    }).then((collection) => {
      if (!active) return;
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) setStatus('error');
      else if (collection.features.length === 0) setStatus('empty');
      else {
        setData(collection);
        setStatus('ready');
      }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, []);

  if (status !== 'ready' || !data) {
    const message = status === 'loading' ? 'Loading the saved historical map…'
      : status === 'empty' ? 'No mapped areas are available in this saved example.'
        : 'The saved map could not be loaded. Open the archive for details.';
    return <div className="grid min-h-72 place-items-center rounded-rq border border-contour bg-paper p-6 text-center text-sm text-ink-muted" role={status === 'error' ? 'alert' : 'status'}>{message}</div>;
  }

  return <MapShell label="Saved historical ranked forest areas; not live fire activity" bounds={computeFeatureCollectionBounds(data)} center={[80.4, 20.3]} zoom={4.7} aspect="wide" offline>
    <RiskCellsLayer data={data} visible />
  </MapShell>;
}

export function LandingPage({ go }: { go: (path: string) => void }) {
  return (
    <div className="bg-sheet">
      <section className="mx-auto max-w-[1120px] px-6 pb-10 pt-12 text-left sm:px-10 sm:pt-16">
        <h1 className="mx-auto max-w-[780px] font-serif text-4xl leading-tight md:text-5xl">Explore past fire information.</h1>
        <p className="mt-5 max-w-xl text-base text-ink-muted md:text-lg">
          Browse an archived ranking and precomputed spread examples from past events. They are separate examples—not current fire activity, official warnings, or operational monitoring. None shows current fire activity.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => go('/demo')}
            className="rounded-rq border border-canopy bg-canopy px-5 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep"
          >
            Explore the saved example
          </button>
          <span className="text-sm text-ink-muted">Archived examples; no sign-in required.</span>
        </div>
      </section>

      <section className="mx-auto mb-16 grid max-w-[1120px] gap-4 px-6 sm:px-10 lg:grid-cols-[minmax(0,1fr)_250px]" aria-label="Saved geographic preview">
        <HistoricalMapPreview />
        <aside className="flex flex-col justify-between gap-5 rounded-rq border border-contour bg-sheet p-5">
          <div>
            <SampleDataBadge note="Archived, incomplete historical ranking; not a real-time fire map." />
            <h2 className="mt-4 font-serif text-xl">Historical ranking preview</h2>
            <p className="mt-2 text-sm text-ink-muted">An archived relative ranking, not fire detections, confirmed perimeters, or a current risk estimate.</p>
            <p className="mt-3 text-xs text-ink-muted">Archived replay · 10 Mar 2024 · incomplete regional coverage.</p>
          </div>
          <button type="button" onClick={() => go('/demo')} className="rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white">Open saved archive</button>
        </aside>
      </section>

      <section role="region" aria-label="Role-specific entry experiences" className="mx-auto mb-20 max-w-[1040px] px-6 sm:px-10">
        <h2 id="role-entry-heading" className="font-serif text-2xl font-bold text-center mb-2">Role-specific entry experiences</h2>
        <p className="text-center text-sm text-ink-muted max-w-xl mx-auto mb-8">
          Staff sign-in is explicit, and the service checks each account's permissions before allowing staff access. Client-side role selection is not a security boundary; staff operations require verified credentials.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Citizen */}
          <div className="rounded-xl border border-contour bg-sheet p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-canopy">Public Scope</span>
                <span className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-muted">Historical records</span>
              </div>
              <h3 className="text-lg font-serif font-bold text-ink mb-2">Citizen</h3>
              <p className="text-sm text-ink-muted mb-4">
                Browse the archived ranking and precomputed spread examples. Live emergency monitoring, public alerts, and dispatch are not provided.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/demo')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                Browse the public archive
              </button>
            </div>
          </div>

          {/* Control Room */}
          <div className="rounded-xl border border-contour bg-sheet p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-canopy">Operations</span>
                <span className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-muted">Staff workflow</span>
              </div>
              <h3 className="text-lg font-serif font-bold text-ink mb-2">Control Room</h3>
              <p className="text-sm text-ink-muted mb-4">
                Staff workspace access depends on your assigned account and permissions. Public saved examples are available without signing in.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/login')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                Staff sign in
              </button>
              <button
                type="button"
                onClick={() => go('/demo')}
                className="w-full rounded-rq border border-contour px-4 py-2 text-sm font-medium text-ink hover:bg-paper text-center"
              >
                Public saved examples
              </button>
              <p className="text-[11px] text-center text-ink-muted">Sign-in does not guarantee access; permissions are checked by the service.</p>
            </div>
          </div>

          {/* Range Officer */}
          <div className="rounded-xl border border-contour bg-sheet p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-canopy">Field Patrol</span>
                <span className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-muted">Scoped monitoring</span>
              </div>
              <h3 className="text-lg font-serif font-bold text-ink mb-2">Range Officer</h3>
              <p className="text-sm text-ink-muted mb-4">
                Field tools are for invited staff accounts. Range Officer accounts can access scoped monitoring and risk reads. Saved notes remain drafts on this device only.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/login')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                Staff sign in
              </button>
              <button type="button" onClick={() => go('/login')} className="w-full rounded-rq border border-contour px-4 py-2 text-sm font-medium text-ink hover:bg-paper text-center">
                Sign in to scoped monitoring
              </button>
              <p className="text-[11px] text-center text-ink-muted">Account permissions are verified after sign-in.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mb-20 grid max-w-[1040px] grid-cols-1 gap-6 px-10 md:grid-cols-3">
        {[
          { num: '01', title: 'Historical ranking', body: 'A saved comparison of forest areas for a past date, not a current forecast or calibrated chance of fire.' },
          { num: '02', title: 'Saved observations', body: 'Archived satellite observations are examples only; they are not live reports or confirmed active fires.' },
          { num: '03', title: 'Possible spread', body: 'A saved example with a fixed starting point and historical weather. It is separate from the area ranking.' },
        ].map((card) => (
          <div key={card.num} className="rounded-xl border border-contour p-6">
            <div className="mb-2.5 font-serif text-xs font-bold text-canopy">{card.num}</div>
            <h2 className="mb-2 text-base font-semibold">{card.title}</h2>
            <p className="text-sm text-ink-muted">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
