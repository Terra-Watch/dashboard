# Product rules

Updated 2026-11-11. The product is early warning and response for forest fires (see the root README).

- Software suggests, people decide. A model gives a chance, a ranking or a sentence; it never verifies, assigns, dispatches or announces. An action goes through a person into an ordinary check.
- Never show research metrics or raw model scores in the UI. Show a chance in plain words ("about 3 in 10") and a level.
- Forecast levels are fixed cut-offs on a calibrated chance: moderate from 10 %, high from 30 %, extreme from 60 %. They are not ranks against the rest of the country. Areas where the forecast is less reliable are drawn differently and say so.
- Say what a number is not. A level is the chance that a satellite detects a fire in the area, not where inside it, how big or how long. A spread outline is a ranking of cells, not how far or how fast.
- Active fires show what the satellite saw. No arrival times and no "reaches X in N hours". Where it may spread next is shown only when a live model has produced it.
- Every satellite detection is kept and shown. Sorting into groups never deletes; known heat sources and detections outside forest are off by default and counted.
- A silent lookout station is a gap, not quiet. A sensor reading or a sound classification is a prompt to check, not a fire.
- Never invent operational data. Use an empty state when it is unavailable, and show the age of every source.
- Status and level are never shown by colour alone: a mark and a word go with every colour.
- The map is light by default. Dark terrain and satellite imagery are options.
- Footer on forecast pages: "Advisory forecast. Confirm with field observations."
