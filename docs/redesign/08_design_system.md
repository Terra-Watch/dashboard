# 08. Design system

Builds on `docs/01_design_system.md`'s visual language (kept: "survey sheet" palette, Noto Serif/Sans for 5-language coverage, 4px spacing base, Lucide icons) but narrows scope to the three-step product and adds the trust/replay components this brief requires that didn't exist before (TrustBadge, AssumptionsPanel, BaselineToggle, StepIndicator, SyncQueue, WindArrowsControl, BriefingExport).

## Tokens

### Colour (light theme — same base tokens as `01_design_system.md`, reused verbatim where they already fit)

| Token | Hex | Use |
|---|---|---|
| canopy | #1F5B4A | primary actions, links, selected state |
| canopy-deep | #143D32 | pressed state, header on dark |
| ink | #1D2A27 | body text |
| ink-muted | #55645F | secondary text (6:1 on white) |
| paper | #F1F4F2 | page background |
| sheet | #FFFFFF | panels, sheets, inputs |
| contour | #C7D1CC | borders and dividers |
| info | #1F6FB2 | water, wind arrows, informational banners |
| warn | #B26A00 | stale/caution banners (e.g. "baseline hidden") |
| danger | #B0183A | errors, destructive actions |

### Risk ramp (ignition-risk forecast only — never reused elsewhere)

| Band | Colour | Colour-blind-safe cue |
|---|---|---|
| Low | #BFD8CF @ 25% | no outline |
| Moderate | #E9B824 | 35% fill, no outline |
| High | #E5701F | 55% fill, 1px outline |
| Very high | #B0183A | 70% fill, diagonal hatch + 2px outline |

Bands always labeled in words next to the colour; hatch/outline weight — not hue alone — carries the meaning, verified against a deuteranopia/protanopia simulation before ship.

### Probability-band ramp (spread scenario only — distinct hue family from the risk ramp so the two can never be confused)

| Band | Colour | Colour-blind-safe cue |
|---|---|---|
| 0-20% | #D8E3EC @ 20% | no pattern |
| 20-50% | #7FA8C9 | sparse dot pattern |
| 50-80% | #3D6E97 | medium dot pattern |
| 80-100% | #16314A | dense dot pattern + 1px outline |

Chosen as blues (vs the risk ramp's yellow/orange/red) specifically so a user glancing at a scenario map never mistakes a probability band for a risk band — this is a trust-safety requirement, not a stylistic one.

### Trust scale (badges, not a gradient — these are discrete labeled states, never blended)

| Level | Token colour | Label |
|---|---|---|
| Forecast | canopy (#1F5B4A), outline only, no fill | "Rank for tomorrow" |
| Unverified detection | ink-muted (#55645F), outline only | "Not yet verified" |
| Verified incident | canopy solid | "Verified" |
| Uncalibrated scenario | warn (#B26A00), solid badge, persistent | "Uncalibrated scenario" |
| Baseline/evidence | ink (#1D2A27), outline | "Baseline" / "Replay evidence" |

### Type, spacing, elevation, motion, dark/light

Unchanged from `01_design_system.md` §2: Noto Serif (titles)/Noto Sans (body), scale 12-48px, tabular numerals, 4px spacing base, 4/8/14px radii, one shadow token for floating panels, dark theme derived tokens (#101C18 bg / #16251F sheet / #E4ECE8 ink / #2E4039 contour), map fly-to 600ms, sheet snap 200ms, `prefers-reduced-motion` respected everywhere, simulation footprints never autoplay (Play button required).

## Component inventory

Each entry: props, states (default/hover/focus/loading/empty/error/offline/stale), a11y notes.

### MapShell
- **Props:** `basemap`, `center`, `zoom`, `layers[]`, `onLayerToggle`, `attribution`.
- **States:** default; loading (tile shimmer); error ("Map tiles did not load. Check your connection."); offline (last-cached tiles, banner above map).
- **A11y:** keyboard pan/zoom via arrow keys + `+`/`-`; every visual fact also available via `PriorityList`/table fallback per screen.

### LayerPanel
- **Props:** `layers: {id, label, status: 'available'|'unavailable', visible}[]`, `onToggle`.
- **States:** default; a layer marked `unavailable` renders disabled with "Unavailable" suffix, never silently hidden.
- **A11y:** each toggle is a real `<input type=checkbox>` with a visible label, not an icon-only button.

### RiskCell legend
- **Props:** `bands: {label, colour, pattern}[]`.
- **States:** static (no loading/error — legend is local data).
- **A11y:** colour + pattern + text label together; legend itself is in the tab order so screen readers reach it.

### DetectionCard
- **Props:** `source: 'satellite'|'field'`, `time`, `confidence?`, `verified: boolean`, `age`, `riskCellOverlap?`.
- **States:** default; hover/focus (elevate); loading (skeleton row); stale (age-based warn tint after a configurable threshold).
- **A11y:** "Not yet verified" text is never colour-only; it's a text badge.

### QueueList
- **Props:** `items: DetectionCard[]`, `sortBy`, `filter`.
- **States:** default; empty ("No open detections right now"); loading (skeleton rows); error ("Detection feed did not update — last updated [time]"); offline (desk role, shows reconnect banner).
- **A11y:** full keyboard navigation (arrow keys between rows, Enter to open).

### VerifyActions
- **Props:** `onVerify`, `onDismiss`, `onEscalateToField`, `requiresEvidence: boolean`.
- **States:** default; disabled (if evidence required and missing, with inline reason); loading (submitting); error (submission failed, retry).
- **A11y:** each action is a distinct labeled button, not a dropdown, since these are high-stakes/low-frequency actions.

### TimelineSlider
- **Props:** `stops: [6,12,24,48]`, `value`, `onChange`, `unit: 'h'`.
- **States:** default; focus (visible ring); disabled (scenario not yet run).
- **A11y:** native range semantics (`role=slider`, `aria-valuenow/min/max/text`), arrow-key stepping between the 4 fixed stops only (not continuous).

### ProbabilityBand legend
- **Props:** `bands` (see token table above).
- **States:** static.
- **A11y:** same pattern+text+colour rule as RiskCell legend.

### WindArrowsControl
- **Props:** `visible`, `onToggle`, `hour`, `speed`, `direction`.
- **States:** default on; loading (if wind data not yet loaded for the hour, show faint placeholder arrows, never a guessed value).
- **A11y:** arrow directions are also exposed as text ("Wind from 173°, 1.6 m/s") for screen readers, since direction-by-rotation alone isn't accessible.

### BaselineToggle
- **Props:** `checked` (default true), `onChange`, `label`.
- **States:** default (on); off (shows a persistent "Baseline hidden" reminder chip elsewhere on screen — see `06_simulation_ui.md`).
- **A11y:** real checkbox/switch, not a decorative toggle; tooltip content also reachable via focus, not hover-only.

### AssumptionsPanel
- **Props:** `items: {label, text, status}[]`, `collapsed` (default true), `badgeCount`.
- **States:** collapsed (default, with count badge); expanded; (no loading/error — content is static per incident).
- **A11y:** disclosure pattern (`aria-expanded`, `aria-controls`), focus moves into panel content on expand.

### TrustBadge
- **Props:** `level: 'forecast'|'unverified'|'verified'|'scenario'|'baseline'`, `text` (defaults to the exact wording table in `01_narrative.md`).
- **States:** static, persistent, non-dismissible on scenario/replay screens specifically (dismissible elsewhere is not allowed either, but scenario/replay enforce it most strictly since that's the highest overclaiming risk).
- **A11y:** rendered as text, not colour-only; high contrast against its background in both themes.

### StepIndicator
- **Props:** `steps: ['Forecast','Detection','Verified incident','Scenario']`, `current`.
- **States:** static; current step visually bold + `aria-current="step"`.
- **A11y:** implemented as an ordered list with the current step announced.

### OfflineBanner
- **Props:** `lastSyncedAt`, `message` (defaults to "Offline. Showing data saved at [time]. Changes will sync when you reconnect." from `01_design_system.md`).
- **States:** shown/hidden based on connectivity; stacked with at most one other banner per the existing banner-priority rule.
- **A11y:** `role="status"`, announced on appearance.

### SyncQueue
- **Props:** `pendingItems: {id, idempotencyKey, type, capturedAt, status: 'pending'|'syncing'|'synced'|'failed', attempts, onRetry}[]`. Every queued item is created client-side with a UUID `idempotencyKey` at capture time, before any network attempt — this is what lets a retried or duplicated sync be deduped server-side instead of double-writing (see `10_backend_contract.md`).
- **States:** empty (nothing queued); **pending** (queued, not yet attempted); **syncing** (attempt in flight); **synced** (brief success state, then clears); **failed** (retry button, error reason, attempt count shown — same `idempotencyKey` is resent on retry, never a new one).
- **A11y:** live region announces status changes ("1 report waiting to sync" → "Synced"); the retry button on a failed item is reachable by keyboard and labeled with the item's capture time, not just "Retry".

### PhotoCapture
- **Props:** `maxPhotos` (5, matching existing `02_screens.md` incident-creation limit), `onCapture`, `compressed: boolean`.
- **States:** default; capturing; captured (thumbnail + remove); error (camera access denied — explain why, how to fix); offline (capture works, upload queues via SyncQueue).
- **A11y:** captured photo thumbnails have alt text ("Photo 1 of 3, captured [time]").

### BriefingExport
- **Props:** `format: 'image'|'pdf'`, `includesLabels: true` (not configurable — labels/caveats are always baked in), `onExport`.
- **States:** default; exporting (progress); success (toast + download); error (retry).
- **A11y:** export button clearly labeled; resulting file alt-text/metadata includes the trust badge text.

### RoleSwitcher
- **Props:** `roles: [...]`, `current`, `onChange`.
- **States:** default; open (dropdown or card list per `04_information_architecture.md`); static copy stating "all roles see the same real data."
- **A11y:** proper `<select>` or listbox pattern, not a custom div-based dropdown without keyboard support.

### EmptyState
- **Props:** `message`, `action?`.
- **States:** the single state it represents; message always says what to do next, never just "Nothing here."

### Toast
- **Props:** `message`, `variant: 'success'|'error'|'info'`, `duration`.
- **States:** entering/visible/exiting; persists longer (or is not auto-dismissed) for error variants.
- **A11y:** `role="status"` (info/success) or `role="alert"` (error), not purely visual.

### Dialog
- **Props:** `title`, `children`, `onClose`, `destructive?: boolean`.
- **States:** open/closed; destructive actions require explicit confirm text, not just a default-focused "OK".
- **A11y:** focus trap, `Escape` closes, returns focus to the triggering element.
