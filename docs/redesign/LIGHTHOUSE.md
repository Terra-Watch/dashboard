# Lighthouse results — redesign-v2 screens

Run with `npx lighthouse` (headless Chrome, categories: performance, accessibility, best-practices, seo)
against a **production build** (`vite build` with `VITE_API_BASE_URL` pointed at the standalone
redesign+risk-router uvicorn instance described in the Phase 2 commit messages, served via
`vite preview`). An initial pass against the Vite **dev** server gave artificially low performance
scores (43–56) because dev mode ships unbundled ES modules and Lighthouse's default throttling
punishes that heavily — those numbers are not representative and are not reported below; only the
production-build numbers are.

| Screen | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Landing | 86 | 100 | 100 | 82 |
| Today | 77 | 100 | 100 | 82 |
| Watch | 98 | 100 | 100 | 82 |
| Incident | 97 | 100 | 100 | 82 |
| Replay | 94 | 100 | 100 | 82 |
| Field | 95 | 100 | 100 | 82 |
| Styleguide | 81 | 100 | 100 | 82 |

**Accessibility 100 and best-practices 100 on every screen**, consistent with the axe-core results
in `frontend/tests/redesign.spec.ts` (23/23 passing, zero violations on any redesign screen).

**SEO is 82 on every screen**, not screen-specific — it's the same `document-title`/`meta-description`
finding each time: this is a single-page app with one static `<title>` in `index.html` and no
per-route meta description, which is normal for this kind of app and not a redesign-v2 regression.
Not fixed here; fixing it means per-route `<title>`/meta management (e.g. via a head-management
library), which is a small but real addition — left for a follow-up, noted in `11_build_plan.md`.

**Performance is lower on Today (77) and Styleguide (81)** than the other screens. Investigated:
Today's largest-contentful-paint is ~5.8s in the Lighthouse run, driven by the same root cause on
both screens — the production bundle includes a ~1MB `maplibre-gl` chunk that loads on every
`/redesign/*` route because `App.tsx` imports the **legacy** `MapPage`/`DemoMap` (which use
MapLibre) at the top level, so it's in the same JS entry as the redesign routes even though no
redesign screen currently renders a real MapLibre map (`MapShell` is a plain placeholder — see
`PROGRESS.md`'s MapShell note below). This is a structural, whole-app bundling issue, not something
introduced by Today or Styleguide specifically, and fixing it means code-splitting `App.tsx`'s
legacy-route imports behind `React.lazy` — a real fix, but a separate, scoped task rather than part
of this review pass. Noted here rather than attempted, per the "catch regressions, not a full
perf-tuning pass" instruction for this check.

No other audit failures found (no unminified JS in the production build, no render-blocking CSS
beyond the single stylesheet, no layout shift on any screen, 0ms total blocking time everywhere).
