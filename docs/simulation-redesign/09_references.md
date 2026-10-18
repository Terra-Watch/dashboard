# 09. References

Checked = the claim was seen in a search result or page summary this session. **Not a full read**: confirm each against the original before citing in a paper or slide. Unchecked = from memory.

## Checked in search results

| Topic | Source | Used for |
|---|---|---|
| Next-day spread with MODIS vs VIIRS | Comparing Next-Day Wildfire Predictability of MODIS and VIIRS Satellite Data, arXiv 2503.08580, https://arxiv.org/html/2503.08580v2 | Modest pixel-level skill (F1 near 0.29 for VIIRS-to-VIIRS in Australia); caution that predictability is not real-world accuracy |
| Survey of datasets | Wildfire Risk Prediction: A Survey of Recent Advances Using Deep Learning Techniques, arXiv 2405.01607, https://arxiv.org/html/2405.01607v4 | Datasets (Next Day Wildfire Spread, WildfireSpreadTS, VIIRS 375 m) are US-based |
| FIRMS detection in India | Frontiers in Forests and Global Change (2022), https://www.frontiersin.org/journals/forests-and-global-change/articles/10.3389/ffgc.2022.933807/epub | FIRMS burned-area product detected under 20% of Landsat burned area in Central India; Uttarakhand assessment about 5.6% of incidents |
| VIIRS 375 m active fire assessment | Oliva and Schroeder (2015), NASA summary, https://modarch.gsfc.nasa.gov/sci_team/pubs/abstract_new.php?id=19541 | Higher sensitivity to small fires than earlier products; errors highest in grass, savanna and agriculture |
| Indian occurrence modelling | AutoML-Fire, https://eprints.whiterose.ac.uk/id/eprint/231966 | India work is about occurrence, not spread forecasting |
| FARSITE data assimilation | Srivas et al., WiFire, https://wifire.ucsd.edu/node/69 ; ICCS 2020, https://www.iccs-meeting.org/archive/iccs2020/papers/121420217.pdf | Perimeter assimilation with ensemble Kalman filtering, fuel adjustment factors and wind estimation; US test fires only |
| Score-based filter | Fire-EnSF, arXiv 2510.15954, https://arxiv.org/pdf/2510.15954 | VIIRS-derived perimeters used for assimilation (California) |
| Fractions Skill Score | Roberts and Lean (2008); Antonio and Aitchison, arXiv 2311.11985, https://arxiv.org/pdf/2311.11985 | Neighbourhood verification; a random-forecast reference for interpreting FSS. No wildfire application found |

## Unchecked (from memory; verify)

- Rothermel (1972), USDA Forest Service research paper INT-115: surface spread model.
- Anderson (1983) and Richards (1990): elliptical fire growth.
- Finney et al. (2011): FSim burn probability.
- Alexander and Cruz (2013): limits on the accuracy of fire behaviour model predictions.
- Huot et al. (2022): Next Day Wildfire Spread dataset.
- Radke et al. (2019): FireCast.
- Pais et al. (2021): Cell2Fire.

## Internal documents

- `docs/SCIENTIFIC_VALIDATION_GATE.md` (Gates A to G)
- `docs/simulation/PROTOCOL.md`, `DECISION_RULE.md`, `RESULTS_DEV.md`, `FALLBACK.md`, `API_SPREAD.md`
- `docs/sim_followups.md`, `docs/sim_diagnosis/REPORT.md`
- `results/resq6/failure_mode_investigation_20261015/`
- `docs/redesign/06_simulation_ui.md`
