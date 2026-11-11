<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/terra-watch/dashboard/main/frontend/public/brand/logo-on-dark.svg">
  <img src="https://raw.githubusercontent.com/terra-watch/dashboard/main/frontend/public/brand/logo.svg" alt="TerraWatch" height="72">
</picture>

**Early warning and response for forest fires.**

Forecast where a fire is likely, tell real fires from false detections, follow the fires that are burning, and put the next action in front of a ranger or the control room. Built for forest departments in India.

English · हिन्दी · ଓଡ଼ିଆ

</div>

---

## What it does

TerraWatch does not wait for someone to call in a fire. It watches, warns ahead of time, follows the fires that are burning, and puts the next action in front of a person.

| Question | Answer |
|---|---|
| **Where is a fire likely tomorrow?** | A calibrated chance for each 55 km area of forest, a level (none, moderate, high, extreme), what is usual for this week, the places to look and what to do. |
| **Is something burning, and is it real?** | Every satellite detection is kept and sorted: likely fire, unconfirmed, known heat source (kiln, mine, plant) or outside forest. Lookout stations in the forest add smoke, sound and silence as ground evidence. |
| **Which fires matter now?** | Fires built from the detections, seen pass by pass: size, whether it grew, which side, the nearest villages, who is on it, ordered by who needs attention first. |
| **What do we do?** | Send a crew, warn villages, and close or confirm a fire from the ground: still burning, handled, out, not a forest fire. |
| **Did we get it right?** | Yesterday's forecast against what was detected. The spread outlook against what actually burned on past fires. |

## Our approach

**Software suggests, people decide.** A model gives a chance, a ranking or a sentence. It never verifies, assigns, dispatches or announces. A person turns a suggestion into a check, a crew or a warning, and what the ranger finds on the ground goes back into the system. A check then moves up a confidence ladder (Signal, Report, Verified, Responding, Contained, Closed), and only people move it.

Every screen says what a number is not. A forecast level is the chance that a satellite detects a fire in the area, not where inside it. The spread outlook ranks cells near a fire and says nothing about how far or how fast. A silent lookout station is a gap, not quiet.

## Who uses it

| Role | What they do |
|---|---|
| **Ranger** | See the forecast for their area as a card (today and tomorrow, with what to do and the places to check), fires and stations near them, accept and visit tasks, mark what they find, work offline. |
| **Control Room** | Watch the forecast board, the active fires board, the satellite page and the station network; send crews; verify and close checks; publish approved notices; hand over between shifts. |
| **Admin** | Accounts, communities, stations, alert rules. |
| **Citizen** | May send a report and read official notices. A secondary input: it was the first version of the product, and is no longer the centre. |

Languages: English, Hindi and Odia.

## Capabilities

### Fire forecast
Tomorrow's chance that a satellite detects a fire in each 55 km area, with a level at fixed cut-offs on the chance (10, 30 and 60 %) so that it follows the season, what is usual for this week, and the places to look. Areas where the forecast is less reliable say so. Yesterday's record is shown. Raw model scores are never shown. Advisory: confirm with field observations.

### Satellite detections
NASA VIIRS detections every 3 hours, each kept and sorted into groups with the reason in words. Nothing is hidden; known heat sources and detections outside forest are off by default and counted.

### Active fires
Fires linked from the detections, with size so far, growth at the last look, the side it grew toward and the nearest named places. A board, a fire page with a replay of how it grew, and a "Fires near me" list for rangers. Send a crew creates a check in the normal queue; marking a fire out or not a forest fire closes it until the satellite sees it again. It shows what was seen, not where it will go.

### Lookout stations
Fixed stations with a smoke-particle sensor, temperature, humidity and a sound classifier for chainsaw, blast and open fire, over LoRa. One sentence per station, a map layer, a Network view for maintenance and one alert per check, with the evidence beside it.

### Past fires
The spread model checked against what burned: four archived fires and the result on every 2025 test fire, including where it falls short.

### Checks and field work
A check from a fire, a station, a call or a report is verified, assigned and closed with a reason. Rangers record what they find, also offline.

### Citizen reports and community
Citizens can send a report with place, time and photos, follow it, and read official notices and the community. An advisory photo check can help a reviewer; a person decides.

### Maps
MapLibre GL with a self-hosted PMTiles basemap, so no third-party map requests are made. Light by default; dark terrain and satellite imagery are options. Each role sees only the layers it is allowed. A missing dot on a map is never evidence that there is no fire.

## Safety and privacy

- Citizens never see satellite signals, unchecked reports or other people's reports. A public map, if switched on, shows verified incidents only, coarsened and delayed, enforced on the server.
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
| Lookout stations, ranger observations, citizen reports | Ground evidence |
| Open-Meteo, NOAA GFS | Weather for the forecast |

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

Issues and pull requests are welcome. Please read the docs in the repository first and keep changes consistent with the approach above: software suggests, people decide.
