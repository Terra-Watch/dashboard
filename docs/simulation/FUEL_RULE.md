# RESQ-6 fuel mapping rule

**Status: fixed before any Step 2 replay run uses it, committed alongside
`docs/simulation/PROTOCOL.md`.** This is not a new rule — it carries
`docs/RESQ5_PROTOCOL.md` §4's crosswalk forward **unchanged** for every
engine run going forward (development, test, and live), and it formally
supersedes `backend/inference/proxy_mapping.py`'s crosswalk, which the old
`/spread/jobs` pipeline used and which this engine replaces (see
`docs/simulation/00_audit.md` §1).

## Source and sampling

ESA WorldCover 2021 v200, 10 m resolution. For every 30 m simulation cell,
nine 10 m samples are taken by nearest pixel at offsets
`(-10, 0, +10) m` east and north of the cell centre; the majority class
is the cell's class (ties go to the lower class number, matching
`numpy.bincount(...).argmax()`'s tie-break in both the old runner and the
RESQ-5 replay script). No smoothing, no interpolation, no higher-resolution
substitute.

## Crosswalk (forest -> TL, grass -> GR, crop/other -> non-burning)

| WorldCover class | Meaning | Cell2Fire code | Fuel model |
|---|---|---|---|
| 10 | tree cover | 182 | TL2 (forest litter proxy) |
| 95 | mangroves | 182 | TL2 (forest litter proxy) |
| 30 | grassland | 101 | GR1 (grass proxy) |
| 100 | moss/lichen | 101 | GR1 (grass proxy) |
| 40 | cropland | 93 | non-burnable |
| 50 | built-up | 91 | non-burnable |
| 60 | bare/sparse vegetation | 99 | non-burnable |
| 80 | water | 98 | non-burnable |
| 20, 70, 90 (and any class not listed above) | shrubland, snow/ice, herbaceous wetland, unmapped | 99 | non-burnable |

Plain-language summary: **forest canopy classes map to TL2, grassland
classes map to GR1, every cropland/built-up/bare/water/unmapped class maps
to non-burnable.** This is deliberately simpler than
`proxy_mapping.py`'s old table, which additionally gave shrubland (class
20) a burnable SH5 proxy; RESQ-5 dropped that proxy on the stated reasoning
that it was not forced by any data and this engine keeps that decision —
shrubland is non-burnable here, not because it cannot burn in reality, but
because there is no fuel-load or moisture basis to pick a rate for it, and
leaving it non-burnable is the choice that does not invent one.

## What this rule is not

- **Not calibrated.** TL2 and GR1 are stock Spanish fuel models chosen by
  land-cover class alone. There is no canopy height, fuel load, live/dead
  moisture, or Indian-specific parameterisation anywhere in this mapping.
  `wild-fire-simulation/fuel/evidence/indian_runtime_readiness.md` records
  Indian runtime parameters as blocked (cited via `docs/sim_followups.md`'s
  summary; not re-verified directly in this task).
- **Not tunable per incident.** The table above is the whole rule. No
  incident, dev or test, gets a different crosswalk, a different tie-break,
  or a hand-adjusted class for a better score. If an incident's footprint is
  dominated by a class this table calls non-burnable, that is reported as a
  limitation of the rule, not fixed by widening the table after seeing the
  result.
- **Not a claim about real fuel behaviour.** "TL2" and "GR1" are the names
  of the closest stock entries in the simulator's own Spanish lookup table,
  reused because they are what the simulator ships with, not because
  anything here validates that Indian forest litter or grassland behaves
  like their namesakes.

## Where this is implemented

Step 2 will replace `backend/inference/proxy_mapping.py`'s crosswalk (used
only by the retired 1.2 km Similipal demo path) with this table for every
`/spread/jobs` run — development, test, and live. Implementation and tests
land as part of Step 2's engine work and are logged in
`docs/simulation/PROGRESS.md` as they land; this document is not changed
to match whatever the implementation turns out to do — the implementation
is written to match this document.
