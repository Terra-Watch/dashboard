<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/terra-watch/dashboard/main/frontend/public/brand/logo-on-dark.svg">
  <img src="https://raw.githubusercontent.com/terra-watch/dashboard/main/frontend/public/brand/logo.svg" alt="TerraWatch" height="72">
</picture>

**Report, verify and respond to forest fires.**

A wildfire operations platform for India's forests. It connects the people who see a fire, the people who decide what to do about it, and the people who go to the place.

English · हिन्दी · ଓଡ଼ିଆ

</div>

---

## Our approach

A fire claim moves up a **confidence ladder**, and only people move it up. Software can suggest. It never merges, verifies, closes or announces on its own.

| Rung | Meaning | Moved here by |
|---|---|---|
| **Signal** | A satellite sensor sees heat. No person has looked. | Automatic ingestion |
| **Report** | A person says there is a fire. Not checked. | A citizen, or staff logging a call |
| **Verified** | Staff checked the evidence and agree it is real. | Control Room |
| **Responding** | An officer is on the way or on site. | Control Room, with the officer's acceptance |
| **Contained** | Under control. | Control Room |
| **Closed** | Finished and kept for the record, with a reason. | Control Room |

Each rung has its own shape, colour and word, so meaning never depends on colour alone.

## Three roles, one app

| Role | What they do |
|---|---|
| **Citizen** | Report smoke or fire in a few taps (place, time, up to four photos), follow the report until it closes, see verified fire areas nearby, read official notices, and join the community. |
| **Range Officer** | Accept or decline assignments, navigate to the site, record what they find (fire confirmed, none found, could not tell), and work from an offline regional map. |
| **Control Room** | Triage incidents with their evidence, verify, assign officers, close with a reason, publish approved notices, moderate the community, hand over between shifts, and run fire simulations. |

## Capabilities

### Citizen reporting
Place, time and up to four photos. Reports are kept on the phone and sent when the connection returns, with retry keys so a poor connection never creates duplicates. Each report has a step-by-step timeline from received to closed, and the reason it was closed.

### Community
Three separate spaces for citizens: official **Notices**, **Discussion** (questions, local information, thanks, replies) and regional **Chat rooms** (slow mode, freeze, expiry). Phone numbers, links and coordinates in posts wait for a moderator, and every composer points to **Report**.

### Fire evidence check
An AI model examines the photos attached to a citizen report and gives Control Room reviewers an advisory assessment. A person reviews the photos and decides. Once a report is verified, it appears to other citizens as a coarse, delayed hexagon on the public map.

### Community alerts
Verified citizen reports inform nearby citizens in the community. Alerts go out once the AI evidence check and a reviewer agree, so the community hears about real fires, not unchecked claims.

### Wildfire forecasting
Live daily ignition-risk forecasts across all of India's forests, shown as **relative ranked bands** among forest cells: Very high (top 1%), High (top 5%), Moderate (top 15%) and Low. Raw model scores are never shown. Advisory forecast; confirm with field observations.

### Fire simulation
Fire-spread models calibrated on real Indian fire events. For any reported fire, Control Room draws how far it could spread under inputs the planner types: head-fire rate of spread, wind speed and direction, hours to show, and uncertainty on each.

- Anderson/Richards elliptical fire growth, with inner, typed and outer bands per hour
- Straight-line reach table and a reality check against satellite signals
- Exposure of places the planner adds
- Output is a range under stated inputs, never a statement of what *will* burn
- Saved to the incident timeline as a note

### Maps
MapLibre GL with a self-hosted PMTiles basemap, so no third-party map requests are made. Each role sees only the layers it is allowed. A missing dot on a map is never evidence that there is no fire, and every public view says so.

## Safety and privacy

- The public map shows verified incidents only, snapped to H3 cells and shown after a delay, enforced on the server.
- Citizens never see satellite signals, unchecked reports or other people's reports.
- Official notices are written by one person and approved by a second.
- Citizens can download or delete their data.
- Emergency numbers, thresholds and retention periods come from configuration, never from built-in defaults.
- Secrets are never printed or committed.

## Data sources

| Source | Use |
|---|---|
| NASA FIRMS (VIIRS) | Satellite fire detections |
| Copernicus ERA5 and weather sources | Wind and weather, shown with the age of the reading |
| OpenStreetMap contributors, Protomaps | Basemap |
| Citizen reports and field observations | Evidence and verification |

Every data chip shows its age. A stale source turns grey and says so.

## Built with

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind, MapLibre GL, PMTiles, TanStack Query, i18next |
| Backend | FastAPI, SQLAlchemy, PostgreSQL (PostGIS optional), H3 |
| Security | Short-lived access tokens with refresh rotation, CSRF protection, region-scoped authorisation, audit log |
| Quality | Real-database tests, Playwright, axe-core accessibility checks |

Accessible by design: keyboard use throughout, 44 px touch targets, reduced-motion support, light and dark themes. Installable on a phone.

## Repositories

| Repo | Description |
|---|---|
| [**dashboard**](https://github.com/terra-watch/dashboard) | The TerraWatch web app and API, with product, design and operations docs |

## Get started

```bash
git clone https://github.com/terra-watch/dashboard.git
cd dashboard
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d
```

Run the backend (`uvicorn app.main:app --reload --port 8000`) and the frontend (`npm install && npm run dev`), then open <http://localhost:5173>. The repository README covers the full setup, including local accounts for each role.

## Contributing

Issues and pull requests are welcome. Please read the docs in the repository first and keep changes consistent with the approach above: people verify, software suggests.
