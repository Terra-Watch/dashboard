# Lighthouse results — redesign-v2 screens

Run with `npx lighthouse` (headless Chrome, categories: performance, accessibility, best-practices, seo)
against a **production build** (`vite build` with `VITE_API_BASE_URL` pointed at a standalone
redesign+risk-router uvicorn instance, bypassing the Postgres-dependent main app the same way as
the original Phase 2 build — see that commit's message — served via `vite preview`). An initial
pass against the Vite **dev** server gave artificially low performance scores because dev mode
ships unbundled ES modules; those numbers are not reported, only the production-build ones are.

## Re-run after the real MapShell (MapLibre + PMTiles) replaced every map placeholder

| Screen | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Landing | 82 | 100 | 100 | 82 |
| Today | 68 | 100 | 100 | 82 |
| Watch | 65 | 100 | 100 | 82 |
| Incident | 76 | 100 | 100 | 82 |
| Replay | 79 | 100 | 100 | 82 |
| Field | 81 | 100 | 100 | 82 |
| Styleguide | 55 | 100 | 100 | 82 |

**Accessibility 100 and best-practices 100 on every screen**, consistent with
`frontend/tests/redesign.spec.ts` (31/31 passing, zero axe violations on any redesign screen,
including the new MapLibre canvases — each MapShell now gets a distinct accessible name via
`locale={{ 'Map.Title': label }}`, which axe's `landmark-unique` check caught failing on the
styleguide page before that fix, since two MapShells on one page both defaulted to the same
MapLibre-internal "Map" label).

**Performance is honestly lower than the previous pass** (was 77–98 on the five map screens with
the CSS-grid placeholder; is now 65–81). This is the real, not-hidden cost of "no placeholders on
map screens": every map screen now loads an actual MapLibre GL WebGL context and a real
`@protomaps/basemaps` vector style against the self-hosted PMTiles basemap, instead of rendering a
handful of coloured `<div>`s. Investigated via the Lighthouse trace (Today, representative):
- **Total page weight stays small** (1.1 MB) — the pmtiles library streams only the tiles in view
  via HTTP range requests, not the full 38 MB basemap file, so this isn't a download-size problem.
- **The cost is CPU**: `mainthread-work-breakdown` scores 0 (2.1s of main-thread work) and
  largest-contentful-paint is 3.6s, driven by MapLibre's GL style/shader setup and first paint of
  the vector tiles. Lighthouse's headless Chrome runs without GPU acceleration and applies 4x CPU
  throttling, which penalizes WebGL initialization heavily — this would read meaningfully better
  in a real browser on real hardware, but the honest Lighthouse number is what's reported here.
- **Styleguide is lowest (55)** because it renders two independent MapShell instances (two
  MapLibre GL contexts) on one page, roughly doubling that fixed WebGL-init cost; this is a
  styleguide-only artifact of showing two map states side by side, not something a real screen does.

Not fixed here: this is a real, inherent cost of the requirement (a real map instead of a
placeholder), not a bug. A follow-up could reduce it by lazy-mounting MapShell (don't initialize
MapLibre until the map scrolls into view) or trimming the vector style to fewer layers for a
"survey sheet" look (07_maps.md already specifies a muted, low-contrast basemap — the full
`@protomaps/basemaps` light style renders more than that calls for, e.g. full road-label typography
at a zoom range these screens don't need). Left as a named follow-up rather than attempted here, to
keep this pass's scope to "build the real map, not optimize it."

**SEO is 82 on every screen**, unchanged from before — the same `document-title`/`meta-description`
finding each time (single-page app, one static `<title>`, no per-route meta description); not a
redesign-v2 regression, not fixed here (noted in `11_build_plan.md`).

**The whole-app MapLibre-bundle-on-every-route issue from the previous pass is now moot**: that
finding was about the *legacy* app's MapLibre chunk loading even though no redesign screen used a
real map. Now that the redesign *does* use MapLibre for real, that chunk is legitimately needed on
every map screen; it's no longer dead weight, just required weight. Bundle code-splitting (so the
~1MB MapLibre chunk doesn't load on non-map redesign routes like Field's task list before the map,
or the legacy app's non-map routes) remains a real, separate opportunity, unchanged from before.
