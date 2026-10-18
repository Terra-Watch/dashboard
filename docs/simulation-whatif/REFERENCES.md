# References for the what-if simulation

Search summaries only (read this session, not full papers). Verify before citing in a paper.

| Topic | Source | Used for |
|---|---|---|
| MTT method | FlamMap technical note, https://owfflammaphelp62.firenet.gov/Tech_Topics/Tech_MTT.htm ; IFTDSS, https://iftdss.firenet.gov/firenetHelp/help/pageHelp/content/20-models/mtt/techdocmtt.htm | Minimum-travel-time spread (Huygens wavefront, travel-time paths) |
| Reference equations | pyretechnics (EPL-2.0), https://github.com/pyregence/pyretechnics ; ELMFIRE (EPL-2.0), https://github.com/lautenberger/elmfire | Reference answers for engine checks; code not copied |
| In-browser or web simulators | ForeFire (GPL-3.0, server engine with web client), https://forefire.univ-corse.fr/ ; web-based wildfire system, https://digitalscholarship.unlv.edu/physastr_fac_articles/43 | No open in-browser terrain-aware simulator found |
| Fuel model limits | Rothermel developed for northern-hemisphere conifers, https://egusphere.copernicus.org/preprints/2025/egusphere-2025-4855/egusphere-2025-4855-AC1-supplement.pdf ; standard models tend to over-predict, https://worldwidescience.org/topicpages/s/surface+fire+spread.html ; calibration beats standard models, https://dl.uc.pt/rest/bitstreams/11170031/retrieve | Label spread rates uncalibrated; calibrate later |
| Hindcast behaviour | Portugal 2012 fire, https://idlcc.fc.ul.pt/publications.php?id=317 ; Idaho Soda fire fuel maps, https://pubs.usgs.gov/publication/70237010 ; Iran, https://doaj.org/article/b428e63ad35e4c76a58edf94fff5cf5e ; Cell2Fire 2025, https://www.nature.com/articles/s41598-025-05706-6 | Start from satellite fire points; fuel map dominates accuracy; suppression not modelled |
| Anderson length-to-breadth | Anderson (1983) via `features/scenarios/engine/ellipse.ts` (units note there) | Ellipse shape |
| Rothermel (1972), Finney (2002) | memory, unchecked | Spread equations, MTT |
