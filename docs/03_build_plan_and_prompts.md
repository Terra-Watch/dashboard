# RESQ UI, part 3: build phases and agent prompts

Put the three files in `/website/docs/ui/` so the agent can read them.

## Master prompt (paste at the start of every UI task)

```
UI BUILD for the RESQ dashboard in /Users/kireeti/Desktop/Projects/RESQ/website.
Read docs/ui/01_design_system.md and docs/ui/02_screens.md first. Follow them exactly: tokens, fonts, vocabulary, states and copy.

RULES:
1. Do not change the design system, routes or vocabulary without asking me.
2. No research metrics or model scores in the UI. Risk is shown as bands only.
3. Every screen implements loading, empty, error and (where listed) offline states.
4. No fake data in production. A dev fixture is allowed only behind DEV_FIXTURE=1 and shows a "SAMPLE DATA" watermark.
5. Accessibility: keyboard use, visible focus, 44 px targets, labels, lang attribute, reduced motion. Every map fact also available as a list.
6. All strings go through i18n (en, hi, te, or, mr); only English needs to be filled now.
7. Never write to /Users/kireeti/wildfire-research. No git push. No secrets in the repo.
8. Be fast. Small diffs. State assumptions in one line. Ask at most one question. Add one Playwright smoke test per phase. Report files changed, how to run, and what is still stubbed.
```

## Phases

| Phase | Builds | Done when |
|---|---|---|
| U0 | Foundations: tokens, fonts, dark theme, i18n, app shell, router, auth guard, banners, command palette, API client with dev fixture | shell renders on phone and desktop; theme and language switch work |
| U1 | Public site: landing, demo, about-forecast, help, privacy, terms, contact, status, 404 | landing hero map is interactive on a mid-range phone |
| U2 | Auth: login, request access, forgot and reset, accept invite, two-step sign-in, session expired, onboarding | all auth paths work with a test backend |
| U3 | Map: layers, date control, priority cells, cell panel, detection panel, priority list, search, URL state, offline banner | top-50 list matches the map; deep links restore state |
| U4 | Brief, notifications centre, settings (including offline data) | brief previews and exports |
| U5 | Patrol plans: planner, detail, print preview, PDF and CSV | generated plan can be edited and printed |
| U6 | Alerts and incidents: feed, rules, incident list, new, detail, offline queue | an incident created offline syncs later |
| U7 | Spread: what-if page and incident tab, footprint animation | stub runner produces frames; real runner swaps in |
| U8 | Assistant and admin consoles | cited answers; admin can invite a user and upload an SOP |
| U9 | Polish: accessibility audit, performance, PWA install, end-to-end tests, system pages | no serious axe issues; 30 fps on the target phone |

U0 first, then U1 and U2 in parallel, then U3. U4 to U8 depend on U3 and the backend tasks (T2 to T8); use the dev fixture until each backend piece exists.

## Phase prompts

**U0**
```
Phase U0. Implement section 2 and 4 of 01_design_system.md: CSS variable tokens (light and dark), self-hosted Noto Serif and Noto Sans subset by script, Tailwind config reading the tokens, i18next with the five locales, the app shell (rail, top bar, bottom tabs under 640 px, banners in priority order, footer line), router with the route table in 02_screens.md section 1, auth guard by role, command palette, notification bell stub, and an API client that uses a dev fixture when DEV_FIXTURE=1.
```

**U1**
```
Phase U1. Build the public pages from section 3 of 02_screens.md. The landing hero is the live demo map (sample date, read-only, bands drawing in once over about 1.2 s). Build /demo as the same map screen in read-only mode with locked features. Write the copy as specified. Use topographic contour lines only as a quiet background motif.
```

**U2**
```
Phase U2. Build section 4 of 02_screens.md: login, request access, forgot and reset, accept invite, two-step sign-in (TOTP), session expired, onboarding with a skippable tour. Use the exact error messages. Rate-limit messaging must match.
```

**U3**
```
Phase U3. Build section 5 of 02_screens.md: map with the Show control, priority cells slider, layers panel, legend, basemap switch, locate, measure; cell panel and detection panel; priority list view; place search; URL state as defined in 01_design_system.md. Risk cells: one GeoJSON fill layer (about 17,764 cells), geometry static, bands loaded per date. Simulation frames are not part of this phase.
```

**U4 to U8** (one prompt each, same pattern)
```
Phase U<n>. Build sections <list> of 02_screens.md exactly. Keep to the vocabulary, states and copy. Stub anything that needs a backend piece that does not exist yet and list the stubs.
```
Sections: U4 = 6, 14 and the notification centre. U5 = 7. U6 = 8 and 9. U7 = 10. U8 = 13 and 15.

**U9**
```
Phase U9. Run an accessibility audit (axe plus keyboard walkthrough), fix serious issues, test the landing hero and the simulation animation on a mid-range phone via vite --host and report fps (add a dev-only fps meter shown with ?debug=1), set up PWA install and offline caching for the shell, add Playwright flows for the three key flows in section 17, and finish the system pages.
```

## Assumptions to confirm before U1
1. Product name and logo (RESQ is a working name).
2. The wording of "Is this an official government system?" on the landing page.
3. Whether access requests are approved by you or by a department admin.
4. Who translates and reviews Hindi, Telugu, Odia and Marathi text.
5. Which basemap and satellite imagery provider you will use (check licence and cost first).
