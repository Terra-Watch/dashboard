# 04. Information architecture

Scoped to the three-step product this brief defines. Deliberately smaller than the earlier `docs/02_screens.md` sitemap (which included teams, plans, admin SOP library, assistant) — those remain documented as a longer-term direction but are **out of scope** here and must not appear as if already built.

## Sitemap

| Route | Page | Step | Access |
|---|---|---|---|
| `/` | Landing | — | public |
| `/demo` | Guided demo (read-only, sample incidents) | — | public |
| `/today` | Today — ignition-risk forecast | 1 | range officer, control room |
| `/watch` | Watch — detection triage queue | 2 | control room |
| `/watch/:detectionId` | Detection detail | 2 | control room |
| `/field` | Field — assigned verification tasks (mobile/PWA) | 2 | field crew |
| `/field/:taskId` | Field verification form (offline-capable) | 2 | field crew |
| `/incidents` | Incident list (verified only) | 2→3 | control room, commander |
| `/incidents/:id` | Incident detail | 2→3 | control room, commander |
| `/incidents/:id/scenario` | Incident scenario (6/12/24/48h) | 3 | commander |
| `/replay` | Replay / evidence (4 development incidents) | — (evidence) | public, reviewer |
| `/replay/:incidentId` | Replay detail for one incident | — (evidence) | public, reviewer |
| `/about` | What RESQ does and does not claim | — | public |
| `/login` | Sign in | — | public |
| `/403`, `/404`, `/500`, `/offline` | System pages | — | all |

## Navigation per role

- **Range officer:** Today (home), Watch (read, to see what's happening in their cells), Incidents (read), Replay.
- **Control-room operator:** Watch (home), Incidents, Today (read), Replay.
- **Field crew:** Field (home, mobile-first, often the *only* route they use), nothing else — a deliberately minimal nav for weak-signal use.
- **Incident commander:** Incidents (home), Incident scenario, Replay, Today (read).
- **Reviewer/judge (no login needed):** Replay (home), Demo, About.

## URL structure

- Query-state for shareable views, mirroring the pattern already used in `docs/01_design_system.md`: `/today?region=OD-bargarh&band=high&d=2024-03-12`.
- Scenario state: `/incidents/124/scenario?horizon=24&wind=era5land_native&baseline=proximity`.
- Replay state: `/replay/E2024-135332?overpass=5&source=era5land_native`.

## Role switcher behaviour

- A visible switcher (not a hidden setting) in the top bar, since this is still a demo/pilot product with no live multi-tenant deployment: "Viewing as: Range officer / Control room / Field crew / Incident commander / Reviewer."
- Switching role changes nav and default landing route only — it does not fabricate different data; all roles see the same real (or honestly-labeled sample) data, scoped to what that role's screens show.
- This is an **open decision for Gate 1**: whether the real build needs actual authenticated roles (per `backend/app/routers/auth.py`'s JWT/role scaffolding) or whether, for a demo/pilot, a client-side role switcher is sufficient. See `11_build_plan.md` open decisions.
