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
        <h1 className="mx-auto max-w-[780px] font-serif text-4xl leading-tight md:text-5xl">Three tools, not one.</h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-muted md:text-lg">
          A daily rank of forest cells for tomorrow. A queue for satellite and field detections. A scenario — only
          after a human confirms a fire — shown next to a simple guess it did not beat.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => go('/redesign/today')}
            className="rounded-rq border border-canopy bg-canopy px-5 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep"
          >
            See today's ranking
          </button>
        </div>
      </section>

      <section className="mx-auto mb-20 max-w-[1040px] px-10">
        <div className="relative flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-contour bg-paper text-sm text-ink-muted">
          <SampleDataBadge note="Archived replay, not real-time." />
          <p>Interactive ranked-cell map (pan/zoom) — rendered on the Today screen</p>
        </div>
      </section>

      <section className="mx-auto mb-20 grid max-w-[1040px] grid-cols-1 gap-6 px-10 md:grid-cols-3">
        {[
          { num: '01', title: 'Forecast', body: "Tomorrow's patrol priority, ranked. Never a prediction, never 24/48h." },
          { num: '02', title: 'Detection', body: 'Satellite and field reports, triaged by a person before anything counts as confirmed.' },
          { num: '03', title: 'Scenario', body: 'Only after verification: an estimate of how a confirmed fire might spread, from forecast wind and fuel.' },
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
