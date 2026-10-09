import bcrypt
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from ..database.session import engine
from ..contracts.schemas import AccessRequest, LoginRequest, PasswordResetRequest
from ..core.security import make_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
def login(payload: LoginRequest) -> dict[str, object]:
    with engine.connect() as db:
        user = db.execute(text("SELECT id,email,name,password_hash,role FROM resq_users WHERE email=:email"), {"email": payload.email.strip().lower()}).mappings().first()
    if not user or not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"access_token": make_token(user["id"], user["role"]), "token_type": "bearer", "user": {"email": user["email"], "name": user["name"], "role": user["role"]}}

@router.post("/access-requests", status_code=202)
def request_access(payload: AccessRequest) -> dict[str, str]:
    with engine.begin() as db:
        db.execute(text("INSERT INTO resq_access_requests (name,designation,department,email,state,reason) VALUES (:name,:designation,:department,:email,:state,:reason)"), payload.model_dump())
    return {"status": "received"}

@router.post('/password-reset/request', status_code=202)
def request_password_reset(payload: PasswordResetRequest) -> dict[str, str]:
    # Deliberately does not reveal whether an account exists. Delivery is a deployment integration.
    with engine.begin() as db:
        db.execute(text('INSERT INTO resq_password_reset_requests (email) VALUES (:email)'), {'email': payload.email.strip().lower()})
    return {'status': 'received'}
