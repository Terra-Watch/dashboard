# RESQ-6 engine decisions (coordinator amendment items 2 and 3)

Written and committed before any Step 2 engine code, per the coordinator's
instruction after Step 1 approval. Referenced from
`docs/simulation/PROTOCOL.md`'s Amendment 1.

## 1. Temperature / relative humidity: effort estimate and decision

### What was checked

`backend/inference`'s and `scripts/resq5`'s pipelines both run Cell2Fire's
simulator `S` with temperature and RH fixed by the binary itself, not by
any input file: `ReadCSV.cpp:526` —

```cpp
float ws = 0, waz = 0, tmp = 27, rh = 40;
```

declared once, outside the per-row loop. The loop
(`CSVReader::parseWeatherDF`) only overwrites `tmp`/`rh` inside
`if (args_ptr->Simulator == "K") { ... }` and
`else if (args_ptr->Simulator == "C") { ... }` branches — there is **no
branch for `"S"`**, so for every row, every run, `tmp` and `rh` keep their
initial 27/40 values regardless of what `Weather.csv` contains.

For this task, I additionally checked whether `tmp`/`rh` are consumed
*anywhere else* in the Cell2Fire source, beyond being stored into the
`weatherDF` struct — i.e., whether wiring real values through would have
any effect at all:

```
grep -rn "\.tmp\b\|\.rh\b" --include="*.cpp" --include="*.h" .
```

run from the Cell2Fire source root, returns **zero matches outside
`ReadCSV.cpp`**. In particular, `FuelModelSpain.cpp` — which holds the
`ROS = 1/(p1 exp(-p2 w) + p3)` formula simulator `S` uses
(`docs/RESQ4_SPREAD_TEST.md` §3, re-confirmed in `docs/simulation/00_audit.md`)
— never references `tmp` or `rh`. The formula is a function of wind speed
`w` only. **`weatherDF.tmp`/`.rh` are dead fields for every simulator this
fork supports, not just `S`.**

### Two-tier effort estimate

- **Tier A — wire real values into the struct for simulator `S`.** Add an
  `else if (args_ptr->Simulator == "S") { tmp = ...; rh = ...; }` branch
  reading the appropriate `Weather.csv` columns, mirroring the existing `K`
  branch. This is genuinely small: on the order of 5-10 lines, no new data
  structures, a well-understood pattern already present twice in the same
  function. Effort: well under an hour, including a rebuild.
- **Tier B — make temperature/RH actually affect fire behaviour.** Requires
  adding a moisture/temperature-dependent term to `FuelModelSpain.cpp`'s ROS
  calculation itself — a physically-grounded fuel-moisture model (e.g. a
  dead-fuel-moisture correction to the head rate), which in turn needs fuel
  moisture content, live/dead ratio, or an equivalent input that does not
  exist for Indian fuels today (`wild-fire-simulation/fuel/evidence/indian_runtime_readiness.md`
  records `INDIAN_RUNTIME = BLOCKED`, cited via `docs/sim_followups.md`'s
  summary, not re-verified directly here). Effort: not small — days, and
  blocked on missing data regardless of how much coding time is spent on
  the formula itself.

### Decision

**Do not do Tier A on its own.** Patching `ReadCSV.cpp` to read real
temperature/RH into the struct, while leaving `FuelModelSpain.cpp`
unchanged, would make the engine *appear* to use real weather (the values
would be real, stored, and visible in any debug output) while having
**exactly zero effect on the simulated footprint** — this is precisely the
kind of silent, misleading patch the coordinator's instruction warned
against ("don't silently patch around it either way"). Doing it would cost
almost nothing and fix nothing.

Tier B is the only change that would make temperature/RH matter, and it is
blocked on data this project does not have, independent of engineering
effort.

**Both constants (27°C, 40% RH) are left exactly as they are.** This is
carried into the engine's own documentation (Step 2) as a stated, permanent
limitation, with wording along these lines, reused verbatim where the
engine's assumptions are documented:

> Temperature is fixed at 27°C and relative humidity at 40% by the
> simulator, regardless of the actual forecast or historical conditions at
> the incident. These fields are read from the weather input but never
> consumed by the rate-of-spread calculation for any simulator mode this
> fork supports; wiring real values through would not change the simulated
> result. This is unchanged by RESQ-6 and is not expected to change without
> a fuel-moisture model this project does not have the input data to build.

## 2. Ignition location: sourcing from a verified-incident record

### What was read

`resq8/firms-ingestion`'s `docs/ingest/00_design.md` (read via
`git show resq8/firms-ingestion:docs/ingest/00_design.md` from this
worktree; that branch is not checked out here and was not modified).
Status as of this writing, taken directly from the doc's own "Status"
section: **design approved with amendments, still holding before Step 1,
no ingestion code has been written** on `resq8`. Its audit-log ownership
(verify/dismiss/escalate, `previous_state`) was moved by a prior amendment
to `resq9/product-pass`, whose schema is also **not finalized / not yet
code** as of this writing (`resq8`'s own §8a: "the actual integration can't
be built until that interface exists or is confirmed stable").

So: there is no real verified-incident record anywhere in this repo today,
on any branch, to call into. Per the coordinator's instruction, this is a
cross-branch dependency to reconcile later, not something to block Step 2
on.

### The record shape being designed against

From `resq8`'s design (§6, §8), the entity that becomes a "verified
incident" is a `resq_incident_candidates` row (a spatio-temporal cluster of
FIRMS detections) whose most recent audit-log action (once `resq9` exists)
is `verify`:

```
incident_candidate = {
    id:                 int
    state:              str              # best-effort bbox tag
    label:              str              # e.g. "{state} — cluster since {date}"
    centroid:           {lat: float, lon: float}
    bbox:               polygon (WGS84)
    first_detected_at:  datetime (UTC)
    last_detected_at:   datetime (UTC)
    detection_count:    int
    status:             "not_verified" | "verify" | "dismiss" | "escalate"   # latest resq9 audit-log action, default not_verified
}
```

### What this engine builds against today

A small lookup interface this engine owns (not `operations.py`'s incident
tables, and not a new table that would compete with `resq8`/`resq9`'s
eventual real implementation):

```python
class VerifiedIncidentLocation(Protocol):
    incident_id: str
    latitude: float
    longitude: float
    first_detected_at: datetime  # used to derive t0, same style as RESQ-5's "first detection - lead hours" rule

def get_verified_incident(incident_id: str) -> VerifiedIncidentLocation | None:
    """Resolve a verified incident to its location. Returns None if the
    incident is unknown or not verified — /spread/jobs must then refuse the
    request (422/404), never fall back to treating an unverified or unknown
    id as if it were located somewhere."""
```

**Today's implementation of `get_verified_incident` is a stub**, backed
only by the fixed development/test incidents this task already has real,
fixed coordinates for (`data/resq5/protocol_setup.json` for the 4
development incidents; the test-set candidates once Step 3 fetches them).
It resolves nothing else — a request for any incident id outside that
fixed set returns `None` (refused), since there is no live verification
system yet to ask. This is the explicit, documented boundary of the stub:
it never invents a location for an id it does not recognize, and it never
treats "unknown" as "verified."

### Cross-branch reconciliation (not resolved here)

When `resq8`'s `resq_incident_candidates` and `resq9`'s audit log exist as
real code, `get_verified_incident` is the one function that needs to be
swapped to query them (by `candidate_id`, filtering on the latest audit-log
action being `verify`) instead of the fixed stub table. Nothing else in
this engine's design should need to change, since the interface above is
already shaped to match the real record (lat/lon from `centroid`, incident
id from `candidate_id`). This reconciliation is explicitly **not** done as
part of RESQ-6; `operations.py`'s incident schema is not touched by this
task.
