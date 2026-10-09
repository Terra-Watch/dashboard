from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .core.config import API_ORIGINS
from .database.session import engine, init_db
from .routers import auth, operations, risk

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield

app = FastAPI(title="RESQ Wildfire Operations API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=API_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(operations.router)
app.include_router(risk.router)

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}

@app.get("/ready")
def ready() -> dict[str, object]:
    try:
        with engine.connect() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ready"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
