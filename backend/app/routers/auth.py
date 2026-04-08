import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth_utils import hash_password, verify_password
from app.database import get_db
from app.encryption import mask_email
from app.models.models import LoginSession, WorkspaceUser
from app.schemas.schemas import (
    AuthStatus,
    ChangePasswordRequest,
    CheckEmailResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    WorkspaceUserRead,
)

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)

SESSION_TTL_DAYS = 30


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header"
        )
    return authorization[7:]


async def _get_valid_session(token: str, db: AsyncSession) -> LoginSession:
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    if session.expires_at < datetime.now(timezone.utc):
        await db.delete(session)
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    return session


async def _create_session(user_id: str, db: AsyncSession) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    session = LoginSession(token=token, user_id=user_id, expires_at=expires_at)
    db.add(session)
    await db.flush()
    return token


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/auth/status", response_model=AuthStatus)
async def auth_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    return AuthStatus(initialized=count > 0)


@router.post("/auth/register", response_model=LoginResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    if count > 0:
        raise HTTPException(status_code=409, detail="System already initialized")
    if len(body.password) < 8:
        raise HTTPException(
            status_code=422, detail="Password must be at least 8 characters"
        )
    try:
        password_hash = hash_password(body.password)
    except Exception:
        raise HTTPException(
            status_code=500, detail="Registration failed — contact admin"
        )
    user = WorkspaceUser(
        id=f"local-{uuid.uuid4().hex[:12]}",
        email=body.email.strip().lower(),
        name=None,
        role="account-owner",
        status="active",
        system_role="system-admin",
        password_hash=password_hash,
        password_temp=False,
    )
    db.add(user)
    await db.flush()
    token = await _create_session(user.id, db)
    await db.commit()
    await db.refresh(user)
    logger.info(f"First admin registered: {mask_email(user.email)}")
    return LoginResponse(user=WorkspaceUserRead.model_validate(user), token=token)


@router.post("/auth/check-email", response_model=CheckEmailResponse)
async def check_email(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    # Always return 200 — never reveal whether email exists
    requires_password = bool(user and user.password_hash)
    return CheckEmailResponse(requires_password=requires_password)


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.password_hash:
        if not body.password:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Incorrect password")
    token = await _create_session(user.id, db)
    await db.commit()
    return LoginResponse(user=WorkspaceUserRead.model_validate(user), token=token)


@router.get("/auth/me", response_model=WorkspaceUserRead)
async def get_me(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    token = _extract_bearer(authorization)
    session = await _get_valid_session(token, db)
    # Roll the expiry on each /me call
    try:
        session.expires_at = datetime.now(timezone.utc) + timedelta(
            days=SESSION_TTL_DAYS
        )
        await db.commit()
        await db.refresh(session.user)
    except Exception:
        logger.warning("Failed to roll session expiry, continuing anyway")
    return session.user


@router.delete("/auth/session", status_code=204)
async def logout(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        return  # Already logged out / no session
    token = authorization[7:]
    session = await db.get(LoginSession, token)
    if session:
        await db.delete(session)
        await db.commit()


@router.post("/auth/change-password", response_model=WorkspaceUserRead)
async def change_password(
    body: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    token = _extract_bearer(authorization)
    session = await _get_valid_session(token, db)
    user = session.user

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="No password set for this account")

    # Skip old-password check when account is in forced-change mode
    if not user.password_temp:
        if not body.old_password:
            raise HTTPException(status_code=422, detail="Current password is required")
        if not verify_password(body.old_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=422, detail="New password must be at least 8 characters"
        )
    try:
        user.password_hash = hash_password(body.new_password)
    except Exception:
        raise HTTPException(
            status_code=500, detail="Password change failed — contact admin"
        )
    user.password_temp = False
    await db.commit()
    await db.refresh(user)
    return user
