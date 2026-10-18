# What-if fire spread: the Control Room page

What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels. Spotting, crown fire, fuel-moisture change and suppression are not modelled.

Route `/app/whatif`, menu entry "What-if" for the Control Room only. It is absent from the menu and the page says it is switched off when the ops setting `scenario_enabled` is off (the same rule as the Scenario tab on an incident). Citizens and field officers get the usual "This area is for Control Room staff." page.

The page reads **no API data of its own**. The only calls are the ones the app already makes (sign-in state, `/api/ops/settings`, the notification bell). The area packs are static files under `/whatif/<area>/`. Nothing is written to the server; no incident, alert, assignment or the public map is read, created or changed.

## How to use it
1. **Area.** Pick Similipal, Almora or Ramnagar. A pack that fails to load shows a message with the reason and the others stay usable. Attribution text from the pack manifest (Copernicus DEM, ESA WorldCover, OpenStreetMap) is shown under the map and is inside every exported image.
2. **Ignition.** Click the map (snaps to a 30 m cell; water, built-up, bare and unmapped cells are refused with a message). Up to 10 ignitions. Or use "Place ignition at map centre".
3. **Wind.** Speed 0 to 60 km/h and the direction the wind comes FROM, by dial, number field or slider. Optional "The wind changes later": new speed and direction after N hours (engine wind schedule). The run uses 32 directions per cell above 10 km/h, else 16 (ENGINE.md: 16 directions cut the head of a strongly wind-driven fire; 32 roughly halves that error for about twice the run time).
4. **Time.** Slider 0 to the run length (6, 12, 24 or 48 h), Play/Pause and a speed. Nothing plays by itself. With reduced motion on, Play steps whole hours once per second.
5. **Read the map.** Colour = hours after ignition when the fire could arrive (darker earlier, lighter later), thin lines every hour (every 2 h on a 48 h run), the legend gives hour ticks. Numbers panel: burned area (km2), head reach and back reach (km, measured along the wind from the nearest ignition).
6. **Assets table.** Villages, roads and water, earliest first: "could reach in about X h" or "not reached in N h", plus whether it is reached by the selected time. A place counts as reached when the fire gets within 2 cells (about 60 m) of it (roads: of any cell along the line). Water does not burn; its row says when fire could reach the edge. Similipal has nothing mapped in OpenStreetMap, so the table says so.
7. **Fire lines.** "Draw fire line", click points, finish with a double-click or "Finish line"; the line is drawn into the barrier mask (8-connected, so it is closed; a one-cell gap lets fire through). Undo and Clear. Ignitions that end up on a line are left out of the run, with a warning.
8. **Compare.** "Add a wind case to compare" adds case B, then C (copying the case being edited). Outlines of all cases are drawn at the selected time with different line styles (A solid, B dashed, C dotted) as well as different colours; a table compares wind, burned area and the first assets reached.
9. **Share.** "Download image" saves the map as shown plus a caption band with area, hour, wind per case, data sources and the notice. "Copy scenario as note" puts a text note in the clipboard (and on screen) for pasting by hand. Neither goes to a server.

## Keyboard map
| Where | Keys |
|---|---|
| Anywhere | Tab / Shift+Tab in reading order: area, ignition, wind, fire lines, map, time, tables, share |
| Ignition list | Enter/Space selects an ignition; with it focused, Arrow keys move it one cell, Shift+Arrow five cells (a move onto a cell that cannot burn is refused with a message) |
| Place ignition without a mouse | "Place ignition at map centre" (pan the map with its own arrow keys first; plus/minus zoom) |
| Wind | Number fields (type a value) and sliders (arrows, Home/End) for speed and direction; the dial is a pointer shortcut only |
| Fire line without a mouse | "Add point at map centre" then "Finish line" |
| Time | Slider arrows; Play/Pause button; speed and run length selects |

## Colours and accessibility
All colours are CSS tokens (`--tw-*`); the arrival ramp is the outlook scale (dark to light). Nothing relies on colour alone: the ramp has a legend with hour ticks and words, contour lines mark hours, case outlines differ in line style and are named A/B/C in the legend and table, every status has words. Touch targets are at least 44 px. The notice banner is always visible (sticky). Axe (WCAG 2 A/AA) is checked in light and dark in `frontend/tests/whatif.spec.ts`.

## How it is built
- `frontend/src/features/scenarios/WhatIfPage.tsx` (page), `WindControl.tsx` (dial, fields, sliders).
- Pure helpers in `frontend/src/features/scenarios/whatif/`: `areas.ts`, `layout.ts` (corner coordinates to cells), `pack.ts` and `packLoader.ts` (parse and verify a pack), `ignition.ts`, `wind.ts`, `fireline.ts`, `assets.ts`, `ramp.ts`, `overlay.ts` (pixels for the burned-area picture), `note.ts`, `exportImage.ts`, `simJob.ts`, `simClient.ts` and `sim.worker.ts` (the engine runs in a Web Worker, one per wind case, with a main-thread fallback). Unit tests: `frontend/unit/whatifUi.unit.ts`.
- The burned area is a canvas (4 pixels per cell) turned into an image and placed on the MapLibre map with an image source at the pack's four corner coordinates. `MapView` got additive props only: `imageOverlay`, `lines`, `onMapReady`, `onMapDoubleClick`, `doubleClickZoom`.
- Pack integrity: with `crypto.subtle` (secure contexts and localhost) the SHA-256 of all three files is compared with the manifest and a mismatch refuses the pack. Without it the check is skipped and the page says so.

## Known limits
- Hindi and Odia text is a first draft written for this build and has not been reviewed by a native speaker.
- Speed of the first run depends on the machine (about 0.2 to 0.5 s on 334 x 334, up to about twice that for 32 directions or the 467 x 467 Ramnagar pack, per wind case). Runs happen in a worker, so the page stays responsive, but the picture updates when the run ends.
- Reach (head and back) is along the initial wind direction from the nearest ignition; with a wind shift or steep slopes the real head can point elsewhere.
- Drawing a fire line by double-click needs a mouse; keyboard users add points at the map centre.
- Fire-line points are cell centres; the line is a rasterised polyline, not a fixed width.
- A road or village that OpenStreetMap does not hold is not in the table. Reach of roads uses the line cells, so a long road is reached when any part is.
- The exported image is the map canvas at screen resolution; very small windows give a small image.
- Spread rates are uncalibrated assumptions (fuels.ts); the measured engine errors are in ENGINE.md and summarised in the "How this works" section on the page.
- Translations of the page strings are not machine-verified markers; they are first drafts.
