# RESQ wildfire operations

Mobile-first daily wildfire-ignition risk planning for forest departments in Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, and Jharkhand.

## Run locally

Create local environment files from the checked-in examples before starting the services:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Keep credentials outside the repository and replace only the local values required by your deployment.

```bash
cd website
docker compose up -d
```

Terminal 1:

```bash
cd website/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=postgresql+psycopg://resq:resq@localhost:55432/resq uvicorn app.main:app --reload --port 8000
```

Terminal 2:

```bash
cd website/frontend
npm install
npm run dev
```

Open http://localhost:5173. Development accounts use password `resq-demo`: `admin@resq.local`, `officer@resq.local`, and `viewer@resq.local`.

To enable the available Bar v3 archive, export a versioned model bundle outside
the research repository, set `RESQ_MODEL_BUNDLE_DIR` in `.env`, and restart the
backend. The bundle contains `results/bar3_deployable_2023_predictions.npz`,
`results/bar3_deployable_2024_predictions.npz`, and `features/model_table.pkl`.
Only 2023–2024 archived validation days are served; other dates remain empty.

To load one archived replay day into PostGIS, after the bundle contains
`grid/cells.geojson`:

```bash
cd website/backend
python -m inference.import_barv3_replay 2024-06-18
```

Risk is displayed only as daily ranked bands: Low, Moderate, High, and Very high. If data is unavailable, the UI shows an empty state.
