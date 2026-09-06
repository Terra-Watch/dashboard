import logging

from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    alerts,
    auth,
    boat_telemetry,
    boats,
    family,
    gateways,
    history,
    ingestion,
    mobile_crew,
    users,
    system_status,
    telemetry,
)
from app.api.routes import assignments
from app.services.errors import InvalidTransitionError, ResourceConflictError, ResourceNotFoundError
from app.services.ingestion import UnregisteredNodeError

app = FastAPI(title="JALRI Backend", version="0.1.0")
logger = logging.getLogger("jalri.backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(family.router)
app.include_router(boats.router)
app.include_router(assignments.router)
app.include_router(gateways.router)
app.include_router(telemetry.router)
app.include_router(boat_telemetry.router)
app.include_router(alerts.router)
app.include_router(history.router)
app.include_router(system_status.router)
app.include_router(ingestion.router)
app.include_router(mobile_crew.router)
app.include_router(users.router)



@app.exception_handler(ResourceNotFoundError)
def resource_not_found_handler(_: Request, exc: ResourceNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ResourceConflictError)
def resource_conflict_handler(_: Request, exc: ResourceConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(InvalidTransitionError)
def invalid_transition_handler(_: Request, exc: InvalidTransitionError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(UnregisteredNodeError)
def unregistered_node_handler(_: Request, exc: UnregisteredNodeError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(SQLAlchemyError)
def database_error_handler(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database unavailable"})


@app.exception_handler(Exception)
def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled backend error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy"}
