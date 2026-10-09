# RESQ UI, part 1: design system and app shell

Working name: RESQ. Rename freely; every product string lives in the i18n files.

## 1. Brief

**Users:** range officers, divisional officers, control-room operators and field guards in Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra and Jharkhand.

**Job:** decide where to send limited teams tomorrow, track satellite detections and incidents, and see how a fire might spread.

**Conditions:** phones in sunlight and weak networks; large screens in control rooms, often at night.

**Principles**
1. The map is the page. Panels sit on it; they never replace it.
2. Plain words. Say "detection" until someone verifies a fire.
3. Every number explains itself in one tap.
4. One-handed on a phone: reachable controls, 44 px targets, bottom sheets.
5. Never show more certainty than the data has. Risk is a ranking, not a probability.

## 2. Visual direction: "survey sheet"

Calm mineral paper, deep canopy green, and risk colours reserved for risk only. The one memorable element is the map itself (hero on the landing page, centre of the app). One quiet motif: faint topographic contour lines on the landing page, login and empty states. Nothing else is decorative. No gradients, no identical card grids, no all-caps labels, no arrows on buttons.

### Colour tokens (CSS variables, light theme)

| Token | Hex | Use |
|---|---|---|
| canopy | #1F5B4A | primary actions, links, selected state |
| canopy-deep | #143D32 | pressed state, header on dark |
| ink | #1D2A27 | body text |
| ink-muted | #55645F | secondary text (6:1 on white) |
| paper | #F1F4F2 | page background |
| sheet | #FFFFFF | panels, sheets, inputs |
| contour | #C7D1CC | borders and dividers |
| info | #1F6FB2 | water, spread footprint, informational banners |
| warn | #B26A00 | stale or caution banners |
| danger | #B0183A | errors, destructive actions |

### Risk ramp (map and chips; never reused for other meanings)

| Band | Colour | Map treatment |
|---|---|---|
| Low | #BFD8CF at 25% | faint fill; grid lines only at zoom 9+ |
| Moderate | #E9B824 | 35% fill |
| High | #E5701F | 55% fill, 1 px outline |
| Very high | #B0183A | 70% fill, diagonal hatch, 2 px outline |

Bands are always written as words next to the colour. Hatch and outline weight carry the meaning for colour-blind users.

### Dark theme
Derived tokens: background #101C18, sheet #16251F, ink #E4ECE8, contour #2E4039. Same risk ramp. Offer "Auto / Light / Dark" in settings; default Auto.

### Type
- **Noto Serif**: page titles and landing headlines (weight 600).
- **Noto Sans**: everything else (400, 500, 600).
- Both families cover Latin, Devanagari (Hindi, Marathi), Telugu and Odia, so all five languages look consistent. Self-host and subset by script with `unicode-range`.
- Scale (px): 12, 14, 16, 18, 22, 28, 36, 48. Inputs are 16 px minimum on mobile.
- Tabular numerals for all data (`font-variant-numeric: tabular-nums`). No monospace for labels.
- Line length at most 72 characters. Sentence case everywhere.

### Shape, space, depth
- 4 px spacing base. Radii: 4 px (chips, map controls), 8 px (buttons, inputs), 14 px top corners on bottom sheets and side sheets. Tables have no radius.
- Lists use hairline dividers, not cards. Floating panels over the map get one shadow: `0 8px 24px rgba(16,28,24,.16)`. Flat surfaces get none.

### Icons
Lucide, 20 px, 1.5 px stroke. Custom icons: priority cell, detection, incident pin.

### Motion
- Map fly-to 600 ms; sheet snap 200 ms ease-out; skeleton loaders for loading.
- Landing hero: one orchestrated moment (risk cells appear band by band over about 1.2 s). Nothing else animates on its own.
- Simulation footprints never autoplay: show the 12-hour frame with a Play button.
- Respect `prefers-reduced-motion` everywhere.

### Accessibility floor
WCAG 2.2 AA, 44 px targets, visible focus ring (2 px canopy with 2 px white offset), full keyboard use, `lang` attribute per locale, labels on every control, zoom to 200% without loss. **Every map fact is also available as a list** ("Priority list" view) for screen-reader users and low-bandwidth mode.

## 3. Map symbology

| Thing | Symbol | Notes |
|---|---|---|
| Risk cell | filled square per ramp | 5 km grid |
| Priority cell | thick ink outline plus rank number | rank by risk among selected cells |
| Satellite detection | violet (#6B2FA0) ring, 12 px | opacity by age: under 6 h solid, 6 to 24 h 70%, 1 to 3 days 40%. Popup: time (IST), "Satellite detection, not yet verified" |
| Incident | teardrop pin with glyph | hollow = reported, filled crimson = verified, amber with arrow = responding, blue = contained, grey check = closed. Glyph and fill both change |
| Team | teal (#137C86) circle with initials | |
| Base / check post | square | |
| Watchtower | triangle | |
| Water source | droplet in info blue | |
| Village | small dot with label from zoom 11 | |
| Roads | grey lines, weight by class | |
| Boundaries | state solid, district dashed, division dotted | |
| Wind (forecast) | arrow with speed label | |
| Spread estimate | nested info-blue footprints for 3, 6, 12 h, wind arrow | "Estimated spread" label always visible |
| Selected | white plus ink double outline | |

Basemap options: Map, Satellite, Terrain. Check each provider's licence and attribution before choosing one, and always show OpenStreetMap and data attributions.

## 4. App shell

### Breakpoints
- Under 640 px (phone): bottom tab bar (Map, Plan, Alerts, Incidents, More) and bottom sheets with three snap points (peek, half, full).
- 640 to 1024 px (tablet): collapsed icon rail, side sheet 360 px.
- Over 1024 px (desktop): labelled left rail, side panel 400 px, top bar.

### Top bar (desktop and tablet)
Logo, region selector (State > District > Division), **forecast date control**, place search, notifications bell, language menu, user menu.

### Forecast date control
- Chip showing the forecast date, previous and next day arrows, and "Updated 06:40 IST" text.
- Demo mode: limited to the sample dates, with a banner "Sample data from a past date".

### Banners (stack in this priority, show at most two)
1. Maintenance
2. Offline: "Offline. Showing data saved at 06:40. Changes will sync when you reconnect."
3. Stale forecast (older than 36 h): "This forecast is out of date. Do not rely on it."
4. Demo: "Sample data from 14 Apr 2024."

### Footer line (every authenticated page, small, bottom of side panel on map)
"Advisory forecast. Confirm with field observations."

### Global features
- **Command palette** (Ctrl or Cmd + K): jump to places, cells, incidents, teams, pages.
- **Notifications centre**: alerts, assignments, incident updates, system notices; mark read; filter.
- **Assistant button** on every page, opens the assistant drawer with the current context attached (cell, incident, plan).
- **Keyboard shortcuts**: `/` search, `[` and `]` previous and next day, `L` layers, `P` priority list, `?` shortcut help.
- **Shareable URL state**: `/app/map?d=2024-03-12&r=OD-bargarh&layers=risk,det&sel=cell:1234&k=50&z=9&c=21.5,83.9`.

### Vocabulary (use consistently)
Priority cells, Detection (until verified), Incident, Plan, Brief, Estimated spread, Team, Base. Buttons say what they do: "Add to plan", "Create incident", "Save changes". Toasts repeat the verb: "Added to plan".

### Languages
English, Hindi, Telugu, Odia, Marathi. i18next with ICU plurals; dates in IST; metric units; numbers in Western digits. Machine-translated drafts of safety messages must be reviewed by native speakers before release.

### Technology
React + TypeScript + Vite; Tailwind with the tokens above as CSS variables; shadcn/ui (Radix) primitives; `react-map-gl/maplibre`; TanStack Query; React Router; Zustand for UI state; react-hook-form + Zod; i18next; date-fns-tz; Workbox PWA; Playwright for end-to-end tests.
