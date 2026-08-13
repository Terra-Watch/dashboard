# JALRI

Jalri is a maritime safety and operations software system. It will provide operational tooling for BoatNodes, gateway connectivity, vessel status, SOS events, telemetry, maritime safety information, and communication history.

This repository is currently at **Phase 0: clean project foundation**. No operational features or fake operational data are included.

## Repository structure

```text
jalri/
├── frontend/       Next.js + TypeScript application
├── backend/        FastAPI application
├── docs/            Project documentation and data contracts
└── README.md
```

## Frontend

The frontend uses Next.js, React, and TypeScript. It currently contains only a temporary foundation page and global design tokens.

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>.

To create a production build:

```bash
cd frontend
npm run build
```

## Backend

The backend uses Python, FastAPI, and Uvicorn. It currently exposes only a health-check endpoint.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open <http://localhost:8000/health> or use:

```bash
curl http://localhost:8000/health
```

## Environment variables

Copy the relevant example file before local development:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

The examples document the current foundation settings. No database, gateway, authentication, or external API configuration is active yet.

## Current dependencies

- Frontend: Next.js, React, React DOM, TypeScript, and their type definitions.
- Backend: FastAPI and Uvicorn.

## Not implemented yet

The dashboard, boat registry, live map, alerts and SOS, telemetry, history, gateway UI, system status, database schema, authentication, WebSocket flows, gateway ingestion, and landing page design are intentionally not implemented. They will be added in the documented phase order after the canonical data contract is established.

