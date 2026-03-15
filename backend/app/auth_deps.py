"""Shared FastAPI auth dependencies used across routers."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import LoginSession, WorkspaceUser


async def require_system_admin(
    authorization: str | None, db: AsyncSession
) -> WorkspaceUser:
    """Validate Bearer token and assert caller is system-admin."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[7:]
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session or session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if session.user.system_role != "system-admin":
        raise HTTPException(
            status_code=403, detail="Only system admins can perform this action"
        )
    return session.user


async def require_auth(authorization: str | None, db: AsyncSession) -> WorkspaceUser:
    """Validate Bearer token — any authenticated user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[7:]
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session or session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return session.user
