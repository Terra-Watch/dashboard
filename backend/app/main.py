import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .core.config import API_ORIGINS
from .database.session import engine, init_db
from .routers import auth, citizen, community, fire_spread, operations, redesign, risk, workflow
from .routers_ext import routers as extension_routers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield

app = FastAPI(title="TerraWatch — Wildfire Monitoring & Incident Intelligence API", version="1.0.0", lifespan=lifespan)
@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Any unexpected error: log the cause with a short reference, and tell the person the reference. Nothing else about the failure is shown."""
    ref = uuid.uuid4().hex[:8]
    logger.error("unhandled error %s on %s %s", ref, request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": f"Something went wrong on our side (reference {ref}). If you were sending a report, it is saved and will be sent again.", "ref": ref})


app.add_middleware(CORSMiddleware, allow_origins=API_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(citizen.router)
app.include_router(community.router)
app.include_router(workflow.router)
app.include_router(operations.router)
app.include_router(risk.router)
app.include_router(fire_spread.router)
app.include_router(redesign.router)
for extension_router in extension_routers():
    app.include_router(extension_router)

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
