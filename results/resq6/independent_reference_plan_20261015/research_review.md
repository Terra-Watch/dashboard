# RESQ6 independent reference research review

Prepared 2026-10-15. Development cases only. No catalog search, acquisition API, download, simulation, or held-out-data access was performed.

## Recommendation and candidate ranking

Use **E2024-131853 as first catalog-screening candidate only**. This choice is not based on model score. It combines a prescribed ignition inside the existing 24 h target, 375 × 375 cells at 30 m (11.25 km), no reported 24 h edge contact, locally complete MCD64A1 model-cell-center coverage with matching recorded LAADS listing sizes, and no pre-origin detection-association warning in the reviewed audits. Important counter-evidence: local MCD64A1 has zero positive burn-date pixels in this domain; that is not evidence of no fire. No independent image, perimeter, or 24 h reference has been verified. Its VIIRS pass at 23.37 h after proxy origin is close to t+24 but is the current target source and is not independent.

| Rank | Incident | Evidence | Limitations |
|---:|---|---|---|
| 1 | E2024-131853 | Ignition inside selected target; 375² 30 m grid; no 24 h edge contact; local MCD64A1 coverage 100%, source listing size matches; no pre-origin association warning. | MCD has zero positive pixels locally; no S2/Landsat/CLMS granule or perimeter confirmed; VIIRS target has no valid-view mask and is not independent. |
| 2 | E2023-084925 | MCD64A1 covers 100% of model-cell centers and has four positive native pixels in-domain (DOY 70×2, 71×1, 76×1); 388² 30 m domain. | Positive-pixel date uncertainties 1/2/6 days; pre-origin VIIRS detections raise event-association ambiguity; selected 24 h VIIRS target is 11.15 h early. |
| 3 | E2024-155286 | Prescribed point inside selected VIIRS mask; MCD tile extent covers model centers. | MCD fetch metadata has null LAADS listing bytes/size mismatch; zero local positives do not prove no burn; 24 h target is 11.23 h early. |
| 4 | E2024-135332 | Local MCD64A1 has 12 positive native centers (DOY 68×10, 69×2; recorded 1-day uncertainty). | Only 83.69% model-center coverage; prescribed ignition outside both selected 24/48 h VIIRS masks; 3/60 members touch boundary at 48 h; 24 h target is 10.28 h early. |

Ranking criteria: event/initial-state provenance, local reference evidence/quality, domain/edge risk, timing uncertainty, and ability to avoid assumptions. AP/Brier outcomes were not used. Ranking selects a metadata-screening order, not a valid evaluation case.

## Source comparison: documented facts, inference, unknowns

| Source | Confirmed properties (published docs) | Inference for this study | Must still inspect |
|---|---|---|---|
| Copernicus Global Burnt Area v3.1 (historical 2023–2025) | CLMS lists a global daily 300 m product (grid 1/336°) for 2023–2025, now marked superseded; the monthly v3.1 archive spans 2019–2025. The daily product is Sentinel-3 OLCI/SLSTR based, and its algorithm documentation lists NASA VIIRS active-fire products among the inputs. | Useful corroboration, but not an independent validation target relative to a VIIRS-derived benchmark. Daily product date is not an exact fire-arrival time; the monthly product is still less temporally specific. | Exact granule/version, date semantics, coverage, burn-date/quality values, fill/no-data and input lineage. No local granule found. The current daily v4 is 2025-present and cannot cover these 2023–24 events; monthly v4 has historical coverage but remains a coarse product. |
| Sentinel-2 L2A | Surface reflectance; visible/NIR B02/B03/B04/B08 at 10 m, SWIR B11/B12 and SCL at 20 m; ESA states the two-satellite constellation revisit is 5 days at the equator. Sentinel Hub's L2A collection documents SCL and a 20 m Sen2Cor cloud-probability layer. | Best open optical spatial-detail candidate for an independently interpreted post-event scar, with sensor independence from the current VIIRS detections. | Actual scene/time, AOI coverage, cloud/smoke, SCL/QA, registration, scar separability and attribution. No acquisition is confirmed; a scar is not automatically a t+24 perimeter. |
| Landsat 8/9 Collection 2 Level-2 | USGS SR at 30 m with QA_PIXEL/QA_RADSAT and scale/offset metadata; each satellite repeats every 16 days, pair offset for nominal 8-day coverage. Public/no-cost under USGS policy. | Useful independent optical alternative and native scale close to model cells. | Actual scene/coverage/time, clouds/smoke, QA, product scaling and metadata; cadence does not guarantee a clear target-time image. |
| Authority incident perimeter/progression | No local event perimeter was found. New public-source screening found Telangana Forest Department FMIS pages for fire point ground-truthing, a 2024 fire book, and detailed fire reports/photos; the actual record for this event, fields, geospatial extent, and reuse terms remain unverified. FSI's Large Forest Fire system says it tracks estimated event boundaries from SNPP-VIIRS active-fire pixels, so that product is not independent of the current VIIRS target. FSI's searchable fire-point page advertises data only from 2025-11-01, after this incident. | A Telangana field-verified incident record would be the strongest prospective reference if it provides actual timestamped boundaries, source method, coverage and uncertainty. FSI's VIIRS-derived boundary can aid event association, not independent validation. | Verify event-code/location crosswalk and actual historical record through an owner-approved official channel; confirm timestamps, geometry, field vs satellite provenance, survey accuracy, covered/unknown area, and license. No request sent and no event record confirmed. |
| NASA FIRMS VIIRS | Nominal 375 m active-fire detection pixels with UTC acquisition time; detection locations are not perimeters; clouds, smoke, canopy and overpass gaps can cause missed detections. | Use for chronology/event discovery only. | Existing target is derived from this family; it cannot independently validate itself; no-detection is not known-unburned without view masks. |
| MODIS MCD64A1 C6.1 | Monthly global ~500 m burned-area product, ordinal burn date, QA and burn-date uncertainty. | Independent product/sensor cross-check, not ground truth. | Local HDF QA/extent already inventoried; monthly date uncertainty cannot establish exact hour-24 burn arrival; QA is not a per-acquisition clear-view mask. |

The best prospective independent reference is a timestamped, field-verified Telangana Forest Department perimeter/progression record if one exists; otherwise Sentinel-2 L2A pre/post scenes are the strongest imagery candidate, with Landsat 8/9 as alternative. Neither an incident-specific authority record nor a scene acquisition has been verified. The state portal exposes query/report entry points, but that establishes only a search path, not that the event is recorded or that reports contain a perimeter. Copernicus BA v3.1 is supplemental because its VIIRS inputs compromise independence from the current VIIRS target.

## Feasibility

No current local reference supports an approved physical-spread comparison at nominal 24 h. S2's nominal equatorial revisit is 5 days; Landsat 8 and 9 each have a 16-day cycle offset to provide nominal 8-day combined coverage. Neither promises an acquisition at t+24, and cloud/smoke can reduce usable coverage. A valid post-event optical scar could support an interval-censored *post-event* comparison if an owner-approved temporal rule allows it; it cannot be relabeled as exact t+24. A metadata-only search should first use the official Telangana FMIS query/report pages to resolve an event record and then Copernicus Data Space / USGS catalogs for scene IDs; no scene-catalog query or acquisition API was executed here. The Telangana 2024 Fire Book link was not fetched: the public page reported a 1,358,601,144-byte PDF, which exceeded the browser's response-size guard.

## Licensing and attribution

CLMS policy requires source acknowledgment, disclosure of modifications and appropriate dataset citation/DOI, without implying EU endorsement. Follow current Sentinel legal notice and attribution. USGS Landsat policy provides public-domain/no-cost data; retain IDs and source citation. Cite NASA FIRMS/LP DAAC products; do not infer broad redistribution rights for derived products. Obtain explicit terms for authority perimeters. Re-check terms for exact version before acquisition/publication.

## Authoritative and methodological sources (accessed 2026-10-15)

- [CLMS Global Burnt Area v3.1 daily archive (2023–2025; marked superseded)](https://land.copernicus.eu/en/products/vegetation/burnt-area-v3-1-daily-300m)
- [CLMS Global Burnt Area v3.1 monthly archive (2019–2025; marked superseded)](https://land.copernicus.eu/en/products/vegetation/burnt-area-v3-1-monthly-300m)
- [CLMS Global Burnt Area v4 daily (2025–present)](https://land.copernicus.eu/en/products/vegetation/burnt-area-v4-daily-300m)
- [CLMS Burnt Area v3.1 Product User Manual](https://land.copernicus.eu/en/technical-library/product-user-manual-burnt-area-version-3.1/%40%40download/file)
- [CLMS Burnt Area v3.1 ATBD](https://land.copernicus.eu/en/technical-library/algorithm-theoretical-basis-document-burnt-area-version-3.1/%40%40download/file)
- [CLMS data policy](https://land.copernicus.eu/en/data-policy)
- [Copernicus Sentinel terms](https://dataspace.copernicus.eu/terms-and-conditions)
- [Copernicus Data Space Sentinel-2 L2A docs](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html)
- [ESA Sentinel-2 constellation and revisit](https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Satellite_constellation)
- [ESA Sentinel-2 product information](https://sentinels.copernicus.eu/sentinel-data-access/sentinel-products/sentinel-2-data-products)
- [Sentinel-2 L2A ATBD](https://sentinels.copernicus.eu/documents/247904/446933/Sentinel-2-Level-2A-Algorithm-Theoretical-Basis-Document-ATBD.pdf)
- [USGS Landsat Collection 2 Level-2](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products)
- [USGS Landsat Collection 2](https://www.usgs.gov/landsat-missions/landsat-collection-2)
- [USGS Landsat acquisitions/revisit](https://www.usgs.gov/landsat-missions/landsat-acquisitions)
- [USGS Landsat 8/9 combined 8-day coverage](https://www.usgs.gov/faqs/what-landsat-satellite-constellation)
- [USGS Landsat data policy](https://www.usgs.gov/media/files/landsat-data-distribution-policy)
- [NASA FIRMS VIIRS product description](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)
- [NASA FIRMS detection limitations](https://firms.modaps.eosdis.nasa.gov/alerts/notes.php)
- [LP DAAC MCD64A1 C6.1 guide](https://lpdaac.usgs.gov/documents/1006/MCD64_User_Guide_V61.pdf)
- [CEOS burned-area validation protocol](https://lpvs.gsfc.nasa.gov/PDF/BurnedAreaValidationProtocol.pdf)
- [Peer-reviewed CEOS burned-area validation methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC6220344/)
- [Peer-reviewed BARD reference database and interpretation methodology](https://essd.copernicus.org/articles/12/3229/2020/)
- [Peer-reviewed Sentinel-2 reference perimeter approach (Roteta et al.)](https://doi.org/10.1016/j.isprsjprs.2022.07.015)
- [Roteta et al. burned-area mapping method](https://doi.org/10.1016/j.rse.2019.111254)
- [Bhuvan forest-fire regime update](https://bhuvan.nrsc.gov.in/updates/bhuvan_sep2022.html)
- [Bhuvan terrestrial product listing](https://bhuvan.nrsc.gov.in/wiki/index.php/Terrestrial_Sciences_Products)
- [Telangana Forest Department FMIS fire reporting and Fire Book links](https://fmis.telangana.gov.in/Fire/FPMIS/FireReports/Firechangepoints.aspx)
- [Telangana Forest Department fire details report form](https://fmis.telangana.gov.in/Fire/FPMIS/SSRS/FIRE_DETAILED_RPT.aspx)
- [Forest Survey of India Large Forest Fire monitoring methods](https://fsiforestfire.gov.in/Home/LFFDetails)
- [Forest Survey of India public fire-point search (coverage begins 2025-11-01)](https://fsiforestfire.gov.in/FirePointSearch)
- [USGS Landsat acquisition-schedule FAQ](https://www.usgs.gov/faqs/what-are-acquisition-schedules-landsat-satellites)
