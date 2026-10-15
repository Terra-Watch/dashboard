# RESQ6 saved-grid viewer — implementation report

## Implemented

- Added a local standard-library HTTP server and browser Canvas UI. It serves
  four allowlisted development scenarios and selects archived member
  footprints at their four exact saved horizons (6, 12, 24, 48 h).
- The API loads one member/horizon on demand, verifies the NPZ against its
  existing SHA-256 manifest entry, parses the NPY Boolean array without NumPy,
  handles its Fortran-order storage, and emits north-up row-major bytes.
- UI includes scenario/member selection, exact-snapshot time navigation and
  playback, per-member ignition placement, burned/unburned legend, projected
  grid axis values, 1 km scale, and scenario metadata. The archive lacks
  per-member weather perturbation values, so the UI discloses this provenance
  limitation.
- Added the required simulated-output disclaimer and explicit separation from
  DMM onset prediction and observed physical-perimeter claims.

## Verification performed

- `python3 -m unittest backend.tests.test_spread_viewer -v` — 5 tests passed.
  Tests load/hash-check actual member-zero grids for all four development
  incidents; check the 375×375 grid, cell values, and recorded ignition for
  E2024-131853; exercise Fortran-to-row-major orientation; accept only exact
  saved hours and allowlisted scenarios; and reject malformed/hash-mismatched
  artifacts.
- `python3 -m py_compile scripts/resq6/spread_viewer.py backend/tests/test_spread_viewer.py` — passed.
- Node `new Function()` syntax check on the page's inline JavaScript — passed.
- Local server smoke test — HTML returned 200 and contained the disclaimer;
  scenario API returned four scenarios; frame API returned 140,625 cell bytes
  and the expected ignition row/column. The smoke-test server was terminated.
- `git diff --check` — see final verification record in
  `provenance_manifest.json`.

## Scope and limitations

Only existing local development artifacts were read. No Cell2Fire or other
simulation was run, no data/dependencies were downloaded, no held-out data was
accessed, and no historical output, protocol, scoring, labels, baseline, or
acceptance criterion was changed. Four exact snapshots are supported; there
are no archived sub-hourly/intermediate frames to render. Boolean source
arrays have no unknown/no-data values. Existing archival provenance does not
include each member's weather perturbation inputs, which limits exact replay
but not rendering of the saved arrays. Browser rendering was syntax- and
HTTP-smoke-tested. The in-app browser was unavailable in this environment, so
no graphical GUI automation or cross-browser visual QA was performed.

## Remaining blockers

This visualization is not a physical-accuracy validation. No time-resolved
fire-perimeter truth, complete observation coverage mask, DMM-to-Cell2Fire
handoff, or full per-member replay provenance is added here. The official
development benchmark and held-out evaluation status remain unchanged.
