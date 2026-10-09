# RESQ T1 architecture

The frontend is a Vite React PWA using `react-map-gl/maplibre`. It serves a key-free MapLibre map using OpenStreetMap raster tiles. Simulation time steps are drawn into one MapLibre `canvas` source and displayed with a raster layer; polygon layers are intentionally not used.

The backend is FastAPI. Startup creates the PostGIS extension and a minimal user table, then seeds development users for the three roles: admin, officer, and viewer. JWTs are signed with `RESQ_SECRET_KEY`.

The six-state scope is OD, CG, TS, MP, MH, and JH. Demo dates are limited to 2023–2024; no 2025 dates are used. The current app has no connected daily frame payload, so the UI reports the forest-cell count as unavailable rather than inventing a value.
