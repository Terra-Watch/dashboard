# 05. Landing page

Read `01_narrative.md` and `04_information_architecture.md` first.

## Section-by-section wireframe with real copy

### 1. Hero

Desktop: two columns — left copy, right an interactive (pannable, zoomable) map strip showing today's ranked cells for the demo region, with a visible "Sample data" chip on the date. The map is interactive, not live — it renders an archived replay date, never a real-time feed.

```
RESQ                 How it works   Demo   Replay      [Sign in]
----------------------------------------------------------------
Three tools, not one.              |  [ map strip: ranked cells,  |
A daily rank of forest cells for   |    Very high / High / Mod,   |
tomorrow. A queue for satellite    |    date chip: "Sample data   |
and field detections. A scenario,  |    14 Apr 2024" ]            |
only after a human confirms a      |                               |
fire — shown next to a simple      |                               |
guess it did not beat.             |                               |
[See today's ranking] [See replay] |                               |
```

Headline (Noto Serif): "Three tools, not one." Subhead: "A daily rank of forest cells for tomorrow. A queue for satellite and field detections. A scenario — only after a human confirms a fire — shown next to a simple guess it did not beat." Primary CTA: "See today's ranking" → `/today`. Secondary CTA: "See the replay evidence" → `/replay`.

Mobile: stacked, map strip becomes a short fixed-height map (no pan on hero to save scroll), copy above.

### 2. Role switcher (right under hero)

"Who are you?" with four cards: Range officer, Control-room operator, Field crew, Incident commander. Each card: one line of job, link to the role's home page. This is navigation, not personalization of data — stated inline: "All roles see the same real data, scoped to what each screen shows."

### 3. The three-step flow (not "features" — a real sequence)

Three rows, each: icon, one sentence, a cropped screenshot. No cards, hairline dividers per the existing design system convention.

1. **Today.** "Forest cells ranked by risk for tomorrow — a priority list for patrols, not a prediction of where fire will start."
2. **Watch.** "Satellite detections and field reports land in one queue. Nothing becomes an incident until a person verifies it."
3. **Incident.** "Only a verified incident can run a spread scenario — shown as probability bands next to a simple distance-based guess, with the wind source and fuel assumption always visible."

### 4. "What we do not claim" (its own section, not buried in a footer)

Headline: "What RESQ does not claim." A plain list, same visual weight as the features above it, not smaller or greyed out:

- It does not predict where or when a fire will start.
- It does not confirm a fire — a detection is something to check, not something that happened.
- Its spread scenario is one uncalibrated simulation run. Tested against four real Indian fires, it did not beat a simple "fire stays near where it started" guess on three of them.
- The four test fires were used to build this tool. They are not a held-out, independent test.
- It never shows a forecast horizon longer than tomorrow. 24h and 48h only ever appear on a spread scenario, never on the forecast.

Closing line of the section: "See the full evidence." → `/replay`.

### 5. Evidence

A compact version of the replay headline table (per-incident AP/IoU, sim vs baseline) with a link to the full `/replay` page. Framed as: "We tested the spread simulator against four real fires. Here's exactly what happened."

### 6. Demo entry

"Try it with sample data." Single button → `/demo`, with a line: "No sign-in needed. Uses the same four real incidents shown in the replay evidence."

### 7. Footer

"Advisory forecast. Confirm with field observations." (verbatim from `docs/PRODUCT_RULES.md`) plus links: How it works, Replay evidence, Privacy, Status, data attributions (NASA VIIRS, NASA MCD64A1, ESA WorldCover, Copernicus DEM/ERA5, OpenStreetMap where used).

## Mobile layout notes

- Hero map strip: fixed 220px height, no interaction (tap to open full Today map).
- Role switcher: horizontal scroll of 4 cards instead of a grid.
- Three-step flow and "what we do not claim": single column, same content, no truncation of the claims list (these are the most important words on the page and must not be hidden behind a "read more").
