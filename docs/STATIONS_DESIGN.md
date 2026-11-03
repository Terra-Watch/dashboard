# Lookout stations, satellite and ranger pages: design and flow (2026-11-03)

Status: DESIGN ONLY. Nothing is built. Facts about today's code were read from the repo; everything else is proposed and marked as such.

## What exists today
- The node now sends a 15-byte DATA payload v1 every telemetry interval: `'S'`, version 1, flags (BME680 valid, PMS valid), PM2.5, PM10, PM2.5 baseline (0xFFFF, not yet), temperature in 0.01 C, humidity in 0.01 percent, battery mV (0xFFFF, not yet). The gateway only prints it on its serial port.
- Navigation is pure data in `frontend/src/ui/nav.ts` with a fixed maximum of 5 items per role. Control room: queue, map, field, notices, handover (+ what-if when enabled). Ranger (field): tasks, map, capture (centre button), notices, me.
- The satellite page already exists at `/ops/satellite` (`SatellitePage.tsx`, `GET /api/hotspots`) but has no nav entry; satellite detections are also a layer on the Control Room map.
- Alerts, scopes (state, community), incidents and the ranger task flow exist and are reused.

## Pages
| Role | Page | Path | Content |
|---|---|---|---|
| Control room | Stations | `/ops/stations` | list and map of lookout stations in scope: status dot (online, late, offline), last heard, PM2.5, PM10, temperature, humidity, battery, link quality; filters by state and status |
| Control room | Station | `/ops/stations/:id` | current values, 24 h and 7 day series (PM2.5 and PM10, temperature, humidity), link health (RSSI, SNR, hops), registry data, recent events and alerts, button "Create a check" |
| Control room | Satellite | `/ops/satellite` | the existing page, promoted to a nav entry with its own icon; no longer duplicated inside other pages (the map keeps its layer toggle only) |
| Ranger | Stations | `/field/stations` | stations near the ranger, nearest first, read-only cards: status, last reading, distance, "open in map" |
| Ranger | Station | `/field/stations/:id` | one station: current reading, short trend, last heard, location and route link |
| Ranger | Satellite | `/field/satellite` | detections near the ranger (age, distance, fire power), read-only, with "report from here" |
| Admin | Station setup | `/ops/admin` (a tab) | register a station: node id, name, position, state, community; unknown node ids heard by the gateway are listed to claim or ignore |

Navigation (the 5-item cap is raised to 7 for the Control Room rail; mobile keeps 4 items plus "More"):
- Control room: Queue, Map, **Stations**, **Satellite**, Field, Notices, Handover. On mobile "More" holds Notices and Handover.
- Ranger (bottom bar, 5 slots): Tasks, Map, **Capture** (centre), **Stations**, **More**; "More" holds **Satellite**, Notices, Me. The profile link already sits in the top bar, so "Me" does not need a slot.
- Icons: add `radio-tower` (Stations) and `satellite` (Satellite) to the nav icon set.

## Data flow
```
station (BME680 + PMS5003, LoRa) -> [relay] -> gateway (ESP32 + LoRa, USB serial)
   -> bridge script (decodes, signs, retries, buffers when offline)
   -> POST /api/stations/ingest  -> resq_station_readings
   -> rules (offline watchdog; smoke-rise rule, off until policy values are set)
   -> alerts (existing) / optional incident (source "station")
   -> Control Room pages -> ranger task context
```
- Bridge: a small Python program next to the gateway (laptop or Raspberry Pi): reads `[DATA RX]` lines, decodes payload v1 (shared test vector with the firmware), sends batches over HTTPS with an HMAC header, keeps a local queue on failure. No Wi-Fi in the gateway firmware.
- Trust: a gateway key per bridge, checked server side; node ids not in the registry are stored as "heard, unregistered" and never shown on the map; node-level HMAC is a later firmware step (the radio protocol has none today).
- Tables (proposed): `resq_stations` (id, node_id, name, latitude, longitude, state, community_id, kind, installed_at, active), `resq_station_readings` (station_id, received_at, node_seq, rssi, snr, hops, temp_c, humidity_pct, pm25, pm10, battery_mv, flags; kept 30 days, older rows downsampled to hourly), `resq_station_unknown` (node_id, last_heard, count).
- Endpoints (proposed): `POST /api/stations/ingest` (gateway key), `GET /api/stations` and `GET /api/stations/:id` and `GET /api/stations/:id/readings?hours=` (staff and rangers, scoped), admin create and update. Citizens get nothing.
- Status is computed on the server: online (heard within 2 intervals), late (2 to 6), offline (more than 6); a silent station is shown as a gap, never as "quiet forest".

## User flows
1. **Control room, smoke seen.** Stations page shows a station with PM2.5 above its own baseline -> open the station -> compare with the satellite page and recent reports on the map -> "Create a check" makes an incident (source "station") with the station readings attached -> assign a ranger as for any report.
2. **Ranger.** The task shows a station card (readings of the last hour, distance) -> on site the ranger records the outcome as today -> the outcome is stored with the station event, which later tunes the thresholds for that site.
3. **Station silent.** The watchdog raises "station offline" to Control Room staff in scope after the late threshold; the Stations page shows it in red with the last heard time; nothing is announced to the public.
4. **Ranger quick look.** Open Stations from the bottom bar, nearest first, check the reading and last heard, open the position in the map.

## Rules and wording
- Readings are labelled "from sensors, not people. A high reading is a prompt to check, not a fire."
- PM2.5 is the PMS5003 sensor estimate, shown relative to the station's own baseline, not as a calibrated air-quality value.
- Smoke-rise thresholds and "k samples in a row" have NO defaults; until a department sets them the page shows readings only and creates no alerts or incidents. Offline thresholds are policy values too, with a stated default for the demo only.
- Everything is state and community scoped like incidents; rangers see read-only data.

## Build order (each step ends in something you can open)
1. Backend: tables, registry, ingest, status; bridge script; seed the one real station. Tests: payload decode vs firmware vector, auth, scope, offline status.
2. Control Room Stations list (map and table) with real readings.
3. Station detail with series and link health.
4. Nav change (7 items, mobile "More") and Satellite promoted to the nav.
5. Ranger Stations, Station, Satellite pages and "More" sheet.
6. Offline watchdog alerts, then "Create a check", then the smoke-rise rule (needs policy values).
7. Later: acoustic events from the stations (chainsaw, blast) as a second event type on the same pages.

## Decisions for the owner
1. Raise the Control Room nav to 7 items and give rangers a "More" sheet (proposed), or keep 5 and put Satellite inside Map.
2. Rangers see all stations in their state or only the nearest N.
3. "Create a check" is always an operator click (proposed) or automatic once rules are set.
4. Where the bridge runs for the demo (your laptop at the gateway) and who registers stations (admin page, proposed).
