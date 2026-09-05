# Jalri

Jalri is a maritime safety and operations platform. It provides a frontend dashboard, backend API, and landing page for managing vessel information, monitoring operational status, handling safety alerts, and reviewing telemetry and event history.

This repository contains both the **frontend** (Next.js) and **backend** (FastAPI) applications.

## Overview

The Jalri web application is the user-facing layer of the Jalri maritime system. It receives data from the Jalri Gateway (via the backend ingestion API) and presents it through a dashboard with fleet overview, vessel details, map view, alerts, telemetry, event history, gateway status, and system status pages.

The application intentionally uses empty/unavailable states when no operational data exists. No fake data is generated or displayed.

## Role in Jalri

```text
[ BoatNode ] --LoRa--> [ Gateway ] --HTTP--> [ Backend ] --> [ Dashboard ]
                                                  ▲               ▲
                                             backend/         frontend/
```

## Repository Structure

```text
website/
├── frontend/           # Next.js + React + TypeScript dashboard and landing page
├── backend/            # FastAPI + SQLAlchemy + PostgreSQL API server
├── docs/               # Data contracts and specifications
└── README.md
```

---

## Frontend

### Technology Stack

| Component | Technology |
|---|---|
| Framework | Next.js 15.5 |
| UI library | React 19 |
| Language | TypeScript 5.8 |
| Styling | Vanilla CSS (globals.css) |

### Dashboard Routes

| Route | Component | Description |
|---|---|---|
| `/` | LandingPage | Product landing page |
| `/dashboard` | Overview | Fleet overview with metrics, position panel, alerts, activity |
| `/dashboard/boats` | BoatRegistry | Registered vessel list |
| `/dashboard/boats/[boatId]` | Boat detail | Individual vessel detail |
| `/dashboard/map` | LiveMapWorkspace | Map view |
| `/dashboard/alerts` | AlertsOverview | Alert list with filtering |
| `/dashboard/alerts/[alertId]` | Alert detail | Individual alert detail |
| `/dashboard/telemetry` | TelemetryOverview | Telemetry data view |
| `/dashboard/history` | HistoryRecords | Historical event records |
| `/dashboard/gateway` | GatewayOverview | Gateway status |
| `/dashboard/system-status` | SystemStatusOverview | System-wide status |

### Components

**Dashboard shell:**
- `DashboardShell` — layout wrapper
- `Sidebar` — navigation sidebar
- `Topbar` — top navigation bar

**Page components:**
- `Overview`, `BoatRegistry`, `LiveMapWorkspace`, `AlertsOverview`, `TelemetryOverview`, `HistoryRecords`, `GatewayOverview`, `SystemStatusOverview`

**Landing page:**
- `LandingPage` — product page with capabilities, workflow, future capabilities sections
- `Reveal` — scroll-based reveal animation

**UI primitives:**
- `Button`, `Card`, `DataTable`, `SectionHeader`, `StatusBadge`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

Production build:

```bash
cd frontend
npm run build
npm start
```

### Render Deployment

Deploy the repository as a **Web Service**, using the settings in `render.yaml`:

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Start command: `npm start`

Do not configure this service as a Static Site or set its publish directory to `out`. The dynamic dashboard detail routes require the Next.js server, which serves the `.next` build through `next start`.

### Frontend Environment

Copy the example before local development:

```bash
cp frontend/.env.example frontend/.env.local
```

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `http://localhost:8000` |

---

## Backend

### Technology Stack

| Component | Technology |
|---|---|
| Framework | FastAPI 0.116.1 |
| Server | Uvicorn 0.35.0 |
| ORM | SQLAlchemy ≥ 2.0 |
| Migrations | Alembic ≥ 1.16 |
| Database driver | psycopg ≥ 3.2 |
| Database | PostgreSQL |

### API Routes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/boats` | List boats (optional `search` query) |
| `POST` | `/api/boats` | Register a new boat |
| `GET` | `/api/boats/{boatId}` | Get boat details |
| `PATCH` | `/api/boats/{boatId}` | Update boat |
| `GET` | `/api/boats/{boatId}/telemetry` | Get telemetry for a specific boat |
| `GET` | `/api/gateways` | List gateways |
| `GET` | `/api/gateways/{gatewayId}` | Get gateway details |
| `GET` | `/api/telemetry` | List telemetry (optional `boatId`, `from`, `to`) |
| `GET` | `/api/alerts` | List alerts (optional `status`, `type` filters) |
| `GET` | `/api/alerts/{alertId}` | Get alert details |
| `POST` | `/api/alerts/{alertId}/acknowledge` | Acknowledge an alert |
| `POST` | `/api/alerts/{alertId}/resolve` | Resolve an alert |
| `GET` | `/api/history` | List historical events (optional `from`, `to`, `boatId`, `eventType`) |
| `GET` | `/api/system-status` | Get system-wide status |
| `POST` | `/api/ingest/gateway` | Ingest gateway heartbeat event (internal) |

### Data Models

| Model | Key Fields |
|---|---|
| **Boat** | boatId, nodeId, status (ONLINE/OFFLINE), sos, battery, latitude, longitude, rssi, snr, rttMs, heartbeatCount, lastSeen, firmware, registeredAt, dataSource |
| **Gateway** | (via repository, schema-defined) |
| **Telemetry** | boat relationship, timestamped readings |
| **Alert** | type (SOS/SYSTEM/COMMUNICATION), status (ACTIVE/ACKNOWLEDGED/RESOLVED), severity (CRITICAL/WARNING/INFO) |
| **HistoricalEvent** | eventType (HEARTBEAT_RECEIVED, SOS_CREATED, BOAT_REGISTERED, etc.), boat relationship |

### Backend Architecture

```text
Routes (API layer)
  └── Services (business logic)
        └── Repositories (data access)
              └── Models (SQLAlchemy ORM)
                    └── PostgreSQL
```

Custom error handling: `ResourceNotFoundError` (404), `ResourceConflictError` (409), `InvalidTransitionError` (400), `UnregisteredNodeError` (422), `SQLAlchemyError` (503).

### Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The backend requires a running PostgreSQL instance. Set `DATABASE_URL` before starting.

### Backend Environment

Copy the example before local development:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Example |
|---|---|---|
| `JALRI_ENVIRONMENT` | Environment name | `development` |
| `JALRI_API_HOST` | API bind host | `127.0.0.1` |
| `JALRI_API_PORT` | API bind port | `8000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://USER:PASSWORD@HOST:5432/jalri` |

### Database Migrations

Alembic is configured for schema migrations:

```bash
cd backend
alembic upgrade head
```

### Tests

The backend has 4 test files:

- `tests/test_health.py` — health endpoint test
- `tests/test_api.py` — API route tests
- `tests/test_database_models.py` — ORM model tests
- `tests/test_ingestion.py` — gateway ingestion tests

---

## Documentation

The `docs/` directory contains data contracts and specifications:

| Document | Description |
|---|---|
| `JALRI_SPECIFICATION.md` | Jalri system specification |
| `JALRI_BACKEND_SPEC.md` | Backend specification |
| `BACKEND_DATA_CONTRACT.md` | Backend data contract |
| `FIRMWARE_COMMUNICATION_CONTRACT.md` | Firmware communication contract |
| `GATEWAY_BACKEND_CONTRACT.md` | Gateway → backend ingestion contract |

---

## Current Status

| Category | Status |
|---|---|
| Landing page | Implemented |
| Dashboard layout (shell, sidebar, topbar) | Implemented |
| Dashboard pages (all 10 routes) | Implemented (with empty states) |
| UI component library | Implemented (5 primitives) |
| Backend API routes | Implemented (17 endpoints) |
| Database models and schemas | Implemented |
| Service and repository layers | Implemented |
| Alembic migrations | Configured |
| Backend tests | 4 test files present |
| Gateway ingestion endpoint | Implemented |
| Frontend ↔ Backend integration | Not active (frontend shows empty states) |
| Authentication | Not implemented |
| WebSocket / real-time updates | Not implemented |
| Live vessel tracking | Not implemented |

## Not Implemented

The following are intentionally not implemented:

- Authentication and authorization
- WebSocket real-time updates
- Live map with actual vessel positions
- Frontend API integration (frontend currently renders static empty states)
- Live data from gateway hardware
