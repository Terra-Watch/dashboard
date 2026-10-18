# TerraWatch configuration

Everything below is read from the server's environment. Values that describe policy (who is told what, how long things are kept, which numbers the public sees) have **no defaults on purpose**: if they are not set, the feature is off and the screen says so. Nothing here is a recommendation; each value is for the department to decide.

## Required to start

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (psycopg3), e.g. `postgresql+psycopg://user:pass@host:5432/db` |
| `RESQ_SECRET_KEY` | Signing key, at least 32 bytes. The server refuses to start without it. |
| `RESQ_ENV` | Set to `production` in production. Development accounts are never created then. |

First administrator: `python -m scripts.create_admin` (reads `RESQ_ADMIN_PASSWORD`, or asks). Staff after that are invited from **Control Room → People**.

## Policy values (unset = feature off)

| Variable | Turns on | Notes |
|---|---|---|
| `EMERGENCY_CONTACTS` | Emergency numbers on the citizen Near me page and the Range Officer Me page | JSON list of `{label, number, region?}` the department supplies. No numbers are ever invented. |
| `PUBLIC_MAP_ENABLED`, `PUBLIC_MAP_H3_RESOLUTION`, `PUBLIC_MAP_DELAY_MINUTES` | Verified areas on the citizen map | All three are required together. Areas are coarsened to the H3 cell and delayed. Unchecked reports and satellite signals are never public. |
| `PUBLIC_RATE_LIMIT_PER_MINUTE` | Rate limit on public read endpoints, per address and per worker | Unset means no limit is applied. |
| `CORROBORATION_RADIUS_KM`, `CORROBORATION_WINDOW_MINUTES` | "Possibly the same event" suggestions in the queue | Suggestions only. Nothing is merged automatically. |
| `EXPOSURE_RADII_KM` | Distances shown beside the scenario planner (comma list) | |
| `SCENARIO_PLANNER_ENABLED=true` | Scenario tab for the Control Room | Never shown to citizens or Range Officers. Not validated; the banner says so. |
| `FEED_STALE_MINUTES` | "stale" marking on satellite and weather data; scenario "outdated" rule | |
| `REPORT_ESCALATION_MINUTES` | Reports with no officer are brought to the lead after this long | Run `python -m scripts.escalate_reports` on a schedule. |
| `COMMUNITY_EDIT_WINDOW_MINUTES`, `COMMUNITY_NEW_ACCOUNT_HOURS` | Community edit window and new-account limits | Chat retention is set per room by a moderator; run `python -m scripts.purge_chat` on a schedule. |
| `COMMUNITY_IMAGES_ENABLED=true` | One image per community post (author only; re-encoded without EXIF/GPS; jpeg/png/webp) | Off by default; with it off the endpoints return 404 and no image fields exist. `COMMUNITY_IMAGE_MAX_BYTES` (default 5 MB) and `COMMUNITY_IMAGE_STORAGE_DIR` tune it. Separate from incident evidence. |
| `FIRE_EVIDENCE_COMMUNITY_ENABLED=true` | Media-authenticity check on those images (moderator-only advisory result) | Off by default and needs `COMMUNITY_IMAGES_ENABLED`. Needs the shared Fire Evidence model to be configured; otherwise every image is UNAVAILABLE and its post is held for a moderator. It never removes, mutes or publishes anything. See `docs/fire_evidence_integration.md`. |
| `FIRE_EVIDENCE_INFERENCE_ENABLED=true`, `FIRE_EVIDENCE_REPO`, `FIRE_EVIDENCE_ARTIFACT_DIR`, `FIRE_EVIDENCE_MODEL_VERSION` | Fire Evidence Assessor on incident evidence | Off by default; every upload is stored as UNAVAILABLE until an APPROVED artifact is configured. Staff review stays authoritative. |
| `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY`, `FIRE_EVIDENCE_TRUSTED_KEY_ID` | Ed25519 check of the artifact's approval signature | Enforced only when the public key is set; unset means the signature is not checked. Needs the `cryptography` package. |
| `FEATURE_PATROL_PLANNING=true` and `VITE_FEATURE_PATROL_PLANNING=true` | Patrol planning screens | Built but off until the department agrees how it should work. |

## Email (optional)

`SMTP_HOST`, `SMTP_FROM`, `PUBLIC_BASE_URL` (all three required to send), plus `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. Without them, password resets and invitations are not emailed; the screen says so and the administrator hands over the link.

## Data feeds

| Variable | Feed |
|---|---|
| `FIRMS_MAP_KEY` | NASA FIRMS satellite detections (`python -m scripts.ingest_feeds`, schedule it) |
| `CDSAPI_URL`, `CDSAPI_KEY` | Copernicus ERA5 weather. Not yet wired to any screen. |

## Front end build

`VITE_API_BASE_URL` (API address). `npm run build` also stamps the service worker. `npm run budget` checks bundle sizes, `npm run i18n` lists text that lacks a Hindi or Odia version, `npm run test:unit` runs the unit tests.

## Things that run on a schedule

| Command | Why |
|---|---|
| `python -m scripts.ingest_feeds` | Fetch satellite detections |
| `python -m scripts.escalate_reports` | Bring unattended reports to the lead |
| `python -m scripts.purge_chat` | Delete chat past each room's retention |
