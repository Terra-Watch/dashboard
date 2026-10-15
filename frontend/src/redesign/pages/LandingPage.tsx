import { SampleDataBadge } from '../components/primitives';

/** Direction A — calm, map-first (user's Gate 2 pick over the animated Direction B).
 *  Motion is a single fade-in on load only; no scroll-triggered animation, per the
 *  Gate 1 amendment restricting motion-forward treatment to this page alone, and the
 *  user's own choice of the calmer of the two directions. */
export function LandingPage({ go }: { go: (path: string) => void }) {
  return (
    <div className="animate-[fadeUp_0.6s_ease-out_0.1s_both] bg-sheet">
      <style>{'@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }'}</style>

      <section className="mx-auto max-w-[1040px] px-10 pb-16 pt-24 text-center">
        <h1 className="mx-auto max-w-[780px] font-serif text-4xl leading-tight md:text-5xl">Explore past fire information.</h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-muted md:text-lg">
          Review a saved historical fire-risk ranking, example reports, and a separate saved example of possible fire spread. None shows current fire activity.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => go('/redesign/today')}
            className="rounded-rq border border-canopy bg-canopy px-5 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep"
          >
            View the historical ranking
          </button>
          <button
            onClick={() => go('/demo')}
            className="rounded-rq border border-canopy px-5 py-2.5 text-sm font-semibold text-canopy hover:bg-canopy/10"
          >
            Explore the saved example
          </button>
        </div>
      </section>

      <section className="mx-auto mb-20 max-w-[1040px] px-10">
        <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-contour bg-paper text-sm text-ink-muted">
          <SampleDataBadge note="Archived replay, not real-time." />
          <p>Explore the historical map from the ranking page</p>
        </div>
      </section>

      <section role="region" aria-label="Role-specific entry experiences" className="mx-auto mb-20 max-w-[1040px] px-6 sm:px-10">
        <h2 id="role-entry-heading" className="font-serif text-2xl font-bold text-center mb-2">Role-specific entry experiences</h2>
        <p className="text-center text-sm text-ink-muted max-w-xl mx-auto mb-8">
          Explore workflows tailored for citizens, control room staff, and field officers. Client-side role selection is not a security boundary; staff operations require verified credentials.
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
                Review historical fire-risk comparisons and educational spread demonstrations. Live emergency monitoring, public alerts, and dispatch are not provided.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/redesign/today')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                View historical ranking
              </button>
              <button
                type="button"
                onClick={() => go('/demo')}
                className="w-full rounded-rq border border-contour px-4 py-2 text-sm font-medium text-ink hover:bg-paper text-center"
              >
                Open public archive
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
                Inspect candidate detections and evaluate possible spread models across research weather comparisons. Staff actions require verified credentials.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/redesign/watch')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                Review reports
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => go('/redesign/incident/E2023-084925')}
                  className="flex-1 rounded-rq border border-contour px-3 py-2 text-xs font-medium text-ink hover:bg-paper text-center"
                >
                  Spread model
                </button>
                <a
                  href="/login"
                  className="flex-1 rounded-rq border border-contour px-3 py-2 text-xs font-medium text-ink hover:bg-paper text-center flex items-center justify-center"
                >
                  Staff sign in
                </a>
              </div>
            </div>
          </div>

          {/* Range Officer */}
          <div className="rounded-xl border border-contour bg-sheet p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-canopy">Field Patrol</span>
                <span className="rounded bg-paper px-2 py-0.5 text-[11px] text-ink-muted">Offline-capable</span>
              </div>
              <h3 className="text-lg font-serif font-bold text-ink mb-2">Range Officer</h3>
              <p className="text-sm text-ink-muted mb-4">
                Ground verification of candidate areas. Save field notes directly on your device with local storage. Notes remain on this device until synchronized.
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-contour/50">
              <button
                type="button"
                onClick={() => go('/redesign/field')}
                className="w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep text-center"
              >
                Open field notes
              </button>
              <p className="text-[11px] text-center text-ink-muted">Drafts saved on device only</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mb-20 grid max-w-[1040px] grid-cols-1 gap-6 px-10 md:grid-cols-3">
        {[
          { num: '01', title: 'Historical ranking', body: 'A saved comparison of forest areas for a past date, not a current forecast or calibrated chance of fire.' },
          { num: '02', title: 'Example reports', body: 'Satellite observations and field reports need human review; none is a confirmed fire until checked.' },
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
