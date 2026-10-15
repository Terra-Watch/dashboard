# Next actions

## Highest-value next step

Obtain explicit owner decisions listed in `validation_protocol.md`, prioritizing target semantics, forecast origin, temporal-age/missing-target rules, valid-cell policy, and spatial support. In parallel, identify one authoritative time-stamped perimeter/progression reference for each development incident, with acquisition times, quality/coverage, CRS, licence, and event attribution. Do not score until those prerequisites are approved and the data are locally verified.

## Offline work available now

- Re-run `backend/.venv/bin/python results/resq6/observational_validation_investigation_20261015/build_inventory.py` to regenerate the scoped inventory from unchanged local sources.
- Independently review MCD64A1 QA semantics and validate the 155286 fetch metadata if an existing local manifest supplies the expected listing record; do not infer missing bytes/checksums.
- Correct or review existing target/timing documentation only in a separately authorized task; this investigation does not edit historical results.

## Requires external acquisition / approval

- Time-resolved, incident-associated perimeter or burn-progression observations, ideally for all four cases, plus valid observation/quality masks and licensing terms.
- If using Sentinel-2/Landsat: suitable pre/post acquisitions and cloud/shadow/valid masks; demonstrate domain coverage and observation dates before delineation.
- If using Copernicus daily BA v3.1 or another BA product: verify exact local product version, dates, grid/CRS, QA/uncertainty, event attribution and licence before deciding it is a comparator. No external source was contacted or downloaded here.

Do not access the held-out set, rerun Cell2Fire, tune parameters, or alter the official benchmark while the development gate remains failed.
