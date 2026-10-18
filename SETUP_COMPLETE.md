# TerraWatch Setup Complete ✅

## Quick Start Commands

### Start Everything
```bash
# Terminal 1 - Backend API
cd /Users/kireeti/Desktop/Projects/RESQ/terrawatch/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 - Frontend
cd /Users/kireeti/Desktop/Projects/RESQ/terrawatch/frontend
npm run dev
```

### Access the App
- **Frontend**: http://localhost:5173
- **Backend API Docs**: http://127.0.0.1:8000/docs

---

## Login Credentials

**All development accounts use password: `resq-demo`**

- Administrator: `admin@resq.local`
- Control Room Operator: `operator@resq.local`
- Range Officer: `trainee@resq.local`
- Field Crew: `field@resq.local`
- Incident Commander: `commander@resq.local`

**Custom admin**: `kireeti@example.com` / `AdminPass123!`

**Citizen**: Register at http://localhost:5173/register

---

## Feature Locations

### ✅ Working Features

**Risk Forecast (Bar v3 Model)**
- **Status**: ✅ Model data available, UI layer added to Map
- **Location**: Control Room → Map → "Situation" tab
- **Switch**: `RISK_FORECAST_ENABLED=true` (already set)
- **Note**: Shows model output, not verified fire
- **Data**: 3,752 risk cells for 6 states (2023-2024 replay)

**Scenario Planner (Fire Spread Simulation)**
- **Status**: ✅ Built and enabled
- **Location**: Control Room → Queue → Open incident → "Scenario" tab
- **Switch**: `SCENARIO_PLANNER_ENABLED=true` (already set)
- **Requirements**: Incident must have coordinates (latitude/longitude)
- **Engine**: Elliptical spread with exposure bands

**Satellite Signals (FIRMS)**
- **Status**: ✅ Connected and tested
- **Location**: Control Room → Map (heat signals)
- **API Key**: Configured
- **Update**: Run `python -m scripts.ingest_feeds --bbox 74,15,88,27`

**Email (Mailtrap)**
- **Status**: ✅ Configured and tested
- **Port**: 587 (port 2525 was blocked)
- **Use**: Password resets, staff invitations
- **Inbox**: https://mailtrap.io/inboxes

---

## What's NOT Built

Per `docs/design/STATUS.md`:

- Cell2Fire simulations from research (old spread endpoint disabled)
- AI-assisted report drafts
- Scenario validation page
- Officer position sharing
- ERA5 weather (configured but not wired)
- Time replay, measure tools, terrain layers

---

## Database & Models

**PostgreSQL**
- Database: `resq`
- User: `resq`
- Location: localhost:5432

**Bar v3 Risk Model**
- Location: `backend/models/barv3/`
- Files: `bar3_replay_2023.npz` (6.6MB), `bar3_replay_2024.npz` (5.1MB)
- Coverage: 936,380 predictions for OD, CG, TS, MP, MH, JH

**Fire Evidence Assessor**
- Checkpoint: `/Users/kireeti/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt` (330MB)
- Status: Configured but experimental mode (not active by default)

---

## Testing

**Frontend**
```bash
cd frontend
npm run test:unit    # 114 tests pass
npx tsc -b           # 0 errors
npm run build        # Production build works
npm run budget       # All bundles within limits
```

**Backend**
```bash
cd backend
source .venv/bin/activate
pytest tests/        # Tests can now run
python test_email.py # Test email sending
```

---

## Environment Variables

All configured in `backend/.env`:
- ✅ Database connection
- ✅ Secret key
- ✅ Development seed accounts
- ✅ Scenario planner enabled
- ✅ Risk forecast enabled
- ✅ FIRMS API key
- ✅ Copernicus/ERA5 API keys
- ✅ Mailtrap SMTP (port 587)
- ✅ Fire evidence assessor paths

---

## Issues Fixed

1. ✅ TypeScript case-sensitivity (`evidenceReview.ts` → `evidenceReviewTypes.ts`)
2. ✅ pytest missing (added to requirements.txt)
3. ✅ i18n complete for Hindi/Odia
4. ✅ Email SMTP configured and tested
5. ✅ Risk forecast layer added to map

---

## Notes

- Email uses port 587 (2525 blocked on this network)
- Scenario tab only appears on incidents with coordinates
- Risk forecast is Bar v3 replay data (2023-2024), not live forecast
- All sensitive credentials are in `.env` files (gitignored)

**Setup completed**: October 16, 2026 at 23:42
